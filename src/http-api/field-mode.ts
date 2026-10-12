import type { ApiRecord, EventOverview, ForestEvent } from "./forest-api";

const DEFAULT_FIELD_EVENT_ID = "field-md1000-local";
const PREVIEW_CENTER: [number, number] = [127.3845, 36.3504];

const point = (coordinates: [number, number]) => ({ type: "Point", coordinates });
const polygon = (coordinates: [number, number][]) => ({
  type: "Polygon",
  coordinates: [[...coordinates, coordinates[0]]],
});

export function fieldEventId(): string {
  const configured = import.meta.env.VITE_FIELD_EVENT_ID?.trim();
  return configured || DEFAULT_FIELD_EVENT_ID;
}

export function fieldAssetCode(): string {
  return import.meta.env.VITE_FIELD_ASSET_CODE?.trim() || "MD1000-01";
}

export function isLocalFieldMode(): boolean {
  if (import.meta.env.VITE_FIELD_MODE_ENABLED !== "1" || typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("field") === "1" && params.get("e2e") !== "1";
}

export function isFieldPreviewMode(): boolean {
  if (!isLocalFieldMode() || typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("preview") === "1";
}

export function fieldEvent(): ForestEvent {
  const preview = isFieldPreviewMode();
  return {
    eventId: fieldEventId(),
    eventCode: preview ? "FIELD-PREVIEW-MD1000" : "FIELD-MD1000",
    disasterType: "WILDFIRE",
    eventName: preview ? "MD1000 현장 화면 미리보기" : "MD1000 현장 실기체 연동",
    status: "RESPONDING",
    severityCode: "NORMAL",
    locationName: preview ? "대전광역시 · UI PREVIEW" : "LOCAL FIELD SESSION",
    geometry: preview ? point(PREVIEW_CENTER) : undefined,
  };
}

export function fieldRegisteredAssets(): ApiRecord[] {
  const assetCode = fieldAssetCode();
  return [
    {
      assetId: "field-md1000-canonical-local",
      assetCode,
      assetType: "UAV",
      assetName: "MD1000 실기체",
      ownerOrgCode: "FIELD-LOCAL",
      modelName: "MD1000",
      serialNumber: null,
      status: "ACTIVE",
      specifications: {
        telemetrySourceAssetId: assetCode,
        localFieldSession: true,
        telemetryPositionSource: "GLOBAL_POSITION_INT(33)",
      },
      eventResourceId: "field-resource-md1000-local",
      eventId: fieldEventId(),
      assignedOrgCode: "FIELD-LOCAL",
      mission: "PHYSICAL_FLIGHT_TELEMETRY",
      assignedAt: null,
      releasedAt: null,
      eventRegistrationStatus: "REGISTERED",
    },
  ];
}

function previewAsset(
  assetId: string,
  assetName: string,
  assetType: string,
  coordinates: [number, number, number],
  observedAt: string,
  extra: ApiRecord = {},
): ApiRecord {
  return {
    assetId,
    assetCode: assetId,
    assetName,
    assetType,
    operationalStatus: "ACTIVE",
    observedAt,
    geometry: { type: "Point", coordinates },
    batteryPct: 82,
    signalStrengthDbm: -68,
    latencyMs: 148,
    packetLossPct: 0.8,
    sourceSystem: "FIELD_PREVIEW",
    eventRegistrationStatus: "REGISTERED",
    networkId: "FIELD-NET-PREVIEW",
    previewOnly: true,
    ...extra,
  };
}

export function createFieldPreviewOverview(
  event: ForestEvent = fieldEvent(),
  now = new Date(),
): EventOverview {
  const observedAt = now.toISOString();
  const phase = (now.getTime() / 1000) % 120;
  const angle = (phase / 120) * Math.PI * 2;
  const droneLng = PREVIEW_CENTER[0] + Math.cos(angle) * 0.0042;
  const droneLat = PREVIEW_CENTER[1] + Math.sin(angle) * 0.0028;
  const coverageBoundary: [number, number][] = [
    [127.3758, 36.3440],
    [127.3768, 36.3578],
    [127.3916, 36.3600],
    [127.3982, 36.3518],
    [127.3930, 36.3428],
    [127.3814, 36.3418],
  ];

  return {
    event: {
      ...event,
      eventName: "MD1000 현장 화면 미리보기",
      locationName: "대전광역시 · PREVIEW DATA",
      geometry: point(PREVIEW_CENTER),
      updatedAt: observedAt,
    },
    assets: [
      previewAsset("MD1000-01", "MD1000 정찰드론", "UAV", [droneLng, droneLat, 118 + Math.sin(angle) * 8], observedAt, {
        operationalStatus: "FLYING",
        mission: "산림 현장 정찰",
        batteryPct: 76,
        sourceAssetId: "MD1000-01",
        positioningMethod: "GNSS",
        attributes: {
          mavlinkVersion: 2,
          systemId: 1,
          componentId: 1,
          sourceAddress: "127.0.0.1:64361",
          flightMode: "LOITER",
          armed: true,
          groundSpeedMps: 7.4,
          verticalSpeedMps: 0.2,
          headingDeg: (phase * 3) % 360,
          telemetryPositionSource: "GLOBAL_POSITION_INT(33)",
          previewOnly: true,
        },
      }),
      previewAsset("CMD-01", "현장지휘차량", "COMMAND_VEHICLE", [127.3798, 36.3462, 70], observedAt, { mission: "통합 지휘" }),
      previewAsset("RELAY-01", "산악 중계기 1호", "FIXED_RELAY", [127.3936, 36.3572, 186], observedAt, { mission: "통신 음영 보완", signalStrengthDbm: -79 }),
      previewAsset("RTK-BASE-01", "RTK 기준국", "RTK_BASE_LPWA_GATEWAY", [127.3828, 36.3486, 74], observedAt, { mission: "정밀측위·데이터 중계", batteryPct: 93 }),
      previewAsset("FIRE-ENG-01", "산불진화차 1호", "ASSET", [127.3894, 36.3466, 78], observedAt, { mission: "현장 대응", operationalStatus: "MOVING" }),
    ],
    unregisteredAssets: [],
    personnel: [
      {
        personExternalId: "CREW-01",
        activityStatus: "APPROACHING",
        safetyStatus: "SAFE",
        observedAt,
        geometry: point([127.3876, 36.3518]),
        batteryPct: 88,
        signalStrengthDbm: -72,
        sourceSystem: "FIELD_PREVIEW",
        previewOnly: true,
      },
      {
        personExternalId: "CREW-02",
        activityStatus: "HOLDING",
        safetyStatus: "SAFE",
        observedAt,
        geometry: point([127.3842, 36.3546]),
        batteryPct: 79,
        signalStrengthDbm: -75,
        sourceSystem: "FIELD_PREVIEW",
        previewOnly: true,
      },
    ],
    networks: [
      {
        networkId: "FIELD-NET-PREVIEW",
        networkName: "현장 MAVLink·LTE 백홀",
        networkType: "MAVLINK_LTE",
        status: "ACTIVE",
        availabilityPct: 99.1,
        lastReceivedAt: observedAt,
        previewOnly: true,
      },
      {
        networkId: "FIELD-RELAY-PREVIEW",
        networkName: "산악 중계 링크",
        networkType: "RELAY",
        status: "ACTIVE",
        availabilityPct: 98.7,
        lastReceivedAt: observedAt,
        previewOnly: true,
      },
    ],
    topology: { networks: [], nodes: [], links: [] },
    alerts: [
      {
        alertId: "FIELD-PREVIEW-ALERT-01",
        severity: "WARNING",
        status: "ACTIVE",
        title: "중계기 신호 저하 예시",
        message: "대표 공유용 FIELD 화면 미리보기 데이터입니다. 실제 현장 경보가 아닙니다.",
        issuedAt: observedAt,
        issuerOrgCode: "FIELD_PREVIEW",
        previewOnly: true,
      },
    ],
    reports: [
      {
        reportId: "FIELD-PREVIEW-RPT-01",
        title: "현장 연동 상태 미리보기",
        reportText: "MD1000 → QGC → Uplink → Core → Dashboard 표시 예시",
        urgency: "NORMAL",
        status: "SUBMITTED",
        reportedAt: observedAt,
        reporterOrgCode: "FIELD_PREVIEW",
        previewOnly: true,
      },
    ],
    kpis: [
      { kpiMeasurementId: "FIELD-PREVIEW-DEPLOY", metricCode: "NETWORK_DEPLOYMENT_TIME", metricName: "통신망 구축시간", measuredValue: 5.8, unit: "분", targetOperator: "≤", targetValue: 7, passed: true, measuredTo: observedAt, sourceSystem: "FIELD_PREVIEW", previewOnly: true },
      { kpiMeasurementId: "FIELD-PREVIEW-LOC", metricCode: "LOCATION_LATENCY", metricName: "위치정보 갱신시간", measuredValue: 1.4, unit: "초", targetOperator: "≤", targetValue: 3, passed: true, measuredTo: observedAt, sourceSystem: "FIELD_PREVIEW", previewOnly: true },
      { kpiMeasurementId: "FIELD-PREVIEW-SHARE", metricCode: "SHARING_SUCCESS", metricName: "정보공유 성공률", measuredValue: 99.0, unit: "%", targetOperator: "≥", targetValue: 98, passed: true, measuredTo: observedAt, sourceSystem: "FIELD_PREVIEW", previewOnly: true },
      { kpiMeasurementId: "FIELD-PREVIEW-AVL", metricCode: "NETWORK_AVAILABILITY", metricName: "네트워크 가용률", measuredValue: 99.1, unit: "%", targetOperator: "≥", targetValue: 98, passed: true, measuredTo: observedAt, sourceSystem: "FIELD_PREVIEW", previewOnly: true },
    ],
    integrations: [],
    domainDetail: {
      mode: "FIELD_PREVIEW",
      note: "UI preview only; not physical flight evidence",
    },
    domainLayers: {
      "communication-coverages": [
        {
          id: "field-preview-coverage",
          observedAt,
          coverageArea: polygon(coverageBoundary),
          previewOnly: true,
        },
      ],
      "wildfire-risk-zones": [
        {
          id: "field-preview-risk",
          observedAt,
          resultGeometry: polygon([
            [127.3862, 36.3490],
            [127.3894, 36.3548],
            [127.3954, 36.3536],
            [127.3942, 36.3478],
          ]),
          previewOnly: true,
        },
      ],
    },
    liveDroneTelemetry: {
      status: "PREVIEW",
      matched: 1,
      unmatched: 0,
      live: 1,
      stale: 0,
      offline: 0,
    },
  };
}

export function fieldCoreStatusLabel(status: unknown, matched: number): string {
  if (status === "CONNECTED") {
    return matched > 0
      ? "Core API 정상"
      : "Core API 정상 · 실기체 위치 대기";
  }
  if (status === "UNAVAILABLE") {
    return "Core API 재연결 중 · 마지막 유효 위치 유지";
  }
  return "Core API 상태 확인 중";
}

export function emptyFieldOverview(event: ForestEvent = fieldEvent()): Omit<EventOverview, "assets" | "liveDroneTelemetry"> {
  return {
    event,
    unregisteredAssets: [],
    personnel: [],
    networks: [],
    topology: { networks: [], nodes: [], links: [] },
    alerts: [],
    reports: [],
    kpis: [],
    integrations: [],
    domainDetail: null,
    domainLayers: {},
  };
}
