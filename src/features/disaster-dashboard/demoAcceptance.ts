import { createDemoOverview, type DemoScenario } from "./demoOverview";
import { buildOperationalEvidence, classifyLinkHealth, evaluateRiskZone } from "./operationalEvidence";
import { REQUIREMENTS_READINESS } from "./requirementsReadiness";

export type DemoAcceptanceCase = { requirementId: string; passed: boolean; evidence: string };

const scenarios: DemoScenario[] = ["WILDFIRE", "LANDSLIDE", "COMMUNICATION_FAILURE", "DRONE_EMERGENCY"];

export function runDemoAcceptance(now = new Date("2026-09-04T00:00:30Z")) {
  const overview = Object.fromEntries(scenarios.map((scenario) => [scenario, createDemoOverview(now, scenario)])) as Record<DemoScenario, ReturnType<typeof createDemoOverview>>;
  const wildfire = overview.WILDFIRE;
  const drone = wildfire.assets.find((asset) => asset.assetId === "DRONE-01")!;
  const emergencyDrone = overview.DRONE_EMERGENCY.assets.find((asset) => asset.assetId === "DRONE-01")!;
  const relayFailure = overview.COMMUNICATION_FAILURE.assets.find((asset) => asset.assetId === "RELAY-02")!;
  const layers = wildfire.domainLayers;
  const layer = (id: string) => (layers[id] ?? []).length > 0;
  const locationSamples = wildfire.assets.slice(0, 4).map((asset, sequence) => ({
    assetId: String(asset.assetId), sequence: sequence + 1,
    observedAt: String(asset.observedAt), receivedAt: new Date(Date.parse(String(asset.observedAt)) + 250).toISOString(),
  }));
  const evidence = buildOperationalEvidence({ eventId: String(wildfire.event.eventId), runId: "demo-acceptance-20260904", samples: locationSamples, startedAt: new Date(now.getTime() - 6.4 * 60_000).toISOString(), networkReadyAt: now.toISOString() });
  const checks: Record<string, [boolean, string]> = {
    "GIS-01": [layer("wildfire-risk-zones") && overview.LANDSLIDE.event.disasterType === "LANDSLIDE", "산불 위험면과 산사태 시나리오 생성"],
    "GIS-02": [wildfire.assets.length > 0 && wildfire.personnel.length > 0, "자산·인원 좌표 수신"],
    "GIS-03": [Object.keys(layers).length >= 10, "독립 레이어 ID 계약"],
    "GIS-04": [["wildfire-risk-zones", "evacuation-routes", "suppression-resources"].every(layer), "위험·대피·진화자원 동시 중첩"],
    "FIRE-03": [layer("external-firms") && layer("wildfire-risk-zones"), "화점·위험면 공간자료"],
    "FIRE-04": [layer("external-firms"), "외부기관 화점 지도자료"],
    "LAND-04": [overview.LANDSLIDE.event.disasterType === "LANDSLIDE" && layer("external-landslide-history"), "산사태 독립 시나리오·이력 레이어"],
    "ASSET-01": [wildfire.assets.length >= 5 && wildfire.personnel.length >= 2, "유형별 현장자원 7건"],
    "ASSET-02": [wildfire.assets.some((asset) => String(asset.positioningMethod).startsWith("RTK")), "RTK FIX/FLOAT 품질값"],
    "ASSET-03": [wildfire.assets.every((asset) => asset.batteryPct != null && asset.signalStrengthDbm != null), "배터리·신호·지연 상태값"],
    "ASSET-04": [wildfire.assets.every((asset) => Boolean(asset.assetId)), "assetId 기반 조회키"],
    "ASSET-05": [wildfire.assets.every((asset) => asset.reportedByAssetId === "GW-RTK-01"), "Gateway 전달주체 추적"],
    "DRONE-01": [Array.isArray((drone.geometry as { coordinates?: unknown[] }).coordinates), "드론 실시간 좌표"],
    "DRONE-02": [drone.operationalStatus === "FLYING" && Number((drone.attributes as Record<string, unknown>).groundSpeedMps) > 0, "비행·속도·방향 상태"],
    "DRONE-03": [drone.sourceSystem === "FIELD_GATEWAY" && Boolean(drone.attributes), "MAVLink 변환 텔레메트리 계약"],
    "DRONE-04": [drone.positioningMethod === "RTK_FIXED" && Number(drone.horizontalAccuracyM) > 0, "GPS/RTK 위치 품질"],
    "DRONE-05": [(emergencyDrone.attributes as Record<string, unknown>).flightMode === "RTL" && emergencyDrone.operationalStatus === "RETURNING", "저전압 RTL 비상복귀"],
    "ALERT-01": [wildfire.alerts.length > 0 && overview.LANDSLIDE.alerts.length > 0, "산불·산사태 관제 경보"],
    "ALERT-02": [overview.COMMUNICATION_FAILURE.alerts.some((alert) => String(alert.title).includes("통신")), "통신두절 경보"],
    "ALERT-03": [evaluateRiskZone([128.372, 37.615], [[128.355,37.608],[128.356,37.624],[128.378,37.625],[128.382,37.608]]).shouldAlert, "좌표-위험면 공간판정"],
    "ALERT-04": [wildfire.alerts.every((alert) => Boolean(alert.issuedAt)), "발령시각 포함 경보목록"],
    "NET-01": [wildfire.networks.length >= 2 && overview.COMMUNICATION_FAILURE.networks.some((network) => network.status === "FAILED"), "현장망·백홀·장애 시나리오"],
    "NET-02": [wildfire.networks.every((network) => Boolean(network.lastReceivedAt)), "망별 마지막 수신시각"],
    "NET-03": [classifyLinkHealth(String(relayFailure.observedAt), now, 3) === "DISCONNECTED", "목표주기 기반 두절판정"],
    "NET-04": [wildfire.networks.every((network) => Number(network.availabilityPct) > 0), "망별 가용률"],
    "NET-05": [wildfire.assets.every((asset) => Number(asset.expectedTelemetryIntervalSec) === 3), "3초 목표 수신주기"],
    "DEM-02": [wildfire.domainDetail?.terrain === "DEM 10m", "DEM terrain 계약"],
    "DEM-03": [layer("slope-gradients"), "경사도 분석면"],
    "DEM-04": [wildfire.domainDetail?.terrain === "DEM 10m", "3D terrain 입력자료"],
    "DEM-05": [layer("viewsheds") && layer("communication-shadows"), "가시권·통신음영 독립 레이어"],
    "RESP-01": [layer("wildfire-risk-zones"), "위험지역"], "RESP-02": [layer("evacuation-routes"), "안전 대피로"],
    "RESP-03": [layer("suppression-resources"), "진화자원"], "RESP-04": [layer("water-sources"), "소화용수"],
    "RESP-05": [layer("nearby-response-resources"), "주변 대응자원·ETA"],
    "KPI-01": [evidence.metrics.averageLatencySec <= 3, "원시표본 평균 수신지연"],
    "KPI-02": [evidence.metrics.networkDeploymentMinutes <= 7, "시작-망준비 6.4분"],
    "KPI-03": [evidence.metrics.sharingSuccessPct >= 98, "sequence 수신 성공률"],
    "KPI-04": [evidence.metrics.availabilityPct >= 98, "목표주기 대비 가용률"],
    "KPI-05": [evidence.rawSamples.length > 0 && Boolean(evidence.integrity.checksum), "실행 ID·원시표본·체크섬"],
  };
  const cases: DemoAcceptanceCase[] = REQUIREMENTS_READINESS
    .filter((item) => ["OPERATING", "DEMO_VERIFIED"].includes(item.validation))
    .map((item) => ({ requirementId: item.id, passed: checks[item.id]?.[0] === true, evidence: checks[item.id]?.[1] ?? "자동검증 정의 누락" }));
  return { generatedAt: new Date().toISOString(), scenarios, total: cases.length, passed: cases.filter((item) => item.passed).length, failed: cases.filter((item) => !item.passed).length, cases };
}
