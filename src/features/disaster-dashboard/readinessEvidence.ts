import { REQUIREMENTS_READINESS, requirementSummary } from "./requirementsReadiness";
import { runDemoAcceptance } from "./demoAcceptance";
import { OFFICIAL_RFP_GAPS, OFFICIAL_RFP_BASELINE, PROJECT_ENHANCED_TARGET, KPI_SOURCE_REFS, officialRfpGapSummary } from "./officialRfpGaps";
export function buildReadinessEvidence(now = new Date()) {
  return {
    schemaVersion: "forest-requirements-readiness/v2",
    generatedAt: now.toISOString(),
    scope: "Frontend repository evidence review; not official RFP acceptance",
    internalRequirementsSummary: requirementSummary(),
    requirements: REQUIREMENTS_READINESS,
    officialRfpGapSummary: officialRfpGapSummary(),
    officialRfpGaps: OFFICIAL_RFP_GAPS,
    demoDataContractCheck: runDemoAcceptance(),
    officialRfpBaseline: OFFICIAL_RFP_BASELINE,
    projectEnhancedTarget: PROJECT_ENHANCED_TARGET,
    sourceRefs: KPI_SOURCE_REFS,
    externalDependencies: OFFICIAL_RFP_GAPS.filter(x => x.dependencies.some(d => ["BACKEND", "HW", "AGENCY"].includes(d))),
    fieldDependencies: OFFICIAL_RFP_GAPS.filter(x => x.dependencies.includes("FIELD")),
    limitations: [
      "내부 47개 ID는 공식 RFP 전체 목록이 아니며 구현 상태는 Frontend 범위의 코드 검토 결과입니다.",
      "기존 검증 상태는 증빙 범주이며 운영 인증이 아닙니다. DEMO 계약 PASS는 브라우저 렌더링·기관 인수·현장 성능 통과를 의미하지 않습니다.",
      "공식 Gap은 제공 문서와 이 저장소의 확인 가능한 증거 기준입니다. 타 기관/HW의 구현 여부를 단정하지 않습니다.",
      "수신 표본 기반 지연·비율은 공식 갱신주기·전체 정보공유 성공률·운영시간 가용률과 다릅니다.",
      "FNV 체크섬은 변경 탐지 보조값이며 서명·공인시험·위변조 방지 증빙이 아닙니다.",
      "위치 Timeline은 사건 전체 복기가 아니며 auth/role API 및 실제 RBAC 구현은 확인되지 않았습니다.",
      "DomainFeatureModals.tsx는 미사용 프로토타입입니다. 인증·성능 하드코딩은 운영 증거에서 제외했습니다.",
    ],
  };
}
