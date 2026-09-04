import type { EventOverview, ForestEvent } from "../../http-api";
import { evaluateRiskZone } from "./operationalEvidence";

const point = (coordinates: [number, number]) => ({ type: "Point", coordinates });
const line = (coordinates: [number, number][]) => ({ type: "LineString", coordinates });
const polygon = (coordinates: [number, number][]) => ({ type: "Polygon", coordinates: [[...coordinates, coordinates[0]]] });

export const DEMO_EVENT: ForestEvent = {
  eventId: "demo-wildfire-pyeongchang",
  eventCode: "WF-2026-0903-01",
  disasterType: "WILDFIRE",
  eventName: "평창군 봉평면 산림화재 대응",
  status: "RESPONDING",
  severityCode: "SEVERE",
  locationName: "강원특별자치도 평창군 봉평면",
  geometry: point([128.365, 37.614]),
};

export type DemoScenario = "WILDFIRE" | "LANDSLIDE" | "COMMUNICATION_FAILURE" | "DRONE_EMERGENCY";
export const DEMO_SCENARIOS: Array<{ id: DemoScenario; label: string }> = [
  { id: "WILDFIRE", label: "산불 통합대응" },
  { id: "LANDSLIDE", label: "산사태 위험대응" },
  { id: "COMMUNICATION_FAILURE", label: "통신 장애복구" },
  { id: "DRONE_EMERGENCY", label: "드론 비상복귀" },
];

export function demoScenarioFromLocation(): DemoScenario {
  if (typeof window === "undefined") return "WILDFIRE";
  const scenario = new URLSearchParams(window.location.search).get("scenario") as DemoScenario | null;
  return DEMO_SCENARIOS.some((item) => item.id === scenario) ? scenario! : "WILDFIRE";
}

export function createDemoOverview(now = new Date(), scenario: DemoScenario = demoScenarioFromLocation()): EventOverview {
  const observedAt = now.toISOString();
  const phase = (now.getTime() / 1000) % 120;
  const droneLng = 128.359 + Math.cos((phase / 120) * Math.PI * 2) * 0.006;
  const droneLat = 37.619 + Math.sin((phase / 120) * Math.PI * 2) * 0.004;
  const wildfireRiskBoundary: [number, number][] = [[128.355,37.608],[128.356,37.624],[128.378,37.625],[128.382,37.608]];
  const crew12Position: [number, number] = [128.372, 37.615];
  const crew12Risk = evaluateRiskZone(crew12Position, wildfireRiskBoundary, 100);
  const asset = (assetId: string, assetName: string, assetType: string, coordinates: [number, number, number], extra = {}) => ({
    assetId, assetName, assetCode: assetId, assetType, operationalStatus: "ACTIVE", observedAt,
    geometry: { type: "Point", coordinates }, batteryPct: 78, signalStrengthDbm: -67,
    latencyMs: 142, packetLossPct: 0.7, positioningMethod: "RTK_FIXED", horizontalAccuracyM: 0.04,
    sourceSystem: "FIELD_GATEWAY", sourceAssetId: assetId, reportedByAssetId: "GW-RTK-01",
    reportingRole: "GATEWAY", activeLink: "PRIVATE_5G", expectedTelemetryIntervalSec: 3,
    eventRegistrationStatus: "REGISTERED", networkId: "NET-FIELD-01", ...extra,
  });

  const overview: EventOverview = {
    event: { ...DEMO_EVENT, updatedAt: observedAt },
    assets: [
      asset("DRONE-01", "정찰드론 1호", "UAV", [droneLng, droneLat, 312 + Math.sin(phase / 8) * 12], { operationalStatus: "FLYING", mission: "화선 정찰", batteryPct: 68, attributes: { flightMode: "AUTO", armed: true, missionSequence: Math.floor(phase / 15) + 1, emergencyStatus: "NORMAL", groundSpeedMps: 11.4, headingDeg: (phase * 3) % 360 } }),
      asset("CMD-01", "현장지휘차량", "COMMAND_VEHICLE", [128.349, 37.607, 196], { mission: "통합 지휘" }),
      asset("GW-RTK-01", "RTK·LPWA 이동기지국", "RTK_BASE_LPWA_GATEWAY", [128.354, 37.611, 224], { mission: "정밀측위·수집", batteryPct: 91 }),
      asset("FIRE-ENG-03", "산불진화차 3호", "ASSET", [128.371, 37.608, 241], { mission: "동측 화선 방어", operationalStatus: "MOVING" }),
      asset("RELAY-02", "산악 중계기 2호", "FIXED_RELAY", [128.376, 37.621, 428], { mission: "통신 음영 보완", signalStrengthDbm: -82 }),
    ],
    unregisteredAssets: [],
    personnel: [
      { personExternalId: "CREW-07", activityStatus: "APPROACHING", safetyStatus: "SAFE", observedAt, geometry: point([128.363, 37.611]), altitude: 238, batteryPct: 84, signalStrengthDbm: -71, latencyMs: 188, packetLossPct: 1.1, positioningMethod: "RTK_FIXED", horizontalAccuracyM: 0.06, sourceAssetId: "RTK-07", reportedByAssetId: "GW-RTK-01", reportingRole: "GATEWAY", activeLink: "LPWA", expectedTelemetryIntervalSec: 3 },
      { personExternalId: "CREW-12", activityStatus: "HOLDING", safetyStatus: crew12Risk.shouldAlert ? "CAUTION" : "SAFE", observedAt, geometry: point(crew12Position), altitude: 286, batteryPct: 61, signalStrengthDbm: -86, latencyMs: 291, packetLossPct: 2.3, positioningMethod: "RTK_FLOAT", horizontalAccuracyM: 0.43, sourceAssetId: "RTK-12", reportedByAssetId: "GW-RTK-01", reportingRole: "GATEWAY", activeLink: "LPWA", expectedTelemetryIntervalSec: 3 },
    ],
    networks: [
      { networkId: "NET-FIELD-01", networkName: "현장 이음5G·LPWA", networkType: "PRIVATE_5G_LPWA", status: "ACTIVE", availabilityPct: 99.2, lastReceivedAt: observedAt, attributes: { primary: "이음5G", activePath: "LTE 백홀" } },
      { networkId: "NET-BACKHAUL-01", networkName: "지휘차량 백홀", networkType: "LTE_TVWS", status: "DEGRADED", availabilityPct: 98.4, lastReceivedAt: observedAt, attributes: { primary: "LTE", switchReason: "TVWS 신호 약화" } },
    ],
    topology: { networks: [], nodes: [], links: [] },
    alerts: [
      { alertId: "ALT-01", severity: "CRITICAL", status: "ACTIVE", title: "대원 위험구역 진입", message: `CREW-12가 산불 위험구역 ${crew12Risk.inside ? "내부에 진입" : `${crew12Risk.boundaryDistanceM}m 이내에 접근`}했습니다. 북서 대피로로 이동을 지시하세요.`, issuedAt: observedAt, issuerOrgCode: "공간판정 엔진" },
      { alertId: "ALT-02", severity: "WARNING", status: "ACTIVE", title: "산악 중계기 신호 저하", message: "RELAY-02 수신신호가 -82dBm으로 낮습니다. 예비 중계기 배치를 검토하세요.", issuedAt: observedAt, issuerOrgCode: "통신 관제" },
    ],
    reports: [{ reportId: "RPT-01", title: "동측 화선 대응 보고", reportText: "진화차 3호 현장 진입, 소화용수 2개소 확보 완료", urgency: "WARNING", status: "SUBMITTED", reportedAt: observedAt, reporterOrgCode: "현장지휘" }],
    kpis: [
      { kpiMeasurementId: "KPI-LOC", metricCode: "LOCATION_LATENCY", metricName: "위치정보 갱신시간", measuredValue: 2.1, unit: "초", targetOperator: "≤", targetValue: 3, passed: true, measuredTo: observedAt, sourceSystem: "Gateway 원시로그", evidence: ["run-20260903-01"] },
      { kpiMeasurementId: "KPI-AVL", metricCode: "NETWORK_AVAILABILITY", metricName: "네트워크 가용률", measuredValue: 99.2, unit: "%", targetOperator: "≥", targetValue: 98, passed: true, measuredTo: observedAt, sourceSystem: "NMS", evidence: ["run-20260903-01"] },
      { kpiMeasurementId: "KPI-SHARE", metricCode: "SHARING_SUCCESS", metricName: "정보공유 성공률", measuredValue: 98.8, unit: "%", targetOperator: "≥", targetValue: 98, passed: true, measuredTo: observedAt, sourceSystem: "Message Gateway", evidence: ["run-20260903-01"] },
      { kpiMeasurementId: "KPI-DEPLOY", metricCode: "NETWORK_DEPLOYMENT_TIME", metricName: "통신망 구축시간", measuredValue: 6.4, unit: "분", targetOperator: "≤", targetValue: 7, passed: true, measuredTo: observedAt, sourceSystem: "DEMO 현장시험 타임라인", evidence: ["demo-run-20260903-01"] },
    ],
    integrations: [],
    domainDetail: { mode: "SIMULATION", terrain: "DEM 10m", windDirection: "서남서", windSpeedMps: 4.2 },
    domainLayers: {
      firelines: [{ id: "fireline-1", observedAt, fireline: line([[128.359,37.616],[128.364,37.618],[128.369,37.616],[128.372,37.613]]) }],
      "spread-predictions": [{ id: "spread-1", baseTime: observedAt, modelName: "ForestSpread AI", modelVersion: "2.4", confidence: 0.86, predictedArea: polygon([[128.357,37.611],[128.360,37.622],[128.373,37.624],[128.379,37.614],[128.369,37.606]]) }],
      "wildfire-risk-zones": [{ id: "risk-1", observedAt, resultGeometry: polygon(wildfireRiskBoundary) }],
      "evacuation-routes": [{ id: "evac-1", observedAt, resultGeometry: line([[128.373,37.616],[128.365,37.610],[128.355,37.606],[128.346,37.603]]) }],
      "suppression-resources": [{ id: "sup-1", observedAt, resultGeometry: point([128.351,37.606]) }, { id: "sup-2", observedAt, resultGeometry: point([128.375,37.608]) }],
      "water-sources": [{ id: "water-1", observedAt, resultGeometry: point([128.343,37.609]) }, { id: "water-2", observedAt, resultGeometry: point([128.382,37.604]) }],
      "nearby-response-resources": [{ id: "station-1", observedAt, resourceType: "산불대응센터", etaMinutes: 12, resultGeometry: point([128.337,37.601]) }, { id: "heli-1", observedAt, resourceType: "임차헬기 대기장", etaMinutes: 18, resultGeometry: point([128.397,37.631]) }],
      viewsheds: [{ id: "viewshed-1", observedAt, observerAltitudeM: 428, resultGeometry: polygon([[128.362,37.610],[128.353,37.622],[128.368,37.631],[128.388,37.626],[128.389,37.611],[128.376,37.604]]) }],
      "communication-shadows": [{ id: "shadow-1", observedAt, reason: "북동 능선 차폐", resultGeometry: polygon([[128.378,37.617],[128.385,37.624],[128.393,37.620],[128.389,37.612]]) }],
      "slope-gradients": [{ id: "slope-gradient-1", assessedAt: observedAt, maxSlopeDeg: 37, resultGeometry: polygon([[128.369,37.616],[128.376,37.622],[128.382,37.616],[128.376,37.609]]) }],
      "external-firms": [{ id: "firms-demo-1", observedAt, provider: "NASA FIRMS", confidence: "high", frp: 18.4, resultGeometry: point([128.366,37.616]) }],
      "slope-assessments": [{ id: "slope-1", assessedAt: observedAt, geometry: polygon([[128.371,37.619],[128.377,37.621],[128.379,37.615],[128.374,37.613]]) }],
      "external-landslide-history": [{ id: "slide-history-1", observedAt, provider: "재난안전데이터", resultGeometry: point([128.379,37.620]) }],
    },
  };

  if (scenario === "LANDSLIDE") {
    overview.event = {
      ...overview.event,
      eventId: "demo-landslide-pyeongchang",
      eventCode: "LS-2026-0903-01",
      disasterType: "LANDSLIDE",
      eventName: "평창군 봉평면 산사태 위험대응",
      severityCode: "CRITICAL",
    };
    overview.alerts = [{
      alertId: "ALT-LAND-01", severity: "CRITICAL", status: "ACTIVE", title: "급경사지 산사태 위험 상승",
      message: "시간강우량과 사면 위험도가 임계치를 초과했습니다. 동측 계곡 접근을 통제하고 지정 대피로를 사용하세요.",
      issuedAt: observedAt, issuerOrgCode: "산사태 관제",
    }];
    overview.reports = [{ reportId: "RPT-LAND-01", title: "산사태 위험구역 통제", reportText: "동측 계곡 진입 통제와 주민 대피경로 확보를 완료했습니다.", urgency: "CRITICAL", status: "SUBMITTED", reportedAt: observedAt, reporterOrgCode: "현장지휘" }];
  }

  if (scenario === "COMMUNICATION_FAILURE") {
    const relay = overview.assets.find((item) => item.assetId === "RELAY-02");
    if (relay) Object.assign(relay, { operationalStatus: "SIGNAL_LOST", signalStrengthDbm: -113, latencyMs: 4200, packetLossPct: 38.2, observedAt: new Date(now.getTime() - 20_000).toISOString() });
    overview.networks = overview.networks.map((network, index) => index === 0
      ? { ...network, status: "FAILED", availabilityPct: 91.3, lastReceivedAt: new Date(now.getTime() - 20_000).toISOString(), attributes: { primary: "이음5G", activePath: "LTE 비상 백홀", switchReason: "산악 중계기 두절" } }
      : network);
    overview.alerts = [{
      alertId: "ALT-NET-01", severity: "CRITICAL", status: "ACTIVE", title: "산악 중계기 통신 두절",
      message: "RELAY-02가 20초 동안 수신되지 않았습니다. LTE 비상 백홀로 전환하고 예비 중계기를 배치하세요.",
      issuedAt: observedAt, issuerOrgCode: "통신 관제",
    }];
  }

  if (scenario === "DRONE_EMERGENCY") {
    const drone = overview.assets.find((item) => item.assetId === "DRONE-01");
    if (drone) {
      Object.assign(drone, { operationalStatus: "RETURNING", batteryPct: 19 });
      drone.attributes = { ...(drone.attributes as Record<string, unknown>), flightMode: "RTL", emergencyStatus: "LOW_BATTERY", groundSpeedMps: 14.8 };
    }
    overview.alerts = [{
      alertId: "ALT-UAV-01", severity: "CRITICAL", status: "ACTIVE", title: "드론 저전압 비상복귀",
      message: "DRONE-01 배터리가 19%로 감소해 RTL 모드로 전환했습니다. 복귀 경로와 착륙지 안전을 확인하세요.",
      issuedAt: observedAt, issuerOrgCode: "드론 관제",
    }];
  }

  return overview;
}
