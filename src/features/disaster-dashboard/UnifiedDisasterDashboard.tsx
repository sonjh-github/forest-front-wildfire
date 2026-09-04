import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { externalDisasterApi, loadDashboardDisasterAssetsCached, loadEventOverview, loadEventTimeline, type ApiRecord, type EventOverview, type EventTimeline, type ForestEvent } from "../../http-api";
import LivePositionMap from "./LivePositionMap";
import MapTimelinePlayer, { type MapTimelineSnapshot } from "./MapTimelinePlayer";
import {
  OperationsPanel,
  type ExternalIntegrationStatus,
  type PanelTab,
} from "./OperationsPanel";

import DroneVideoModal from "./DroneVideoModal";
import RequirementsReadinessModal from "./RequirementsReadinessModal";
import { createDemoOverview, DEMO_EVENT, DEMO_SCENARIOS, demoScenarioFromLocation } from "./demoOverview";
import { applyTelemetrySafetyRules, TelemetryStreamClient, type TelemetryStreamStatus } from "./telemetryStream";
import type { TelemetrySample } from "./operationalEvidence";
import "./unified-disaster-dashboard.css";

const POLL_INTERVAL_MS = 1_000;
const DEFAULT_CHANGE_HIGHLIGHT_MS = POLL_INTERVAL_MS * 0.3;
const DEFAULT_EVENT_ID = "10000000-0000-4000-8000-000000000001";
const FORCE_DEMO_MODE = new URLSearchParams(window.location.search).get("demo") === "1";

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
  latencyMs: number | null;
  packetLossPct: number | null;
  safetyStatus: string;
  sourceSystem: string;
  positioningMethod: string | null;
  horizontalAccuracyM: number | null;
  qualityStatus: string;
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
    batteryPct: Number.isFinite(Number(item.batteryPct)) ? Number(item.batteryPct) : null,
    signalStrengthDbm: Number.isFinite(Number(item.signalStrengthDbm)) ? Number(item.signalStrengthDbm) : null,
    latencyMs: Number.isFinite(Number(item.latencyMs)) ? Number(item.latencyMs) : null,
    packetLossPct: Number.isFinite(Number(item.packetLossPct)) ? Number(item.packetLossPct) : null,
    safetyStatus: korean(item.safetyStatus ?? "UNKNOWN"),
    sourceSystem: String(item.sourceSystem ?? ""),
    positioningMethod: item.positioningMethod || attributes.positionFix
      ? String(item.positioningMethod ?? attributes.positionFix)
      : null,
    horizontalAccuracyM: Number.isFinite(horizontalAccuracyM) ? horizontalAccuracyM : null,
    qualityStatus: String(item.qualityStatus ?? ""),
    sourceAssetId: String(item.sourceAssetId ?? ""),
    reportedByAssetId: String(item.reportedByAssetId ?? ""),
    reportingRole: String(item.reportingRole ?? ""),
    rtcmStatus: attributes.correction ? String(attributes.correction) : null,
    networkMode: item.activeLink || item.networkMode || attributes.network
      ? String(item.activeLink ?? item.networkMode ?? attributes.network)
      : null,
    expectedTelemetryIntervalSec: Number.isFinite(expectedTelemetryIntervalSec) && expectedTelemetryIntervalSec > 0
      ? expectedTelemetryIntervalSec
      : null,
    flightMode: attributes.flightMode == null ? null : String(attributes.flightMode),
    armed: typeof attributes.armed === "boolean" ? attributes.armed : null,
    missionSequence: Number.isFinite(Number(attributes.missionSequence)) ? Number(attributes.missionSequence) : null,
    emergencyStatus: attributes.emergencyStatus == null ? null : String(attributes.emergencyStatus),
    groundSpeedMps: Number.isFinite(Number(attributes.groundSpeedMps)) ? Number(attributes.groundSpeedMps) : null,
    headingDeg: Number.isFinite(Number(attributes.headingDeg)) ? Number(attributes.headingDeg) : null,
    registeredToEvent: kind === "personnel" || item.eventRegistrationStatus !== "UNREGISTERED",
  };
}

function locationKey(item: LiveLocation) { return `${item.kind}-${item.id}`; }
function locationFingerprint(item: LiveLocation) {
  return [
    item.longitude, item.latitude, item.altitude, item.status, item.observedAt,
    item.positioningMethod, item.horizontalAccuracyM, item.rtcmStatus,
  ].join("|");
}

function isPositioningLocation(location: LiveLocation) {
  return location.kind === "personnel"
    || ["RTK_TERMINAL", "RTK_BASE_LPWA_GATEWAY"].includes(location.category);
}

type CommunicationPath = {
  nodes: string[];
  links: Array<{ label: string; medium: "wired" | "wireless" }>;
};

function communicationPath(location: LiveLocation): CommunicationPath | null {
  if (location.kind === "personnel" || location.category === "RTK_TERMINAL") {
    const accessNetwork = location.networkMode || "LPWA";
    if (location.reportedByAssetId) {
      return {
        nodes: ["대원 RTK 단말", `${korean(location.reportingRole || "GATEWAY")} 집계`, "통합 API·클라우드"],
        links: [
          { label: accessNetwork, medium: "wireless" },
          { label: "HTTPS·JSON", medium: "wired" },
        ],
      };
    }
    return {
      nodes: ["대원 RTK 단말", "LPWA 게이트웨이", "백홀 게이트웨이", "통합관제"],
      links: [
        { label: "LPWA", medium: "wireless" },
        { label: "Ethernet", medium: "wired" },
        { label: "LTE·5G·LEO", medium: "wireless" },
      ],
    };
  }
  if (location.category === "RTK_BASE_LPWA_GATEWAY") {
    return {
      nodes: ["대원 단말", "RTK 기준국·LPWA GW", "TVWS·백홀 장비", "통합관제"],
      links: [
        { label: "LPWA", medium: "wireless" },
        { label: "Ethernet", medium: "wired" },
        { label: "LTE·5G·LEO", medium: "wireless" },
      ],
    };
  }
  if (location.category === "TVWS_CPE") {
    return {
      nodes: ["현장 장비·LPWA GW", "TVWS CPE", "TVWS 기지국", "백홀 GW"],
      links: [
        { label: "Ethernet", medium: "wired" },
        { label: "TVWS", medium: "wireless" },
        { label: "Ethernet", medium: "wired" },
      ],
    };
  }
  if (location.category === "TVWS_BASE_STATION") {
    return {
      nodes: ["현장 TVWS CPE", "TVWS 기지국", "L3 스위치·백홀 GW", "통합관제"],
      links: [
        { label: "TVWS", medium: "wireless" },
        { label: "Ethernet", medium: "wired" },
        { label: "LTE·5G·LEO", medium: "wireless" },
      ],
    };
  }
  if (["LTE_GATEWAY", "PRIVATE_5G_NTN_GATEWAY"].includes(location.category)) {
    return {
      nodes: ["현장 IP 장비", assetTypeLabel(location.category), "통합관제"],
      links: [
        { label: "Ethernet", medium: "wired" },
        { label: location.category === "LTE_GATEWAY" ? "LTE" : "5G·LEO", medium: "wireless" },
      ],
    };
  }
  if (location.category === "COMMAND_VEHICLE") {
    return {
      nodes: ["현장 게이트웨이", "차량 L3 스위치", "백홀 게이트웨이", "통합관제"],
      links: [
        { label: "Ethernet", medium: "wired" },
        { label: "Ethernet", medium: "wired" },
        { label: "LTE·5G·LEO", medium: "wireless" },
      ],
    };
  }
  if (resourceGroupOf(location) === "COMMUNICATION") {
    return {
      nodes: ["현장 장비", assetTypeLabel(location.category), "상위 게이트웨이", "통합관제"],
      links: [
        { label: "현장 무선", medium: "wireless" },
        { label: "Ethernet", medium: "wired" },
        { label: "백홀 무선", medium: "wireless" },
      ],
    };
  }
  return null;
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

function positioningDescription(location: LiveLocation) {
  if (location.category === "RTK_BASE_LPWA_GATEWAY") {
    return "기준국은 정확한 기준좌표와 GNSS 관측값의 차이로 RTCM 보정정보를 만듭니다. 대원 상태는 LPWA를 기본 현장망으로 공유하고, LPWA 음영지역에서 LTE 보조망으로 전환합니다.";
  }
  return "단말이 GNSS 위성신호와 기준국의 RTCM 보정정보를 결합해 위치를 계산합니다. 표시 위치는 측위 상태와 예상 오차를 함께 확인해야 합니다.";
}

type PositioningWarning = {
  level: "caution" | "critical";
  title: string;
  message: string;
  action: string;
};

function positioningWarning(location: LiveLocation): PositioningWarning | null {
  if (location.category === "RTK_BASE_LPWA_GATEWAY") {
    if (location.rtcmStatus === "READY") return null;
    return {
      level: "critical",
      title: "RTCM 보정정보를 송출할 수 없습니다",
      message: "현재 기준국 상태로는 대원 단말의 정밀 위치를 보장할 수 없습니다.",
      action: "기준국 좌표와 GNSS 수신상태, RTCM 연동을 확인하고 대원 단말의 LPWA 기본망 및 LTE 보조망 상태를 각각 점검해 주세요.",
    };
  }
  if (location.positioningMethod === "RTK_FIXED" && location.horizontalAccuracyM != null) return null;
  if (location.positioningMethod === "RTK_FLOAT") {
    return {
      level: "caution",
      title: "RTK 보정이 아직 안정되지 않았습니다",
      message: "FLOAT 상태의 위치는 FIX 상태보다 오차가 크므로 정확한 구조·지휘 위치로 확정해서는 안 됩니다.",
      action: "기준국 거리·위성 수·LPWA 수신상태를 확인하고 RTCM 보정정보가 안정될 때까지 기다려 주세요.",
    };
  }
  if (location.positioningMethod === "GNSS") {
    return {
      level: "critical",
      title: "보정치가 없는 일반 GNSS 위치입니다",
      message: "표시 좌표는 기준국 보정이 적용되지 않아 정확히 신뢰할 수 있는 정밀 위치가 아닙니다.",
      action: "RTK 기준국의 RTCM 보정 연결을 확인하고, 위치 공유 경로는 LPWA 기본망과 LTE 보조망으로 구분해 점검해 주세요.",
    };
  }
  if (location.positioningMethod === "RTK_FIXED" && location.horizontalAccuracyM == null) {
    return {
      level: "caution",
      title: "위치 오차값을 확인할 수 없습니다",
      message: "RTK FIX 상태이지만 정확도 값이 없어 표시 위치의 신뢰 수준을 검증할 수 없습니다.",
      action: "RTK 단말에서 horizontalAccuracyM 등 프로토콜 필수 측위 품질값을 함께 전송해 주세요.",
    };
  }
  return {
    level: "critical",
    title: "측위·보정 상태가 확인되지 않았습니다",
    message: "보정 적용 여부를 알 수 없어 표시 좌표를 정확한 위치로 신뢰할 수 없습니다.",
    action: "RTK 기준국의 보정 연결과 positioningMethod·horizontalAccuracyM을 확인하고, primaryLink·activeLink·fallbackActivated를 통신 규약에 맞게 입력해 주세요.",
  };
}

type CommunicationProfile = {
  scope: string;
  role: string;
  carries: string;
  path: string;
};

function communicationProfile(location: LiveLocation): CommunicationProfile | null {
  if (["RTK_TERMINAL", "RTK_BASE_LPWA_GATEWAY"].includes(location.category)) {
    return {
      scope: "현장 저속망",
      role: "LPWA",
      carries: "RTCM 보정정보·대원 위치·배터리·비상신호",
      path: "RTK 단말 ↔ LPWA 게이트웨이 → 지휘차량",
    };
  }
  if (location.category === "PRIVATE_5G_NTN_GATEWAY") {
    return {
      scope: "현장 고속망 + 비상 외부연결",
      role: "이음5G·LEO 게이트웨이",
      carries: "드론 영상·사진·지도·현장 업무 데이터",
      path: "드론·카메라 → 이음5G → 지휘차량 → LEO/LTE → 클라우드",
    };
  }
  if (location.category === "LTE_GATEWAY") {
    return {
      scope: "외부 연결망",
      role: "통신사 LTE 백홀",
      carries: "위치·상태·영상·업무 데이터",
      path: "단말 또는 지휘차량 → LTE → 클라우드",
    };
  }
  if (["TVWS_BASE_STATION", "TVWS_CPE"].includes(location.category)) {
    return {
      scope: "장거리 현장연결·백홀",
      role: "TVWS Base·CPE",
      carries: "차량·중계장비 간 데이터와 외부망 연결 트래픽",
      path: "현장 중계기·진화차량 → TVWS → 지휘차량·외부망",
    };
  }
  if (location.category === "RADIO_GATEWAY_400MHZ") {
    return {
      scope: "현장 음성망",
      role: "400MHz 양방향 무전",
      carries: "대원 음성·긴급 호출",
      path: "대원 무전기 ↔ 무전 게이트웨이 ↔ 지휘부",
    };
  }
  if (["MAIN_RELAY_DRONE", "SERVICE_RELAY_DRONE", "FIXED_RELAY", "MOBILE_RELAY"].includes(location.category)) {
    return {
      scope: "현장 중계망",
      role: "공중·지상 중계기",
      carries: "현장 단말의 통신 신호와 상태정보",
      path: "대원·센서 → 중계기 → 지휘차량 → 외부 연결망",
    };
  }
  if (location.category === "COMMAND_VEHICLE") {
    return {
      scope: "현장망 집선·외부망 연결",
      role: "지휘·통신차량",
      carries: "LPWA·이음5G·TVWS·LTE·위성 통합 트래픽",
      path: "현장 저속·고속망 → 지휘차량 → 외부망·클라우드",
    };
  }
  return null;
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
  const demoScenario = demoScenarioFromLocation();
  const [events, setEvents] = useState<ForestEvent[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [overview, setOverview] = useState<EventOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eventsLoaded, setEventsLoaded] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [demoMode, setDemoMode] = useState(FORCE_DEMO_MODE);
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
  const [operationsTab, setOperationsTab] = useState<PanelTab>("layers");
  const [selectedLocationKey, setSelectedLocationKey] = useState<string | null>(null);
  const [topologyLocationKey, setTopologyLocationKey] = useState<string | null>(null);
  const [resourceDialogGroup, setResourceDialogGroup] = useState<ResourceGroup | "ALL" | "ALL_ASSETS" | null>(null);

  const [videoDrone, setVideoDrone] = useState<LiveLocation | null>(null);
  const [timeline, setTimeline] = useState<EventTimeline | null>(null);
  const [timelineIndex, setTimelineIndex] = useState<number | null>(null);
  const [timelinePlaying, setTimelinePlaying] = useState(false);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [visibleLayerIds, setVisibleLayerIds] = useState(() => new Set([
    "resources", "event", "topology", "firelines", "spread-predictions", "slope-assessments",
    "debris-flow-paths", "debris-flow-areas", "victim-candidates", "rssi-detections",
    "ai-ran-coverages", "relay-placement-candidates", "ignition-detections",
    "vehicle-detections", "road-segmentations", "change-detections", "vital-signal-detections",
    "external-firms", "external-landslide-history", "wildfire-risk-zones", "evacuation-routes",
    "suppression-resources", "water-sources",
    "nearby-response-resources", "slope-gradients", "viewsheds", "communication-shadows",
    "external-wildfire-risk", "external-landslide-forecast", "external-landslide-regional-risk",
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
    const result = await loadDashboardDisasterAssetsCached(DEFAULT_EVENT_ID);
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
    };

    setEvents([currentEvent]);
    setSelectedId((current) => current || currentEvent.eventId);
  }, []);

  const refreshExternalIntegrations = useCallback(async () => {
    if (demoMode) {
      const demo = createDemoOverview();
      const checkedAt = new Date().toISOString();
      setExternalFirmsRows(demo.domainLayers["external-firms"] ?? []);
      setExternalLandslideHistoryRows(demo.domainLayers["external-landslide-history"] ?? []);
      setExternalWildfireRiskRows(demo.domainLayers["wildfire-risk-zones"] ?? []);
      setExternalLandslideForecastRows(demo.domainLayers["slope-assessments"] ?? []);
      setExternalLandslideRegionalRows(demo.domainLayers["slope-gradients"] ?? []);
      setExternalIntegrationStatus({
        firms: { status: "ok", count: 1, checkedAt }, wildfireRisk: { status: "ok", count: 1, checkedAt },
        landslideForecast: { status: "ok", count: 1, checkedAt }, landslideHistory: { status: "ok", count: 1, checkedAt },
        landslideRegionalRisk: { status: "ok", count: 1, checkedAt },
      });
      return;
    }
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
  }, [demoMode]);

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
    const locations = overviewLocations(result);
    const hasOperationalMapData = locations.length > 0
      || Object.values(result.domainLayers).some((rows) => rows.length > 0);
    if (!hasOperationalMapData) {
      const demo = createDemoOverview();
      setEvents([DEMO_EVENT]);
      setSelectedId(DEMO_EVENT.eventId);
      setOverview(demo);
      setDemoMode(true);
      setLastUpdatedAt(new Date());
      return;
    }
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
    if (FORCE_DEMO_MODE) {
      const demo = createDemoOverview();
      setEvents([demo.event]);
      setSelectedId(demo.event.eventId);
      setOverview(demo);
      setLastUpdatedAt(new Date());
      setEventsLoaded(true);
      return () => { active = false; };
    }
    refreshEvents()
      .catch(() => {
        if (!active) return;
        setEvents([DEMO_EVENT]);
        setSelectedId(DEMO_EVENT.eventId);
        setOverview(createDemoOverview());
        setLastUpdatedAt(new Date());
        setDemoMode(true);
        setError(null);
        setExternalFirmsRows(createDemoOverview().domainLayers["external-firms"] ?? []);
        setExternalLandslideHistoryRows(createDemoOverview().domainLayers["external-landslide-history"] ?? []);
        setExternalWildfireRiskRows(createDemoOverview().domainLayers["wildfire-risk-zones"] ?? []);
        setExternalLandslideForecastRows(createDemoOverview().domainLayers["slope-assessments"] ?? []);
        setExternalLandslideRegionalRows(createDemoOverview().domainLayers["slope-gradients"] ?? []);
        const checkedAt = new Date().toISOString();
        setExternalIntegrationStatus({
          firms: { status: "ok", count: 1, checkedAt }, wildfireRisk: { status: "ok", count: 1, checkedAt },
          landslideForecast: { status: "ok", count: 1, checkedAt }, landslideHistory: { status: "ok", count: 1, checkedAt },
          landslideRegionalRisk: { status: "ok", count: 1, checkedAt },
        });
      })
      .finally(() => active && setEventsLoaded(true));
    return () => { active = false; };
  }, [refreshEvents]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      refreshEvents().catch(() => undefined);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [refreshEvents]);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    const refresh = () => demoMode
      ? Promise.resolve(setOverview(createDemoOverview()))
      : refreshOverview()
      .then(() => active && setError(null))
      .catch((caught: unknown) => active && setError(caught instanceof Error ? caught.message : "현황 조회 실패"));
    void refresh();
    const timer = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => { active = false; window.clearInterval(timer); };
  }, [demoMode, refreshOverview, selectedId]);

  useEffect(() => {
    const url = import.meta.env.VITE_TELEMETRY_WS_URL?.trim();
    if (demoMode || !url || !selectedId) {
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
          assetId: message.assetId, observedAt: message.observedAt,
          receivedAt: message.receivedAt ?? new Date().toISOString(), sequence: message.sequence,
          latitude: message.latitude, longitude: message.longitude,
        }].slice(-3_600));
        setLastUpdatedAt(new Date());
      },
    });
    client.connect();
    return () => client.stop();
  }, [demoMode, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
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
  }, [selectedId]);

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
  const mapLocations = playbackSnapshot?.locations ?? liveLocations;
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
  const visibleLocations = useMemo(() => {
    return mapLocations.filter((item) => visibleResourceGroups.has(resourceGroupOf(item)));
  }, [mapLocations, visibleResourceGroups]);
  const eventCoordinates = overview?.event.geometry?.coordinates;
  const eventCenter = eventCoordinates && Number.isFinite(Number(eventCoordinates[0])) && Number.isFinite(Number(eventCoordinates[1]))
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
  const mapFocusCenter = eventToLiveDistance > 0.08 ? liveCenter : eventCenter;
  const coordinateOutlierKeys = new Set(
    liveCenter
      ? mapLocations
          .filter((item) => Math.hypot(item.longitude - liveCenter[0], item.latitude - liveCenter[1]) > 0.08)
          .map(locationKey)
      : [],
  );
  const selectedLocation = mapLocations.find((location) => locationKey(location) === selectedLocationKey) ?? null;
  const selectedCommunicationPath = selectedLocation ? communicationPath(selectedLocation) : null;
  const selectedPositioningWarning = selectedLocation && isPositioningLocation(selectedLocation)
    ? positioningWarning(selectedLocation)
    : null;
  const selectedCommunicationProfile = selectedLocation ? communicationProfile(selectedLocation) : null;
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
    <main className="unified-disaster-board" aria-label="산림 재난 통합 현황">
      {error && <p className="unified-disaster-error" role="status"><strong>데이터 갱신 지연</strong><span>{error}</span><small>{overview ? "마지막 정상 데이터를 유지합니다." : "연결을 다시 확인하고 있습니다."}</small></p>}
      {!overview && (
        <section className="dashboard-readiness" aria-live="polite">
          <header>
            <div className="readiness-brand"><span>산림청</span><strong>산림재난 통합상황판</strong><small>FOREST DISASTER COMMON OPERATIONAL PICTURE</small></div>
            <div className="readiness-actions">
              <button type="button" className="requirements-open" onClick={() => setRequirementsOpen(true)}>47개 개발 증빙</button>
              <button type="button" className="asset-registry-open" onClick={() => { window.location.href = "/device"; }}>자산 등록·관리</button>
              <div className={`readiness-connection ${error ? "is-error" : eventsLoaded ? "is-ready" : "is-loading"}`}><i />{error ? "연결 점검 필요" : eventsLoaded ? "연결 정상" : "데이터 연결 중"}</div>
            </div>
          </header>
          <div className="readiness-body">
            <div className="readiness-symbol" aria-hidden="true"><span /><i /><b /></div>
            <div>
              <p>{error ? "통합 데이터 연결을 확인해 주세요" : eventsLoaded ? "현재 진행 중인 재난이 없습니다" : "산림재난 운영 정보를 불러오고 있습니다"}</p>
              <h1>{error ? "상황판을 준비하지 못했습니다" : eventsLoaded ? "정상 대기 상태" : "상황판 준비 중"}</h1>
              <span>{error ? "기존 데이터는 변경되지 않았습니다. 연결 복구 후 최신 상황을 다시 불러옵니다." : eventsLoaded ? "재난 사건이 접수되면 지도·자원·통신망·경보 현황이 자동으로 표시됩니다." : "사건, 현장 자원, 통신망과 경보 상태를 확인하는 중입니다."}</span>
              {error && <button type="button" onClick={handleRetry} disabled={retrying}>{retrying ? "다시 연결 중…" : "연결 다시 확인"}</button>}
            </div>
          </div>
          <footer>
            <span><i /> 사건 정보</span><span><i /> 현장 자원</span><span><i /> 통신망 상태</span><span><i /> 위험 경보</span>
          </footer>
        </section>
      )}

      {overview && (
        <>
        <header className="map-command-header">
          <div className="service-brand"><span>산</span><div><strong>산림재난 통합상황판</strong><small>COMMON OPERATIONAL PICTURE</small></div></div>
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
          {demoMode && <div className="demo-mode-badge" title="실제 API 연결 전 화면 검증용 데이터입니다"><b>DEMO</b><span>모의 관제 데이터</span></div>}
          {demoMode && <label className="demo-scenario-selector"><span>검증 시나리오</span><select aria-label="DEMO 검증 시나리오" value={demoScenario} onChange={(event) => { const params = new URLSearchParams(window.location.search); params.set("demo", "1"); params.set("scenario", event.target.value); window.location.search = params.toString(); }}>{DEMO_SCENARIOS.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.label}</option>)}</select></label>}
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
          <button type="button" className="asset-registry-open" onClick={() => { window.location.href = "/device"; }}>자산 등록·관리</button>
          <button type="button" className="requirements-open" onClick={() => setRequirementsOpen(true)}>47개 개발 증빙</button>
          <button type="button" className="asset-status-open" onClick={() => { setSelectedLocationKey(null); setResourceDialogGroup("ALL"); }}>사건 투입 자산</button>
          <time className="last-updated" title={lastUpdatedAt?.toLocaleString("ko-KR")}><i /> 최근 갱신 {lastUpdatedAt ? relativeTime(lastUpdatedAt.toISOString()) : "대기 중"}</time>
        </header>
        <section className="dashboard-map-stage asset-panel-collapsed" aria-label="지도 중심 통합 상황판">
          <section className="live-location-panel" aria-label="실시간 현장 위치">
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
                    사건 기준점과 현장 자산 중심이 약 {eventToLiveDistanceKm.toFixed(1)}km 떨어져 있어 자산 중심으로 표시합니다.
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
                telemetrySamples={telemetrySamples}
              />
            </div>
            {selectedLocation && <div className="resource-modal-backdrop" role="presentation" onMouseDown={() => setSelectedLocationKey(null)}>
            <section className="selected-location-drawer resource-modal" role="dialog" aria-modal="true" aria-label="선택 자산 상세" onMouseDown={(event) => event.stopPropagation()}>
              <div><span>{assetTypeLabel(selectedLocation.category)}</span><strong>{selectedLocation.label}</strong><small>{coordinateOutlierKeys.has(locationKey(selectedLocation)) ? "좌표 정합성 확인 필요" : selectedLocation.status}</small></div>
              <dl>
                <div><dt>최근 통신</dt><dd>{relativeTime(selectedLocation.observedAt)}</dd></div>
                <div><dt>위치</dt><dd>{selectedLocation.latitude.toFixed(6)}, {selectedLocation.longitude.toFixed(6)}</dd></div>
                <div><dt>고도</dt><dd>{selectedLocation.altitude == null ? "확인 불가" : `${selectedLocation.altitude.toFixed(1)}m`}</dd></div>
                <div><dt>배터리</dt><dd>{selectedLocation.batteryPct == null ? "측정값 없음" : `${selectedLocation.batteryPct.toFixed(0)}%`}</dd></div>
                <div><dt>신호</dt><dd>{selectedLocation.signalStrengthDbm == null ? "측정값 없음" : `${selectedLocation.signalStrengthDbm.toFixed(0)} dBm`}</dd></div>
                <div><dt>지연·손실</dt><dd>{selectedLocation.latencyMs == null ? "측정값 없음" : `${selectedLocation.latencyMs.toFixed(0)} ms · ${selectedLocation.packetLossPct?.toFixed(1) ?? "-"}%`}</dd></div>
                <div><dt>데이터 발생 장비</dt><dd>{selectedLocation.sourceAssetId || selectedLocation.id}</dd></div>
                <div><dt>API 전달 주체</dt><dd>{selectedLocation.reportedByAssetId ? `${korean(selectedLocation.reportingRole || "GATEWAY")} · ${selectedLocation.reportedByAssetId}` : "직접 보고 또는 정보 미수신"}</dd></div>
              {isPositioningLocation(selectedLocation) && <>
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
              </dl>
              {selectedLocation.kind === "asset" && <button type="button" className="asset-log-link" onClick={() => { window.location.href = `/device?assetId=${encodeURIComponent(selectedLocation.id)}`; }}>assetId 로그·이력 조회</button>}
              {isPositioningLocation(selectedLocation) && <p className="positioning-dialog-note">
                <strong>{selectedLocation.category === "RTK_BASE_LPWA_GATEWAY" ? "기준국 역할" : "위치 산출 흐름"}</strong>
                <span>{positioningDescription(selectedLocation)}</span>
              </p>}
              {selectedCommunicationPath && <section className="communication-path" aria-label="통신 연결 구성">
                <header>
                  <strong>통신 연결 구성</strong>
                  <span><i data-medium="wired" />유선</span>
                  <span><i data-medium="wireless" />무선</span>
                </header>
                <div className="communication-path-flow">
                  {selectedCommunicationPath.nodes.map((node, index) => <div className="communication-path-step" key={`${node}-${index}`}>
                    <b>{node}</b>
                    {index < selectedCommunicationPath.links.length && <span
                      className="communication-path-link"
                      data-medium={selectedCommunicationPath.links[index].medium}
                    >
                      <small>{selectedCommunicationPath.links[index].label}</small>
                      <i />
                    </span>}
                  </div>)}
                </div>
              </section>}
              {selectedPositioningWarning && <aside
                className="positioning-correction-warning"
                data-level={selectedPositioningWarning.level}
                role="alert"
              >
                <strong>{selectedPositioningWarning.title}</strong>
                <span>{selectedPositioningWarning.message}</span>
                <small><b>조치</b>{selectedPositioningWarning.action}</small>
              </aside>}
              {selectedCommunicationProfile && <section className="communication-role-panel" aria-label="통신망 역할">
                <header><small>통신망 구분</small><strong>{selectedCommunicationProfile.scope}</strong></header>
                <dl>
                  <div><dt>사용망</dt><dd>{selectedCommunicationProfile.role}</dd></div>
                  <div><dt>전송정보</dt><dd>{selectedCommunicationProfile.carries}</dd></div>
                  <div><dt>연결경로</dt><dd>{selectedCommunicationProfile.path}</dd></div>
                </dl>
              </section>}
              <button type="button" onClick={() => setSelectedLocationKey(null)} aria-label="자산 상세 닫기">×</button>
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
                        <button key={String(asset.assetId)} type="button">
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
        </>
      )}
      {requirementsOpen && <RequirementsReadinessModal onClose={() => setRequirementsOpen(false)} />}

      {videoDrone && <DroneVideoModal drone={videoDrone} onClose={() => setVideoDrone(null)} />}
    </main>
  );
}
