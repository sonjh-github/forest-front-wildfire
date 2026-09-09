import type { ImplementationStatus } from "./requirementsReadiness";

export const OFFICIAL_RFP_BASELINE = { networkDeploymentMinutes: 10, locationUpdateSeconds: 5, sharingSuccessPct: 98, availabilityPct: 98 };
export const PROJECT_ENHANCED_TARGET = { networkDeploymentMinutes: 7, locationUpdateSeconds: 3, sharingSuccessPct: 98, availabilityPct: 98 };
export const KPI_SOURCE_REFS = { official: "RFP 인쇄 p.12 (첨부 PDF p.2) 성능지표", project: "연구개발계획서 PDF p.82 / 3. 평가기준 및 평가방법" };
export type OfficialRfpGap = {
  sourceRef: string;
  title: string;
  implementation: ImplementationStatus;
  frontendEvidence: string;
  blocker: string;
  dependencies: Array<"BACKEND" | "HW" | "AGENCY" | "FIELD" | "PROJECT">;
};
// RFP requirements are separate from the 47 internal IDs. Status is limited to this repository's evidence.
const gap = (page: 11 | 12, title: string, implementation: ImplementationStatus, frontendEvidence: string, blocker: string, dependencies: OfficialRfpGap["dependencies"]): OfficialRfpGap => ({ sourceRef: `RFP 인쇄 p.${page} / ${title}`, title, implementation, frontendEvidence, blocker, dependencies });
export const OFFICIAL_RFP_GAPS: OfficialRfpGap[] = [
  gap(11, "이동형 양방향 통신 인프라 · 이음5G/LEO 비교", "PARTIAL", "UnifiedDisasterDashboard.tsx communicationProfile: 장비·망 역할 표시", "실제 접속망/위성 링크 구축·비교 시험 증거 필요", ["HW", "FIELD"]),
  gap(11, "AI-RAN 셀 커버리지 자동 조정", "CONTRACT_ONLY", "forest-api.ts AI_RAN_COVERAGE 매핑 / LivePositionMap.tsx 입력면 표시", "자동 셀 제어·효과 검증 없음", ["BACKEND", "HW", "FIELD"]),
  gap(11, "TVWS 저주파 기지국·무선백홀", "PARTIAL", "UnifiedDisasterDashboard.tsx TVWS 장비·연결 정보", "무선백홀 운용·장거리 성능 시험 필요", ["HW", "FIELD"]),
  gap(11, "휴대용 양방향 통신 · 상황실↔대원↔대원", "NOT_IMPLEMENTED", "통신장비 분류는 존재하나 음성/PTT 세션 구현 없음", "휴대 단말·PTT/400MHz 음성 Gateway 및 실통화 시험", ["BACKEND", "HW", "FIELD"]),
  gap(11, "차량탑재 소형 기지국·통신 모듈", "PARTIAL", "UnifiedDisasterDashboard.tsx 지휘차량·게이트웨이 상태 표시", "차량 설치·전원·RF 통합 제작 및 시험은 Frontend 밖", ["HW", "FIELD"]),
  gap(11, "네트워크 이중화·자동 전환", "PARTIAL", "OperationsPanel.tsx primary/activePath/switchReason 조회", "경로 관측 UI만 제공; 자동절체·본딩 제어 및 세션 연속성 시험 필요", ["BACKEND", "HW", "FIELD"]),
  gap(11, "NMS/BMS 관제 시스템", "PARTIAL", "OperationsPanel.tsx NMS/BMS 조회 요약 및 nmsSummary.ts", "배터리 잔량·MAVLink 전압 수신값 집계; 전원·온도 표준 계약/제어 및 현장 연계 대기", ["BACKEND", "HW"]),
  gap(11, "산악기상관측 시설 탑재 통신 모듈", "NOT_IMPLEMENTED", "해당 시설 전용 제어·설치 증거 없음", "시설 인터페이스·장비 설치·기관 협의 필요", ["HW", "AGENCY", "FIELD"]),
  gap(11, "단절지역 현장 자율 커버리지 생성", "CONTRACT_ONLY", "forest-api.ts relay-placement-candidates / 통신 커버리지 결과 레이어", "결과 표시 계약만 존재; 배치 명령·자율망 제어 없음", ["BACKEND", "HW", "FIELD"]),
  gap(11, "진화대원·차량 좌표·이동경로·실시간 상황 갱신", "PARTIAL", "LivePositionMap.tsx / telemetryStream.ts / MapTimelinePlayer.tsx", "위치 스냅샷 재생은 사건 전체 복기 아님; 종단 갱신주기 현장 검증 필요", ["BACKEND", "FIELD"]),
  gap(11, "위험경보·안전지대 경로·화선접근 양방향 공유", "PARTIAL", "OperationsPanel.tsx 경보 / LivePositionMap.tsx 경로 / telemetryStream.ts 위험면 진입 판정", "위험면 접근 판정은 구현; 관측 화선 접근·단말 전달/ACK·안전경로 승인 API 미연결", ["BACKEND", "HW", "FIELD"]),
  gap(11, "지도 위치정보 + 영상 + 상황보고 통합 현장 UI", "PARTIAL", "OperationsPanel.tsx 현장 통합정보: 사건·경보·자원·화선·대피·보고 조회 / 기존 DroneVideoModal 연결", "영상은 설정·Probe UI이며 브라우저 재생 엔진 없음; 보고 송신 API 미확인", ["BACKEND", "FIELD"]),
  gap(11, "산불상황관제시스템 연계", "NOT_IMPLEMENTED", "FIRMS·위험예보 API는 외부 데이터 조회이며 관제시스템 연계가 아님", "기관 ICD·인증·연계 endpoint 및 합동 시험 필요", ["AGENCY", "BACKEND"]),
  gap(11, "AI-RAN 통신자원 자동 할당·스케줄링", "NOT_IMPLEMENTED", "src 검색: 실제 scheduler/제어 endpoint 없음", "AI-RAN 제어 서비스·기지국 인터페이스 필요", ["BACKEND", "HW"]),
  gap(11, "영상·위치 대용량 트래픽 경량 전송 알고리즘", "NOT_IMPLEMENTED", "src 검색: 전송 최적화 알고리즘 없음", "코덱/압축·프로토콜 구현 및 품질 비교 시험 필요", ["BACKEND", "HW", "FIELD"]),
  gap(11, "비상 시 중요도 기반 데이터 전송 우선순위", "NOT_IMPLEMENTED", "경보 UI 정렬만 존재; 기술기준서 §3.3 P0~P4 데이터 클래스 미적용", "실제 QoS 제어 Backend/HW 의존; 경보 정렬은 전송 우선순위가 아님", ["BACKEND", "HW"]),
  gap(12, "연구결과 종합 평가·정책·기술 표준화 방안", "PARTIAL", "공식 Gap Matrix·기술기준서 초안·증빙 JSON", "최종 연구보고·표준 합의 및 성과 평가 필요", ["PROJECT", "AGENCY"]),
  gap(12, "실시간 다부처 진화자원 배치현황 연계방안", "NOT_IMPLEMENTED", "공통 자산 화면은 존재; 다부처 인증·자원배치 연계 증거 없음", "기관별 ICD·권한·자원 상태 계약과 연계방안 확정", ["AGENCY", "BACKEND"]),
  gap(12, "정부·지자체·국민 활용방안", "NOT_IMPLEMENTED", "내부 관제 화면만 존재; 대외 활용방안 증빙 없음", "공개 범위·운영 정책·기관 합의 필요", ["PROJECT", "AGENCY"]),
  gap(12, "RFP5 정보연계·RFP7 통신연계", "NOT_IMPLEMENTED", "schema 추적 문서는 decision_recommendation/field_task 설계만 명시", "상대 시스템 ICD·명령/응답·합동 연계시험 필요", ["AGENCY", "BACKEND", "HW"]),
  gap(12, "연구 협의체 참여·성과물 및 등록 3건", "NOT_IMPLEMENTED", "Frontend 저장소에서 협의체·특허/등록 증빙 확인 불가", "프로젝트 관리 산출물 별도 확인; 기관 전체 미수행 판정 아님", ["PROJECT"]),
  gap(12, "이동형 현장통신망·차량 모듈·정보공유 시스템 각 1식", "PARTIAL", "GIS 관제 Frontend 및 API 클라이언트", "HW 프로토타입·종단 시스템 납품/검증 증적 필요", ["HW", "BACKEND", "FIELD"]),
  gap(12, "공식 KPI 10분·5초·98%·98%", "PARTIAL", "operationalEvidence.ts 표본 계산 / OperationsPanel.tsx API 측정값 조회", "송신 분모·ACK·운영/중단시간·실증 시험 ID 필요; DEMO는 공인 성능시험 아님", ["BACKEND", "FIELD"]),
];
export function officialRfpGapSummary(items = OFFICIAL_RFP_GAPS) {
  return { total: items.length,
    implemented: items.filter(x => x.implementation === "IMPLEMENTED").length,
    partial: items.filter(x => x.implementation === "PARTIAL").length,
    contractOnly: items.filter(x => x.implementation === "CONTRACT_ONLY").length,
    notImplemented: items.filter(x => x.implementation === "NOT_IMPLEMENTED").length,
    externalDependency: items.filter(x => x.dependencies.some(d => ["BACKEND", "HW", "AGENCY"].includes(d))).length,
    fieldDependency: items.filter(x => x.dependencies.includes("FIELD")).length };
}
