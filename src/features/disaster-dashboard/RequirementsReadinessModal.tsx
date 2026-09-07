import { useEffect, useRef, useState } from "react";
import { buildReadinessEvidence } from "./readinessEvidence";
import { OFFICIAL_RFP_GAPS, officialRfpGapSummary } from "./officialRfpGaps";
import "./readiness-review.css";
import { REQUIREMENTS_READINESS, requirementSummary, implementationLabel, type RequirementValidation } from "./requirementsReadiness";
import { runDemoAcceptance } from "./demoAcceptance";

const validationLabel: Record<RequirementValidation, string> = {
  OPERATING: "운영 기능 분류",
  DEMO_VERIFIED: "DEMO 검증",
  EXTERNAL_PENDING: "기관 연계 대기",
  FIELD_PENDING: "현장 검증 대기",
};

export default function RequirementsReadinessModal({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<"internal" | "official">("internal");
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key === "Tab") {
        const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button, [href], [tabindex="0"]') ?? []).filter(x => !x.hasAttribute("disabled"));
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, []);
  const summary = requirementSummary();
  const gaps = officialRfpGapSummary();
  const acceptance = runDemoAcceptance();
  const categories = [...new Set(REQUIREMENTS_READINESS.map((item) => item.category))];
  const download = () => {
    const payload = JSON.stringify(buildReadinessEvidence(), null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `forest-requirements-readiness-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return <div className="requirements-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="requirements-modal" ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="requirements-title" onMouseDown={(event) => event.stopPropagation()}>
      <header>
        <div><small>REQUIREMENTS TRACEABILITY</small><h2 id="requirements-title">내부 SW 요구사항 추적</h2><p>내부 47개 항목과 공식 RFP를 별도로 추적합니다. 구현은 Frontend 범위이며 전체 시스템 완료율이 아닙니다.</p></div>
        <div><button type="button" onClick={download}>증빙 JSON</button><button type="button" onClick={onClose} aria-label="요구사항 증빙 닫기">×</button></div>
      </header>
      <div className="requirements-summary">
        <strong><b>{summary.total}</b><span>개 내부 항목</span></strong>
        <span>구현 {summary.implemented}</span><span>부분구현 {summary.partial}</span><span>계약구현 {summary.contractOnly}</span><span>미구현 {summary.notImplemented}</span>
      </div>
      <p className="review-validation">검증 근거 분류: 운영 기능 {summary.operating} · DEMO {summary.demoVerified} · 기관 연계 대기 {summary.externalPending} · 현장 검증 대기 {summary.fieldPending} — 구현 상태와 별개이며 인증을 뜻하지 않습니다.</p>
      <div className="demo-acceptance-summary" data-passed={acceptance.failed === 0}>
        <div><small>DEMO DATA / UI CONTRACT CHECK</small><strong>{acceptance.label} · {acceptance.passed} / {acceptance.total} PASS</strong></div>
        <em>모의 입력 검증 · 공식 인수/현장 성능시험 아님</em>
      </div>
      <nav className="review-tabs" aria-label="요구사항 추적 범위">
        <button type="button" aria-pressed={view === "internal"} onClick={() => setView("internal")}>내부 SW 요구사항 47</button>
        <button type="button" aria-pressed={view === "official"} onClick={() => setView("official")}>공식 RFP Gap {gaps.total}</button>
      </nav>
      <div className="requirements-groups">
        {view === "internal" && categories.map((category) => <section key={category}>
          <h3>{category}</h3>
          {REQUIREMENTS_READINESS.filter((item) => item.category === category).map((item) => <article key={item.id}>
            <code>{item.id}</code><div><strong>{item.requirement}</strong><small>{item.evidence}</small></div>
            <b className="implementation-state" data-implementation={item.implementation}>{implementationLabel[item.implementation]}</b><em data-validation={item.validation}>{validationLabel[item.validation]}</em>
          </article>)}
        </section>)}
        {view === "official" && <section className="official-gap-list">
          <h3>공식 RFP Gap — 저장소 증거 기준</h3>
          <p>구현 {gaps.implemented} · 부분구현 {gaps.partial} · 계약구현 {gaps.contractOnly} · 미구현/증거 없음 {gaps.notImplemented}</p>
          <p>외부 의존 {gaps.externalDependency} · 현장 의존 {gaps.fieldDependency} (중복 포함). 타 기관의 전체 개발 상태를 단정하지 않습니다.</p>
          <div className="review-kpi"><b>KPI 기준 구분</b><span>공식 RFP: ≤10분 / ≤5초 / ≥98% / ≥98%</span><span>연구개발계획 강화 목표: ≤7분 / ≤3초 / ≥98% / ≥98%</span><small>순서: 망 구축 / 위치 갱신 / 정보공유 성공 / 망 가용률</small></div>
          {OFFICIAL_RFP_GAPS.map(gap => <article key={gap.sourceRef}>
            <div><small>{gap.sourceRef}</small><strong>{gap.title}</strong><small>근거: {gap.frontendEvidence}</small><small>남은 의존사항: {gap.blocker}</small></div>
            <b className="implementation-state" data-implementation={gap.implementation}>{implementationLabel[gap.implementation]}</b>
          </article>)}
        </section>}
      </div>
    </section>
  </div>;
}
