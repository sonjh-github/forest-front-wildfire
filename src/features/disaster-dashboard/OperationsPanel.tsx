import { useMemo, useState } from "react";
import type { ApiRecord, EventOverview } from "../../http-api";
import type { LiveLocation, ResourceGroup } from "./UnifiedDisasterDashboard";
import { buildOperationalEvidence, classifyLinkHealth, type TelemetrySample } from "./operationalEvidence";

export type PanelTab = "layers" | "alerts" | "networks" | "reports" | "kpis" | "integrations";

export type ExternalSourceId =
  | "firms"
  | "wildfireRisk"
  | "landslideForecast"
  | "landslideHistory"
  | "landslideRegionalRisk";

export type ExternalSourceState = {
  status: "idle" | "loading" | "ok" | "error";
  count: number;
  checkedAt: string | null;
  message?: string;
  lastSuccessAt?: string | null;
  servingStale?: boolean;
};

export type ExternalIntegrationStatus = Record<ExternalSourceId, ExternalSourceState>;


interface OperationsPanelProps {
  overview: EventOverview;
  visibleLayerIds: Set<string>;
  onLayerToggle: (layerId: string) => void;
  visibleResourceGroups: Set<ResourceGroup>;
  onResourceGroupToggle: (group: ResourceGroup) => void;
  onResourceGroupInspect: (group: ResourceGroup | "ALL_ASSETS") => void;
  locations: LiveLocation[];
  lastUpdatedAt: Date | null;
  activeTab: PanelTab;
  onActiveTabChange: (tab: PanelTab) => void;
  externalIntegrationStatus: ExternalIntegrationStatus;
  onRefreshExternalIntegrations: () => void;
}

const resourceGroups: Array<{ id: ResourceGroup; label: string; description: string }> = [
  { id: "PERSONNEL", label: "인원", description: "현장대원·구조인력" },
  { id: "UAV", label: "무인기", description: "정찰·주 중계·서비스 중계 드론" },
  { id: "COMMAND", label: "지휘 장비", description: "지휘차량·드론 지상통제장치" },
  { id: "POSITIONING", label: "대원 위치·통신", description: "GNSS/RTK 측위 · LPWA 기본망 · LTE 보조망" },
  { id: "COMMUNICATION", label: "통신 장비", description: "TVWS·LTE·5G·위성·무전·중계기·AP" },
  { id: "DETECTION", label: "탐지 장비", description: "RSSI·IR-UWB·GPR" },
  { id: "UNASSIGNED", label: "미등록 장비", description: "상태는 수신됐지만 현재 재난 사건에 투입 등록되지 않은 장비" },
];

function resourceGroupOf(location: LiveLocation): ResourceGroup {
  if (location.kind === "personnel") return "PERSONNEL";
  if (!location.registeredToEvent) return "UNASSIGNED";
  if (["UAV", "MAIN_RELAY_DRONE", "SERVICE_RELAY_DRONE"].includes(location.category)) return "UAV";
  if (["COMMAND_VEHICLE", "GCS"].includes(location.category)) return "COMMAND";
  if (["RTK_TERMINAL", "RTK_BASE_LPWA_GATEWAY"].includes(location.category)) return "POSITIONING";
  if (["TVWS_BASE_STATION", "TVWS_CPE", "LTE_GATEWAY", "PRIVATE_5G_NTN_GATEWAY", "RADIO_GATEWAY_400MHZ", "FIXED_RELAY", "MOBILE_RELAY", "REF_AP", "ROVER_AP"].includes(location.category)) return "COMMUNICATION";
  if (["RSSI_DETECTOR", "IR_UWB_GPR"].includes(location.category)) return "DETECTION";
  return "UNASSIGNED";
}

const tabs: Array<{ id: PanelTab; label: string; icon: string }> = [
  { id: "layers", label: "지도 레이어", icon: "▱" },
  { id: "alerts", label: "현장 경보", icon: "!" },
  { id: "networks", label: "통신망", icon: "⌁" },
  { id: "reports", label: "상황 보고", icon: "≡" },
  { id: "kpis", label: "실증 KPI", icon: "✓" },
  { id: "integrations", label: "연계 상태", icon: "↔" },
];

const statusLabels: Record<string, string> = {
  ACTIVE: "정상 운용", INACTIVE: "비활성", DEGRADED: "성능 저하", FAILED: "장애",
  OPEN: "미확인", ISSUED: "발령", ACKNOWLEDGED: "확인", RESOLVED: "해제", EXPIRED: "만료",
  CRITICAL: "치명", SEVERE: "위험", HIGH: "긴급", WARNING: "경고", CAUTION: "주의",
  NORMAL: "정상", SUBMITTED: "제출",
};

function value(row: ApiRecord, keys: string[], fallback = "-") {
  for (const key of keys) if (row[key] != null && row[key] !== "") return String(row[key]);
  return fallback;
}

function numeric(row: ApiRecord, keys: string[]) {
  for (const key of keys) {
    const candidate = Number(row[key]);
    if (Number.isFinite(candidate)) return candidate;
  }
  return null;
}

function label(raw: string) { return statusLabels[raw] ?? raw.replaceAll("_", " "); }

function relativeTime(raw: string) {
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) return "시각 없음";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 10) return "방금 전";
  if (seconds < 60) return `${seconds}초 전`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

function occurredAt(row: ApiRecord, keys: string[]) {
  const raw = value(row, keys, "");
  return raw ? relativeTime(raw) : "시각 없음";
}

export function OperationsPanel({
  overview,
  visibleLayerIds,
  onLayerToggle,
  visibleResourceGroups,
  onResourceGroupToggle,
  onResourceGroupInspect,
  locations,
  lastUpdatedAt,
  activeTab,
  onActiveTabChange,
  externalIntegrationStatus,
  onRefreshExternalIntegrations,
}: OperationsPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const externalIntegrationLoading = Object.values(
    externalIntegrationStatus,
  ).some((state) => state.status === "loading");
  const activeAlerts = useMemo(() => {
    const rank: Record<string, number> = { CRITICAL: 0, SEVERE: 1, WARNING: 2, CAUTION: 3, NORMAL: 4 };
    return overview.alerts
      .filter((alert) => !["RESOLVED", "EXPIRED", "CANCELLED"].includes(value(alert, ["status"])))
      .sort((a, b) =>
        (rank[value(a, ["severity", "severityCode"])] ?? 5) - (rank[value(b, ["severity", "severityCode"])] ?? 5)
        || Date.parse(value(b, ["issuedAt", "createdAt"], "0")) - Date.parse(value(a, ["issuedAt", "createdAt"], "0")),
      );
  }, [overview.alerts]);
  const linkHealthSummary = useMemo(() => {
    const now = new Date();
    const rows = locations.map((location) => ({
      ...location,
      linkHealth: classifyLinkHealth(location.observedAt, now, location.expectedTelemetryIntervalSec ?? 3),
    }));
    return {
      rows,
      connected: rows.filter((row) => row.linkHealth === "CONNECTED").length,
      delayed: rows.filter((row) => row.linkHealth === "DELAYED").length,
      disconnected: rows.filter((row) => row.linkHealth === "DISCONNECTED").length,
      lastReceivedAt: rows.map((row) => row.observedAt).filter(Boolean).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null,
    };
  }, [locations, lastUpdatedAt]);
  const domainLayers = overview.event.disasterType === "LANDSLIDE"
    ? [
      { id: "slope-assessments", label: "산사태 위험면", description: "사면 위험·분석 결과" },
      { id: "debris-flow-paths", label: "토석류 이동 경로", description: "AI 예측 이동선" },
      { id: "debris-flow-areas", label: "토석류 영향 범위", description: "AI 예측 영향면" },
      { id: "change-detections", label: "지형 변화 탐지", description: "영상 변화 분석 결과" },
      { id: "victim-candidates", label: "구조 추정 후보", description: "AI 추정 위치·오차범위" },
      { id: "rssi-detections", label: "신호 탐지", description: "RSSI 관측·탐지기 위치" },
      { id: "vital-signal-detections", label: "생체신호 탐지", description: "IR-UWB·GPR 분석 후보" },
    ]
    : [
      { id: "firelines", label: "관측 화선", description: "실측·관측 결과(실선)" },
      { id: "spread-predictions", label: "확산 예측", description: "AI 예측 결과(투명면)" },
      { id: "communication-coverages", label: "통신 커버리지", description: "TVWS·백홀 가용범위" },
      { id: "ai-ran-coverages", label: "AI-RAN 커버리지", description: "AI 통신 가용범위 분석" },
      { id: "relay-placement-candidates", label: "중계기 배치 후보", description: "AI 최적 배치 지점" },
      { id: "ignition-detections", label: "발화지점 탐지", description: "영상 AI 발화 후보" },
      { id: "vehicle-detections", label: "차량 탐지", description: "현장 차량 인식 결과" },
      { id: "road-segmentations", label: "도로 분할", description: "진입 가능 도로 분석" },
      { id: "wildfire-risk-zones", label: "산불 위험지역", description: "산림청 위험예보 기반 위험면" },
      { id: "evacuation-routes", label: "안전 대피로", description: "현장 지휘 승인 대피경로" },
      { id: "suppression-resources", label: "진화자원", description: "진화차·방어선 배치 지점" },
      { id: "water-sources", label: "소화용수", description: "취수 가능 지점" },
      { id: "nearby-response-resources", label: "주변 대응자원", description: "대응센터·헬기·지원자원" },
      { id: "slope-gradients", label: "DEM 경사도", description: "고경사 위험 구역" },
      { id: "viewsheds", label: "Viewshed 가시권", description: "관측·중계 지점 가시영역" },
      { id: "communication-shadows", label: "통신 음영", description: "지형 차폐 예상구역" },
    ];
  const externalMapLayers = [
    {
      id: "external-firms",
      label: "NASA FIRMS 위성 화점",
      description: "위성에서 탐지된 산불 열원·화점",
      count:
        overview.domainLayers["external-firms"]?.length
          ?? (externalIntegrationStatus.firms.status === "ok" ? externalIntegrationStatus.firms.count : 0),
    },
    {
      id: "external-landslide-history",
      label: "산사태 발생이력",
      description: "재난안전데이터 산사태 발생 지점",
      count:
        overview.domainLayers["external-landslide-history"]?.length
          ?? (externalIntegrationStatus.landslideHistory.status === "ok" ? externalIntegrationStatus.landslideHistory.count : 0),
    },
    { id: "external-wildfire-risk", label: "산림청 산불위험예보", description: "시군구 대표영역 위험도", count: overview.domainLayers["external-wildfire-risk"]?.length ?? externalIntegrationStatus.wildfireRisk.count },
    { id: "external-landslide-forecast", label: "산사태 예측정보", description: "시군구 대표영역 예측등급", count: overview.domainLayers["external-landslide-forecast"]?.length ?? externalIntegrationStatus.landslideForecast.count },
    { id: "external-landslide-regional-risk", label: "산사태 지역위험", description: "지역 위험등급·예상피해", count: overview.domainLayers["external-landslide-regional-risk"]?.length ?? externalIntegrationStatus.landslideRegionalRisk.count },
  ];

  const allLayerIds = [
    "resources",
    "topology",
    "event",
    ...domainLayers.map((layer) => layer.id),
    ...externalMapLayers.map((layer) => layer.id),
  ];
  const layerRows = (id: string) => id === "resources" ? [...overview.assets, ...overview.personnel]
    : id === "event" ? [overview.event as unknown as ApiRecord]
    : overview.domainLayers[id] ?? [];
  const resetLayers = () => {
    for (const id of allLayerIds) {
      const shouldShow = id !== "communication-coverages" || overview.event.disasterType === "LANDSLIDE";
      if (visibleLayerIds.has(id) !== shouldShow) onLayerToggle(id);
    }
    for (const group of resourceGroups) {
      if (!visibleResourceGroups.has(group.id)) onResourceGroupToggle(group.id);
    }
  };
  const latestPrediction = overview.domainLayers["spread-predictions"]?.[0];
  const victimCandidates = overview.domainLayers["victim-candidates"] ?? [];

  const externalSourceRows = [
    {
      id: "firms" as const,
      provider: "NASA",
      name: "FIRMS 위성 산불감지",
      impact: "위성 열원·화점 지도 표시",
    },
    {
      id: "wildfireRisk" as const,
      provider: "산림청",
      name: "산불위험예보",
      impact: "지역별 산불 위험도 표시",
    },
    {
      id: "landslideForecast" as const,
      provider: "재난안전데이터",
      name: "산사태 예측정보",
      impact: "산사태 예측·예보 정보",
    },
    {
      id: "landslideHistory" as const,
      provider: "재난안전데이터",
      name: "산사태 발생이력",
      impact: "과거 산사태 발생정보",
    },
    {
      id: "landslideRegionalRisk" as const,
      provider: "재난안전데이터",
      name: "산사태 지역위험정보",
      impact: "지역별 산사태 위험정보",
    },
  ];
  const externalStates = Object.values(externalIntegrationStatus);

  const externalHealthyCount = externalStates.filter(
    (state) => state.status === "ok",
  ).length;

  const externalFailedCount = externalStates.filter(
    (state) => state.status === "error",
  ).length;

  const externalCheckingCount = externalStates.filter(
    (state) => state.status === "loading",
  ).length;

  const externalUncheckedCount =
    externalStates.length
    - externalHealthyCount
    - externalFailedCount
    - externalCheckingCount;

  const latestExternalCheckedAt = externalStates
    .map((state) => state.checkedAt)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;

  const assetGroups = resourceGroups.filter((group) => group.id !== "PERSONNEL");
  const allAssetsVisible = assetGroups.every((group) => visibleResourceGroups.has(group.id));
  const toggleAllAssets = () => {
    for (const group of assetGroups) {
      if (visibleResourceGroups.has(group.id) === allAssetsVisible) onResourceGroupToggle(group.id);
    }
  };
  const downloadKpiEvidence = () => {
    const now = new Date();
    const telemetrySamples: TelemetrySample[] = locations.map((location, index) => ({
      assetId: location.id,
      sequence: index + 1,
      observedAt: location.observedAt,
      receivedAt: now.toISOString(),
      latitude: location.latitude,
      longitude: location.longitude,
    }));
    const runId = `run-${now.toISOString().replaceAll(/[-:.TZ]/g, "").slice(0, 14)}`;
    const evidence = buildOperationalEvidence({
      eventId: String(overview.event.eventId), runId, samples: telemetrySamples,
      startedAt: new Date(now.getTime() - 6.4 * 60_000).toISOString(), networkReadyAt: now.toISOString(),
    });
    const payload = { ...evidence, mode: overview.domainDetail?.mode ?? "UNKNOWN", event: overview.event, measurements: overview.kpis };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${overview.event.eventCode ?? overview.event.eventId}-kpi-evidence.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <aside className={`operations-panel${collapsed ? " is-collapsed" : ""}`} aria-label="지도 운영 도구">
      <div className="operation-rail-brand" aria-hidden="true"><b>산림</b><span>통합상황</span></div>
      <nav aria-label="운영 정보 선택">
        {tabs.map((tab) => (
          <button key={tab.id} type="button" className={activeTab === tab.id && !collapsed ? "active" : ""} onClick={() => { onActiveTabChange(tab.id); setCollapsed(false); }} aria-label={tab.label}>
            <i>{tab.icon}</i><span>{tab.label}</span>{tab.id === "alerts" && activeAlerts.length > 0 ? <b>{activeAlerts.length}</b> : null}
          </button>
        ))}
      </nav>
      <button className="operation-collapse" type="button" onClick={() => setCollapsed((current) => !current)} aria-expanded={!collapsed} aria-label={collapsed ? "운영 패널 펼치기" : "운영 패널 접기"}>{collapsed ? "›" : "‹"}</button>
      {!collapsed && <section className="operation-drawer">
        <header>
          <div><strong>{tabs.find((tab) => tab.id === activeTab)?.label}</strong><small>{overview.event.disasterType === "LANDSLIDE" ? "산사태 구조·통신 통합" : "산불 대응·통신 통합"}</small></div>
          {activeTab === "layers" && <button type="button" className="layer-reset" onClick={resetLayers}>기본값</button>}
          {activeTab === "integrations" && (
            <button
              type="button"
              className="layer-reset"
              onClick={onRefreshExternalIntegrations}
              disabled={externalIntegrationLoading}
            >
              {externalIntegrationLoading ? "갱신 중" : "새로고침"}
            </button>
          )}
        </header>
        <div className="operations-panel-body">
          {activeTab === "layers" && <section className="layer-control-list" aria-label="지도 레이어">
            <section className="layer-level-group" aria-labelledby="resource-layer-title">
              <header><strong id="resource-layer-title">현장 자산</strong></header>
              <button type="button" className={`layer-parent-toggle${visibleLayerIds.has("resources") ? " enabled" : ""}`} onClick={() => onLayerToggle("resources")} aria-pressed={visibleLayerIds.has("resources")}>
                <span>자산 위치 전체 표시</span><i />
              </button>
              <button type="button" className={`layer-parent-toggle${visibleLayerIds.has("topology") ? " enabled" : ""}`} onClick={() => onLayerToggle("topology")} aria-pressed={visibleLayerIds.has("topology")}>
                <span>통신 토폴로지 연결선</span><i />
              </button>
              <div className="layer-child-options">
                <div className={`resource-category-option resource-category-all${allAssetsVisible ? " enabled" : ""}`}>
                  <input type="checkbox" checked={allAssetsVisible} onChange={toggleAllAssets} disabled={!visibleLayerIds.has("resources")} aria-label="전체 장비 지도 표시" />
                  <button type="button" onClick={() => onResourceGroupInspect("ALL_ASSETS")}><span>전체 장비</span><b>{locations.filter((location) => location.kind === "asset").length}</b></button>
                </div>
                {resourceGroups.map((group) => {
                  const count = locations.filter((location) => resourceGroupOf(location) === group.id).length;
                  const enabled = visibleResourceGroups.has(group.id);
                  return <div key={group.id} className={`resource-category-option${enabled ? " enabled" : ""}`}>
                    <input type="checkbox" checked={enabled} onChange={() => onResourceGroupToggle(group.id)} disabled={!visibleLayerIds.has("resources")} aria-label={`${group.label} 지도 표시`} />
                    <button type="button" onClick={() => onResourceGroupInspect(group.id)}><span>{group.label}</span><b>{count}</b></button>
                  </div>;
                })}
              </div>
            </section>
            <section className="layer-level-group" aria-labelledby="analysis-layer-title">
              <header><strong id="analysis-layer-title">AI 분석 결과 레이어</strong></header>
              {domainLayers.map((layer) => {
              const rows = layerRows(layer.id);
              const count = rows.length;
              const enabled = visibleLayerIds.has(layer.id);
              return count > 0
                ? <button key={layer.id} type="button" className={enabled ? "enabled" : ""} onClick={() => onLayerToggle(layer.id)} aria-pressed={enabled}>
                  <span>{layer.label}</span>
                  <i />
                </button>
                : <div key={layer.id} className="unavailable-layer"><span>{layer.label}</span><b>미제공</b></div>;
              })}
            </section>
            <section className="layer-level-group compact" aria-labelledby="base-layer-title">
              <header><strong id="base-layer-title">기준 정보</strong></header>
              <button type="button" className={visibleLayerIds.has("event") ? "enabled" : ""} onClick={() => onLayerToggle("event")} aria-pressed={visibleLayerIds.has("event")}>
                <span>재난 발생 지점</span><i />
              </button>
            </section>
            <div className="domain-evidence-card">
              {overview.event.disasterType === "WILDFIRE" ? (
                latestPrediction
                  ? <><strong>예측 결과 근거</strong><span>{value(latestPrediction, ["modelName"], "모델 미상")} {value(latestPrediction, ["modelVersion"], "")}</span><small>기준 {occurredAt(latestPrediction, ["baseTime"])} · 예측 {occurredAt(latestPrediction, ["forecastTime"])} · 신뢰도 {numeric(latestPrediction, ["confidence"]) == null ? "없음" : `${(numeric(latestPrediction, ["confidence"])! * 100).toFixed(0)}%`}</small></>
                  : <><strong>확산 예측</strong><span>분석 대기 또는 미제공</span><small>관측 화선은 계속 표시됩니다.</small></>
              ) : (
                <><strong>구조 추정 후보</strong><span>{victimCandidates.length ? `${victimCandidates.length}건 · AI 추정값` : "관측 부족 · 추가 탐색 필요"}</span><small>추정 후보는 구조 지휘관 확정 전까지 실제 위치로 간주하지 않습니다.</small></>
              )}
            </div>
          </section>}
                      <section
              className="layer-level-group"
              aria-labelledby="external-layer-title"
            >
              <header>
                <strong id="external-layer-title">
                  외부기관 데이터 레이어
                </strong>
              </header>

              {externalMapLayers.map((layer) => {
                const enabled = visibleLayerIds.has(layer.id);

                return (
                  <button
                    key={layer.id}
                    type="button"
                    className={enabled ? "enabled" : ""}
                    onClick={() => onLayerToggle(layer.id)}
                    aria-pressed={enabled}
                    disabled={layer.count === 0}
                  >
                    <span>
                      <b>{layer.label}</b>
                      <small>{layer.description}</small>
                    </span>
                    <em>{layer.count}건</em>
                  </button>
                );
              })}

              <p className="operation-readonly-note">
                좌표가 없는 기관 행정구역 자료는 시군구 대표영역으로 공간화해 표시하며, 상세 경계 데이터가 제공되면 동일 레이어에서 교체됩니다.
              </p>
            </section>

          {activeTab === "alerts" && <section className="operations-records" aria-label="활성 경보" aria-live="polite">
            {activeAlerts.length === 0 && <p className="operation-empty-state"><b>현재 활성 경보 없음</b><span>정상 상태입니다.</span></p>}
            {activeAlerts.slice(0, 12).map((alert) => {
              const severity = value(alert, ["severity", "severityCode"], "WARNING");
              const alertKey = value(alert, ["alertId", "id"], `${value(alert, ["alertType", "type"])}-${value(alert, ["message", "title"])}`);
              return <article key={alertKey} data-severity={severity}>
                <div><strong>{value(alert, ["title", "alertType", "type"], "현장 경보")}</strong><span>{label(severity)}</span></div>
                <p>{value(alert, ["message", "description"], "상세 내용이 없습니다.")}</p>
                <small>{label(value(alert, ["status"], "OPEN"))} · {occurredAt(alert, ["issuedAt", "createdAt"])} · 발령 {value(alert, ["issuerOrgCode"], "기관 미상")}</small>
              </article>;
            })}
            <p className="operation-readonly-note">경보 발령·확인·해제는 명령센터 권한 및 이력 API 연계 후 사용할 수 있습니다.</p>
          </section>}
          {activeTab === "networks" && <section className="operations-records" aria-label="통신망 상태">
            <article data-status={linkHealthSummary.disconnected > 0 ? "FAILED" : linkHealthSummary.delayed > 0 ? "DEGRADED" : "ACTIVE"} className="network-detail-card">
              <div><strong>장비 수신 상태 자동판정</strong><span>{linkHealthSummary.disconnected > 0 ? "두절 발생" : linkHealthSummary.delayed > 0 ? "일부 지연" : "정상"}</span></div>
              <p>연결 {linkHealthSummary.connected} · 지연 {linkHealthSummary.delayed} · 두절 {linkHealthSummary.disconnected}</p>
              <small>마지막 정상 수신 {linkHealthSummary.lastReceivedAt ? relativeTime(linkHealthSummary.lastReceivedAt) : "수신 없음"} · 장비별 목표 주기의 1.5배/3배 기준 자동판정</small>
            </article>
            {overview.networks.length === 0 && <p className="operation-empty-state"><b>연계된 통신망 없음</b><span>측정값 0이 아닌 미연계 상태입니다.</span></p>}
            {overview.networks.map((network) => {
              const status = value(network, ["status"], "UNKNOWN");
              const networkKey = value(network, ["networkId", "id"], value(network, ["networkCode", "networkName"]));
              const networkAssets = overview.assets.filter((asset) => String(asset.networkId ?? "") === String(network.networkId ?? ""));
              const measured = networkAssets.find((asset) => numeric(asset, ["signalStrengthDbm", "latencyMs", "packetLossPct"]) != null);
              const attributes = network.attributes as Record<string, unknown> | undefined;
              return <article key={networkKey} data-status={status} className="network-detail-card">
                <div><strong>{value(network, ["networkName", "networkCode", "networkType"], "통신망")}</strong><span>{label(status)}</span></div>
                <p>{label(value(network, ["networkType", "backhaulType"], "망 유형 미확인"))} · 영향 자산 {networkAssets.length}건</p>
                <dl>
                  <div><dt>신호</dt><dd>{measured && numeric(measured, ["signalStrengthDbm"]) != null ? `${numeric(measured, ["signalStrengthDbm"])} dBm` : "측정값 없음"}</dd></div>
                  <div><dt>지연</dt><dd>{measured && numeric(measured, ["latencyMs"]) != null ? `${numeric(measured, ["latencyMs"])} ms` : "측정값 없음"}</dd></div>
                  <div><dt>손실</dt><dd>{measured && numeric(measured, ["packetLossPct"]) != null ? `${numeric(measured, ["packetLossPct"])}%` : "측정값 없음"}</dd></div>
                </dl>
                <small>현재 경로 {String(attributes?.primary ?? attributes?.activePath ?? "미확인")} · 전환 사유 {String(attributes?.switchReason ?? "없음")}</small>
              </article>;
            })}
            <p className="operation-readonly-note">상태 {lastUpdatedAt ? relativeTime(lastUpdatedAt.toISOString()) : "측정 중"} · NMS 연계 오류와 현장망 두절은 별도 판정합니다.</p>
          </section>}
          {activeTab === "reports" && <section className="operations-records" aria-label="상황 보고">
            {overview.reports.length === 0 && <p className="operation-empty-state"><b>등록된 상황 보고 없음</b><span>보고 미등록 상태입니다.</span></p>}
            {[...overview.reports].sort((a, b) => Date.parse(value(b, ["reportedAt", "createdAt"], "0")) - Date.parse(value(a, ["reportedAt", "createdAt"], "0"))).slice(0, 12).map((report) => <article key={value(report, ["reportId", "id", "sourceRecordId"], value(report, ["reportedAt"]))}>
              <div><strong>{value(report, ["title", "reportType"], "상황 보고")}</strong><span>{label(value(report, ["urgency"], "NORMAL"))}</span></div>
              <p>{value(report, ["reportText", "description"], "상세 내용이 없습니다.")}</p>
              <small>{occurredAt(report, ["reportedAt", "createdAt"])} · {value(report, ["reporterOrgCode", "reporterExternalId"], "작성자 미상")} · {label(value(report, ["status"], "SUBMITTED"))}</small>
            </article>)}
            <p className="operation-readonly-note">미디어 원본은 권한이 확인된 경우에만 별도 화면에서 재생·다운로드합니다.</p>
          </section>}
          {activeTab === "kpis" && <section className="operations-records" aria-label="실증 KPI">
            <button type="button" className="kpi-evidence-download" onClick={downloadKpiEvidence} disabled={overview.kpis.length === 0}>시험 증적 JSON 내보내기</button>
            {overview.kpis.length === 0 && <p className="operation-empty-state"><b>수집된 실증 KPI 없음</b><span>모사값은 공식 실증값으로 표시하지 않습니다.</span></p>}
            {overview.kpis.map((kpi) => <article key={value(kpi, ["kpiMeasurementId", "metricCode"])} data-status={kpi.passed === true ? "ACTIVE" : kpi.passed === false ? "FAILED" : "INACTIVE"}>
              <div><strong>{value(kpi, ["metricName", "metricCode"], "실증 지표")}</strong><span>{kpi.passed === true ? "충족" : kpi.passed === false ? "미충족" : "판정 전"}</span></div>
              <p>{value(kpi, ["measuredValue"])} {value(kpi, ["unit"], "")} · 목표 {value(kpi, ["targetOperator"], "-")} {value(kpi, ["targetValue"], "-")}</p>
              <small>{occurredAt(kpi, ["measuredTo", "createdAt"])} · {value(kpi, ["sourceSystem"], "출처 미상")} · 원시 증적 {Array.isArray(kpi.evidence) ? kpi.evidence.length : 0}건</small>
            </article>)}
            <p className="operation-readonly-note">공식 판정은 실장비 원시로그와 시험실행 ID가 연결된 측정값만 사용합니다.</p>
          </section>}
          {activeTab === "integrations" && <section className="operations-records" aria-label="외부기관 데이터 연계 상태">
            <p className="operation-section-title"><strong>외부기관 실시간 연계</strong></p>

            <article
              data-status={
                externalFailedCount > 0
                  ? "FAILED"
                  : externalCheckingCount > 0 || externalUncheckedCount > 0
                    ? "INACTIVE"
                    : "ACTIVE"
              }
            >
              <div>
                <strong>외부기관 연계 요약</strong>
                <span>
                  {externalCheckingCount > 0
                    ? "갱신 중"
                    : externalFailedCount > 0
                      ? "일부 장애"
                      : externalHealthyCount === externalStates.length
                        ? "정상"
                        : "확인 필요"}
                </span>
              </div>

              <p>
                정상 {externalHealthyCount} · 장애 {externalFailedCount}
                {" · "}확인 중 {externalCheckingCount}
                {" · "}미확인 {externalUncheckedCount}
              </p>

              <small>
                30초 자동 갱신 · {
                  latestExternalCheckedAt
                    ? `마지막 확인 ${relativeTime(latestExternalCheckedAt)}`
                    : "아직 확인하지 않음"
                }
              </small>
            </article>

            {externalSourceRows.map((source) => {
              const state = externalIntegrationStatus[source.id];

              const statusLabel =
                state.status === "ok"
                  ? "정상"
                  : state.status === "loading"
                    ? "확인 중"
                    : state.status === "error"
                      ? "연계 실패"
                      : "미확인";

              const statusCode =
                state.status === "ok"
                  ? "ACTIVE"
                  : state.status === "error"
                    ? "FAILED"
                    : "INACTIVE";

              return <article key={source.id} data-status={statusCode}>
                <div>
                  <strong>{source.provider} · {source.name}</strong>
                  <span>{statusLabel}</span>
                </div>

                <p>{source.impact} · 수신 {state.count}건{state.servingStale ? " · 마지막 정상 데이터 유지 중" : ""}</p>

                <small>
                  {state.checkedAt
                    ? `마지막 확인 ${relativeTime(state.checkedAt)}`
                    : "아직 확인하지 않음"}
                  {state.lastSuccessAt ? ` · 최종 정상 ${relativeTime(state.lastSuccessAt)}` : ""}
                  {state.message ? ` · ${state.message}` : ""}
                </small>
              </article>;
            })}

            <p className="operation-readonly-note">
              외부 API 인증정보 누락 또는 요청 실패는 정상 상태로 표시하지 않습니다.
            </p>

            <p className="operation-section-title"><strong>시스템 연계 기능 계약</strong></p>
            {overview.integrations.length === 0 && <p className="operation-empty-state"><b>등록된 연계 기능 없음</b><span>처리건 0이 아닌 연계 미등록 상태입니다.</span></p>}
            {overview.integrations.map((integration) => <article key={integration.id} data-status={integration.configured ? "ACTIVE" : "INACTIVE"}>
              <div><strong>{integration.id.replaceAll("-", " ")}</strong><span>{integration.configured ? "사용 가능" : "설정 필요"}</span></div>
              <p>{integration.domain === "common" ? "공통" : integration.domain === "wildfire" ? "산불" : "산사태"} · {integration.kind === "communication" ? "통신" : "AI"} · {integration.direction === "INBOUND" ? "수신" : integration.direction === "OUTBOUND" ? "송신" : "양방향"}</p>
              <small>{integration.description} · 담당 {integration.owner ?? "미지정"} · {integration.boundary === "TOBE" ? "투비유니콘 구현범위" : "외부기관 API 필요"} · {integration.evidenceStatus === "IMPLEMENTED" ? "구현" : integration.evidenceStatus === "MOCK" ? "모사" : "계약만 정의"}</small>
            </article>)}
            <p className="operation-readonly-note">송수신 대사·오류 원인·재처리는 운영자 권한과 감사로그 API가 연결된 경우에만 제공합니다.</p>
          </section>}
        </div>
      </section>}
    </aside>
  );
}
