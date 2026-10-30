import RtkPacketPanel from "./RtkPacketPanel";
import { DroneTwinDetail } from "./DroneTwinDetail";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { externalDisasterApi, loadDashboardDisasterAssetsCached, loadEventOverview, loadEventTimeline, type ApiRecord, type EventOverview, type EventTimeline, type ForestEvent } from "../../http-api";
import { forestApi } from "../../http-api/forest-api";
import { HttpApiError } from "../../http-api/client";
import SlenoNetworkQualityPanel from "./SlenoNetworkQualityPanel";
import { fieldCoreStatusLabel, fieldEvent, isLocalFieldMode } from "../../http-api/field-mode";
import { decideSemanticFallback } from "./semanticFallback";
import LivePositionMap from "./LivePositionMap";
import { pickSlenoRtkFocusCenter } from "./slenoMapFocus";
import MapTimelinePlayer, { type MapTimelineSnapshot } from "./MapTimelinePlayer";
import {
  OperationsPanel,
  type ExternalIntegrationStatus,
  type PanelTab,
} from "./OperationsPanel";

import DroneVideoModal from "./DroneVideoModal";
import VideoPlayback from "./VideoPlayback";
import FieldLinkChatWidget from "./FieldLinkChatWidget";
import type { VideoPlaybackState } from "./videoPlaybackState";
import RequirementsReadinessModal from "./RequirementsReadinessModal";
import { applyTelemetrySafetyRules, TelemetryStreamClient, type TelemetryStreamStatus } from "./telemetryStream";
import { calculatePacketSequence, classifyLinkHealth, type TelemetrySample } from "./operationalEvidence";
import { assessKpiMeasurement } from "./kpiMeasurementEvidence";
import { evaluateFieldApiHealth, fieldApiHealthLabel, formatLastSuccessAge } from "./fieldApiHealth";
import { PROJECT_ENHANCED_TARGET } from "./officialRfpGaps";
import {
  displayProfileClassName,
  getDisplayProfileConfig,
  isHybridExhibitionMode,
  parseDisplayProfile,
} from "./displayProfile";
import {
  EXHIBITION_TOUR_STEPS,
  isExhibitionTourStepAvailable,
} from "./exhibitionTour";
import "./unified-disaster-dashboard.css";
import "./field-header-hotfix.css";
import "./field-interaction-hotfix.css";

const POLL_INTERVAL_MS = 3_000;
const DEFAULT_CHANGE_HIGHLIGHT_MS = POLL_INTERVAL_MS * 0.3;
const DEFAULT_EVENT_ID =
  import.meta.env.VITE_DEFAULT_EVENT_ID?.trim() ||
  "10000000-0000-4000-8000-000000000001";

const FORCE_LOCAL_FIELD_MODE = isLocalFieldMode() || new URLSearchParams(window.location.search).get("field") === "1";

/*
 * 최종 운영 화면에서는 DEMO/KPI/PoC 검증 UI를 노출하지 않는다.
 * 필요 시 ?debug=1 에서만 개발 검증 UI를 다시 확인할 수 있다.
 */
const SHOW_VALIDATION_UI = new URLSearchParams(window.location.search).get("debug") === "1";

function text(value: unknown, fallback = "-") { return value == null || value === "" ? fallback : String(value); }
const koreanLabels: Record<string, string> = {
  WILDFIRE: "산불",
  LANDSLIDE: "산사태",
  COMPLEX: "복합 재난",
  RESPONDING: "대응 중",
  CLOSED: "종료",
  READY: "대기",
  ACTIVE: "활성",
  INACTIVE: "비활성",
  RESOLVED: "해제",
  FLYING: "비행 중",
  TAKING_OFF: "이륙 중",
  RETURNING: "복귀 중",
  MOVING: "이동 중",
  PATROLLING: "순찰 중",
  SEARCHING: "수색 중",
  APPROACHING: "접근 중",
  EVACUATING: "대피 중",
  HOLDING: "현장 대기",
  STOPPED: "정지",
  SAFE: "안전",
  CAUTION: "주의",
  WARNING: "경계",
  CRITICAL: "심각",
  SEVERE: "위험",
  MODERATE: "보통",
  LOW: "낮음",
  NORMAL: "정상",
  DEGRADED: "성능 저하",
  DEPLOYING: "구축 중",
  CALIBRATING: "보정 중",
  SIGNAL_LOST: "신호 끊김",
  BOOTING: "시작 중",
  FAILED: "고장",
  UNKNOWN: "확인 필요",
  NO_FIX: "측위 미확정",
  RTK_FIXED: "RTK FIX · 보정 안정",
  RTK_FLOAT: "RTK FLOAT · 보정 중",
  GNSS: "일반 GNSS",
  NETWORK: "네트워크 측위",
  VALIDATED: "검증 완료",
  RAW: "원시 수신",
  REJECTED: "사용 제외",
};
function korean(value: unknown, fallback = "-") {
  const raw = text(value, fallback);
  return koreanLabels[raw] ?? raw.replaceAll("_", " ");
}
const assetTypeLabels: Record<string, string> = {
  PERSONNEL: "인원",
  UAV: "무인기",
  RTK_BASE_LPWA_GATEWAY: "이동형 RTK 기준국·LPWA 게이트웨이",
  TVWS_BASE_STATION: "TVWS 기지국",
  TVWS_CPE: "TVWS CPE",
  LTE_GATEWAY: "LTE 게이트웨이",
  COMMAND_VEHICLE: "지휘 차량",
  RTK_TERMINAL: "RTK 단말",
  PRIVATE_5G_NTN_GATEWAY: "특화망 5G·저궤도 위성 게이트웨이",
  RADIO_GATEWAY_400MHZ: "400MHz 무전 게이트웨이",
  MAIN_RELAY_DRONE: "주 중계 드론",
  SERVICE_RELAY_DRONE: "서비스 중계 드론",
  FIXED_RELAY: "고정형 임시 중계기",
  GCS: "드론 지상통제장치(GCS)",
  REF_AP: "기준 AP",
  ROVER_AP: "이동 AP",
  IR_UWB_GPR: "IR-UWB·GPR 탐지 장비",
  MOBILE_RELAY: "이동 중계기",
  RSSI_DETECTOR: "RSSI 탐지기",
  ASSET: "장비",
};
function assetTypeLabel(value: string) { return assetTypeLabels[value] ?? value.replaceAll("_", " "); }
export type ResourceGroup = "PERSONNEL" | "UAV" | "COMMAND" | "POSITIONING" | "COMMUNICATION" | "DETECTION" | "UNASSIGNED";
const resourceGroupLabels: Record<ResourceGroup, string> = {
  PERSONNEL: "인원", UAV: "무인기", COMMAND: "지휘 장비", POSITIONING: "위치 장비",
  COMMUNICATION: "통신 장비", DETECTION: "탐지 장비", UNASSIGNED: "미등록 장비",
};
function resourceGroupOf(item: LiveLocation): ResourceGroup {
  if (item.kind === "personnel") return "PERSONNEL";
  if (!item.registeredToEvent) return "UNASSIGNED";
  if (["UAV", "MAIN_RELAY_DRONE", "SERVICE_RELAY_DRONE"].includes(item.category)) return "UAV";
  if (["COMMAND_VEHICLE", "GCS"].includes(item.category)) return "COMMAND";
  if (["RTK_TERMINAL", "RTK_BASE_LPWA_GATEWAY"].includes(item.category)) return "POSITIONING";
  if (["TVWS_BASE_STATION", "TVWS_CPE", "LTE_GATEWAY", "PRIVATE_5G_NTN_GATEWAY", "RADIO_GATEWAY_400MHZ", "FIXED_RELAY", "MOBILE_RELAY", "REF_AP", "ROVER_AP"].includes(item.category)) return "COMMUNICATION";
  if (["RSSI_DETECTOR", "IR_UWB_GPR"].includes(item.category)) return "DETECTION";
  return "UNASSIGNED";
}
function relativeTime(value: unknown) {
  if (!value) return "수신 시각 없음";
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(String(value)).getTime()) / 1000));
  if (elapsedSeconds < 10) return "방금 전";
  if (elapsedSeconds < 60) return `${elapsedSeconds}초 전`;
  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

export type LiveLocation = {
  id: string;
  kind: "personnel" | "asset";
  label: string;
  status: string;
  longitude: number;
  latitude: number;
  altitude: number | null;
  observedAt: string;
  category: string;
  batteryPct: number | null;
  signalStrengthDbm: number | null;
  snrDb: number | null;
  latencyMs: number | null;
  packetLossPct: number | null;
  safetyStatus: string;
  sourceSystem: string;
  positioningMethod: string | null;
  horizontalAccuracyM: number | null;
  qualityStatus: string;
  positionFetchStatus: string;
  sourceAssetId: string;
  reportedByAssetId: string;
  reportingRole: string;
  rtcmStatus: string | null;
  networkMode: string | null;
  expectedTelemetryIntervalSec: number | null;
  flightMode: string | null;
  armed: boolean | null;
  missionSequence: number | null;
  emergencyStatus: string | null;
  groundSpeedMps: number | null;
  headingDeg: number | null;
  registeredToEvent: boolean;

  pathEvidence: {
    uplinkReceivedAt: string | null;
    uplinkForwardStartedAt: string | null;
    uplinkSource: string | null;
    uplinkBytes: number | null;
    transport: string | null;
    coreReceivedAt: string | null;
  } | null;
};

function locationFrom(item: Record<string, unknown>, kind: LiveLocation["kind"]): LiveLocation | null {
  const geometry = item.geometry as { coordinates?: unknown[] } | undefined;
  const coordinates = geometry?.coordinates;
  const longitude = Number(coordinates?.[0]);
  const latitude = Number(coordinates?.[1]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  const altitudeValue = Number(coordinates?.[2]);
  const attributes = item.attributes && typeof item.attributes === "object"
    ? item.attributes as Record<string, unknown>
    : {};
  const specifications = item.specifications && typeof item.specifications === "object"
    ? item.specifications as Record<string, unknown>
    : {};

  const linkQuality =
    attributes.linkQuality &&
    typeof attributes.linkQuality === "object" &&
    !Array.isArray(attributes.linkQuality)
      ? attributes.linkQuality as Record<string, unknown>
      : {};

  const rawPathEvidence =
    attributes.pathEvidence &&
    typeof attributes.pathEvidence === "object" &&
    !Array.isArray(attributes.pathEvidence)
      ? attributes.pathEvidence as Record<string, unknown>
      : null;

  const pathBytes =
    Number(rawPathEvidence?.uplinkBytes);

  const pathEvidence = rawPathEvidence
    ? {
        uplinkReceivedAt:
          rawPathEvidence.uplinkReceivedAt == null
            ? null
            : String(rawPathEvidence.uplinkReceivedAt),

        uplinkForwardStartedAt:
          rawPathEvidence.uplinkForwardStartedAt == null
            ? null
            : String(rawPathEvidence.uplinkForwardStartedAt),

        uplinkSource:
          rawPathEvidence.uplinkSource == null
            ? null
            : String(rawPathEvidence.uplinkSource),

        uplinkBytes:
          Number.isFinite(pathBytes)
            ? pathBytes
            : null,

        transport:
          rawPathEvidence.transport == null
            ? null
            : String(rawPathEvidence.transport),

        coreReceivedAt:
          rawPathEvidence.coreReceivedAt == null
            ? null
            : String(rawPathEvidence.coreReceivedAt),
      }
    : null;
  const horizontalAccuracyM = Number(item.horizontalAccuracyM);
  const expectedTelemetryIntervalSec = Number(
    item.expectedTelemetryIntervalSec
    ?? attributes.expectedTelemetryIntervalSec
    ?? attributes.reportingIntervalSec
    ?? specifications.targetUpdateSeconds,
  );
  return {
    id: String(kind === "personnel" ? item.personExternalId : item.assetId),
    kind,
    label: String(kind === "personnel" ? item.personExternalId : item.assetName ?? item.assetCode ?? item.assetId),
    status: korean(kind === "personnel" ? item.activityStatus ?? item.safetyStatus : item.operationalStatus),
    longitude,
    latitude,
    altitude: Number.isFinite(altitudeValue) ? altitudeValue : null,
    observedAt: String(item.observedAt ?? ""),
    category: String(kind === "personnel" ? "PERSONNEL" : item.assetType ?? "ASSET"),
    batteryPct: (item.batteryPct != null && Number.isFinite(Number(item.batteryPct))) ? Number(item.batteryPct) : null,
    signalStrengthDbm:
      Number.isFinite(Number(item.signalStrengthDbm ?? linkQuality.rssiDbm))
        ? Number(item.signalStrengthDbm ?? linkQuality.rssiDbm)
        : null,

    snrDb:
      Number.isFinite(Number(linkQuality.snrDb))
        ? Number(linkQuality.snrDb)
        : null,

    latencyMs: (item.latencyMs != null && Number.isFinite(Number(item.latencyMs))) ? Number(item.latencyMs) : null,
    packetLossPct: (item.packetLossPct != null && Number.isFinite(Number(item.packetLossPct))) ? Number(item.packetLossPct) : null,
    safetyStatus: korean(item.safetyStatus ?? "UNKNOWN"),
    sourceSystem: String(item.sourceSystem ?? attributes.sourceSystem ?? ""),
    positioningMethod: item.positioningMethod || attributes.positionFix
      ? String(item.positioningMethod ?? attributes.positionFix)
      : null,
    horizontalAccuracyM: Number.isFinite(horizontalAccuracyM) ? horizontalAccuracyM : null,
    qualityStatus: String(item.qualityStatus ?? ""),
    positionFetchStatus: String(item.positionFetchStatus ?? ""),
    sourceAssetId: String(item.sourceAssetId ?? ""),
    reportedByAssetId: String(item.reportedByAssetId ?? ""),
    reportingRole: String(item.reportingRole ?? ""),
    rtcmStatus: attributes.correction ? String(attributes.correction) : null,
    networkMode:
      item.activeLink ||
      item.networkMode ||
      attributes.network ||
      attributes.networkType ||
      pathEvidence?.transport
        ? String(
            item.activeLink ??
            item.networkMode ??
            attributes.network ??
            attributes.networkType ??
            pathEvidence?.transport
          )
        : null,
    expectedTelemetryIntervalSec: Number.isFinite(expectedTelemetryIntervalSec) && expectedTelemetryIntervalSec > 0
      ? expectedTelemetryIntervalSec
      : null,
    flightMode: attributes.flightMode == null ? null : String(attributes.flightMode),
    armed: typeof attributes.armed === "boolean" ? attributes.armed : null,
    missionSequence: (attributes.missionSequence != null && Number.isFinite(Number(attributes.missionSequence))) ? Number(attributes.missionSequence) : null,
    emergencyStatus: attributes.emergencyStatus == null ? null : String(attributes.emergencyStatus),
    groundSpeedMps: (attributes.groundSpeedMps != null && Number.isFinite(Number(attributes.groundSpeedMps))) ? Number(attributes.groundSpeedMps) : null,
    headingDeg: (attributes.headingDeg != null && Number.isFinite(Number(attributes.headingDeg))) ? Number(attributes.headingDeg) : null,
    registeredToEvent: kind === "personnel" || item.eventRegistrationStatus !== "UNREGISTERED",

    pathEvidence,
  };
}

function locationKey(item: LiveLocation) { return `${item.kind}-${item.id}`; }
function locationFingerprint(item: LiveLocation) {
  return [
    item.longitude, item.latitude, item.altitude, item.status, item.observedAt,
    item.positioningMethod, item.horizontalAccuracyM, item.rtcmStatus,
    item.pathEvidence?.coreReceivedAt,
  ].join("|");
}

function telemetrySampleFromLiveAsset(asset: ApiRecord): TelemetrySample | null {
  if (asset.sourceSystem !== "GCS_UPLINK") return null;
  const geometry = asset.geometry as { coordinates?: unknown[] } | undefined;
  const coordinates = geometry?.coordinates;
  const longitude = Number(coordinates?.[0]);
  const latitude = Number(coordinates?.[1]);
  const observedAt = typeof asset.observedAt === "string" ? asset.observedAt : "";
  const receivedAt = typeof asset.receivedAt === "string" ? asset.receivedAt : "";
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || !observedAt || !receivedAt) return null;
  return {
    assetId: String(asset.assetId ?? ""),
    entityType: "ASSET",
    assetType: String(asset.assetType ?? "UAV"),
    observedAt,
    receivedAt,
    sequence: asset.sequence != null && Number.isFinite(Number(asset.sequence)) ? Number(asset.sequence) : undefined,
    latitude,
    longitude,
  };
}

function isPositioningLocation(location: LiveLocation) {
  return location.kind === "personnel"
    || ["RTK_TERMINAL", "RTK_BASE_LPWA_GATEWAY"].includes(location.category);
}

function correctionStatus(location: LiveLocation) {
  if (location.category === "RTK_BASE_LPWA_GATEWAY") {
    return location.rtcmStatus === "READY" ? "RTCM 생성·송출 준비" : location.rtcmStatus ? korean(location.rtcmStatus) : "상태 수신 전";
  }
  if (location.positioningMethod === "RTK_FIXED") return "RTCM 적용 · 고정해";
  if (location.positioningMethod === "RTK_FLOAT") return "RTCM 적용 · 유동해";
  if (location.positioningMethod === "GNSS") return "기준국 보정 미적용";
  return "보정 상태 확인 불가";
}

function overviewLatestUpdateTime(overview: EventOverview) {
  const timestampKeys = new Set([
    "updatedAt", "createdAt", "occurredAt", "observedAt", "receivedAt",
    "reportedAt", "issuedAt", "startedAt", "analyzedAt", "assessedAt",
    "baseTime", "detectedAt", "firstDetectedAt", "lastDetectedAt",
  ]);
  let latest = 0;
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value)) {
      if (timestampKeys.has(key) && typeof nested === "string") {
        const parsed = Date.parse(nested);
        if (Number.isFinite(parsed)) latest = Math.max(latest, parsed);
      } else {
        visit(nested);
      }
    }
  };
  visit({
    event: overview.event,
    assets: overview.assets,
    unregisteredAssets: overview.unregisteredAssets,
    personnel: overview.personnel,
    networks: overview.networks,
    topology: overview.topology,
    alerts: overview.alerts,
    reports: overview.reports,
    kpis: overview.kpis,
    domainDetail: overview.domainDetail,
    domainLayers: overview.domainLayers,
  });
  return latest;
}

function overviewLocations(overview: EventOverview): LiveLocation[] {
  return [
    ...overview.personnel.map((item) => locationFrom(item, "personnel")),
    ...overview.assets.map((item) => locationFrom(item, "asset")),
    ...overview.unregisteredAssets.map((item) => locationFrom(item, "asset")),
  ].filter((item): item is LiveLocation => item !== null);
}

const fallbackTopologyLabels: Record<string, string[]> = {
  ENDPOINT: ["대원 RTK 단말", "드론·영상장비", "400㎒ 무전기"],
  FIELD: ["LPWA · 저속", "이음5G · 고속", "무전 중계망"],
  COMMAND: ["게이트웨이·L3 스위치", "RTK 기준국", "현장 상황판"],
  BACKHAUL: ["LTE", "TVWS", "LEO 위성"],
  CLOUD: ["수집 API", "PostgreSQL", "통합 상황판"],
};

function topologyLabelsFor(overview: EventOverview | null, layer: string) {
  const labels = overview?.topology.nodes
    .filter((node) => String(node.topologyLayer) === layer && String(node.status) !== "UNAVAILABLE")
    .sort((left, right) => Number(left.sortOrder ?? 0) - Number(right.sortOrder ?? 0))
    .map((node) => String(node.nodeName ?? node.nodeCode ?? ""))
    .filter(Boolean) ?? [];
  return labels.length ? labels : fallbackTopologyLabels[layer] ?? [];
}

function buildTimelineSnapshots(timeline: EventTimeline | null, currentAssets: ApiRecord[]): MapTimelineSnapshot[] {
  if (!timeline) return [];
  const fromMs = Math.floor(Date.parse(timeline.from) / 60_000) * 60_000;
  const toMs = Math.floor(Date.parse(timeline.to) / 60_000) * 60_000;
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs > toMs) return [];

  const assetCatalog = new Map(currentAssets.map((asset) => [String(asset.assetId), asset]));
  const assetRows = [...timeline.assetStatuses].sort((left, right) => Date.parse(String(left.observedAt)) - Date.parse(String(right.observedAt)));
  const personnelRows = [...timeline.personnelPositions].sort((left, right) => Date.parse(String(left.observedAt)) - Date.parse(String(right.observedAt)));
  const latestAssets = new Map<string, ApiRecord>();
  const latestPersonnel = new Map<string, ApiRecord>();
  let assetIndex = 0;
  let personnelIndex = 0;
  const snapshots: MapTimelineSnapshot[] = [];

  for (let at = fromMs; at <= toMs; at += 60_000) {
    while (assetIndex < assetRows.length && Date.parse(String(assetRows[assetIndex]?.observedAt)) <= at + 59_999) {
      const row = assetRows[assetIndex++]!;
      latestAssets.set(String(row.assetId), row);
    }
    while (personnelIndex < personnelRows.length && Date.parse(String(personnelRows[personnelIndex]?.observedAt)) <= at + 59_999) {
      const row = personnelRows[personnelIndex++]!;
      latestPersonnel.set(String(row.personExternalId), row);
    }
    const locations = [
      ...[...latestPersonnel.values()].map((row) => locationFrom(row, "personnel")),
      ...[...latestAssets.values()].map((row) => locationFrom({ ...assetCatalog.get(String(row.assetId)), ...row }, "asset")),
    ].filter((location): location is LiveLocation => location !== null);
    snapshots.push({ at: new Date(at).toISOString(), locations });
  }
  return snapshots;
}

function webMercatorToLngLat(x: number, y: number): [number, number] | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const originShift = 20037508.342789244;

  if (
    Math.abs(x) > originShift * 1.05 ||
    Math.abs(y) > originShift * 1.05
  ) {
    return null;
  }

  const longitude = (x / originShift) * 180;
  const latitude =
    (Math.atan(Math.exp((y / originShift) * Math.PI)) * 360) / Math.PI -
    90;

  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    return null;
  }

  return [longitude, latitude];
}

const districtCenters: Record<string, [number, number]> = {
  "평창": [128.390, 37.370], "평창군": [128.390, 37.370], "강릉": [128.876, 37.752], "강릉시": [128.876, 37.752],
  "홍천": [127.888, 37.697], "홍천군": [127.888, 37.697], "정선": [128.661, 37.380], "정선군": [128.661, 37.380],
  "원주": [127.920, 37.342], "원주시": [127.920, 37.342], "춘천": [127.730, 37.881], "춘천시": [127.730, 37.881],
  "인제": [128.170, 38.070], "인제군": [128.170, 38.070], "양양": [128.619, 38.075], "양양군": [128.619, 38.075],
  "울진": [129.400, 36.993], "울진군": [129.400, 36.993], "봉화": [128.733, 36.893], "봉화군": [128.733, 36.893],
  "밀양": [128.746, 35.503], "밀양시": [128.746, 35.503], "합천": [128.166, 35.566], "합천군": [128.166, 35.566],
};
function pointBuffer([longitude, latitude]: [number, number], radius: number) {
  const ring = Array.from({ length: 25 }, (_, index) => {
    const angle = (index / 24) * Math.PI * 2;
    return [longitude + Math.cos(angle) * radius, latitude + Math.sin(angle) * radius] as [number, number];
  });
  return { type: "Polygon", coordinates: [ring] };
}
function districtCenter(...names: unknown[]): [number, number] | null {
  for (const value of names) {
    const raw = String(value ?? "").trim();
    const direct = districtCenters[raw];
    if (direct) return direct;
    const match = Object.entries(districtCenters).find(([name]) => raw.includes(name));
    if (match) return match[1];
  }
  return null;
}

export default function UnifiedDisasterDashboard() {
  const displayProfile = parseDisplayProfile(window.location.search);
  const displayConfig = getDisplayProfileConfig(displayProfile);
  const displayClassName = displayProfileClassName(displayProfile);
  const hybridExhibitionMode = isHybridExhibitionMode(window.location.search);
  const [events, setEvents] = useState<ForestEvent[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [overview, setOverview] = useState<EventOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eventsLoaded, setEventsLoaded] = useState(false);
  const [disasterNotFound, setDisasterNotFound] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const localFieldMode = FORCE_LOCAL_FIELD_MODE;

  const commandShellMode = true;
  const [requirementsOpen, setRequirementsOpen] = useState(false);
  const [telemetryStreamStatus, setTelemetryStreamStatus] = useState<TelemetryStreamStatus>("DISABLED");
  const [telemetrySamples, setTelemetrySamples] = useState<TelemetrySample[]>([]);
  const previousLocationsRef = useRef<Map<string, string> | null>(null);
  const previousOverviewUpdateTimeRef = useRef<number | null>(null);
  const highlightDurationRef = useRef(DEFAULT_CHANGE_HIGHLIGHT_MS);
  const [changedUntil, setChangedUntil] = useState<Record<string, number>>({});
  const [highlightDurationMs, setHighlightDurationMs] = useState(DEFAULT_CHANGE_HIGHLIGHT_MS);
  const [visibleResourceGroups, setVisibleResourceGroups] = useState<Set<ResourceGroup>>(
    () => new Set(["PERSONNEL", "UAV", "COMMAND", "POSITIONING", "COMMUNICATION", "DETECTION", "UNASSIGNED"]),
  );
  const [operationsTab, setOperationsTab] = useState<PanelTab>(
    "weather",
  );
  // Keep the existing left operation rail mounted; only dock content changes.
  const [rightDockTab, setRightDockTab] = useState<"status" | "semantic" | "fieldlink">("status");
  const [toolDrawerOpen, setToolDrawerOpen] = useState(false);
  const [capabilityMenu, setCapabilityMenu] = useState<null | "equipment" | "command" | "twin" | "response">(null);
  const [responseSection, setResponseSection] = useState<"night" | "vehicle" | "hq">("night");
  const [selectedLocationKey, setSelectedLocationKey] = useState<string | null>(null);
  const [topologyLocationKey, setTopologyLocationKey] = useState<string | null>(null);
  const [resourceDialogGroup, setResourceDialogGroup] = useState<ResourceGroup | "ALL" | "ALL_ASSETS" | null>(null);
  const [exhibitionTourStepIndex, setExhibitionTourStepIndex] = useState<number | null>(null);
  const [terrainPresentationState, setTerrainPresentationState] = useState<"2D" | "3D" | "FALLBACK">(
    hybridExhibitionMode ? "3D" : "2D",
  );

  const [videoDrone, setVideoDrone] = useState<LiveLocation | null>(null);
  const [fieldInspectorTab, setFieldInspectorTab] =
    useState<"quality" | "details" | "video">("quality");

  // Field command video channels.
  // RTSP itself is not browser-playable; this state reflects the real
  // channel configuration registered for the primary UAV.
  const [fieldVideoChannels, setFieldVideoChannels] = useState<ApiRecord[]>([]);
  const [fieldVideoLoading, setFieldVideoLoading] = useState(false);
  const [fieldVideoPlaybackStates, setFieldVideoPlaybackStates] =
    useState<Record<string, VideoPlaybackState>>({});
  const [timeline, setTimeline] = useState<EventTimeline | null>(null);
  const [timelineIndex, setTimelineIndex] = useState<number | null>(null);
  const [timelinePlaying, setTimelinePlaying] = useState(false);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [visibleLayerIds, setVisibleLayerIds] = useState(() => new Set([
    "resources",
    "topology",
    "event",
    "communication-coverages",
  ]));
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const [externalFirmsRows, setExternalFirmsRows] = useState<ApiRecord[]>([]);
  const [externalLandslideHistoryRows, setExternalLandslideHistoryRows] =
    useState<ApiRecord[]>([]);
  const [externalWildfireRiskRows, setExternalWildfireRiskRows] = useState<ApiRecord[]>([]);
  const [externalLandslideForecastRows, setExternalLandslideForecastRows] = useState<ApiRecord[]>([]);
  const [externalLandslideRegionalRows, setExternalLandslideRegionalRows] = useState<ApiRecord[]>([]);

  const [externalIntegrationStatus, setExternalIntegrationStatus] =
    useState<ExternalIntegrationStatus>({
      firms: { status: "idle", count: 0, checkedAt: null },
      wildfireRisk: { status: "idle", count: 0, checkedAt: null },
      landslideForecast: { status: "idle", count: 0, checkedAt: null },
      landslideHistory: { status: "idle", count: 0, checkedAt: null },
      landslideRegionalRisk: { status: "idle", count: 0, checkedAt: null },
    });

  const refreshEvents = useCallback(async () => {
    if (localFieldMode) {
      const event = fieldEvent();
      setDisasterNotFound(false);
      setEvents([event]);
      setSelectedId(event.eventId);
      setError(null);
      return;
    }

    let result;
    try {
      result = await loadDashboardDisasterAssetsCached(DEFAULT_EVENT_ID);
    } catch (caught) {
      const missingDisaster =
        caught instanceof HttpApiError &&
        caught.status === 404 &&
        typeof caught.payload === "object" &&
        caught.payload !== null &&
        "error" in caught.payload &&
        (caught.payload as { error?: { code?: string } }).error?.code ===
          "DISASTER_NOT_FOUND";
      if (!missingDisaster) throw caught;
      // 등록되지 않은 재난은 API 장애나 재난이 없다는 확정 증거가 아니다.
      setDisasterNotFound(true);
      setEvents([]);
      setSelectedId("");
      setOverview(null);
      setError(null);
      return;
    }
    setDisasterNotFound(false);
    const disaster = result.data.disaster;
    const rawDisasterType = String(disaster.disasterType ?? "WILDFIRE").toUpperCase();
    const disasterType: ForestEvent["disasterType"] =
      rawDisasterType === "LANDSLIDE" || rawDisasterType === "COMPLEX"
        ? rawDisasterType
        : "WILDFIRE";

    const currentEvent: ForestEvent = {
      eventId: disaster.disasterId || DEFAULT_EVENT_ID,
      eventCode: disaster.disasterCode,
      disasterType,
      eventName: disaster.disasterName,
      status: disaster.status,
      geometry: disaster.geometry,
      severityCode: disaster.severityCode,
      occurredAt: disaster.occurredAt,
      locationName: disaster.locationName,
    };

    setEvents([currentEvent]);
    setSelectedId((current) => current || currentEvent.eventId);
    setError(null);
  }, [localFieldMode]);

  /* FIELD_EXTERNAL_API_FINAL */
  const refreshExternalIntegrations = useCallback(async () => {
    /* FIELD_EXTERNAL_INTEGRATIONS_ENABLED */

    setExternalIntegrationStatus((current) => ({
      firms: { ...current.firms, status: "loading", message: undefined },
      wildfireRisk: { ...current.wildfireRisk, status: "loading", message: undefined },
      landslideForecast: { ...current.landslideForecast, status: "loading", message: undefined },
      landslideHistory: { ...current.landslideHistory, status: "loading", message: undefined },
      landslideRegionalRisk: {
        ...current.landslideRegionalRisk,
        status: "loading",
        message: undefined,
      },
    }));

    const [
      firms,
      wildfireRisk,
      landslideForecast,
      landslideHistory,
      landslideRegionalRisk,
    ] = await Promise.allSettled([
      externalDisasterApi.wildfireFirms(),
      externalDisasterApi.wildfireRisk(1, 100),
      externalDisasterApi.landslideForecast(1, 100),
      externalDisasterApi.landslideHistory(1, 100),
      externalDisasterApi.landslideRegionalRisk(1, 100),
    ]);

    const checkedAt = new Date().toISOString();

    const errorMessage = (reason: unknown) =>
      reason instanceof Error ? reason.message : "외부 API 요청 실패";

    if (firms.status === "fulfilled") {
      setExternalFirmsRows(
        firms.value.data.flatMap((item, index) => {
          const longitude = Number(item.longitude);
          const latitude = Number(item.latitude);

          if (
            !Number.isFinite(longitude) ||
            !Number.isFinite(latitude) ||
            longitude < -180 ||
            longitude > 180 ||
            latitude < -90 ||
            latitude > 90
          ) {
            return [];
          }

          return [{
            id: `firms-${index}-${item.acquiredAt ?? "unknown"}`,
            observedAt: item.acquiredAt ?? checkedAt,
            provider: "NASA FIRMS",
            confidence: item.confidence,
            frp: item.frp,
            resultGeometry: {
              type: "Point",
              coordinates: [longitude, latitude],
            },
          } as ApiRecord];
        }),
      );
    }

    if (landslideHistory.status === "fulfilled") {
      setExternalLandslideHistoryRows(
        landslideHistory.value.data.flatMap((item) => {
          const position = webMercatorToLngLat(
            Number(item.x),
            Number(item.y),
          );

          if (!position) return [];

          return [{
            id: `landslide-history-${item.serialNumber}`,
            observedAt: item.occurredDate,
            provider: "재난안전데이터",
            disasterName: item.disasterName,
            address: item.address,
            resultGeometry: {
              type: "Point",
              coordinates: position,
            },
          } as ApiRecord];
        }),
      );
    }

    if (wildfireRisk.status === "fulfilled") setExternalWildfireRiskRows(wildfireRisk.value.data.flatMap((item, index) => {
      const coordinates = districtCenter(item.district, item.area, item.province);
      return coordinates ? [{ id: `kfs-risk-${item.regionCode || index}`, observedAt: item.analyzedAt || checkedAt, provider: "산림청", riskScore: item.mean ?? item.max, district: item.district, resultGeometry: pointBuffer(coordinates, 0.035) }] : [];
    }));
    if (landslideForecast.status === "fulfilled") setExternalLandslideForecastRows(landslideForecast.value.data.flatMap((item, index) => {
      const coordinates = districtCenter(item.district);
      return coordinates ? [{ id: `slide-forecast-${index}`, observedAt: item.predictedAt || checkedAt, provider: "재난안전데이터", forecast: item.forecast, resultGeometry: pointBuffer(coordinates, 0.028) }] : [];
    }));
    if (landslideRegionalRisk.status === "fulfilled") setExternalLandslideRegionalRows(landslideRegionalRisk.value.data.flatMap((item, index) => {
      const coordinates = districtCenter(item.districtName, item.detailAddress);
      return coordinates ? [{ id: `slide-regional-${item.managementNumber || index}`, observedAt: item.lastModifiedAt || checkedAt, provider: "재난안전데이터", riskGrade: item.riskGradeCode, expectedPeople: item.expectedPeople, resultGeometry: pointBuffer(coordinates, 0.022) }] : [];
    }));

    setExternalIntegrationStatus((current) => ({
      firms: firms.status === "fulfilled"
        ? {
            status: "ok",
            count: firms.value.meta.count,
            checkedAt,
            lastSuccessAt: checkedAt,
          }
        : {
            status: "error",
            count: current.firms.count,
            checkedAt,
            lastSuccessAt: current.firms.lastSuccessAt,
            servingStale: current.firms.count > 0,
            message: errorMessage(firms.reason),
          },

      wildfireRisk: wildfireRisk.status === "fulfilled"
        ? {
            status: "ok",
            count: wildfireRisk.value.meta.count,
            checkedAt,
            lastSuccessAt: checkedAt,
          }
        : {
            status: "error",
            count: current.wildfireRisk.count,
            checkedAt,
            lastSuccessAt: current.wildfireRisk.lastSuccessAt,
            servingStale: current.wildfireRisk.count > 0,
            message: errorMessage(wildfireRisk.reason),
          },

      landslideForecast: landslideForecast.status === "fulfilled"
        ? {
            status: "ok",
            count: landslideForecast.value.meta.count,
            checkedAt,
            lastSuccessAt: checkedAt,
          }
        : {
            status: "error",
            count: current.landslideForecast.count,
            checkedAt,
            lastSuccessAt: current.landslideForecast.lastSuccessAt,
            servingStale: current.landslideForecast.count > 0,
            message: errorMessage(landslideForecast.reason),
          },

      landslideHistory: landslideHistory.status === "fulfilled"
        ? {
            status: "ok",
            count: landslideHistory.value.meta.count,
            checkedAt,
            lastSuccessAt: checkedAt,
          }
        : {
            status: "error",
            count: current.landslideHistory.count,
            checkedAt,
            lastSuccessAt: current.landslideHistory.lastSuccessAt,
            servingStale: current.landslideHistory.count > 0,
            message: errorMessage(landslideHistory.reason),
          },

      landslideRegionalRisk: landslideRegionalRisk.status === "fulfilled"
        ? {
            status: "ok",
            count: landslideRegionalRisk.value.meta.count,
            checkedAt,
            lastSuccessAt: checkedAt,
          }
        : {
            status: "error",
            count: current.landslideRegionalRisk.count,
            checkedAt,
            lastSuccessAt: current.landslideRegionalRisk.lastSuccessAt,
            servingStale: current.landslideRegionalRisk.count > 0,
            message: errorMessage(landslideRegionalRisk.reason),
          },
    }));
  }, []);

  useEffect(() => {
    void refreshExternalIntegrations();

    const timer = window.setInterval(() => {
      void refreshExternalIntegrations();
    }, 30_000);

    return () => window.clearInterval(timer);
  }, [refreshExternalIntegrations]);

  const refreshOverview = useCallback(async () => {
    const selected = events.find((event) => event.eventId === selectedId);
    if (!selected) return;

    const result = await loadEventOverview(selected);
    const polledTelemetrySamples = result.assets
      .map((asset) => telemetrySampleFromLiveAsset(asset))
      .filter((sample): sample is TelemetrySample => sample !== null);
    if (polledTelemetrySamples.length > 0) {
      setTelemetrySamples((current) => {
        const next = [...current];
        const seen = new Set(current.map((sample) => `${sample.assetId}|${sample.observedAt}|${sample.sequence ?? ""}`));
        for (const sample of polledTelemetrySamples) {
          const key = `${sample.assetId}|${sample.observedAt}|${sample.sequence ?? ""}`;
          if (seen.has(key)) continue;
          seen.add(key);
          next.push(sample);
        }
        return next.slice(-3_600);
      });
    }
    const locations = overviewLocations(result);
    const current = new Map(locations.map((item) => [locationKey(item), locationFingerprint(item)]));
    const previous = previousLocationsRef.current;
    const currentOverviewUpdateTime = overviewLatestUpdateTime(result);
    const overviewChanged =
      previousOverviewUpdateTimeRef.current !== null &&
      currentOverviewUpdateTime > previousOverviewUpdateTimeRef.current;
    if (previous) {
      const now = Date.now();
      const updateIntervalMs = previousOverviewUpdateTimeRef.current === null
        ? POLL_INTERVAL_MS
        : currentOverviewUpdateTime - previousOverviewUpdateTimeRef.current;
      const changeDurationMs = overviewChanged
        ? Math.max(300, Math.min(3_000, updateIntervalMs * 0.3))
        : highlightDurationRef.current;
      if (overviewChanged) {
        highlightDurationRef.current = changeDurationMs;
        setHighlightDurationMs(changeDurationMs);
      }
      const changedKeys = overviewChanged
        ? [...current.keys()]
        : [...current].filter(([key, fingerprint]) => previous.get(key) !== fingerprint).map(([key]) => key);
      setChangedUntil((existing) => {
        const next = Object.fromEntries(Object.entries(existing).filter(([, until]) => until > now));
        for (const key of changedKeys) next[key] = now + changeDurationMs;
        return next;
      });
      if (changedKeys.length) {
        window.setTimeout(() => {
          const expiredAt = Date.now();
          setChangedUntil((existing) => Object.fromEntries(Object.entries(existing).filter(([, until]) => until > expiredAt)));
        }, changeDurationMs + 25);
      }
    }
    previousLocationsRef.current = current;
    previousOverviewUpdateTimeRef.current = Math.max(
      previousOverviewUpdateTimeRef.current ?? 0,
      currentOverviewUpdateTime,
    );
    setOverview(result);
    setLastUpdatedAt(new Date());
  }, [events, selectedId]);

  useEffect(() => {
    previousLocationsRef.current = null;
    previousOverviewUpdateTimeRef.current = null;
    setChangedUntil({});
    setSelectedLocationKey(null);
    setTopologyLocationKey(null);
    setTimeline(null);
    setTimelineIndex(null);
    setTimelinePlaying(false);
    setTelemetrySamples([]);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedLocationKey && !resourceDialogGroup && !topologyLocationKey && !videoDrone) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedLocationKey(null);
        setResourceDialogGroup(null);
        setTopologyLocationKey(null);

        setVideoDrone(null);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [resourceDialogGroup, selectedLocationKey, topologyLocationKey, videoDrone]);

  useEffect(() => {
    let active = true;

    refreshEvents()
      .catch((caught: unknown) => {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : "?? ?? ?? ??");
      })
      .finally(() => active && setEventsLoaded(true));
    return () => { active = false; };
  }, [refreshEvents]);

  useEffect(() => {
    if (localFieldMode) return;
    const timer = window.setInterval(() => {
      refreshEvents().catch(() => undefined);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [localFieldMode, refreshEvents]);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    const refresh = () => refreshOverview()
      .then(() => active && setError(null))
      .catch((caught: unknown) => {
        if (!active) return;
        const message = caught instanceof Error ? caught.message : "현황 조회 실패";
        setError(message);
        setOverview((current) =>
          current
            ? {
                ...current,
                kpis: [],
                kpiApiStatus: {
                  state: "ERROR",
                  checkedAt: new Date().toISOString(),
                  message,
                },
              }
            : current,
        );
      });
    void refresh();
    const timer = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => { active = false; window.clearInterval(timer); };
  }, [refreshOverview, selectedId]);

  useEffect(() => {
    const url = import.meta.env.VITE_TELEMETRY_WS_URL?.trim();
    if (localFieldMode || !url || !selectedId) {
      setTelemetryStreamStatus("DISABLED");
      return;
    }
    const client = new TelemetryStreamClient({
      url,
      eventId: selectedId,
      onStatus: setTelemetryStreamStatus,
      onMessage: (message) => {
        setOverview((current) => current ? applyTelemetrySafetyRules(current, message) : current);
        setTelemetrySamples((current) => [...current, {
          assetId: message.assetId,
          entityType: message.entityType,
          assetType: message.assetType,
          observedAt: message.observedAt,
          receivedAt: message.receivedAt ?? new Date().toISOString(),
          sequence: message.sequence,
          latitude: message.latitude,
          longitude: message.longitude,
        }].slice(-3_600));
        setLastUpdatedAt(new Date());
      },
    });
    client.connect();
    return () => client.stop();
  }, [localFieldMode, selectedId]);

  useEffect(() => {
    if (!selectedId || localFieldMode) {
      if (localFieldMode) setTimeline(null);
      return;
    }
    let active = true;
    const refreshTimeline = async () => {
      if (active) setTimelineLoading(true);
      const to = new Date();
      const from = new Date(to.getTime() - 60 * 60_000);
      try {
        const result = await loadEventTimeline(selectedId, from.toISOString(), to.toISOString());
        if (active) setTimeline(result);
      } catch {
        if (active) setTimeline(null);
      } finally {
        if (active) setTimelineLoading(false);
      }
    };
    void refreshTimeline();
    const timer = window.setInterval(refreshTimeline, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [localFieldMode, selectedId]);

  const mapDomainLayers = useMemo<Record<string, ApiRecord[]>>(
    () => ({
      ...overview?.domainLayers,
      "external-firms": externalFirmsRows,
      "external-landslide-history": externalLandslideHistoryRows,
      "external-wildfire-risk": externalWildfireRiskRows,
      "external-landslide-forecast": externalLandslideForecastRows,
      "external-landslide-regional-risk": externalLandslideRegionalRows,
    }),
    [
      overview?.domainLayers,
      externalFirmsRows,
      externalLandslideHistoryRows,
      externalWildfireRiskRows,
      externalLandslideForecastRows,
      externalLandslideRegionalRows,
    ],
  );

  const liveLocations = useMemo(() => overview ? overviewLocations(overview) : [], [overview]);

  const timelineSnapshots = useMemo(
    () => buildTimelineSnapshots(timeline, [...(overview?.assets ?? []), ...(overview?.unregisteredAssets ?? [])]),
    [overview?.assets, overview?.unregisteredAssets, timeline],
  );
  useEffect(() => {
    if (!timelinePlaying || timelineSnapshots.length < 2) return;
    const current = timelineIndex ?? 0;
    if (current >= timelineSnapshots.length - 1) {
      setTimelinePlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setTimelineIndex(current + 1), 1_000);
    return () => window.clearTimeout(timer);
  }, [timelineIndex, timelinePlaying, timelineSnapshots.length]);
  const playbackSnapshot = timelineIndex == null ? null : timelineSnapshots[timelineIndex] ?? null;
  const mapLocations =
    playbackSnapshot?.locations
    ?? (liveLocations);
  const handleTimelinePlayToggle = useCallback(() => {
    if (timelineSnapshots.length < 2) return;
    if (timelinePlaying) {
      setTimelinePlaying(false);
      return;
    }
    setTimelineIndex((current) => current == null || current >= timelineSnapshots.length - 1 ? 0 : current);
    setTimelinePlaying(true);
  }, [timelinePlaying, timelineSnapshots.length]);
  const handleTimelineIndexChange = useCallback((index: number) => {
    setTimelinePlaying(false);
    setTimelineIndex(index);
    setSelectedLocationKey(null);
  }, []);
  const handleTimelineLive = useCallback(() => {
    setTimelinePlaying(false);
    setTimelineIndex(null);
    setSelectedLocationKey(null);
  }, []);
  const activeAlertCount = useMemo(() => overview?.alerts.filter((item) => !["RESOLVED", "EXPIRED", "CANCELLED"].includes(String(item.status))).length ?? 0, [overview]);
  const visibleLocations = useMemo(() => mapLocations.filter(
    (item) => visibleResourceGroups.has(resourceGroupOf(item))
      && (!hybridExhibitionMode || item.registeredToEvent)
  ), [hybridExhibitionMode, mapLocations, visibleResourceGroups]);
  const eventCoordinates = overview?.event.geometry?.coordinates;
  const eventCenter: [number, number] | null =
    eventCoordinates
        && Number.isFinite(Number(eventCoordinates[0]))
        && Number.isFinite(Number(eventCoordinates[1]))
          ? [Number(eventCoordinates[0]), Number(eventCoordinates[1])] as [number, number]
          : null;
  const liveCenter = mapLocations.length
    ? (() => {
        const middle = Math.floor(mapLocations.length / 2);
        const median = (values: number[]) => {
          const sorted = [...values].sort((a, b) => a - b);
          return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
        };
        return [
          median(mapLocations.map((item) => item.longitude)),
          median(mapLocations.map((item) => item.latitude)),
        ] as [number, number];
      })()
    : null;
  const eventToLiveDistance = eventCenter && liveCenter
    ? Math.hypot(eventCenter[0] - liveCenter[0], eventCenter[1] - liveCenter[1])
    : 0;
  const eventToLiveDistanceKm = eventCenter && liveCenter
    ? Math.hypot(
        (eventCenter[0] - liveCenter[0]) * 88.8,
        (eventCenter[1] - liveCenter[1]) * 111,
      )
    : 0;
  const focusedLocation = selectedLocationKey
    ? mapLocations.find(location => locationKey(location) === selectedLocationKey)
    : undefined;
  const latestRtkCenter = pickSlenoRtkFocusCenter(visibleLocations);
  const mapFocusCenter: [number, number] | null = focusedLocation
    ? [focusedLocation.longitude, focusedLocation.latitude]
    : latestRtkCenter ?? eventCenter ?? liveCenter;
  const coordinateOutlierKeys = new Set(
    liveCenter
      ? mapLocations
          .filter((item) => Math.hypot(item.longitude - liveCenter[0], item.latitude - liveCenter[1]) > 0.08)
          .map(locationKey)
      : [],
  );
  const selectedLocation = mapLocations.find((location) => locationKey(location) === selectedLocationKey) ?? null;
  const selectedRtk = Boolean(selectedLocation && ["RTK_TERMINAL", "RTK_BASE_LPWA_GATEWAY"].includes(selectedLocation.category));
  const selectedTelemetryHistory = selectedLocation
    ? telemetrySamples.filter((sample) => sample.assetId === selectedLocation.id).slice(-20).reverse()
    : [];
  const downloadSelectedTelemetry = () => {
    if (!selectedLocation || selectedTelemetryHistory.length === 0) return;
    const payload = { exportedAt: new Date().toISOString(), eventId: overview?.event.eventId, assetId: selectedLocation.id, samples: [...selectedTelemetryHistory].reverse() };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${selectedLocation.id}-telemetry-history.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const registeredLiveLocations = liveLocations.filter((location) => location.registeredToEvent);
  const exhibitionLocations = hybridExhibitionMode ? registeredLiveLocations : liveLocations;
  const positioningLocations = exhibitionLocations.filter(isPositioningLocation);
  const communicationLocations = exhibitionLocations.filter((location) => resourceGroupOf(location) === "COMMUNICATION");
  const rtkFixedCount = positioningLocations.filter((location) =>
    location.positioningMethod === "RTK_FIXED" ||
    (location.category === "RTK_BASE_LPWA_GATEWAY" && location.rtcmStatus === "READY")
  ).length;
  const rtkFloatCount = positioningLocations.filter((location) => location.positioningMethod === "RTK_FLOAT").length;
  const gnssCount = positioningLocations.filter((location) => ["GNSS", "DGPS"].includes(String(location.positioningMethod))).length;
  const currentTourStep = exhibitionTourStepIndex == null
    ? null
    : EXHIBITION_TOUR_STEPS[exhibitionTourStepIndex] ?? null;
  const currentTourStepAvailable = currentTourStep
    ? isExhibitionTourStepAvailable(currentTourStep.id, {
        hasIncident: Boolean(eventCenter),
        positioningCount: positioningLocations.length,
        communicationCount: communicationLocations.length,
        responseCount: registeredLiveLocations.length,
      })
    : false;
  const dialogLocations = resourceDialogGroup
    ? liveLocations.filter((location) => resourceDialogGroup === "ALL"
      || (resourceDialogGroup === "ALL_ASSETS" ? location.kind === "asset" : resourceGroupOf(location) === resourceDialogGroup))
    : [];
  const topologyLabels = {
    endpoints: topologyLabelsFor(overview, "ENDPOINT"),
    field: topologyLabelsFor(overview, "FIELD"),
    command: topologyLabelsFor(overview, "COMMAND"),
    backhaul: topologyLabelsFor(overview, "BACKHAUL"),
    cloud: topologyLabelsFor(overview, "CLOUD"),
  };
  const topologyDataStatus = overview?.topology.nodes.length
    ? `${overview.topology.nodes.length}개 노드 · ${overview.topology.links.length}개 연결`
    : "운용 기준 구성";
  const externalIntegrationItems = Object.values(externalIntegrationStatus);
  const failedExternalIntegrations = externalIntegrationItems.filter(
    (item) => item.status === "error",
  ).length;

  const fieldApiHealth = evaluateFieldApiHealth({
    lastSuccessAt: lastUpdatedAt,
    failedIntegrations: failedExternalIntegrations,
    totalIntegrations: externalIntegrationItems.length,
    retrying,
    staleAfterMs: 5_000,
    offlineAfterMs: 15_000,
  });

  const fieldApiHealthText = fieldApiHealthLabel(fieldApiHealth);
  const fieldApiLastSuccessText = formatLastSuccessAge(lastUpdatedAt);

  const communicationKpis = useMemo(() => {
    if (!overview) return [];
    return [
      { id: "deployment", code: "NETWORK_DEPLOYMENT_TIME", label: "통신망 구축시간", unit: "분", target: PROJECT_ENHANCED_TARGET.networkDeploymentMinutes, operator: "≤" as const, icon: "NET" },
      { id: "freshness", code: "LOCATION_LATENCY", label: "위치정보 갱신", unit: "초", target: PROJECT_ENHANCED_TARGET.locationUpdateSeconds, operator: "≤" as const, icon: "GPS" },
      { id: "sharing", code: "SHARING_SUCCESS", label: "정보공유 성공률", unit: "%", target: PROJECT_ENHANCED_TARGET.sharingSuccessPct, operator: "≥" as const, icon: "SEQ" },
      { id: "availability", code: "NETWORK_AVAILABILITY", label: "네트워크 가용률", unit: "%", target: PROJECT_ENHANCED_TARGET.availabilityPct, operator: "≥" as const, icon: "LINK" },
    ].map((item) => {
      const row = overview.kpis.find(
        (candidate) => String(candidate.metricCode ?? "") === item.code,
      );
      const assessment = assessKpiMeasurement({
        row,
        expectedMetricCode: item.code,
        expectedUnit: item.unit,
        operator: item.operator,
        target: item.target,
        demoMode: false,
        apiStatus: overview.kpiApiStatus,
      });
      return { ...item, value: assessment.value, state: assessment.state };
    });
  }, [overview]);
  const fieldPrimaryDrone = liveLocations.find(
    (location) => resourceGroupOf(location) === "UAV"
  ) ?? null;
  const fieldVideoAssetId = fieldPrimaryDrone?.id ?? null;

  useEffect(() => {
    let active = true;

    if (!fieldVideoAssetId) {
      setFieldVideoChannels([]);
      setFieldVideoLoading(false);
      return () => { active = false; };
    }

    const loadVideoChannels = async () => {
      setFieldVideoLoading(true);

      try {
        const result = await forestApi.videoChannels(fieldVideoAssetId);

        if (active) {
          setFieldVideoChannels(Array.isArray(result.data) ? result.data : []);
        }
      } catch {
        if (active) setFieldVideoChannels([]);
      } finally {
        if (active) setFieldVideoLoading(false);
      }
    };

    void loadVideoChannels();

    const timer = window.setInterval(() => {
      void loadVideoChannels();
    }, 5000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [fieldVideoAssetId]);

  const fieldPrimaryAsset = (localFieldMode) && fieldPrimaryDrone
    ? overview?.assets.find((asset) =>
        String(asset.assetId ?? "") === fieldPrimaryDrone.id
        || String(asset.assetCode ?? "") === fieldPrimaryDrone.sourceAssetId
        || String(asset.assetCode ?? "") === fieldPrimaryDrone.id,
      ) ?? null
    : null;
  const fieldPrimaryAttributes = fieldPrimaryAsset?.attributes && typeof fieldPrimaryAsset.attributes === "object"
    ? fieldPrimaryAsset.attributes as Record<string, unknown>
    : {};
  const fieldSequenceSummary = localFieldMode
    ? calculatePacketSequence(telemetrySamples, fieldPrimaryDrone?.id, 100)
    : null;

  const fieldLinkQuality =
    fieldPrimaryAttributes.linkQuality &&
    typeof fieldPrimaryAttributes.linkQuality === "object"
      ? fieldPrimaryAttributes.linkQuality as Record<string, unknown>
      : {};

  const linkReceived = Number(fieldLinkQuality.windowReceived);
  const linkLost = Number(fieldLinkQuality.windowLost);
  const linkExpected = Number(fieldLinkQuality.windowExpected);
  const linkLossPct = Number(fieldLinkQuality.packetLossPct);

  const fieldSequenceReceived = Number.isFinite(linkReceived)
      ? linkReceived
      : fieldSequenceSummary?.received ?? 0;

  const fieldSequenceLost = Number.isFinite(linkLost)
      ? linkLost
      : fieldSequenceSummary?.lost ?? 0;

  const fieldSequenceLossPct = Number.isFinite(linkLossPct)
      ? linkLossPct
      : fieldSequenceSummary?.lossPct ?? null;

  const fieldMavlinkVersion = Number(
    fieldPrimaryAttributes.mavlinkVersion ??
    fieldLinkQuality.mavlinkVersion
  );

  const fieldSystemId = Number(
    fieldPrimaryAttributes.systemId ??
    fieldLinkQuality.mavlinkSystemId
  );

  const fieldComponentId = Number(
    fieldPrimaryAttributes.componentId ??
    fieldLinkQuality.mavlinkComponentId
  );
  const fieldSourceAddress = text(fieldPrimaryAttributes.sourceAddress, "수신 대기");
  const fieldTelemetryAgeSec = fieldPrimaryDrone?.observedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(fieldPrimaryDrone.observedAt).getTime()) / 1000))
    : null;
  const fieldLinkHealth = fieldPrimaryDrone?.observedAt
    ? classifyLinkHealth(
        fieldPrimaryDrone.observedAt,
        new Date(),
        fieldPrimaryDrone.expectedTelemetryIntervalSec ?? 3,
      )
    : null;

  /*
   * Semantic Mission fallback PoC
   *
   * MOCK packet is generated only in preview mode.
   * LIVE operation never fabricates predicted operational data.
   */
  const semanticFallbackPacket = null;

  const semanticFallbackDecision = decideSemanticFallback(
    (fieldLinkHealth ?? "DISCONNECTED"),
    semanticFallbackPacket,
    new Date(),
  );

  const semanticFallbackActive =
    semanticFallbackDecision.mode === "SEMANTIC_POC";
  const fieldTwinState = fieldPrimaryDrone == null
      ? "WAITING"
      : fieldLinkHealth === "CONNECTED"
        ? "LIVE"
        : fieldLinkHealth === "DELAYED"
          ? "STALE"
          : "OFFLINE";
  const fieldTwinLabel = fieldTwinState === "LIVE"
    ? "PHYSICAL ↔ DIGITAL SYNC"
    : fieldTwinState === "STALE"
      ? "SYNC DELAY"
      : fieldTwinState === "OFFLINE"
        ? "PHYSICAL LINK OFFLINE"
        : "WAITING FOR PHYSICAL STATE";
  const fieldDisplay = {
    altitude: fieldPrimaryDrone?.altitude ?? (null),
    speed: fieldPrimaryDrone?.groundSpeedMps ?? (null),
    heading: fieldPrimaryDrone?.headingDeg ?? (null),
    battery: fieldPrimaryDrone?.batteryPct ?? (null),
    signal: fieldPrimaryDrone?.signalStrengthDbm ?? (null),
    flightMode: fieldPrimaryDrone?.flightMode ?? (null),
    armed: fieldPrimaryDrone?.armed ?? (null),
    latitude: fieldPrimaryDrone?.latitude ?? (null),
    longitude: fieldPrimaryDrone?.longitude ?? (null),
  };
  /* PHASE_5_4_FIELD_FRESHNESS */
  const fieldFreshnessState =
    fieldTelemetryAgeSec == null
        ? "WAITING"
        : fieldLinkHealth === "CONNECTED"
          ? "LIVE"
          : fieldLinkHealth === "DELAYED"
            ? "STALE"
            : "OFFLINE";

  const fieldFreshnessLabel =
    fieldFreshnessState === "LIVE"
      ? "LIVE · 정상 수신"
      : fieldFreshnessState === "STALE"
        ? "STALE · 갱신 지연"
        : fieldFreshnessState === "OFFLINE"
          ? "OFFLINE · 수신 중단"
          : "WAITING · 위치 수신 대기";

  const fieldFreshnessDetail =
    fieldTelemetryAgeSec == null
        ? "GLOBAL_POSITION_INT(33) 대기"
        : `마지막 위치 수신 ${fieldTelemetryAgeSec}s 전`;

  /* PHASE_5_5_FIELD_SUCCESS_GATE */
  const fieldHasCorePosition = Boolean(
    fieldPrimaryDrone
    && fieldPrimaryDrone.latitude != null
    && fieldPrimaryDrone.longitude != null
    && Number.isFinite(fieldPrimaryDrone.latitude)
    && Number.isFinite(fieldPrimaryDrone.longitude)
  );

  const fieldPipelineMapState =
    fieldHasCorePosition
        ? fieldFreshnessState
        : "WAIT";

  const fieldPipelineRows = [
    {
      id: "uplink",
      label: "QGC / Uplink",
      state: "CHECK",
      detail: "CHECK_FIELD_MD1000.ps1",
    },
    {
      id: "core",
      label: "Core Position",
      state: fieldHasCorePosition ? "OK" : "WAIT",
      detail: fieldHasCorePosition
          ? "MSG33 POSITION RECEIVED"
          : "GLOBAL_POSITION_INT(33) WAIT",
    },
    {
      id: "twin",
      label: "Map Twin",
      state: fieldHasCorePosition
          ? "OK"
          : "WAIT",
      detail: fieldHasCorePosition
          ? "MARKER / TRAIL READY"
          : "POSITION REQUIRED",
    },
    {
      id: "freshness",
      label: "Freshness",
      state: fieldPipelineMapState,
      detail: fieldTelemetryAgeSec == null
          ? "NO POSITION"
          : `${fieldTelemetryAgeSec}s`,
    },
  ];

  const eventSwitching = Boolean(overview && overview.event.eventId !== selectedId);
  const toggleLayer = useCallback((layerId: string) => {
    setVisibleLayerIds((current) => {
      const next = new Set(current);
      if (next.has(layerId)) next.delete(layerId); else next.add(layerId);
      return next;
    });
  }, []);
  const toggleResourceGroup = useCallback((group: ResourceGroup) => {
    setVisibleResourceGroups((current) => {
      const next = new Set(current);
      if (next.has(group)) next.delete(group); else next.add(group);
      return next;
    });
  }, []);
  const handleLocationSelect = useCallback((location: LiveLocation) => {
    setTopologyLocationKey(null);
    setSelectedLocationKey(locationKey(location));
  }, []);
  const handleLocationTopology = useCallback((location: LiveLocation) => {
    const key = locationKey(location);
    setSelectedLocationKey(null);
    setResourceDialogGroup(null);
    setTopologyLocationKey((current) => current === key ? null : key);
  }, []);
  const handleRetry = useCallback(async () => {
    setRetrying(true);
    setError(null);
    try {
      await refreshEvents();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "사건 목록 조회 실패");
    } finally {
      setEventsLoaded(true);
      setRetrying(false);
    }
  }, [refreshEvents]);

  return (
<main className={`unified-disaster-board ${displayClassName}${commandShellMode ? " is-field-mode" : ""}${SHOW_VALIDATION_UI ? "" : " final-ops-ui"}${hybridExhibitionMode ? " hybrid-exhibition-mode" : ""}`} aria-label="산림재난 통합상황판">
      {error && <p className="unified-disaster-error" role="status"><strong>데이터 갱신 지연</strong><span>{error}</span><small>{overview ? "마지막 정상 데이터를 유지합니다." : "연결을 다시 확인하고 있습니다."}</small></p>}
      {!overview && (
        <section className="dashboard-readiness" aria-live="polite">
          <header>
            <div className="readiness-brand"><span>산림청</span><strong>산림재난 통합상황판</strong><small>FOREST DISASTER COMMON OPERATIONAL PICTURE</small></div>
            <div className="readiness-actions">
              {SHOW_VALIDATION_UI && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("qa") === "1" && <button type="button" className="requirements-open" onClick={() => setRequirementsOpen(true)}>기능 검증 현황</button>}
              <button type="button" className="asset-registry-open" onClick={() => { window.location.href = "/device"; }}>자산 등록·관리</button>
              <div className={`readiness-connection ${error ? "is-error" : eventsLoaded ? "is-ready" : "is-loading"}`}><i />{error ? "연결 점검 필요" : eventsLoaded ? "연결 정상" : "데이터 연결 중"}</div>
            </div>
          </header>
          <div className="readiness-body">
            <div className="readiness-symbol" aria-hidden="true"><span /><i /><b /></div>
            <div>
              <p>{error ? "통합 데이터 연결을 확인해 주세요" : disasterNotFound ? "기본 재난 ID에 대응하는 등록 정보가 없습니다" : eventsLoaded ? "조회된 재난 정보가 없습니다" : "산림재난 운영 정보를 불러오고 있습니다"}</p>
              <h1>{error ? "상황판을 준비하지 못했습니다" : disasterNotFound ? "재난 미등록 · 장비 정보 별도 조회" : eventsLoaded ? "재난 조회 대기" : "상황판 준비 중"}</h1>
              <span>{error ? "기존 데이터는 변경되지 않았습니다. 연결 복구 후 최신 상황을 다시 불러옵니다." : disasterNotFound ? "설정된 기본 재난 ID를 찾지 못했습니다. 실제 재난 발생 여부는 확인되지 않았으며, 아래 Sleno 통신 품질 정보는 별도 운영 API로 조회합니다." : eventsLoaded ? "실제 재난 목록 연동 상태를 확인해 주세요." : "사건, 현장 자원, 통신망과 경보 상태를 확인하는 중입니다."}</span>
              {error && <button type="button" onClick={handleRetry} disabled={retrying}>{retrying ? "다시 연결 중…" : "연결 다시 확인"}</button>}
            </div>
          </div>
          {disasterNotFound && !error && (
            <section aria-label="재난 미등록 상태의 독립 Sleno 품질 조회">
              <SlenoNetworkQualityPanel />
            </section>
          )}
          <footer>
            <span><i /> 사건 정보</span><span><i /> 현장 자원</span><span><i /> 통신망 상태</span><span><i /> 위험 경보</span>
          </footer>
        </section>
      )}

      {overview && (
        <>
        <header className="map-command-header">
          <div className="service-brand">
            <img
              className="service-brand-logo"
              src="/brand/tobeunicorn.png"
              alt="투비유니콘"
            />
          </div>
          <label className="event-selector">
            <span>{eventSwitching ? "사건 전환 중" : "재난 사건"}</span>
            <select value={eventSwitching ? overview.event.eventId : selectedId} onChange={(event) => setSelectedId(event.target.value)} aria-label="재난 사건 선택" disabled={eventSwitching}>
              {events.map((event) => <option key={event.eventId} value={event.eventId}>{korean(event.disasterType, "재난")} · {text(event.eventName, event.eventCode)}</option>)}
            </select>
          </label>
          <div className="header-event-state">
            <b data-type={overview.event.disasterType}>{korean(overview.event.disasterType, "재난")}</b>
            <span>{korean(overview.event.status)}</span>
            <span>{korean(overview.event.severityCode)}</span>
            <small>{text(overview.event.locationName)}</small>
          </div>

          {localFieldMode && <div className={`demo-mode-badge field-mode-badge${""}`} title={"실제 MD1000 MAVLink만 수신하는 로컬 현장 모드입니다. Synthetic feed는 사용하지 않습니다."}><b>{"현장"}</b><span>{"MD1000 실기체 · MAVLink 연동"}</span></div>}

{/* restore-field-header-nav-20261011: existing field tools in header */}
          <nav className="field-header-tools-nav" aria-label="현장 도구 선택">
            <button type="button" className={toolDrawerOpen && rightDockTab === "status" ? "is-active" : ""} aria-pressed={toolDrawerOpen && rightDockTab === "status"} aria-controls="field-left-drawer-content" onClick={() => { setRightDockTab("status"); setToolDrawerOpen(value => rightDockTab === "status" ? !value : true); }}>현장 상태</button>
            <button type="button" className={toolDrawerOpen && rightDockTab === "semantic" ? "is-active" : ""} aria-pressed={toolDrawerOpen && rightDockTab === "semantic"} aria-controls="field-left-drawer-content" title={"Semantic AI 상세정보는 디버그·시연 모드에서만 제공됩니다"} onClick={() => { setRightDockTab("semantic"); setToolDrawerOpen(value => rightDockTab === "semantic" ? !value : true); }}>Semantic AI</button>
            <button type="button" className={toolDrawerOpen && rightDockTab === "fieldlink" ? "is-active" : ""} aria-pressed={toolDrawerOpen && rightDockTab === "fieldlink"} aria-controls="field-left-drawer-content" onClick={() => { setRightDockTab("fieldlink"); setToolDrawerOpen(value => rightDockTab === "fieldlink" ? !value : true); }}>FieldLink</button>
          </nav>
          {/* field-capability-shortcuts-20261011: 지원 메뉴는 기존 상태 표시와 분리 */}
          <nav className="field-capability-shortcuts" aria-label="현장 지원 기능">
            {([
              ["equipment", "대원·장비"],
              ["command", "통신 지휘차"],
              ["twin", "AI·디지털트윈"],
              ["response", "현장 대응"],
            ] as const).map(([key, label]) => (
              <button key={key} type="button" aria-haspopup="dialog"
                aria-expanded={capabilityMenu === key}
                className={capabilityMenu === key ? "is-active" : ""}
                onClick={() => setCapabilityMenu(current => current === key ? null : key)}>
                {label}{key === "response" ? " ▾" : ""}
              </button>
            ))}
          </nav>
          <nav className="header-summary" aria-label="운영 현황">
            <button
  type="button"
  onClick={() => {
    setSelectedLocationKey(null);
    setResourceDialogGroup("ALL_ASSETS");
  }}
>
  <span>투입 장비</span>
  <b>{overview.assets.length}</b>
</button>
            <button type="button" onClick={() => setOperationsTab("layers")}><span>인원</span><b>{overview.personnel.length}</b></button>
            <button type="button" onClick={() => setOperationsTab("networks")}><span>통신망</span><b>{overview.networks.length}</b></button>
            <button type="button" data-alert={activeAlertCount > 0} onClick={() => setOperationsTab("alerts")}><span>경보</span><b>{activeAlertCount}</b></button>
          </nav>
          <div className="command-primary-actions">
            <button type="button" className="asset-registry-open" onClick={() => { window.location.href = "/device"; }}>자산 등록·관리</button>
            {SHOW_VALIDATION_UI && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("qa") === "1" && <button type="button" className="requirements-open" onClick={() => setRequirementsOpen(true)}>기능 검증 현황</button>}
          </div>
          <button type="button" className="asset-status-open" onClick={() => { setSelectedLocationKey(null); setResourceDialogGroup("ALL"); }}>사건 투입 자산</button>
          <time className="last-updated" title={lastUpdatedAt?.toLocaleString("ko-KR")}><i /> 최근 갱신 {lastUpdatedAt ? relativeTime(lastUpdatedAt.toISOString()) : "대기 중"}</time>
        </header>
        {hybridExhibitionMode && (
          <section className="hybrid-status-bar" aria-label="전시 관제 핵심 상태">
            <div className="hybrid-mode-label">
              <small>TOBEUNICORN · FOREST COMMAND CENTER</small>
              <strong>CINEMATIC MISSION CONTROL</strong>
              <span>{text(overview.event.eventName, overview.event.eventCode)} · 운영 API</span>
            </div>
            <article data-tone={activeAlertCount > 0 ? "alert" : "normal"}>
              <em className="hybrid-data-state" data-state="measured">API 수신</em>
              <span>재난</span>
              <strong>{korean(overview.event.disasterType, "재난")} · {korean(overview.event.status)}</strong>
              <small>{korean(overview.event.severityCode)} · 경보 {activeAlertCount}건</small>
            </article>
            <article data-tone={overview.liveDroneTelemetry?.status === "CONNECTED" ? "normal" : "warning"}>
              <em className="hybrid-data-state" data-state={overview.liveDroneTelemetry?.status === "CONNECTED" ? "measured" : overview.liveDroneTelemetry ? "error" : "missing"}>{overview.liveDroneTelemetry?.status === "CONNECTED" ? "실측 수신" : overview.liveDroneTelemetry ? "API 오류" : "미수신"}</em>
              <span>통신 수신</span>
              <strong>{overview.liveDroneTelemetry ? `LIVE ${overview.liveDroneTelemetry.live} · 연결 ${overview.liveDroneTelemetry.matched}` : "수신 상태 확인 중"}</strong>
              <small>{overview.liveDroneTelemetry ? `STALE ${overview.liveDroneTelemetry.stale} · OFFLINE ${overview.liveDroneTelemetry.offline}` : "Core 텔레메트리 응답 대기"}</small>
            </article>
            <article data-tone={positioningLocations.length > 0 && rtkFixedCount === 0 ? "warning" : "normal"}>
              <em className="hybrid-data-state" data-state={positioningLocations.length > 0 ? "measured" : "missing"}>{positioningLocations.length > 0 ? "실측 위치" : "미수신"}</em>
              <span>RTK · GNSS</span>
              <strong>{positioningLocations.length > 0 ? `FIX ${rtkFixedCount} · FLOAT ${rtkFloatCount}` : "위치 상태 미수신"}</strong>
              <small>GNSS/DGPS {gnssCount} · 등록 장비 {positioningLocations.length}</small>
            </article>
            <article className="hybrid-terrain-state" data-tone={terrainPresentationState === "FALLBACK" ? "warning" : "normal"}>
              <em className="hybrid-data-state" data-state={terrainPresentationState === "FALLBACK" ? "error" : "measured"}>{terrainPresentationState === "FALLBACK" ? "DEM 오류" : "지도 정상"}</em>
              <span>GIS</span>
              <strong>{terrainPresentationState === "FALLBACK" ? "2D 복구 모드" : terrainPresentationState === "3D" ? "DEM 3D 활성" : "2D 지도"}</strong>
              <small>{terrainPresentationState === "FALLBACK" ? "DEM 오류 감지" : "MapLibre 지형 엔진"}</small>
            </article>
            <button
              type="button"
              className="exhibition-tour-toggle"
              data-running={currentTourStep ? "true" : "false"}
              onClick={() => setExhibitionTourStepIndex(currentTourStep ? null : 0)}
            >
              <span>{currentTourStep ? "TOUR RUNNING" : "GUIDED TOUR"}</span>
              <strong>{currentTourStep ? "투어 중단" : "전시 투어 시작"}</strong>
            </button>
          </section>
        )}
        {hybridExhibitionMode && currentTourStep && (
          <aside className="hybrid-tour-controller" aria-label="전시 투어 진행">
            <header>
              <div><small>{currentTourStep.eyebrow}</small><strong>{currentTourStep.title}</strong></div>
              <span>{String(exhibitionTourStepIndex! + 1).padStart(2, "0")} / {String(EXHIBITION_TOUR_STEPS.length).padStart(2, "0")}</span>
            </header>
            <p>{currentTourStep.description}</p>
            <div className="hybrid-tour-data-state" data-available={currentTourStepAvailable ? "true" : "false"}>
              <i />{currentTourStepAvailable ? "확인된 운영 데이터로 카메라 이동" : "관련 데이터 수신 대기 · 카메라 이동 생략"}
            </div>
            <footer>
              <button type="button" onClick={() => setExhibitionTourStepIndex(null)}>중단</button>
              <button type="button" disabled={exhibitionTourStepIndex === 0} onClick={() => setExhibitionTourStepIndex((index) => index == null ? null : Math.max(0, index - 1))}>이전</button>
              <button
                type="button"
                className="primary"
                onClick={() => setExhibitionTourStepIndex((index) => index == null || index >= EXHIBITION_TOUR_STEPS.length - 1 ? null : index + 1)}
              >
                {exhibitionTourStepIndex === EXHIBITION_TOUR_STEPS.length - 1 ? "투어 종료" : currentTourStepAvailable ? "다음 단계" : "이 단계 건너뛰기"}
              </button>
            </footer>
          </aside>
        )}
        {capabilityMenu && (
          <section className="field-capability-panel" role="dialog" aria-modal="false"
            aria-label="현장 지원 기능 정보">
            <header>
              <strong>{capabilityMenu === "equipment" ? "대원·장비" : capabilityMenu === "command" ? "통신 지휘차" : capabilityMenu === "twin" ? "AI·디지털트윈" : "현장 대응"}</strong>
              <button type="button" onClick={() => setCapabilityMenu(null)} aria-label="지원 메뉴 닫기">×</button>
            </header>
            {capabilityMenu === "equipment" && <div>
              <p>대원 보호장비와 현장 진화장비 점검 항목</p>
              <div className="field-capability-tiles">
                <article><b>대원 보호장비</b><span>헬멧·조명·고글·마스크·장갑</span><small>지급·점검 기록 연동 대기</small></article>
                <article><b>야간 시야 보조</b><span>헬멧 조명·휴대 조명</span><small>실장비 제어 연결 없음</small></article>
                <article><b>진화 장비</b><span>불갈퀴·펌프·호스 등</span><small>재고·배치 데이터 연동 대기</small></article>
              </div>
              <button type="button" onClick={() => { setCapabilityMenu(null); setSelectedLocationKey(null); setResourceDialogGroup("ALL_ASSETS"); }}>등록 자산 목록 열기</button>
            </div>}
            {capabilityMenu === "command" && <div>
              <p>통신 지휘차 탑재 시스템 확인</p>
              <div className="field-capability-tiles">
                <article><b>무전·현장 통신</b><span>VHF·PS-LTE·백홀 인터페이스</span><small>차량별 연결 검증 대기</small></article>
                <article><b>현장 영상·방송</b><span>CCTV·현장 안내 방송</span><small>영상·방송 제어 연동 대기</small></article>
                <article><b>전원 상태</b><span>UPS·배터리·발전기</span><small>운용 계측값 미수신</small></article>
              </div>
              <button type="button" onClick={() => { setOperationsTab("networks"); setCapabilityMenu(null); }}>통신망 현황 열기</button>
            </div>}
            {capabilityMenu === "twin" && <div>
              <p>기존 관제 지도와 AI 분석 레이어를 활용합니다.</p>
              <div className="field-capability-tiles">
                <article><b>3D 지형</b><span>기존 지도 우측 3D 지형 모드 사용</span><small>지도 기능 재사용</small></article>
                <article><b>AI 분석 후보</b><span>관측 화선·확산 참고·위험 구역</span><small>분석 출처·시연 여부 확인 필요</small></article>
                <article><b>실기체 디지털트윈</b><span>실기체 위치 기반 표현</span><small>Core Position 데이터 수신 대기</small></article>
              </div>
              <button type="button" onClick={() => { setOperationsTab("layers"); setCapabilityMenu(null); }}>분석 레이어 열기</button>
            </div>}
            {capabilityMenu === "response" && <div>
              <div className="field-capability-choice" role="group" aria-label="현장 대응 종류">
                <button type="button" aria-pressed={responseSection === "night"} onClick={() => setResponseSection("night")}>야간 대응</button>
                <button type="button" aria-pressed={responseSection === "vehicle"} onClick={() => setResponseSection("vehicle")}>진화 차량</button>
                <button type="button" aria-pressed={responseSection === "hq"} onClick={() => setResponseSection("hq")}>통합지휘본부</button>
              </div>
              {responseSection === "night" && <article><b>야간 대응 검토</b><p>현장 조명·보호장비, 풍속·시정·기상 관측값을 확인합니다.</p><small>헬기 투입 가능 여부는 자동 판정하지 않으며 관계 지침과 지휘권자 판단이 필요합니다.</small></article>}
              {responseSection === "vehicle" && <article><b>진화 차량</b><p>진화차·펌프차·지휘차의 장비 제원 및 투입 현황을 확인합니다.</p><small>차량별 제원·배치 원장 연동 대기</small></article>}
              {responseSection === "hq" && <article><b>통합지휘본부</b><p>상황총괄 · 지상진화 · 공중진화 · 보급지원 · 홍보대책 · 유관기관 협조</p><small>조직별 담당자·지휘명령 데이터 연동 대기</small></article>}
            </div>}
            <footer>표시는 기능 안내 및 연동 현황입니다. 실제 현장 장비 상태를 검증한 결과가 아닙니다.</footer>
          </section>
        )}
        {SHOW_VALIDATION_UI && <section className="field-kpi-strip" aria-label="현장 통신 KPI 4종">
          {communicationKpis.map((item) => (
            <article key={item.id} data-state={item.state}>
              <span className="field-kpi-icon" aria-hidden="true">{item.icon}</span>
              <div>
                <small>{item.label}</small>
                <strong>{item.value == null ? "측정 대기" : `${item.value.toFixed(1)}${item.unit}`}</strong>
              </div>
              <em>{item.state === "PASS" || item.state === "FAIL" ? item.state : item.state === "DEMO" ? "DEMO" : item.state === "UNVERIFIED" ? "미검증" : item.state === "ERROR" ? "API 오류" : item.state === "STALE" ? "STALE" : "대기"}</em>
              <p>기준 {item.operator}{item.target}{item.unit}</p>
            </article>
          ))}
          <aside className="field-kpi-context">
            <div className="field-kpi-context-title">
              <b>
                {localFieldMode
                  ? "실기체 통신 감시"
                  : "현장 통신 상태"}
              </b>
            </div>

            <div
              className="field-kpi-context-status"
              title={
                localFieldMode
                    ? "MD1000 실기체 · MAVLink v2"
                    : undefined
              }
            >
              <small
                className="field-kpi-mode-chip"
                data-mode={
                  localFieldMode
                    ? "physical"
                    : "live"
                }
              >
                {localFieldMode
                  ? "SYNTHETIC OFF"
                  : "API DATA · 실측 여부 개별 확인"}
              </small>
              {(
                <div
                  className="field-api-health"
                  data-state={fieldApiHealth.toLowerCase()}
                  title={fieldApiLastSuccessText}
                  role="status"
                >
                  <i />
                  <span>{fieldApiHealthText}</span>
                </div>
              )}
            </div>
          </aside>
        </section>}
<section className={`dashboard-map-stage${commandShellMode ? " field-command-stage" : " asset-panel-collapsed"}`} aria-label="?? ?? ?? ???">
          <section className="live-location-panel" aria-label="실시간 현장 위치">
            {overview.liveDroneTelemetry && <div
              className="telemetry-connection-status"
              role="status"
              title={localFieldMode ? "현재 위치는 CRC 검증된 MAVLink GLOBAL_POSITION_INT(33)만 사용합니다." : undefined}
              data-local-e2e={undefined}
              data-e2e-live={undefined}
              data-e2e-stale={undefined}
              data-e2e-offline={undefined}
              data-local-field={localFieldMode ? "true" : undefined}
              data-field-live={localFieldMode ? overview.liveDroneTelemetry.live : undefined}
              data-field-stale={localFieldMode ? overview.liveDroneTelemetry.stale : undefined}
              data-field-offline={localFieldMode ? overview.liveDroneTelemetry.offline : undefined}
            >
              {localFieldMode ? ('MD1000 실시간 기체 위치') : '실시간 장비 위치 연동'} · {localFieldMode
                ? (fieldCoreStatusLabel(overview.liveDroneTelemetry.status, overview.liveDroneTelemetry.matched))
                : overview.liveDroneTelemetry.status === 'CONNECTED' ? 'Core 조회 정상' : 'Core 조회 실패 · 마지막 수신값 유지'}
              {' · '}지도 연결 {overview.liveDroneTelemetry.matched}대 · LIVE {overview.liveDroneTelemetry.live} · STALE {overview.liveDroneTelemetry.stale} · OFFLINE {overview.liveDroneTelemetry.offline}
              {' · '}ID 미연결 {overview.liveDroneTelemetry.unmatched}대
              {overview.liveDroneTelemetry.unmatched > 0 && ' · 자산 코드 또는 telemetrySourceAssetId 확인'}
            </div>}
            <div className="live-location-layout">
              <div className="location-map" role="region" aria-label={`현장 위치 ${liveLocations.length}건`}>
                <LivePositionMap
                  locations={visibleLocations}
                  changedUntil={changedUntil}
                  highlightDurationMs={highlightDurationMs}
                  eventCenter={eventCenter}
                  focusCenter={mapFocusCenter}
                  eventId={overview.event.eventId}
                  showResources={visibleLayerIds.has("resources")}
                  showEvent={visibleLayerIds.has("event")}
                  selectedKey={topologyLocationKey ?? selectedLocationKey}
                  onLocationSelect={handleLocationSelect}
                  onLocationDoubleClick={(location) => setVideoDrone(location)}
                  onLocationTopology={handleLocationTopology}
                  topology={overview.topology}
                  topologyFocusKey={topologyLocationKey}
                  showTopology={visibleLayerIds.has("topology")}
                  referenceTimeMs={playbackSnapshot ? Date.parse(playbackSnapshot.at) + 59_999 : Date.now()}
                  domainLayers={mapDomainLayers}
                  visibleLayerIds={visibleLayerIds}
                  cinematicMode={hybridExhibitionMode}
                  tourStage={currentTourStep?.id ?? null}
                  onTerrainStateChange={setTerrainPresentationState}
                />
                <MapTimelinePlayer
                  snapshots={timelineSnapshots}
                  activeIndex={timelineIndex}
                  playing={timelinePlaying}
                  loading={timelineLoading}
                  onPlayToggle={handleTimelinePlayToggle}
                  onIndexChange={handleTimelineIndexChange}
                  onLive={handleTimelineLive}
                />
                {eventToLiveDistance > 0.08 && (
                  <p className="map-coordinate-warning" role="status">
                    <strong>좌표 정합성 확인 필요</strong>
                    재난 위치와 수신 장비 좌표의 중심이 약 {eventToLiveDistanceKm.toFixed(1)}km 떨어져 있습니다. 장비를 선택하면 마지막 수신 위치로 이동하며, 기본 중심은 지정한 재난 위치입니다.
                  </p>
                )}
                {liveLocations.length === 0 && <p>수신된 위치가 없습니다.</p>}
              </div>
              <OperationsPanel
                overview={overview}
                visibleLayerIds={visibleLayerIds}
                onLayerToggle={toggleLayer}
                visibleResourceGroups={visibleResourceGroups}
                onResourceGroupToggle={toggleResourceGroup}
                onResourceGroupInspect={(group) => { setSelectedLocationKey(null); setResourceDialogGroup(group); }}
                locations={liveLocations}
                lastUpdatedAt={lastUpdatedAt}
                activeTab={operationsTab}
                onActiveTabChange={setOperationsTab}
                externalIntegrationStatus={externalIntegrationStatus}
                onRefreshExternalIntegrations={() => {
                  void refreshExternalIntegrations();
                }}
                telemetryStreamStatus={telemetryStreamStatus}
                onOpenDroneVideo={(location) => setVideoDrone(location)}
                telemetrySamples={telemetrySamples}
                initiallyCollapsed={hybridExhibitionMode}
              />

              {/* Right-side tools do not cover the central map while inactive. */}
              <aside className={`field-right-dock field-left-drawer${toolDrawerOpen ? " is-open" : ""}`} aria-label="현장 지원 도구">
<div id="field-left-drawer-content" className="field-left-drawer-content" inert={!toolDrawerOpen}>
<div className="field-right-dock-body" hidden={rightDockTab !== "status"}>
                  <strong>관제 현장 상태</strong>
                  <p>{fieldApiHealthText}</p>
                  <p>지도 왼쪽 관제 메뉴에서 통신망·경보·연계 상태를 확인할 수 있습니다.</p>
                  <button type="button" onClick={() => { setOperationsTab("networks"); setRightDockTab("status"); }}>통신망 정보 보기</button>
                </div>

                <div className="field-right-dock-fieldlink" hidden={rightDockTab !== "fieldlink"}>
                  <FieldLinkChatWidget
                    embedded
                    eventId={String(overview.event.eventId ?? DEFAULT_EVENT_ID)}
                  />
                </div>
                </div>
              </aside>

              {(localFieldMode || SHOW_VALIDATION_UI) && <aside className="field-command-inspector" aria-label="MD1000 장비 상세 정보">
                <header>
                  <div><small>장비 상세 정보</small><strong>{fieldPrimaryDrone?.label ?? ("주 기체 수신 대기")}</strong></div>
                  <em
                    className="field-freshness-chip"
                    data-state={fieldFreshnessState.toLowerCase()}
                  >
                    {fieldFreshnessState}
                  </em>
                </header>
                <div
                  className="field-freshness-banner"
                  data-state={fieldFreshnessState.toLowerCase()}
                >
                  <strong>{fieldFreshnessLabel}</strong>
                  <span>{fieldFreshnessDetail}</span>
                </div>

                {semanticFallbackActive && (
                  <section
                    className="semantic-fallback-poc"
                    aria-label="Semantic AI PoC fallback status"
                  >
                    <header>
                      <div>
                        <strong>SEMANTIC AI · PoC</strong>
                        <small>통신 단절 fallback 시각화</small>
                      </div>
                      <span>EXPERIMENTAL</span>
                    </header>

                    <div className="semantic-fallback-badges">
                      <b>MOCK</b>
                      <b>PREDICTED</b>
                      <b>NOT LIVE VIDEO</b>
                    </div>

                    <div className="semantic-fallback-grid">
                      <article>
                        <small>Fallback Mode</small>
                        <strong>{semanticFallbackDecision.mode}</strong>
                      </article>
                      <article>
                        <small>Semantic State</small>
                        <strong>{semanticFallbackDecision.semanticState}</strong>
                      </article>
                      <article>
                        <small>Source</small>
                        <strong>{semanticFallbackDecision.packet?.source ?? "-"}</strong>
                      </article>
                      <article>
                        <small>Confidence</small>
                        <strong>
                          {semanticFallbackDecision.packet?.observations[0]
                            ? `${Math.round(
                                semanticFallbackDecision.packet.observations[0]
                                  .confidence * 100,
                              )}%`
                            : "-"}
                        </strong>
                      </article>
                    </div>

                    <footer>
                      마지막 관측 기반 예측 표시 · 실제 LIVE 영상 또는 관측 데이터가 아닙니다.
                    </footer>
                  </section>
                )}

                <section
                  className="field-success-gate"
                  aria-label="MD1000 FIELD success gate"
                >
                  <header>
                    <div>
                      <small>FIELD SUCCESS GATE</small>
                      <strong>{fieldPrimaryDrone ? "MD1000 실기체 연동" : "실기체 연동 대기"}</strong>
                    </div>
                    <em data-state={fieldPipelineMapState.toLowerCase()}>
                      {fieldPipelineMapState}
                    </em>
                  </header>

                  <div className="field-success-gate-list">
                    {fieldPipelineRows.map((row) => (
                      <article key={row.id}>
                        <span>{row.label}</span>
                        <b data-state={row.state.toLowerCase()}>
                          {row.state}
                        </b>
                        <small>{row.detail}</small>
                      </article>
                    ))}
                  </div>

                  <footer>
                    <span>POSITION SOURCE</span>
                    <strong>MAVLink GLOBAL_POSITION_INT (MSG 33)</strong>
                  </footer>
                </section>

                <div className="field-inspector-identity">
                  <span>{fieldPrimaryDrone ? `무인기 · ${fieldPrimaryDrone.label}` : "무인기 · 미수신"}</span>
                  <b>{fieldPrimaryDrone?.status ?? "실기체 위치 수신 대기"}</b>
                  <small>{"GLOBAL_POSITION_INT(33) 기반 현재 위치"}</small>
                </div>
                <section className="field-twin-status" data-state={fieldTwinState.toLowerCase()} aria-label="MD1000 디지털 트윈 동기화 상태">
                  <header>
                    <span>Digital Twin</span>
                    <strong>{fieldTwinLabel}</strong>
                  </header>
                  <div className="field-twin-grid">
                    <article><small>Physical Asset</small><b>{fieldPrimaryDrone?.label ?? ("-")}</b></article>
                    <article><small>Twin State</small><b>{fieldTwinState}</b></article>
                    <article><small>Position Source</small><b>{fieldPrimaryDrone ? "MAVLink MSG 33" : "-"}</b></article>
                    <article
                      className="field-freshness-cell"
                      data-state={fieldFreshnessState.toLowerCase()}
                    >
                      <small>Freshness</small>
                      <b>{fieldFreshnessState}</b>
                      <em>
                        {fieldTelemetryAgeSec == null
                            ? "-"
                            : `${fieldTelemetryAgeSec}s`}
                      </em>
                    </article>
                    <article><small>Latitude</small><b>{fieldDisplay.latitude == null ? "-" : fieldDisplay.latitude.toFixed(6)}</b></article>
                    <article><small>Longitude</small><b>{fieldDisplay.longitude == null ? "-" : fieldDisplay.longitude.toFixed(6)}</b></article>
                  </div>
                </section>
                <nav
                  className="field-inspector-tabs"
                  aria-label="장비 정보 분류"
                  role="tablist"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={fieldInspectorTab === "quality"}
                    className={fieldInspectorTab === "quality" ? "active" : ""}
                    onClick={() => setFieldInspectorTab("quality")}
                  >
                    통신 품질
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={fieldInspectorTab === "details"}
                    className={fieldInspectorTab === "details" ? "active" : ""}
                    onClick={() => setFieldInspectorTab("details")}
                  >
                    상세 정보
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={fieldInspectorTab === "video"}
                    className={fieldInspectorTab === "video" ? "active" : ""}
                    onClick={() => setFieldInspectorTab("video")}
                  >
                    실시간 영상
                  </button>
                </nav>

                {fieldInspectorTab === "quality" && (
                <div
                  className="field-inspector-pane field-quality-pane"
                  role="tabpanel"
                >
                <section className="field-seq-summary" aria-label="최근 SEQ 통신 품질">
                  <header><span>최근 100 SEQ 기준</span><small>{fieldSequenceSummary?.expected ? `SEQ ${fieldSequenceSummary.fromSequence ?? "-"}–${fieldSequenceSummary.toSequence ?? "-"}` : "수신 대기"}</small></header>
                  <div className="field-seq-grid">
                    <article><small>Received</small><strong>{fieldSequenceReceived || "-"}</strong></article>
                    <article><small>Lost</small><strong data-alert={fieldSequenceLost > 0}>{fieldSequenceLost || "-"}</strong></article>
                    <article><small>Loss %</small><strong data-alert={(fieldSequenceLossPct ?? 0) >= 3}>{fieldSequenceLossPct == null ? "-" : `${fieldSequenceLossPct.toFixed(1)}%`}</strong></article>
                    <article><small>최근 수신</small><strong>{fieldPrimaryDrone ? relativeTime(fieldPrimaryDrone.observedAt) : "대기"}</strong></article>
                    <article><small>고도</small><strong>{fieldDisplay.altitude == null ? "-" : `${fieldDisplay.altitude.toFixed(0)}m`}</strong></article>
                    <article><small>속도</small><strong>{fieldDisplay.speed == null ? "-" : `${fieldDisplay.speed.toFixed(1)}m/s`}</strong></article>
                  </div>
                </section>
                <dl className="field-link-diagnostics">
                  <div>
                    <dt>MAVLink</dt>
                    <dd>
                      {Number.isFinite(fieldMavlinkVersion)
                        ? `v${fieldMavlinkVersion}`
                        : "수신 대기"}
                    </dd>
                  </div>

                  <div>
                    <dt>SYS / COMP</dt>
                    <dd>
                      {Number.isFinite(fieldSystemId) &&
                      Number.isFinite(fieldComponentId)
                        ? `${fieldSystemId} / ${fieldComponentId}`
                        : "수신 대기"}
                    </dd>
                  </div>

                  <div>
                    <dt>MAVLink SEQ</dt>
                    <dd>
                      {Number.isFinite(
                        Number(fieldLinkQuality.mavlinkSequence),
                      )
                        ? String(fieldLinkQuality.mavlinkSequence)
                        : "-"}
                    </dd>
                  </div>

                  <div>
                    <dt>Expected</dt>
                    <dd>
                      {Number.isFinite(
                        Number(fieldLinkQuality.windowExpected),
                      )
                        ? String(fieldLinkQuality.windowExpected)
                        : "-"}
                    </dd>
                  </div>

                  <div>
                    <dt>AVG</dt>
                    <dd>
                      {Number.isFinite(
                        Number(fieldLinkQuality.periodAvgMs),
                      )
                        ? `${Number(
                            fieldLinkQuality.periodAvgMs,
                          ).toFixed(1)}ms`
                        : "-"}
                    </dd>
                  </div>

                  <div>
                    <dt>P95</dt>
                    <dd>
                      {Number.isFinite(
                        Number(fieldLinkQuality.periodP95Ms),
                      )
                        ? `${Number(
                            fieldLinkQuality.periodP95Ms,
                          ).toFixed(1)}ms`
                        : "-"}
                    </dd>
                  </div>

                  <div>
                    <dt>MAX</dt>
                    <dd>
                      {Number.isFinite(
                        Number(fieldLinkQuality.periodMaxMs),
                      )
                        ? `${Number(
                            fieldLinkQuality.periodMaxMs,
                          ).toFixed(1)}ms`
                        : "-"}
                    </dd>
                  </div>
                </dl>
                <section className="field-event-log">
                  <header><strong>장비 이벤트 로그</strong><small>최근 상태</small></header>
                  <ol>

                    {telemetrySamples.slice(-4).reverse().map((sample, index) => <li key={`${sample.receivedAt}-${index}`}><i data-tone="ok" /><time>{(sample.receivedAt && Number.isFinite(Date.parse(sample.receivedAt)) ? new Date(sample.receivedAt).toLocaleTimeString("ko-KR", { hour12: false }) : "시각 확인 불가")}</time><span>텔레메트리 수신</span><em>SEQ {sample.sequence ?? "-"}</em></li>)}
                    {telemetrySamples.length === 0 && <li className="empty"><span>실기체 텔레메트리 수신 대기</span></li>}
                  </ol>
                </section>
                </div>
                )}

                {fieldInspectorTab === "details" && (
                  <div
                    className="field-inspector-pane field-inspector-detail-pane"
                    role="tabpanel"
                  >
                    {fieldPrimaryAsset ? (
                      <dl className="field-twin-detail">
                        <DroneTwinDetail asset={fieldPrimaryAsset} />
                      </dl>
                    ) : (
                      <div className="field-inspector-empty">
                        <strong>장비 상세정보 수신 대기</strong>
                        <span>Core에서 등록 장비와 실시간 텔레메트리를 결합하면 표시됩니다.</span>
                      </div>
                    )}
                  </div>
                )}

                {fieldInspectorTab === "video" && (
                  <div
                    className="field-inspector-pane field-inspector-video-pane"
                    role="tabpanel"
                  >
                    <div className="field-video-tab-summary">
                      <span>실시간 영상</span>
                      <strong>
                        {fieldPrimaryDrone?.label ??
                          ("주 기체 수신 대기")}
                      </strong>
                      <small>
                        등록 영상 채널 {fieldVideoChannels.length}개
                      </small>
                    </div>

                    <button
                      type="button"
                      className="field-open-video-button"
                      disabled={!fieldPrimaryDrone}
                      onClick={() => {
                        if (fieldPrimaryDrone) {
                          setVideoDrone(fieldPrimaryDrone);
                        }
                      }}
                    >
                      실시간 영상 열기
                    </button>

                    {!fieldPrimaryDrone && (
                      <p className="field-video-wait">
                        드론 텔레메트리가 수신되면 영상 채널을 열 수 있습니다.
                      </p>
                    )}
                  </div>
                )}
              </aside>}
            </div>
            {selectedLocation && <div className="resource-modal-backdrop" role="presentation" onMouseDown={() => setSelectedLocationKey(null)}>
            <section className={`selected-location-drawer resource-modal${selectedRtk ? " rtk-detail-modal" : ""}`} role="dialog" aria-modal={!hybridExhibitionMode} aria-label="선택 자산 상세" onMouseDown={(event) => event.stopPropagation()}>
              <div className="resource-detail-heading"><span>{assetTypeLabel(selectedLocation.category)}</span><strong>{selectedLocation.label}</strong><small>{selectedRtk ? "최근 100개 패킷 · 수신·측위 상태" : coordinateOutlierKeys.has(locationKey(selectedLocation)) ? "좌표 정합성 확인 필요" : selectedLocation.status}</small><button type="button" onClick={() => setSelectedLocationKey(null)} aria-label="자산 상세 닫기">×</button></div>
              {selectedRtk ? <RtkPacketPanel key={selectedLocation.id} assetId={selectedLocation.id} /> : <dl>
                <div>
                  <dt>통신 상태</dt>
                  <dd>{selectedLocation.qualityStatus || selectedLocation.status || "확인 중"}</dd>
                </div>
                <div>
                  <dt>전송망</dt>
                  <dd>{selectedLocation.networkMode || "망 정보 없음"}</dd>
                </div>
                {<DroneTwinDetail asset={overview.assets.find(asset => asset.assetId === selectedLocation.id) ?? {}} />}
                <div><dt>최근 통신</dt><dd>{relativeTime(selectedLocation.observedAt)}</dd></div>
                <div><dt>위치</dt><dd>{selectedLocation.latitude.toFixed(6)}, {selectedLocation.longitude.toFixed(6)}</dd></div>
                <div><dt>고도</dt><dd>{selectedLocation.altitude == null ? "확인 불가" : `${selectedLocation.altitude.toFixed(1)}m`}</dd></div>
                <div><dt>배터리</dt><dd>{selectedLocation.batteryPct == null ? "측정값 없음" : `${selectedLocation.batteryPct.toFixed(0)}%`}</dd></div>
                <div><dt>신호</dt><dd>{selectedLocation.signalStrengthDbm == null ? "측정값 없음" : `${selectedLocation.signalStrengthDbm.toFixed(0)} dBm`}</dd></div>
                {hybridExhibitionMode && <div><dt>SNR</dt><dd>{selectedLocation.snrDb == null ? "측정값 없음" : `${selectedLocation.snrDb.toFixed(1)} dB`}</dd></div>}
                {hybridExhibitionMode && <div><dt>관측시각·신선도</dt><dd>{new Date(selectedLocation.observedAt).toLocaleString("ko-KR")} · {korean(classifyLinkHealth(selectedLocation.observedAt, new Date()))}</dd></div>}
                <div><dt>지연·손실</dt><dd>{selectedLocation.latencyMs == null ? "측정값 없음" : `${selectedLocation.latencyMs.toFixed(0)} ms · ${selectedLocation.packetLossPct?.toFixed(1) ?? "-"}%`}</dd></div>
                <div><dt>데이터 발생 장비</dt><dd>{selectedLocation.sourceAssetId || selectedLocation.id}</dd></div>
                <div><dt>API 전달 주체</dt><dd>{selectedLocation.reportedByAssetId ? `${korean(selectedLocation.reportingRole || "GATEWAY")} · ${selectedLocation.reportedByAssetId}` : "직접 보고 또는 정보 미수신"}</dd></div>
                {hybridExhibitionMode && <div><dt>데이터 출처</dt><dd>{selectedLocation.sourceSystem || "출처 미수신"} · API 수신값</dd></div>}
              {isPositioningLocation(selectedLocation) && <>
                  {selectedLocation.category === "RTK_TERMINAL" && (
                    <div><dt>위치 조회 상태</dt><dd>{selectedLocation.positionFetchStatus || "조회 상태 미확인"}</dd></div>
                  )}
                  <div><dt>측위 상태</dt><dd>{selectedLocation.positioningMethod ? korean(selectedLocation.positioningMethod) : "측위정보 수신 전"}</dd></div>
                  <div><dt>예상 오차</dt><dd>{selectedLocation.horizontalAccuracyM == null ? "측정값 없음" : `±${selectedLocation.horizontalAccuracyM.toFixed(2)}m`}</dd></div>
                  <div><dt>기준국 보정</dt><dd>{correctionStatus(selectedLocation)}</dd></div>
                  <div><dt>현장 전송망</dt><dd>{selectedLocation.networkMode ? korean(selectedLocation.networkMode) : "망 정보 수신 전"}</dd></div>
                </>}
                {resourceGroupOf(selectedLocation) === "UAV" && <>
                  <div><dt>비행 모드</dt><dd>{selectedLocation.flightMode ?? "수신 전"}</dd></div>
                  <div><dt>시동·임무</dt><dd>{selectedLocation.armed == null ? "수신 전" : `${selectedLocation.armed ? "ARMED" : "DISARMED"} · WP ${selectedLocation.missionSequence ?? "-"}`}</dd></div>
                  <div><dt>속도·방향</dt><dd>{selectedLocation.groundSpeedMps == null ? "수신 전" : `${selectedLocation.groundSpeedMps.toFixed(1)}m/s · ${selectedLocation.headingDeg?.toFixed(0) ?? "-"}°`}</dd></div>
                  <div><dt>비상 상태</dt><dd>{selectedLocation.emergencyStatus ?? "정상"}</dd></div>
                </>}
              </dl>}
              {!selectedRtk && selectedTelemetryHistory.length > 0 && <section className="asset-live-history" aria-label={`${selectedLocation.id} 실시간 수신 이력`}>
                <header><div><small>GATEWAY RAW HISTORY</small><strong>최근 위치 수신 {selectedTelemetryHistory.length}건</strong></div><button type="button" onClick={downloadSelectedTelemetry}>JSON 증적</button></header>
                <ol>{selectedTelemetryHistory.slice(0, 6).map((sample, index) => <li key={`${sample.observedAt}-${sample.sequence ?? index}`}><time>{new Date(sample.observedAt).toLocaleTimeString("ko-KR")}</time><span>{sample.latitude?.toFixed(6) ?? "-"}, {sample.longitude?.toFixed(6) ?? "-"}</span><em>SEQ {sample.sequence ?? "-"}</em></li>)}</ol>
              </section>}
            </section></div>}
            {resourceDialogGroup && <div className="resource-modal-backdrop" role="presentation" onMouseDown={() => setResourceDialogGroup(null)}>
              <section className="resource-status-modal resource-modal" role="dialog" aria-modal="true" aria-label="자산 현황" onMouseDown={(event) => event.stopPropagation()}>
                <header>
                  <div>
                    <small>{resourceDialogGroup === "ALL_ASSETS" ? "선택 사건의 배정 장비 현황" : "선택 사건의 실시간 배치 현황"}</small>
                    <strong>{resourceDialogGroup === "ALL" ? "투입 자산 및 인원" : resourceDialogGroup === "ALL_ASSETS" ? "투입 장비" : resourceGroupLabels[resourceDialogGroup]}</strong>
                  </div>
                  <b>{resourceDialogGroup === "ALL_ASSETS" ? overview.assets.length : dialogLocations.length}건</b>
                  <button type="button" onClick={() => setResourceDialogGroup(null)} aria-label="자산 현황 닫기">×</button>
                </header>
                {(resourceDialogGroup === "COMMUNICATION" || resourceDialogGroup === "POSITIONING" || resourceDialogGroup === "ALL") && <div className="communication-layer-guide">
                  <div><b>현장 저속망</b><strong>LPWA</strong><span>대원 위치·RTCM·배터리·비상신호</span></div>
                  <div><b>현장 고속망</b><strong>이음5G</strong><span>드론 영상·사진·지도·업무 데이터</span></div>
                  <div><b>외부 연결망</b><strong>LTE·TVWS·LEO</strong><span>지휘차량·현장망과 클라우드 연결</span></div>
                </div>}
                {(resourceDialogGroup === "COMMUNICATION" || resourceDialogGroup === "POSITIONING" || resourceDialogGroup === "ALL") && <section className="communication-topology" aria-label="통신망 전체 토폴로지">
                  <header>
                    <div><small>전체 통신 토폴로지</small><strong>현장 단말 → 현장망 → 지휘·통신차량 → 외부망 → 클라우드</strong></div>
                    <span>{topologyDataStatus}</span>
                  </header>
                  <div className="communication-topology-scroll">
                    <div className="communication-topology-grid">
                      <div className="topology-column topology-endpoints">
                        <b>현장 단말</b>
                        {topologyLabels.endpoints.map((label) => <span key={label}>{label}</span>)}
                      </div>
                      <div className="topology-arrow"><small>접속</small><i /></div>
                      <div className="topology-column topology-field">
                        <b>현장 접속망</b>
                        {topologyLabels.field.map((label) => <span key={label}>{label}</span>)}
                      </div>
                      <div className="topology-arrow"><small>집선</small><i /></div>
                      <div className="topology-column topology-command">
                        <b>지휘·통신차량</b>
                        {topologyLabels.command.map((label) => <span key={label}>{label}</span>)}
                      </div>
                      <div className="topology-arrow"><small>백홀</small><i /></div>
                      <div className="topology-column topology-external">
                        <b>외부 연결망</b>
                        {topologyLabels.backhaul.map((label) => <span key={label}>{label}</span>)}
                      </div>
                      <div className="topology-arrow"><small>IP</small><i /></div>
                      <div className="topology-column topology-cloud">
                        <b>클라우드</b>
                        {topologyLabels.cloud.map((label) => <span key={label}>{label}</span>)}
                      </div>
                    </div>
                  </div>
                  <footer>
                    <span><i data-kind="field" />현장 내부 통신</span>
                    <span><i data-kind="backhaul" />외부 백홀</span>
                    <p>LTE 단말은 통신 상태와 운용 정책에 따라 지휘차량을 거치지 않고 클라우드로 직접 연결할 수 있습니다. TVWS는 단독 인터넷망이 아니라 백홀 구성이 필요합니다.</p>
                  </footer>
                </section>}
                <div className="resource-status-list">
                  {resourceDialogGroup === "ALL_ASSETS" ? (
                    <>
                      {overview.assets.map((asset) => (
                        <button key={String(asset.assetId)} type="button"
                          disabled={!mapLocations.some(location => location.id === String(asset.assetId))}
                          title={mapLocations.some(location => location.id === String(asset.assetId)) ? "마지막 수신 위치 보기" : "위치 수신 대기"}
                          onClick={() => {
                            const location = mapLocations.find(item => item.id === String(asset.assetId));
                            if (location) {
                              setResourceDialogGroup(null);
                              handleLocationSelect(location);
                            }
                          }}>
                          <span>{assetTypeLabel(String(asset.assetType ?? "ASSET"))}</span>
                          <strong>{String(asset.assetName ?? asset.assetCode ?? asset.assetId ?? "-")}</strong>
                          <em>{korean(asset.operationalStatus ?? asset.status ?? "UNKNOWN")}</em>
                          <small>
                            {String(asset.assetCode ?? "-")}
                            {asset.modelName ? ` · ${String(asset.modelName)}` : ""}
                            {asset.mission ? ` · ${String(asset.mission)}` : ""}
                          </small>
                        </button>
                      ))}
                      {overview.assets.length === 0 && <p>현재 사건에 투입된 장비가 없습니다.</p>}
                    </>
                  ) : (
                    <>
                      {dialogLocations.map((location) => (
                        <button
                          key={locationKey(location)}
                          type="button"
                          onClick={() => {
                            setResourceDialogGroup(null);
                            setSelectedLocationKey(locationKey(location));
                          }}
                        >
                          <span>{assetTypeLabel(location.category)}</span>
                          <strong>{location.label}</strong>
                          <em>{location.status}</em>
                          <small>
                            최근 통신 {relativeTime(location.observedAt)}
                            {location.batteryPct == null ? "" : ` · 배터리 ${location.batteryPct.toFixed(0)}%`}
                            {location.positioningMethod ? ` · ${korean(location.positioningMethod)}` : ""}
                            {location.horizontalAccuracyM == null ? "" : ` · ±${location.horizontalAccuracyM.toFixed(2)}m`}
                          </small>
                        </button>
                      ))}
                      {dialogLocations.length === 0 && <p>현재 수신된 자산 정보가 없습니다.</p>}
                    </>
                  )}
                </div>
              </section>
            </div>}
          </section>
          <div
            className="map-status-pill"
            data-active-pulses={Object.values(changedUntil).filter((until) => until > Date.now()).length}
          ><i /> 사건 데이터 변화 감지 · 갱신 주기의 30% 동안 테두리 강조</div>
        </section>
{(localFieldMode || SHOW_VALIDATION_UI) && (displayConfig.showVideoDeck || displayConfig.showEventTimeline) && <section className="field-command-footer" aria-label="?? ?? ? ??? ????">
          {displayConfig.showVideoDeck && <div className="field-video-deck">
            <header><strong>실시간 영상</strong><small>{"RTSP 연결 상태"}</small></header>
            <div>
              {fieldVideoChannels.length === 0 && <p>등록된 영상 채널이 없습니다.</p>}
              {fieldVideoChannels.map((channel, index) => {
                const label = text(channel.channelName, "등록 영상 채널");
                const code = text(channel.channelCode, String(channel.videoChannelId ?? index));
                const streamUri = text(channel?.streamUri, "");
                const enabled = channel?.enabled === true;
                const verification = text(channel?.verificationStatus, "UNVERIFIED");
                const rtspReady = Boolean(streamUri) && enabled;
                const reachable = rtspReady && verification === "REACHABLE";

                const playbackState = rtspReady
                  ? fieldVideoPlaybackStates[code]
                  : undefined;

                const stateLabel = playbackState
                    ? playbackState
                    : fieldVideoLoading
                      ? "CHECK"
                      : reachable
                        ? "CONNECTING"
                        : rtspReady
                          ? "RTSP"
                          : "WAIT";

                const detailLabel = playbackState === "LIVE"
                    ? "실시간 영상 재생 중"
                    : playbackState === "RECONNECTING"
                      ? "영상 연결 복구 시도 중"
                      : playbackState === "OFFLINE"
                        ? "영상 소스 응답 없음 · 자동 재연결 대기"
                        : reachable
                          ? "RTSP 확인됨 · HLS 재생 연결 중"
                          : rtspReady
                            ? "RTSP 등록 · 연결 확인 필요"
                            : "영상 소스 연결 대기";

                return <article
                  key={label}
                  className={`field-video-channel field-video-channel-${index + 1}`}
                  data-preview={undefined}
                  data-stream-ready={reachable ? "true" : undefined}
                  data-playback-state={playbackState}
                >
                  <div className="field-video-preview">
                    {(
                      <>
                        <VideoPlayback
                          streamUri={streamUri}
                          enabled={enabled}
                          verificationStatus={verification}
                          label={label}
                          className="field-video-playback"
                          onPlaybackStateChange={(state) => {
                            setFieldVideoPlaybackStates((previous) => {
                              if (previous[code] === state) {
                                return previous;
                              }

                              return {
                                ...previous,
                                [code]: state,
                              };
                            });
                          }}
                        />
                        <span className="field-video-badge">{`CH${index + 1}`}</span>
                        <span className="field-video-live">{stateLabel}</span>
                      </>
                    )}
                  </div>
                  <div className="field-video-caption">
                    <strong>{label}</strong>
                    <small>{detailLabel}</small>
                    <i>{code}</i>
                  </div>
                </article>;
              })}
            </div>
          </div>}
          {displayConfig.showEventTimeline && <div className="field-timeline-deck">
            <header><strong>주요 이벤트 타임라인</strong><span><i data-tone="comm" />통신</span><span><i data-tone="asset" />장비</span><span><i data-tone="alert" />경보</span></header>
            <ol>

              {liveLocations.slice(0, 4).map((location) => <li key={locationKey(location)}><time>{new Date(location.observedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })}</time><i data-tone="asset" /><strong>{location.label}</strong><span>{location.status} · 최근 수신 {relativeTime(location.observedAt)}</span></li>)}
              {liveLocations.length === 0 && <li className="empty"><span>실기체 이벤트 수신 대기</span></li>}
            </ol>
          </div>}
        </section>}
        </>
      )}
      {requirementsOpen && <RequirementsReadinessModal onClose={() => setRequirementsOpen(false)} />}

      {videoDrone && <DroneVideoModal drone={videoDrone} onClose={() => setVideoDrone(null)} />}
    </main>
  );
}
