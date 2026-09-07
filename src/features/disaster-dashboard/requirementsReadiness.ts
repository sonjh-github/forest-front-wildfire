export type ImplementationStatus = "IMPLEMENTED" | "PARTIAL" | "CONTRACT_ONLY" | "NOT_IMPLEMENTED";

export const implementationLabel: Record<ImplementationStatus, string> = { IMPLEMENTED: "구현", PARTIAL: "부분구현", CONTRACT_ONLY: "계약구현", NOT_IMPLEMENTED: "미구현" };

export type RequirementValidation = "OPERATING" | "DEMO_VERIFIED" | "EXTERNAL_PENDING" | "FIELD_PENDING";

export type RequirementReadiness = {
  id: string;
  category: string;
  requirement: string;
  implementation: ImplementationStatus;
  softwareComplete: boolean;
  validation: RequirementValidation;
  evidence: string;
};

const rows = (
  category: string,
  values: Array<[string, string, ImplementationStatus, RequirementValidation, string]>,
): RequirementReadiness[] => values.map(([id, requirement, implementation, validation, evidence]) => ({
  id, category, requirement, implementation, softwareComplete: implementation === "IMPLEMENTED", validation, evidence,
}));

export const REQUIREMENTS_READINESS: RequirementReadiness[] = [
  ...rows("GIS 통합상황판", [
    ["GIS-01", "산불·산사태 위험지역 지도 표시", "IMPLEMENTED", "DEMO_VERIFIED", "LivePositionMap.tsx: GeoJSON 위험면 렌더링; 기관 원본 경계·예측 정확도는 별도 검증"],
    ["GIS-02", "현재 현장 자산·장비 위치 표시", "IMPLEMENTED", "DEMO_VERIFIED", "UnifiedDisasterDashboard.tsx overviewLocations / LivePositionMap.tsx: 자산·인원 위치 표시"],
    ["GIS-03", "지도 레이어 ON/OFF", "IMPLEMENTED", "OPERATING", "OperationsPanel.tsx onLayerToggle / LivePositionMap.tsx visibility: 독립 레이어 토글"],
    ["GIS-04", "위험지역·대피경로·진화자원 통합 표시", "PARTIAL", "DEMO_VERIFIED", "LivePositionMap.tsx 대응 레이어 렌더링; forest-api.ts에 위험구역·대피·진화자원 전용 운영 조회 연결 없음"],
  ]),
  ...rows("산불 정보 시각화", [
    ["FIRE-01", "NASA FIRMS 산불 탐지", "IMPLEMENTED", "EXTERNAL_PENDING", "external-disaster-api.ts 및 테스트: FIRMS 조회·오류 처리; LivePositionMap.tsx 화점 팝업. 실제 기관 응답 검증 대기"],
    ["FIRE-02", "산림청 산불위험예보", "IMPLEMENTED", "EXTERNAL_PENDING", "external-disaster-api.ts 및 테스트: 위험예보 조회·공간화. 기관 데이터 승인·운영 검증 대기"],
    ["FIRE-03", "위험도·발생지점 지도 표현", "IMPLEMENTED", "DEMO_VERIFIED", "LivePositionMap.tsx 발생지점·위험면·산불 DEMO 위험도 표시; 실제 IR 측정 아님"],
    ["FIRE-04", "외부기관 데이터를 관제 지도에 표시", "IMPLEMENTED", "DEMO_VERIFIED", "UnifiedDisasterDashboard.tsx refreshExternalIntegrations: 외부 데이터 지도 표시; 다부처 관제연계와 별개"],
  ]),
  ...rows("산사태 정보 시각화", [
    ["LAND-01", "산사태 예측정보", "IMPLEMENTED", "EXTERNAL_PENDING", "external-disaster-api.ts: 산사태 예측정보 클라이언트·공간화 및 계약 테스트; 기관 검증 대기"],
    ["LAND-02", "지역 위험정보", "IMPLEMENTED", "EXTERNAL_PENDING", "external-disaster-api.ts: 지역위험정보 클라이언트·위험면; 기관 검증 대기"],
    ["LAND-03", "발생이력", "IMPLEMENTED", "EXTERNAL_PENDING", "external-disaster-api.ts: 발생이력 조회·좌표 변환; 기관 검증 대기"],
    ["LAND-04", "산사태 레이어 구분 및 ON/OFF", "IMPLEMENTED", "OPERATING", "OperationsPanel.tsx externalMapLayers: 예측·지역위험·이력 독립 토글"],
  ]),
  ...rows("현장 자산 관제", [
    ["ASSET-01", "드론·차량·인력·장비 통합 표시", "IMPLEMENTED", "DEMO_VERIFIED", "UnifiedDisasterDashboard.tsx overviewLocations / LivePositionMap.tsx: 유형별 마커·상세"],
    ["ASSET-02", "GNSS·RTK 위치 수신", "PARTIAL", "DEMO_VERIFIED", "telemetryStream.ts 및 테스트: GNSS/RTK 변환값 수신; 실제 측위·RTCM 전 구간 검증 대기"],
    ["ASSET-03", "장비 상태 표시", "IMPLEMENTED", "DEMO_VERIFIED", "UnifiedDisasterDashboard.tsx 자산 상세 / OperationsPanel.tsx: 수신 상태·배터리·신호 표시"],
    ["ASSET-04", "assetId 기준 로그·이력 조회", "IMPLEMENTED", "DEMO_VERIFIED", "pages/device/DeviceLogList.tsx / device-log-api.test.ts: assetId 로그 조회·페이지네이션"],
    ["ASSET-05", "Gateway → Backend → Frontend 위치 갱신", "PARTIAL", "DEMO_VERIFIED", "telemetryStream.ts: 브라우저 수신·재연결; Gateway→Core 실제 전달은 외부 구현·현장 증적 필요"],
  ]),
  ...rows("드론 관제", [
    ["DRONE-01", "드론 실시간 위치", "IMPLEMENTED", "DEMO_VERIFIED", "LivePositionMap.tsx: 드론 좌표 갱신; demoOverview.test.ts 이동 모사 검증"],
    ["DRONE-02", "비행상태", "IMPLEMENTED", "DEMO_VERIFIED", "UnifiedDisasterDashboard.tsx: 수신 비행상태 표시; 실기체 상태 검증 대기"],
    ["DRONE-03", "MAVLink 텔레메트리", "PARTIAL", "DEMO_VERIFIED", "telemetryStream.ts MavlinkTelemetryAccumulator: JSON MAVLink 프레임 병합 및 테스트; 바이너리 수신·실기체 검증은 별도"],
    ["DRONE-04", "GPS·GNSS", "PARTIAL", "DEMO_VERIFIED", "telemetryStream.ts: 측위방법·정확도 수신 계약; 실제 GNSS 수신·성능 검증 별도"],
    ["DRONE-05", "임무·비상 상태", "IMPLEMENTED", "DEMO_VERIFIED", "demoOverview.ts RTL·저전압 모사 / UnifiedDisasterDashboard.tsx 상태 표시; 실제 임무 제어 아님"],
    ["DRONE-06", "실비행 화면 이동", "PARTIAL", "FIELD_PENDING", "LivePositionMap.tsx 위치 표시 구현; 실비행 이동 증빙 미제공"],
  ]),
  ...rows("경보·이벤트", [
    ["ALERT-01", "산불·산사태 위험 알림", "IMPLEMENTED", "DEMO_VERIFIED", "OperationsPanel.tsx: 수신 위험 경보 목록; 운영 위험판정은 Core 의존"],
    ["ALERT-02", "장비·통신 이상", "IMPLEMENTED", "DEMO_VERIFIED", "OperationsPanel.tsx: 수신 경보·장비 지연/두절 표시; 현장 경보 전달은 별도"],
    ["ALERT-03", "위험지역 진입", "PARTIAL", "DEMO_VERIFIED", "telemetryStream.ts applyTelemetrySafetyRules: 수신 위험면 진입/접근 경보 구현; 화선 LineString 접근·운영 전달/ACK 미연결"],
    ["ALERT-04", "최근 이벤트·경보 목록", "IMPLEMENTED", "DEMO_VERIFIED", "OperationsPanel.tsx activeAlerts: 심각도·발령시각 정렬; 확인/해제는 DEMO 세션만"],
  ]),
  ...rows("통신 상태", [
    ["NET-01", "현장 ↔ Gateway ↔ 서버 상태", "PARTIAL", "DEMO_VERIFIED", "LivePositionMap.tsx topologyEdges: DB 연결 없으면 기준 연결 추정; 실제 종단 경로 검증 필요"],
    ["NET-02", "마지막 정상 수신시각", "IMPLEMENTED", "DEMO_VERIFIED", "OperationsPanel.tsx: lastReceivedAt·observedAt 표시; 실제 수신 주체 확인 필요"],
    ["NET-03", "장비별 정상·지연·두절", "IMPLEMENTED", "DEMO_VERIFIED", "operationalEvidence.ts classifyLinkHealth 및 테스트: 목표주기 대비 1.5배/3배 판정"],
    ["NET-04", "통신 가용률", "PARTIAL", "DEMO_VERIFIED", "OperationsPanel.tsx API 가용률 표시; 수신 표본 비율은 운영시간 기반 공식 가용률과 다름"],
    ["NET-05", "위치 갱신주기", "PARTIAL", "DEMO_VERIFIED", "operationalEvidence.ts: 지연·표본간 공백 계산; 장비별 평균/최대 갱신주기 공식 시험 미완"],
  ]),
  ...rows("3D 지형 관제", [
    ["DEM-01", "실증 후보지역 DEM 준비", "PARTIAL", "EXTERNAL_PENDING", "public/dem/37806/README.txt: 봉평 공개DEM 90m 준비; 기관 고해상도 실증 원본은 대기"],
    ["DEM-02", "DEM 지도 적용", "IMPLEMENTED", "DEMO_VERIFIED", "LivePositionMap.tsx raster-dem / public/dem/37806: 90m Terrarium 타일 적용"],
    ["DEM-03", "고도·경사 표현", "PARTIAL", "DEMO_VERIFIED", "LivePositionMap.tsx 고도·hillshade 구현; 경사면은 입력 GeoJSON 표시, DEM 경사 분석 엔진 없음"],
    ["DEM-04", "산악지형 3D 표현", "IMPLEMENTED", "OPERATING", "LivePositionMap.tsx setTerrain / pitch·bearing: 2D/3D 전환"],
    ["DEM-05", "Viewshed·통신 음영", "PARTIAL", "DEMO_VERIFIED", "LivePositionMap.tsx Viewshed·통신음영 입력면 표시; 실지형 가시권/전파해석 계산 엔진 없음"],
  ]),
  ...rows("재난 대응 정보", [
    ["RESP-01", "위험지역", "PARTIAL", "DEMO_VERIFIED", "LivePositionMap.tsx wildfire-risk-zones 표시; 운영 hazard-zone 조회·승인 계약 미연결"],
    ["RESP-02", "안전 대피로", "PARTIAL", "DEMO_VERIFIED", "LivePositionMap.tsx evacuation-routes 표시; DEMO 경로, 실제 안전성/지휘 승인 및 API 필요"],
    ["RESP-03", "진화자원", "PARTIAL", "DEMO_VERIFIED", "LivePositionMap.tsx suppression-resources 표시; 운영 진화자원 배치 연계 대기"],
    ["RESP-04", "소화용수", "PARTIAL", "DEMO_VERIFIED", "LivePositionMap.tsx water-sources 표시; 실제 취수 가용성·위치 API 대기"],
    ["RESP-05", "주변 대응자원", "PARTIAL", "DEMO_VERIFIED", "LivePositionMap.tsx nearby-response-resources 표시; 기관 자원/ETA 운영 연계 대기"],
  ]),
  ...rows("운영·KPI", [
    ["KPI-01", "위치정보 갱신 ≤3초", "PARTIAL", "DEMO_VERIFIED", "operationalEvidence.ts 평균 전송지연은 갱신주기와 다름; 계획 강화목표 ≤3초 공식 검증 별도"],
    ["KPI-02", "통신망 구축 ≤7분", "PARTIAL", "DEMO_VERIFIED", "buildOperationalEvidence 시작·완료 시각 차 계산; 실제 차량도착/망준비 증적 미연결, 강화목표 ≤7분"],
    ["KPI-03", "정보공유 성공률 ≥98%", "PARTIAL", "DEMO_VERIFIED", "calculateTelemetryMetrics 표본 비율은 메시지/영상/위치 전체 송수신 성공률 아님; 송신 분모·ACK 필요"],
    ["KPI-04", "네트워크 가용률 ≥98%", "PARTIAL", "DEMO_VERIFIED", "calculateTelemetryMetrics 수신 표본 비율; 총 운영/중단시간 기반 공식 가용률 미구현"],
    ["KPI-05", "시험비행·현장시험 증빙", "PARTIAL", "DEMO_VERIFIED", "buildOperationalEvidence 표본·식별자·FNV 체크섬 내보내기; 공인시험·실비행 증적 및 서명 없음"],
  ]),
];

export const REQUIREMENT_TOTAL = 47;

export function requirementSummary(items = REQUIREMENTS_READINESS) {
  return {
    total: items.length,
    softwareComplete: items.filter((item) => item.implementation === "IMPLEMENTED").length,
    implemented: items.filter((item) => item.implementation === "IMPLEMENTED").length,
    partial: items.filter((item) => item.implementation === "PARTIAL").length,
    contractOnly: items.filter((item) => item.implementation === "CONTRACT_ONLY").length,
    notImplemented: items.filter((item) => item.implementation === "NOT_IMPLEMENTED").length,
    operating: items.filter((item) => item.validation === "OPERATING").length,
    demoVerified: items.filter((item) => item.validation === "DEMO_VERIFIED").length,
    externalPending: items.filter((item) => item.validation === "EXTERNAL_PENDING").length,
    fieldPending: items.filter((item) => item.validation === "FIELD_PENDING").length,
  };
}
