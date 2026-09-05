import { REQUIREMENTS_READINESS, requirementSummary, type RequirementValidation } from "./requirementsReadiness";
import { runDemoAcceptance } from "./demoAcceptance";

const validationLabel: Record<RequirementValidation, string> = {
  OPERATING: "운영 확인",
  DEMO_VERIFIED: "DEMO 검증",
  EXTERNAL_PENDING: "기관 연계 대기",
  FIELD_PENDING: "현장 검증 대기",
};

export default function RequirementsReadinessModal({ onClose }: { onClose: () => void }) {
  const summary = requirementSummary();
  const acceptance = runDemoAcceptance();
  const categories = [...new Set(REQUIREMENTS_READINESS.map((item) => item.category))];
  const download = () => {
    const payload = JSON.stringify({ generatedAt: new Date().toISOString(), summary, demoAcceptance: acceptance, requirements: REQUIREMENTS_READINESS }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `forest-requirements-readiness-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return <div className="requirements-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="requirements-modal" role="dialog" aria-modal="true" aria-labelledby="requirements-title" onMouseDown={(event) => event.stopPropagation()}>
      <header>
        <div><small>REQUIREMENTS TRACEABILITY</small><h2 id="requirements-title">통합상황판 기능 검증 현황</h2><p>소프트웨어 완료와 기관·현장 검증을 분리해 표시합니다.</p></div>
        <div><button type="button" onClick={download}>증빙 JSON</button><button type="button" onClick={onClose} aria-label="요구사항 증빙 닫기">×</button></div>
      </header>
      <div className="requirements-summary">
        <strong><b>{summary.softwareComplete}</b><span>/ {summary.total} SW 구현</span></strong>
        <span>운영 확인 {summary.operating}</span><span>DEMO 검증 {summary.demoVerified}</span>
        <span>기관 대기 {summary.externalPending}</span><span>현장 대기 {summary.fieldPending}</span>
      </div>
      <div className="demo-acceptance-summary" data-passed={acceptance.failed === 0}>
        <div><small>AUTOMATED DEMO ACCEPTANCE</small><strong>{acceptance.passed} / {acceptance.total} 자동검증 통과</strong></div>
        <span>산불</span><span>산사태</span><span>통신장애</span><span>드론비상</span>
        <em>{acceptance.failed === 0 ? "검증 성공" : `${acceptance.failed}개 확인 필요`}</em>
      </div>
      <div className="requirements-groups">
        {categories.map((category) => <section key={category}>
          <h3>{category}</h3>
          {REQUIREMENTS_READINESS.filter((item) => item.category === category).map((item) => <article key={item.id}>
            <code>{item.id}</code><div><strong>{item.requirement}</strong><small>{item.evidence}</small></div>
            <b className="software-complete">SW 완료</b><em data-validation={item.validation}>{validationLabel[item.validation]}</em>
          </article>)}
        </section>)}
      </div>
    </section>
  </div>;
}
