export type RequirementValidation = "OPERATING" | "DEMO_VERIFIED" | "EXTERNAL_PENDING" | "FIELD_PENDING";

export type RequirementReadiness = {
  id: string;
  category: string;
  requirement: string;
  softwareComplete: true;
  validation: RequirementValidation;
  evidence: string;
};

const rows = (
  category: string,
  values: Array<[string, string, RequirementValidation, string]>,
): RequirementReadiness[] => values.map(([id, requirement, validation, evidence]) => ({
  id, category, requirement, softwareComplete: true, validation, evidence,
}));

export const REQUIREMENTS_READINESS: RequirementReadiness[] = [
  ...rows("GIS 통합상황판", [
    ["GIS-01", "산불·산사태 위험지역 지도 표시", "DEMO_VERIFIED", "위험면·대표영역 GeoJSON 레이어"],
    ["GIS-02", "현재 현장 자산·장비 위치 표시", "DEMO_VERIFIED", "자산·인원 위치 통합 및 1초 갱신 시나리오"],
    ["GIS-03", "지도 레이어 ON/OFF", "OPERATING", "레이어·자원 유형별 토글"],
    ["GIS-04", "위험지역·대피경로·진화자원 통합 표시", "DEMO_VERIFIED", "공통상황도 중첩 레이어"],
  ]),
  ...rows("산불 정보 시각화", [
    ["FIRE-01", "NASA FIRMS 산불 탐지", "EXTERNAL_PENDING", "FIRMS API 클라이언트·화점 레이어·상세 팝업"],
    ["FIRE-02", "산림청 산불위험예보", "EXTERNAL_PENDING", "위험예보 API 클라이언트·오류 상태"],
    ["FIRE-03", "위험도·발생지점 지도 표현", "DEMO_VERIFIED", "좌표·행정구역 대표영역 공간화"],
    ["FIRE-04", "외부기관 데이터를 관제 지도에 표시", "DEMO_VERIFIED", "외부기관 레이어·수동 새로고침"],
  ]),
  ...rows("산사태 정보 시각화", [
    ["LAND-01", "산사태 예측정보", "EXTERNAL_PENDING", "예측정보 API 클라이언트·예측등급 레이어"],
    ["LAND-02", "지역 위험정보", "EXTERNAL_PENDING", "지역위험 API 클라이언트·위험면 레이어"],
    ["LAND-03", "발생이력", "EXTERNAL_PENDING", "발생이력 API 클라이언트·발생지점 레이어"],
    ["LAND-04", "산사태 레이어 구분 및 ON/OFF", "OPERATING", "예측·지역위험·이력 독립 토글"],
  ]),
  ...rows("현장 자산 관제", [
    ["ASSET-01", "드론·차량·인력·장비 통합 표시", "DEMO_VERIFIED", "유형별 마커·필터·상세정보"],
    ["ASSET-02", "GNSS·RTK 위치 수신", "DEMO_VERIFIED", "RTK FIX/FLOAT·정확도·RTCM 상태 수신 시나리오"],
    ["ASSET-03", "장비 상태 표시", "DEMO_VERIFIED", "배터리·신호·지연·손실·운영상태 판정"],
    ["ASSET-04", "assetId 기준 로그·이력 조회", "DEMO_VERIFIED", "assetId 조회 화면·페이지네이션 API 계약 테스트"],
    ["ASSET-05", "Gateway → Backend → Frontend 위치 갱신", "DEMO_VERIFIED", "sourceAssetId·reportedByAssetId·1초 갱신 시나리오"],
  ]),
  ...rows("드론 관제", [
    ["DRONE-01", "드론 실시간 위치", "DEMO_VERIFIED", "1초 이동 궤적·실시간 좌표 갱신 테스트"],
    ["DRONE-02", "비행상태", "DEMO_VERIFIED", "운영상태·속도·방향 시나리오"],
    ["DRONE-03", "MAVLink 텔레메트리", "DEMO_VERIFIED", "MAVLink UDP 설정·수신확인 및 텔레메트리 계약"],
    ["DRONE-04", "GPS·GNSS", "DEMO_VERIFIED", "측위방식·고도·정확도 텔레메트리"],
    ["DRONE-05", "임무·비상 상태", "DEMO_VERIFIED", "AUTO/RTL·ARM·임무순번·저전압 비상 시나리오"],
    ["DRONE-06", "실비행 화면 이동", "FIELD_PENDING", "실시간 위치 렌더링 계약·DEMO 검증"],
  ]),
  ...rows("경보·이벤트", [
    ["ALERT-01", "산불·산사태 위험 알림", "DEMO_VERIFIED", "위험도 기반 관제 경보 카드"],
    ["ALERT-02", "장비·통신 이상", "DEMO_VERIFIED", "신호저하·지연·두절 경보"],
    ["ALERT-03", "위험지역 진입", "DEMO_VERIFIED", "좌표-폴리곤 공간판정·대피조치 경보 테스트"],
    ["ALERT-04", "최근 이벤트·경보 목록", "DEMO_VERIFIED", "심각도·발령시각 정렬 목록"],
  ]),
  ...rows("통신 상태", [
    ["NET-01", "현장 ↔ Gateway ↔ 서버 상태", "DEMO_VERIFIED", "통신 토폴로지·전달 주체·장애복구 시나리오"],
    ["NET-02", "마지막 정상 수신시각", "DEMO_VERIFIED", "관측시각 기반 상대시간·최종수신 자동산출"],
    ["NET-03", "장비별 정상·지연·두절", "DEMO_VERIFIED", "목표 수신주기 1.5배/3배 자동판정 테스트"],
    ["NET-04", "통신 가용률", "DEMO_VERIFIED", "원시 텔레메트리 기반 가용률 산출·KPI 표시"],
    ["NET-05", "위치 갱신주기", "DEMO_VERIFIED", "목표 3초·평균지연·최대공백 증적"],
  ]),
  ...rows("3D 지형 관제", [
    ["DEM-01", "실증 후보지역 DEM 준비", "EXTERNAL_PENDING", "실증지역 원본 DEM 교체 계약"],
    ["DEM-02", "DEM 지도 적용", "DEMO_VERIFIED", "MapLibre raster-dem terrain"],
    ["DEM-03", "고도·경사 표현", "DEMO_VERIFIED", "고도 음영·경사도 레이어"],
    ["DEM-04", "산악지형 3D 표현", "OPERATING", "pitch·bearing·terrain 전환"],
    ["DEM-05", "Viewshed·통신 음영", "DEMO_VERIFIED", "가시권·통신음영 독립 레이어"],
  ]),
  ...rows("재난 대응 정보", [
    ["RESP-01", "위험지역", "DEMO_VERIFIED", "산불 위험면 레이어"],
    ["RESP-02", "안전 대피로", "DEMO_VERIFIED", "대피경로 선형 레이어"],
    ["RESP-03", "진화자원", "DEMO_VERIFIED", "진화차·방어선 지점"],
    ["RESP-04", "소화용수", "DEMO_VERIFIED", "취수 가능 지점"],
    ["RESP-05", "주변 대응자원", "DEMO_VERIFIED", "대응센터·헬기장·도착예정시간"],
  ]),
  ...rows("운영·KPI", [
    ["KPI-01", "위치정보 갱신 ≤3초", "DEMO_VERIFIED", "원시 수신표본 기반 ≤3초 자동판정"],
    ["KPI-02", "통신망 구축 ≤7분", "DEMO_VERIFIED", "시험 시작·망 준비시각 기반 ≤7분 자동산출"],
    ["KPI-03", "정보공유 성공률 ≥98%", "DEMO_VERIFIED", "수신 sequence 기반 성공률 자동산출"],
    ["KPI-04", "네트워크 가용률 ≥98%", "DEMO_VERIFIED", "목표주기 대비 수신표본 기반 가용률 자동산출"],
    ["KPI-05", "시험비행·현장시험 증빙", "DEMO_VERIFIED", "시험실행 ID·원시표본·무결성 체크섬 JSON"],
  ]),
];

export const REQUIREMENT_TOTAL = 47;

export function requirementSummary(items = REQUIREMENTS_READINESS) {
  return {
    total: items.length,
    softwareComplete: items.filter((item) => item.softwareComplete).length,
    operating: items.filter((item) => item.validation === "OPERATING").length,
    demoVerified: items.filter((item) => item.validation === "DEMO_VERIFIED").length,
    externalPending: items.filter((item) => item.validation === "EXTERNAL_PENDING").length,
    fieldPending: items.filter((item) => item.validation === "FIELD_PENDING").length,
  };
}
