import { useEffect, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";
import { DEOKSUNG_DEM, resolveTerrainConfig } from "./terrainConfig";
import "maplibre-gl/dist/maplibre-gl.css";
import "./command-center-visuals.css";
import "./dashboard-responsive-tv.css";
import type { ApiRecord, NetworkTopology } from "../../http-api";
import type { LiveLocation } from "./UnifiedDisasterDashboard";

type Props = {
  locations: LiveLocation[];
  changedUntil: Record<string, number>;
  highlightDurationMs: number;
  eventCenter: [number, number] | null;
  focusCenter: [number, number] | null;
  eventId: string;
  showResources: boolean;
  showEvent: boolean;
  selectedKey: string | null;
  onLocationSelect: (location: LiveLocation) => void;
  onLocationDoubleClick: (location: LiveLocation) => void;
  onLocationTopology: (location: LiveLocation) => void;
  topology: NetworkTopology;
  topologyFocusKey: string | null;
  showTopology: boolean;
  referenceTimeMs: number;
  domainLayers: Record<string, ApiRecord[]>;
  visibleLayerIds: Set<string>;
};

const mapStyle: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm", paint: { "raster-saturation": 0, "raster-brightness-max": 1 } }],
};

function keyOf(location: LiveLocation) {
  return `${location.kind}-${location.id}`;
}

const shortCategoryNames: Record<string, string> = {
  PERSONNEL: "인원", UAV: "무인기", MAIN_RELAY_DRONE: "주중계", SERVICE_RELAY_DRONE: "서비스중계",
  RTK_TERMINAL: "RTK", RTK_BASE_LPWA_GATEWAY: "RTK기준국", TVWS_BASE_STATION: "TVWS기지국",
  TVWS_CPE: "TVWS단말", LTE_GATEWAY: "LTE", PRIVATE_5G_NTN_GATEWAY: "5G·위성",
  RADIO_GATEWAY_400MHZ: "무전", COMMAND_VEHICLE: "지휘차량", FIXED_RELAY: "고정중계",
  MOBILE_RELAY: "이동중계", GCS: "GCS", REF_AP: "기준AP", ROVER_AP: "이동AP",
  RSSI_DETECTOR: "신호탐지", IR_UWB_GPR: "생체탐지", ASSET: "장비",
};

function compactLabel(location: LiveLocation) {
  const type = shortCategoryNames[location.category] ?? "장비";
  const name = location.label.length > 12 ? `${location.label.slice(0, 11)}…` : location.label;
  return `${location.registeredToEvent ? type : "미등록"} · ${name}`;
}

function isWildfireDemoMode() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("demo") === "1" && (params.get("scenario") ?? "WILDFIRE") === "WILDFIRE";
}

function wildfireHeatFeatureCollection(
  eventCenter: [number, number] | null,
  domainLayers: Record<string, ApiRecord[]>,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];

  if (eventCenter) {
    features.push({
      type: "Feature",
      id: "incident-center",
      geometry: { type: "Point", coordinates: eventCenter },
      properties: { weight: 1 },
    });
  }

  for (const layerId of ["external-firms", "ignition-detections"]) {
    for (const [index, row] of (domainLayers[layerId] ?? []).entries()) {
      const geometry = geometryOf(layerId, row);
      if (!geometry || geometry.type !== "Point") continue;
      const frp = Number(row.frp);
      features.push({
        type: "Feature",
        id: `heat-${layerId}-${index}`,
        geometry,
        properties: {
          weight: Number.isFinite(frp) ? Math.min(1, 0.55 + frp / 80) : 0.72,
        },
      });
    }
  }

  return { type: "FeatureCollection", features };
}

type MapLabelVariant = "incident" | "resource";

function createLabelImage(
  text: string,
  variant: MapLabelVariant = "resource",
) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return null;

  const incident = variant === "incident";
  // pixelRatio: 2로 등록되므로 실제 지도 표시 크기를 고려해 캔버스 글꼴을 넉넉하게 잡는다.
  const fontSize = incident ? 42 : 32;
  const height = incident ? 74 : 60;
  const paddingX = incident ? 24 : 18;

  context.font = `800 ${fontSize}px sans-serif`;
  const width = Math.min(
    incident ? 520 : 420,
    Math.ceil(context.measureText(text).width) + paddingX * 2,
  );

  canvas.width = width;
  canvas.height = height;

  context.font = `800 ${fontSize}px sans-serif`;
  context.fillStyle = incident
    ? "rgba(255,248,244,0.98)"
    : "rgba(255,255,255,0.96)";
  context.strokeStyle = incident
    ? "rgba(188,47,32,0.62)"
    : "rgba(31,55,72,0.28)";
  context.lineWidth = incident ? 3 : 2;
  context.beginPath();
  context.roundRect(
    1.5,
    1.5,
    width - 3,
    height - 3,
    incident ? 13 : 10,
  );
  context.fill();
  context.stroke();

  context.fillStyle = incident ? "#a92b20" : "#203543";
  context.textBaseline = "middle";
  context.fillText(
    text,
    paddingX,
    height / 2 + 1,
    width - paddingX * 2,
  );

  return context.getImageData(0, 0, width, height);
}

type ResourceIconKind =
  | "personnel"
  | "uav"
  | "vehicle"
  | "communication"
  | "asset";

function resourceIconId(location: LiveLocation) {
  if (location.kind === "personnel" || location.category === "PERSONNEL") {
    return "field-icon-personnel";
  }
  if (
    ["UAV", "MAIN_RELAY_DRONE", "SERVICE_RELAY_DRONE"].includes(
      location.category,
    )
  ) {
    return "field-icon-uav";
  }
  if (["COMMAND_VEHICLE", "GCS"].includes(location.category)) {
    return "field-icon-vehicle";
  }
  if (
    [
      "RTK_BASE_LPWA_GATEWAY",
      "TVWS_BASE_STATION",
      "TVWS_CPE",
      "LTE_GATEWAY",
      "PRIVATE_5G_NTN_GATEWAY",
      "RADIO_GATEWAY_400MHZ",
      "FIXED_RELAY",
      "MOBILE_RELAY",
      "REF_AP",
      "ROVER_AP",
    ].includes(location.category)
  ) {
    return "field-icon-communication";
  }
  return "field-icon-asset";
}

function createResourceIconImage(kind: ResourceIconKind) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return null;

  canvas.width = 48;
  canvas.height = 48;

  context.strokeStyle = "#ffffff";
  context.fillStyle = "#ffffff";
  context.lineWidth = 4;
  context.lineCap = "round";
  context.lineJoin = "round";

  if (kind === "personnel") {
    context.beginPath();
    context.arc(24, 14, 6, 0, Math.PI * 2);
    context.fill();

    context.beginPath();
    context.moveTo(24, 22);
    context.lineTo(24, 35);
    context.moveTo(16, 27);
    context.lineTo(32, 27);
    context.moveTo(24, 35);
    context.lineTo(17, 43);
    context.moveTo(24, 35);
    context.lineTo(31, 43);
    context.stroke();
  } else if (kind === "uav") {
    context.beginPath();
    context.moveTo(11, 16);
    context.lineTo(37, 32);
    context.moveTo(37, 16);
    context.lineTo(11, 32);
    context.stroke();

    for (const [x, y] of [
      [10, 15],
      [38, 15],
      [10, 33],
      [38, 33],
    ] as Array<[number, number]>) {
      context.beginPath();
      context.arc(x, y, 5, 0, Math.PI * 2);
      context.stroke();
    }

    context.fillRect(20, 20, 8, 8);
  } else if (kind === "vehicle") {
    context.beginPath();
    context.roundRect(8, 18, 32, 17, 4);
    context.stroke();
    context.beginPath();
    context.moveTo(16, 18);
    context.lineTo(20, 11);
    context.lineTo(32, 11);
    context.lineTo(36, 18);
    context.stroke();

    context.beginPath();
    context.arc(15, 38, 4, 0, Math.PI * 2);
    context.arc(34, 38, 4, 0, Math.PI * 2);
    context.fill();
  } else if (kind === "communication") {
    context.beginPath();
    context.moveTo(24, 14);
    context.lineTo(24, 41);
    context.moveTo(18, 41);
    context.lineTo(30, 41);
    context.stroke();

    context.beginPath();
    context.arc(24, 13, 4, 0, Math.PI * 2);
    context.fill();

    context.beginPath();
    context.arc(24, 13, 11, -0.9, 0.9);
    context.stroke();
    context.beginPath();
    context.arc(24, 13, 17, -0.75, 0.75);
    context.stroke();
  } else {
    context.beginPath();
    context.roundRect(10, 10, 28, 28, 6);
    context.stroke();
    context.beginPath();
    context.moveTo(17, 24);
    context.lineTo(31, 24);
    context.moveTo(24, 17);
    context.lineTo(24, 31);
    context.stroke();
  }

  return context.getImageData(0, 0, 48, 48);
}

function createIncidentIconImage() {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return null;

  canvas.width = 72;
  canvas.height = 82;

  context.shadowColor = "rgba(149, 25, 12, 0.35)";
  context.shadowBlur = 8;

  const gradient = context.createLinearGradient(0, 12, 0, 72);
  gradient.addColorStop(0, "#ffcf33");
  gradient.addColorStop(0.45, "#ff6f18");
  gradient.addColorStop(1, "#d62818");

  context.fillStyle = gradient;
  context.beginPath();
  context.moveTo(36, 6);
  context.bezierCurveTo(39, 23, 56, 26, 57, 44);
  context.bezierCurveTo(58, 61, 47, 73, 36, 77);
  context.bezierCurveTo(19, 74, 10, 63, 12, 49);
  context.bezierCurveTo(14, 35, 26, 30, 24, 17);
  context.bezierCurveTo(31, 20, 34, 14, 36, 6);
  context.closePath();
  context.fill();

  context.shadowBlur = 0;
  context.fillStyle = "#fff2a8";
  context.beginPath();
  context.moveTo(37, 34);
  context.bezierCurveTo(43, 42, 47, 47, 45, 56);
  context.bezierCurveTo(43, 64, 37, 68, 31, 65);
  context.bezierCurveTo(24, 61, 25, 53, 29, 48);
  context.bezierCurveTo(33, 43, 34, 39, 37, 34);
  context.closePath();
  context.fill();

  return context.getImageData(0, 0, 72, 82);
}

function wildfireIncidentAreaFeatureCollection(
  eventCenter: [number, number] | null,
): GeoJSON.FeatureCollection {
  if (!eventCenter) {
    return { type: "FeatureCollection", features: [] };
  }

  // DEMO 시각 강조용 영향권.
  // 공식 화선/위험경계/확산예측 데이터가 아니라 발생지점 인지를 돕기 위한 보조 표현이다.
  const [longitude, latitude] = eventCenter;
  const points = 64;

  const createRing = (
    baseRadiusM: number,
    phase: number,
    irregularity: number,
  ) => {
    const coordinates: Array<[number, number]> = [];

    for (let index = 0; index <= points; index += 1) {
      const angle = (index / points) * Math.PI * 2;
      const wobble =
        1 +
        irregularity * 0.46 * Math.sin(angle * 3 + phase) +
        irregularity * 0.28 * Math.sin(angle * 5 - phase * 0.7) +
        irregularity * 0.18 * Math.cos(angle * 7 + 0.8);

      const directionalStretch =
        1 + 0.18 * Math.max(0, Math.cos(angle - 0.7));

      const radiusM = baseRadiusM * wobble * directionalStretch;
      const latitudeDelta = radiusM / 111_320;
      const longitudeDelta =
        radiusM /
        (111_320 * Math.max(0.2, Math.cos((latitude * Math.PI) / 180)));

      coordinates.push([
        longitude + Math.cos(angle) * longitudeDelta,
        latitude + Math.sin(angle) * latitudeDelta,
      ]);
    }

    return coordinates;
  };

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "wildfire-incident-emphasis-outer",
        geometry: {
          type: "Polygon",
          coordinates: [createRing(650, 0.5, 0.34)],
        },
        properties: {
          visualOnly: true,
          severity: "outer",
        },
      },
      {
        type: "Feature",
        id: "wildfire-incident-emphasis-core",
        geometry: {
          type: "Polygon",
          coordinates: [createRing(315, 1.2, 0.24)],
        },
        properties: {
          visualOnly: true,
          severity: "core",
        },
      },
    ],
  };
}

const domainLayerStyle: Record<string, { type: "line" | "fill" | "circle"; color: string; opacity?: number }> = {
  firelines: { type: "line", color: "#d9271c" },
  "spread-predictions": { type: "fill", color: "#f36b21", opacity: 0.36 },
  "communication-coverages": { type: "fill", color: "#158bcb", opacity: 0.14 },
  "slope-assessments": { type: "fill", color: "#8a52c7", opacity: 0.12 },
  "debris-flow-paths": { type: "line", color: "#70451f" },
  "debris-flow-areas": { type: "fill", color: "#b36a32", opacity: 0.16 },
  "victim-candidates": { type: "circle", color: "#db3158" },
  "rssi-detections": { type: "circle", color: "#f2a527" },
  "ai-ran-coverages": { type: "fill", color: "#18a1a8", opacity: 0.12 },
  "relay-placement-candidates": { type: "circle", color: "#1678c8" },
  "ignition-detections": { type: "circle", color: "#f02f22" },
  "vehicle-detections": { type: "circle", color: "#4569d4" },
  "road-segmentations": { type: "fill", color: "#53677a", opacity: 0.13 },
  "change-detections": { type: "fill", color: "#d88324", opacity: 0.15 },
  "vital-signal-detections": { type: "circle", color: "#d92f85" },

  "external-firms": {
    type: "circle",
    color: "#e33b2e",
    opacity: 0.88,
  },

  "external-landslide-history": {
    type: "circle",
    color: "#7651a8",
    opacity: 0.8,
  },
  "external-wildfire-risk": { type: "fill", color: "#f05c2f", opacity: 0.29 },
  "external-landslide-forecast": { type: "fill", color: "#d39a28", opacity: 0.18 },
  "external-landslide-regional-risk": { type: "fill", color: "#8550b6", opacity: 0.2 },
  "wildfire-risk-zones": { type: "fill", color: "#d92d20", opacity: 0.34 },
  "evacuation-routes": { type: "line", color: "#16a36d", opacity: 1 },
  "suppression-resources": { type: "circle", color: "#1678c8", opacity: 0.9 },
  "water-sources": { type: "circle", color: "#13a9d6", opacity: 0.9 },
  "nearby-response-resources": { type: "circle", color: "#7057d9", opacity: 0.9 },
  viewsheds: { type: "fill", color: "#e8c33f", opacity: 0.12 },
  "communication-shadows": { type: "fill", color: "#394a5a", opacity: 0.26 },
  "slope-gradients": { type: "fill", color: "#a85c36", opacity: 0.18 },
};

const wildfireOutlineLayerIds = new Set([
  "spread-predictions",
  "external-wildfire-risk",
  "wildfire-risk-zones",
]);

const DEFAULT_EXPECTED_TELEMETRY_INTERVAL_MS = 30_000;

type TopologyEdge = {
  from: LiveLocation;
  to: LiveLocation;
  medium: string;
};

function topologyLinkState(edge: TopologyEdge, referenceTimeMs: number) {
  const explicitFailure = [edge.from.status, edge.to.status].some((status) => /신호 없음|고장|FAILED|SIGNAL_LOST/i.test(status));
  if (explicitFailure) return "disconnected";
  const endpointState = (location: LiveLocation) => {
    const age = referenceTimeMs - Date.parse(location.observedAt || "0");
    const expectedInterval = location.expectedTelemetryIntervalSec
      ? location.expectedTelemetryIntervalSec * 1_000
      : DEFAULT_EXPECTED_TELEMETRY_INTERVAL_MS;
    if (!Number.isFinite(age) || age > expectedInterval * 3) return 2;
    if (age > expectedInterval * 1.5) return 1;
    return 0;
  };
  const state = Math.max(endpointState(edge.from), endpointState(edge.to));
  return state === 2 ? "disconnected" : state === 1 ? "delayed" : "active";
}

function fallbackTopologyEdges(locations: LiveLocation[]): TopologyEdge[] {
  const first = (...categories: string[]) => locations.find((location) => categories.includes(location.category));
  const command = first("COMMAND_VEHICLE", "GCS");
  const rtkBase = first("RTK_BASE_LPWA_GATEWAY");
  const private5g = first("PRIVATE_5G_NTN_GATEWAY");
  const tvwsBase = first("TVWS_BASE_STATION");
  const lte = first("LTE_GATEWAY");
  const relay = first("FIXED_RELAY", "MOBILE_RELAY", "MAIN_RELAY_DRONE", "SERVICE_RELAY_DRONE");
  const edges: TopologyEdge[] = [];
  const keys = new Set<string>();
  const add = (from: LiveLocation | undefined, to: LiveLocation | undefined, medium: string) => {
    if (!from || !to || keyOf(from) === keyOf(to)) return;
    const signature = [keyOf(from), keyOf(to)].sort().join("|");
    if (keys.has(signature)) return;
    keys.add(signature);
    edges.push({ from, to, medium });
  };

  for (const location of locations) {
    if (location.kind === "personnel" || location.category === "RTK_TERMINAL") add(location, rtkBase ?? command, "LPWA");
    else if (["UAV", "MAIN_RELAY_DRONE", "SERVICE_RELAY_DRONE"].includes(location.category)) add(location, private5g ?? relay ?? command, "이음5G");
    else if (location.category === "TVWS_CPE") add(location, tvwsBase ?? command, "TVWS");
    else if (["IR_UWB_GPR", "RSSI_DETECTOR", "REF_AP", "ROVER_AP", "FIXED_RELAY", "MOBILE_RELAY"].includes(location.category)) add(location, relay ?? command, "현장 무선");
    else if (location.category === "RADIO_GATEWAY_400MHZ") add(location, command, "400MHz");
    else if (["RTK_BASE_LPWA_GATEWAY", "TVWS_BASE_STATION", "LTE_GATEWAY", "PRIVATE_5G_NTN_GATEWAY"].includes(location.category)) add(location, command, location.category === "TVWS_BASE_STATION" ? "TVWS" : location.category === "RTK_BASE_LPWA_GATEWAY" ? "Ethernet" : "IP");
    else if (location.category !== "COMMAND_VEHICLE" && location.category !== "GCS") add(location, command ?? rtkBase ?? private5g, "현장망");
  }
  add(command, lte, "LTE");
  add(command, private5g, "5G·LEO");
  add(command, tvwsBase, "TVWS");
  return edges;
}

function topologyEdges(locations: LiveLocation[], topology: NetworkTopology): TopologyEdge[] {
  const byAssetId = new Map(locations.flatMap((location) => {
    const assetId = location.kind === "asset" ? location.id : location.sourceAssetId;
    return assetId ? [[assetId, location] as const] : [];
  }));
  const nodeById = new Map(topology.nodes.map((node) => [String(node.topologyNodeId), node]));
  const databaseEdges = topology.links.flatMap((link) => {
    const fromNode = nodeById.get(String(link.sourceNodeId));
    const toNode = nodeById.get(String(link.targetNodeId));
    const from = fromNode ? byAssetId.get(String(fromNode.assetId ?? "")) : undefined;
    const to = toNode ? byAssetId.get(String(toNode.assetId ?? "")) : undefined;
    return from && to ? [{ from, to, medium: String(link.medium ?? "IP").replaceAll("_", "·") }] : [];
  });
  return databaseEdges.length ? databaseEdges : fallbackTopologyEdges(locations);
}

function topologyFeatureCollection(locations: LiveLocation[], topology: NetworkTopology, focusKey: string | null, referenceTimeMs: number): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: topologyEdges(locations, topology).map((edge, index) => ({
      type: "Feature",
      id: `topology-${index}`,
      geometry: { type: "LineString", coordinates: [[edge.from.longitude, edge.from.latitude], [edge.to.longitude, edge.to.latitude]] },
      properties: {
        state: topologyLinkState(edge, referenceTimeMs),
        medium: edge.medium,
        focused: !focusKey || keyOf(edge.from) === focusKey || keyOf(edge.to) === focusKey,
      },
    })),
  };
}

function geometryOf(layerId: string, row: ApiRecord) {
  const candidates = layerId === "firelines" ? [row.fireline]
    : layerId === "spread-predictions" ? [row.predictedArea]
    : layerId === "communication-coverages" ? [row.coverageArea, row.shadowArea]
    : layerId === "slope-assessments" ? [row.geometry]
    : layerId === "debris-flow-paths" ? [row.flowPath]
    : layerId === "debris-flow-areas" ? [row.affectedArea]
    : layerId === "victim-candidates" ? [row.estimatedPosition]
    : layerId === "rssi-detections" ? [row.estimatedPosition, row.detectorPosition]
    : [row.resultGeometry];
  return candidates.find((candidate) => candidate && typeof candidate === "object" && "type" in candidate) as GeoJSON.Geometry | undefined;
}

function domainPointLabel(
  layerId: string,
  row: ApiRecord,
  index: number,
) {
  if (layerId === "suppression-resources") {
    return String(
      row.resourceName ??
      row.name ??
      `진화자원 ${index + 1}`,
    );
  }

  if (layerId === "water-sources") {
    return String(
      row.resourceName ??
      row.name ??
      `소화용수 ${index + 1}`,
    );
  }

  if (layerId === "nearby-response-resources") {
    const name = String(
      row.resourceType ??
      row.resourceName ??
      row.name ??
      `주변 대응자원 ${index + 1}`,
    );

    const eta = Number(row.etaMinutes);

    return Number.isFinite(eta)
      ? `${name} · ETA ${eta}분`
      : name;
  }

  return "";
}

function featureCollection(layerId: string, rows: ApiRecord[]): GeoJSON.FeatureCollection {
  const timeOf = (row: ApiRecord) => Date.parse(String(
    row.observedAt ?? row.baseTime ?? row.assessedAt ?? row.lastDetectedAt ?? row.detectedAt ?? row.generatedAt ?? 0
  ));
  const sortedRows = [...rows].sort((a, b) => timeOf(b) - timeOf(a));
  const displayRows = layerId === "firelines" || layerId === "spread-predictions"
    ? sortedRows.slice(0, 1)
    : sortedRows.filter((row, index, all) => {
        const signature = JSON.stringify(geometryOf(layerId, row));
        return all.findIndex((candidate) => JSON.stringify(geometryOf(layerId, candidate)) === signature) === index;
      }).slice(0, 20);
  return {
    type: "FeatureCollection",
    features: displayRows.flatMap((row, index) => {
      const geometry = geometryOf(layerId, row);
      return geometry ? [{
        type: "Feature",
        id: String(
          row.id ??
          row.firelineId ??
          row.predictionId ??
          row.assessmentId ??
          row.victimCandidateId ??
          row.detectionId ??
          index
        ),
        geometry,
        properties: {
          layerId,
          provider: String(row.provider ?? ""),
          observedAt: String(row.observedAt ?? ""),
          confidence: row.confidence == null ? "" : String(row.confidence),
          frp: Number.isFinite(Number(row.frp)) ? Number(row.frp) : null,
          label: domainPointLabel(layerId, row, index),
        },
      } as GeoJSON.Feature] : [];
    }),
  };
}

function locationFeatureCollection(locations: LiveLocation[], changedUntil: Record<string, number>, selectedKey: string | null): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: locations.map((location) => {
      const key = keyOf(location);
      return {
        type: "Feature",
        id: key,
        geometry: { type: "Point", coordinates: [location.longitude, location.latitude] },
        properties: {
          key,
          kind: location.kind,
          category: location.category,
          registeredToEvent: location.registeredToEvent,
          labelIcon: `field-label-${key}`,
          resourceIcon: resourceIconId(location),
          labelSlot:
            location.id === "CREW-12"
              ? "crew-up"
              : location.id === "CREW-07"
                ? "crew-down"
                : location.category === "UAV"
                  ? "uav-up"
                  : location.category === "COMMAND_VEHICLE"
                    ? "vehicle-down"
                    : location.category === "RTK_BASE_LPWA_GATEWAY"
                      ? "rtk-down"
                      : location.category === "FIXED_RELAY"
                        ? "relay-up"
                        : location.id === "FIRE-ENG-03"
                          ? "fire-engine-down"
                          : "default",
          changed: (changedUntil[key] ?? 0) > Date.now(),
          selected: selectedKey === key,
        },
      };
    }),
  };
}

export default function LivePositionMap({ locations, changedUntil, highlightDurationMs, eventCenter, focusCenter, eventId, showResources, showEvent, selectedKey, onLocationSelect, onLocationDoubleClick, onLocationTopology, topology, topologyFocusKey, showTopology, referenceTimeMs, domainLayers, visibleLayerIds }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const wildfireDemo = isWildfireDemoMode();
  const [mutedBasemap, setMutedBasemap] = useState(false);
  const [terrain3d, setTerrain3d] = useState(false);
  const [riskHeatmap, setRiskHeatmap] = useState(wildfireDemo);
  const [terrainElevationM, setTerrainElevationM] = useState<number | null>(null);
  const fallbackTerrainConfig = resolveTerrainConfig(import.meta.env);
  const terrainConfig = wildfireDemo ? DEOKSUNG_DEM : fallbackTerrainConfig;
  const [tileDegraded, setTileDegraded] = useState(false);
  const selectedEventRef = useRef("");
  const singleClickTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle,
      center: [128.7, 36.35],
      zoom: 12,
      attributionControl: false,
      maxPitch: 80,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-left");
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: "metric" }), "bottom-left");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    const handleError = (event: { error?: Error }) => {
      if (/tile|source|network|fetch/i.test(String(event.error?.message ?? ""))) setTileDegraded(true);
    };
    map.on("error", handleError);
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);
    mapRef.current = map;
    return () => {
      resizeObserver.disconnect();
      map.off("error", handleError);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (!map.getLayer("osm")) return;
      map.setPaintProperty("osm", "raster-opacity", mutedBasemap ? 0.76 : 1);
      map.setPaintProperty("osm", "raster-saturation", mutedBasemap ? -0.82 : 0);
      map.setPaintProperty("osm", "raster-contrast", mutedBasemap ? 0.2 : 0);
      map.setPaintProperty("osm", "raster-brightness-max", mutedBasemap ? 0.94 : 1);
    };
    if (map.isStyleLoaded()) apply(); else map.once("load", apply);
    return () => { map.off("load", apply); };
  }, [mutedBasemap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      // Terrain source는 최초 1회만 생성합니다.
      // 2D/3D 전환마다 source를 제거하면 DEM 타일 재요청과 프레임 드롭이 발생합니다.
      if (!map.getSource("terrain-dem")) {
        map.addSource("terrain-dem", {
          type: "raster-dem",
          tiles: terrainConfig.tiles,
          tileSize: terrainConfig.tileSize,
          encoding: terrainConfig.encoding,
          maxzoom: terrainConfig.maxzoom,
          attribution: terrainConfig.attribution,
          ...("bounds" in terrainConfig && Array.isArray(terrainConfig.bounds)
            ? { bounds: terrainConfig.bounds as [number, number, number, number] }
            : {}),
        });
      }

      if (!map.getLayer("terrain-hillshade")) {
        map.addLayer({
          id: "terrain-hillshade",
          type: "hillshade",
          source: "terrain-dem",
          layout: { visibility: terrain3d ? "visible" : "none" },
          paint: {
            "hillshade-exaggeration": wildfireDemo ? 0.55 : 0.45,
            "hillshade-shadow-color": "#2f3d36",
            "hillshade-highlight-color": "#ffffff",
            "hillshade-accent-color": "#6f8178",
            "hillshade-illumination-anchor": "map",
            "hillshade-illumination-direction": 315,
          },
        });
      } else {
        map.setLayoutProperty(
          "terrain-hillshade",
          "visibility",
          terrain3d ? "visible" : "none",
        );
      }

      map.setTerrain(
        terrain3d
          ? { source: "terrain-dem", exaggeration: wildfireDemo ? 1.45 : 1.35 }
          : null,
      );

      map.easeTo({
        pitch: terrain3d ? (wildfireDemo ? 64 : 58) : 0,
        bearing: terrain3d ? (wildfireDemo ? -24 : -18) : 0,
        duration: terrain3d ? 420 : 280,
      });
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);

    return () => {
      map.off("load", apply);
    };
  }, [terrain3d, wildfireDemo]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !terrain3d) { setTerrainElevationM(null); return; }
    const handleMove = (event: maplibregl.MapMouseEvent) => {
      const elevation = map.queryTerrainElevation(event.lngLat);
      setTerrainElevationM(Number.isFinite(elevation) ? Number(elevation) : null);
    };
    map.on("mousemove", handleMove);
    return () => { map.off("mousemove", handleMove); };
  }, [terrain3d]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !eventCenter) return;
    if (selectedEventRef.current === eventId) return;
    selectedEventRef.current = eventId;
    const targetCenter = focusCenter ?? eventCenter;
    if (wildfireDemo && !focusCenter) {
      map.easeTo({ center: eventCenter, zoom: 13.8, duration: 700 });
      return;
    }
    const nearbyLocations = locations.filter((location) =>
      Math.hypot(location.longitude - targetCenter[0], location.latitude - targetCenter[1]) <= 0.08
    );
    if (nearbyLocations.length >= 2) {
      const bounds = new maplibregl.LngLatBounds();
      nearbyLocations.forEach((location) => bounds.extend([location.longitude, location.latitude]));
      if (Math.hypot(eventCenter[0] - targetCenter[0], eventCenter[1] - targetCenter[1]) <= 0.08) {
        bounds.extend(eventCenter);
      }
      map.fitBounds(bounds, { padding: 72, maxZoom: 15, duration: 700 });
    } else {
      map.easeTo({ center: targetCenter, zoom: 14, duration: 700 });
    }
  }, [eventCenter, focusCenter, eventId, locations, wildfireDemo]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const render = () => {
      for (const [layerId, rows] of Object.entries(domainLayers)) {
        const style = domainLayerStyle[layerId];
        if (!style) continue;
        const sourceId = `domain-source-${layerId}`;
        const mapLayerId = `domain-layer-${layerId}`;
        const data = featureCollection(layerId, rows);
        const source = map.getSource(sourceId) as GeoJSONSource | undefined;
        if (source) source.setData(data);
        else map.addSource(sourceId, { type: "geojson", data });
        if (!map.getLayer(mapLayerId)) {
          if (style.type === "line") map.addLayer({
            id: mapLayerId,
            type: "line",
            source: sourceId,
            paint: {
              "line-color": style.color,
              "line-width": layerId === "firelines" ? 9 : layerId === "evacuation-routes" ? 6 : 4,
              "line-opacity": style.opacity ?? 0.95,
              "line-blur": layerId === "firelines" ? 0.5 : 0,
            },
          });
          if (style.type === "fill") map.addLayer({
            id: mapLayerId,
            type: "fill",
            source: sourceId,
            paint: {
              "fill-color": style.color,
              "fill-opacity": style.opacity ?? 0.16,
              "fill-outline-color": style.color,
            },
          });
          if (
            style.type === "fill" &&
            wildfireOutlineLayerIds.has(layerId)
          ) {
            const outlineLayerId = `domain-outline-${layerId}`;
            if (!map.getLayer(outlineLayerId)) {
              map.addLayer({
                id: outlineLayerId,
                type: "line",
                source: sourceId,
                paint: {
                  "line-color": style.color,
                  "line-width":
                    layerId === "wildfire-risk-zones" ? 4.5 : 3,
                  "line-opacity": 0.92,
                  "line-dasharray":
                    layerId === "spread-predictions"
                      ? [2.4, 1.8]
                      : [1000, 0.1],
                },
              });
            }
          }
          if (style.type === "circle") {
            map.addLayer({
              id: mapLayerId,
              type: "circle",
              source: sourceId,
              paint: {
                "circle-color": style.color,
                "circle-radius":
                  layerId === "victim-candidates"
                    ? 11
                    : layerId === "external-firms"
                      ? 10
                      : 9,
                "circle-opacity": 0.9,
                "circle-stroke-color": "#fff",
                "circle-stroke-width": 2.8,
              },
            });

            if (
              [
                "suppression-resources",
                "water-sources",
                "nearby-response-resources",
              ].includes(layerId)
            ) {
              const labelLayerId = `${mapLayerId}-label`;

              if (!map.getLayer(labelLayerId)) {
                map.addLayer({
                  id: labelLayerId,
                  type: "symbol",
                  source: sourceId,
                  layout: {
                    "text-field": ["get", "label"],
                    "text-size": [
                      "interpolate",
                      ["linear"],
                      ["zoom"],
                      8, 13,
                      12, 15,
                      15, 18,
                    ],
                    "text-anchor": "left",
                    "text-offset": [1.15, 0],
                    "text-allow-overlap": true,
                    "text-ignore-placement": true,
                  },
                  paint: {
                    "text-color": "#243b35",
                    "text-halo-color": "rgba(255,255,255,.98)",
                    "text-halo-width": 3,
                    "text-halo-blur": 0.4,
                  },
                });
              }
            }
          }
        }
        const visibility = visibleLayerIds.has(layerId)
          ? "visible"
          : "none";
        map.setLayoutProperty(mapLayerId, "visibility", visibility);
        const outlineLayerId = `domain-outline-${layerId}`;
        if (map.getLayer(outlineLayerId)) {
          map.setLayoutProperty(
            outlineLayerId,
            "visibility",
            visibility,
          );
        }

        const labelLayerId = `${mapLayerId}-label`;
        if (map.getLayer(labelLayerId)) {
          map.setLayoutProperty(
            labelLayerId,
            "visibility",
            visibility,
          );
        }
      }
    };
    if (map.isStyleLoaded()) render(); else map.once("load", render);
    return () => { map.off("load", render); };
  }, [domainLayers, visibleLayerIds]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const render = () => {
      const sourceId = "wildfire-risk-heat-source";
      const layerId = "wildfire-risk-heatmap";
      const data = wildfireHeatFeatureCollection(eventCenter, domainLayers);
      const source = map.getSource(sourceId) as GeoJSONSource | undefined;

      if (source) source.setData(data);
      else map.addSource(sourceId, { type: "geojson", data });

      if (!map.getLayer(layerId)) {
        map.addLayer({
          id: layerId,
          type: "heatmap",
          source: sourceId,
          maxzoom: 16,
          paint: {
            "heatmap-weight": ["coalesce", ["get", "weight"], 0.7],
            "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 8, 0.8, 14, 1.8],
            "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 8, 40, 14, 118],
            "heatmap-opacity": wildfireDemo ? 0.92 : 0.86,
            "heatmap-color": [
              "interpolate", ["linear"], ["heatmap-density"],
              0, "rgba(255,220,0,0)",
              0.2, "rgba(255,214,0,.18)",
              0.42, "rgba(255,155,0,.36)",
              0.65, "rgba(255,82,0,.54)",
              0.84, "rgba(220,28,18,.68)",
              1, "rgba(150,0,0,.8)",
            ],
          },
        });
      }

      map.setLayoutProperty(layerId, "visibility", wildfireDemo && riskHeatmap ? "visible" : "none");
    };

    if (map.isStyleLoaded()) render(); else map.once("load", render);
    return () => { map.off("load", render); };
  }, [domainLayers, eventCenter, riskHeatmap, wildfireDemo]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const layerId = "domain-layer-external-firms";

    const showFirmsPopup = (event: maplibregl.MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature) return;

      const properties = feature.properties ?? {};
      const observedAt = String(properties.observedAt ?? "");
      const confidence = String(properties.confidence ?? "-");
      const frpValue = Number(properties.frp);
      const frp = Number.isFinite(frpValue) ? `${frpValue} MW` : "-";

      const detectedAt = observedAt
        ? new Date(observedAt).toLocaleString("ko-KR")
        : "-";

      const popupContent = document.createElement("div");
      popupContent.style.minWidth = "180px";
      popupContent.style.fontFamily = "sans-serif";

      const title = document.createElement("strong");
      title.textContent = "NASA FIRMS 위성 화점";
      popupContent.appendChild(title);

      const detectedAtRow = document.createElement("div");
      detectedAtRow.style.marginTop = "8px";
      detectedAtRow.textContent = `탐지시각: ${detectedAt}`;
      popupContent.appendChild(detectedAtRow);

      const frpRow = document.createElement("div");
      frpRow.textContent = `FRP: ${frp}`;
      popupContent.appendChild(frpRow);

      const confidenceRow = document.createElement("div");
      confidenceRow.textContent = `신뢰도: ${confidence}`;
      popupContent.appendChild(confidenceRow);

      const notice = document.createElement("div");
      notice.style.marginTop = "6px";
      notice.style.fontSize = "11px";
      notice.style.color = "#667";
      notice.textContent = "위성 열원 탐지값 · 산불 확정정보 아님";
      popupContent.appendChild(notice);

      new maplibregl.Popup({
        closeButton: true,
        closeOnClick: true,
        offset: 12,
      })
        .setLngLat(event.lngLat)
        .setDOMContent(popupContent)
        .addTo(map);
    };

    const pointer = () => {
      map.getCanvas().style.cursor = "pointer";
    };

    const unpointer = () => {
      map.getCanvas().style.cursor = "";
    };

    const bind = () => {
      if (!map.getLayer(layerId)) return;

      map.on("click", layerId, showFirmsPopup);
      map.on("mouseenter", layerId, pointer);
      map.on("mouseleave", layerId, unpointer);
    };

    if (map.isStyleLoaded()) bind();
    else map.once("load", bind);

    return () => {
      map.off("load", bind);

      if (map.getLayer(layerId)) {
        map.off("click", layerId, showFirmsPopup);
        map.off("mouseenter", layerId, pointer);
        map.off("mouseleave", layerId, unpointer);
      }
    };
  }, [domainLayers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const render = () => {
      const eventData: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: eventCenter ? [{
          type: "Feature",
          id: "event-origin",
          geometry: { type: "Point", coordinates: eventCenter },
          properties: {
            label: wildfireDemo ? "산불 발생지점" : "재난 발생지점",
          },
        }] : [],
      };
      const eventSource = map.getSource("event-origin-source") as GeoJSONSource | undefined;
      if (eventSource) eventSource.setData(eventData);
      else map.addSource("event-origin-source", { type: "geojson", data: eventData });

      const incidentAreaData = wildfireDemo
        ? wildfireIncidentAreaFeatureCollection(eventCenter)
        : { type: "FeatureCollection", features: [] } as GeoJSON.FeatureCollection;
      const incidentAreaSource = map.getSource(
        "wildfire-incident-area-source",
      ) as GeoJSONSource | undefined;
      if (incidentAreaSource) {
        incidentAreaSource.setData(incidentAreaData);
      } else {
        map.addSource("wildfire-incident-area-source", {
          type: "geojson",
          data: incidentAreaData,
        });
      }

      if (!map.getLayer("wildfire-incident-area-fill")) {
        map.addLayer({
          id: "wildfire-incident-area-fill",
          type: "fill",
          source: "wildfire-incident-area-source",
          paint: {
            "fill-color": [
              "match",
              ["get", "severity"],
              "core",
              "#e53920",
              "#ff7b22",
            ],
            "fill-opacity": [
              "match",
              ["get", "severity"],
              "core",
              0.24,
              0.13,
            ],
          },
        });
      }
      if (!map.getLayer("wildfire-incident-area-outline")) {
        map.addLayer({
          id: "wildfire-incident-area-outline",
          type: "line",
          source: "wildfire-incident-area-source",
          paint: {
            "line-color": [
              "match",
              ["get", "severity"],
              "core",
              "#ff5c26",
              "#e33122",
            ],
            "line-width": [
              "match",
              ["get", "severity"],
              "core",
              3,
              4.5,
            ],
            "line-opacity": [
              "match",
              ["get", "severity"],
              "core",
              0.72,
              0.92,
            ],
            "line-blur": [
              "match",
              ["get", "severity"],
              "core",
              0.4,
              0.8,
            ],
          },
        });
      }

      const incidentAreaVisibility =
        wildfireDemo && showEvent ? "visible" : "none";
      map.setLayoutProperty(
        "wildfire-incident-area-fill",
        "visibility",
        incidentAreaVisibility,
      );
      map.setLayoutProperty(
        "wildfire-incident-area-outline",
        "visibility",
        incidentAreaVisibility,
      );

      const topologyData = topologyFeatureCollection(locations, topology, topologyFocusKey, referenceTimeMs);
      const topologySource = map.getSource("communication-topology-source") as GeoJSONSource | undefined;
      if (topologySource) topologySource.setData(topologyData);
      else map.addSource("communication-topology-source", { type: "geojson", data: topologyData });
      const topologyVisibility = showResources && showTopology ? "visible" : "none";
      const topologyLayerDefinitions: Array<{ id: string; state: string; color: string; dasharray: number[] }> = [
        { id: "communication-topology-active", state: "active", color: "#16866b", dasharray: [1000, 0.1] },
        { id: "communication-topology-delayed", state: "delayed", color: "#d08a20", dasharray: [3, 2] },
        { id: "communication-topology-disconnected", state: "disconnected", color: "#9b5555", dasharray: [1, 3] },
      ];
      for (const definition of topologyLayerDefinitions) {
        if (!map.getLayer(definition.id)) map.addLayer({
          id: definition.id,
          type: "line",
          source: "communication-topology-source",
          filter: ["==", ["get", "state"], definition.state],
          layout: { visibility: topologyVisibility },
          paint: {
            "line-color": definition.color,
            "line-width": ["case", ["boolean", ["get", "focused"], false], 4, 2],
            "line-opacity": ["case", ["boolean", ["get", "focused"], false], definition.state === "active" ? 0.82 : 0.58, 0.13],
            "line-dasharray": definition.dasharray,
          },
        });
        else map.setLayoutProperty(definition.id, "visibility", topologyVisibility);
      }
      if (!map.getLayer("communication-topology-label")) map.addLayer({
        id: "communication-topology-label",
        type: "symbol",
        source: "communication-topology-source",
        layout: {
          visibility: topologyVisibility,
          "symbol-placement": "line-center",
          "text-field": ["get", "medium"],
          "text-size": 10,
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#29483f",
          "text-halo-color": "rgba(255,255,255,.95)",
          "text-halo-width": 2,
          "text-opacity": ["case", ["boolean", ["get", "focused"], false], 0.9, 0.18],
        },
      });
      else map.setLayoutProperty("communication-topology-label", "visibility", topologyVisibility);
      if (!map.getLayer("event-origin-halo")) map.addLayer({
        id: "event-origin-halo", type: "circle", source: "event-origin-source",
        paint: {
          "circle-radius": wildfireDemo ? 62 : 20,
          "circle-color": "#e02b20",
          "circle-opacity": wildfireDemo ? 0.12 : 0.18,
          "circle-blur": wildfireDemo ? 0.68 : 0.2,
        },
      });
      if (!map.getLayer("event-origin-ring")) map.addLayer({
        id: "event-origin-ring", type: "circle", source: "event-origin-source",
        paint: {
          "circle-radius": wildfireDemo ? 31 : 13,
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-color": "#ff5b45",
          "circle-stroke-width": wildfireDemo ? 4 : 2,
          "circle-stroke-opacity": wildfireDemo ? 0.85 : 0.35,
        },
      });
      if (!map.getLayer("event-origin-point")) map.addLayer({
        id: "event-origin-point", type: "circle", source: "event-origin-source",
        paint: {
          "circle-radius": wildfireDemo ? 12 : 9,
          "circle-color": "#d91f18",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": wildfireDemo ? 4 : 3,
        },
      });
      if (!map.getLayer("event-origin-label")) {
        map.addLayer({
          id: "event-origin-label",
          type: "symbol",
          source: "event-origin-source",
          layout: {
            "text-field": ["get", "label"],
            "text-size": wildfireDemo ? 22 : 18,
            "text-anchor": "left",
            "text-offset": [2.25, -0.35],
            "text-allow-overlap": true,
            "text-ignore-placement": true,
          },
          paint: {
            "text-color": "#b52d1f",
            "text-halo-color": "rgba(255,255,255,.98)",
            "text-halo-width": 3.5,
            "text-halo-blur": 0.5,
          },
        });
      }

      const sharedResourceIcons: Array<[
        string,
        ResourceIconKind,
      ]> = [
        ["field-icon-personnel", "personnel"],
        ["field-icon-uav", "uav"],
        ["field-icon-vehicle", "vehicle"],
        ["field-icon-communication", "communication"],
        ["field-icon-asset", "asset"],
      ];
      for (const [imageId, kind] of sharedResourceIcons) {
        if (map.hasImage(imageId)) continue;
        const image = createResourceIconImage(kind);
        if (image) {
          map.addImage(imageId, image, { pixelRatio: 2 });
        }
      }

      for (const location of locations) {
        const imageId = `field-label-${keyOf(location)}`;
        if (!map.hasImage(imageId)) {
          const image = createLabelImage(
            compactLabel(location),
            "resource",
          );
          if (image) map.addImage(imageId, image, { pixelRatio: 2 });
        }
      }
      const resourceData = locationFeatureCollection(locations, changedUntil, selectedKey);
      const resourceSource = map.getSource("field-resource-source") as GeoJSONSource | undefined;
      if (resourceSource) resourceSource.setData(resourceData);
      else map.addSource("field-resource-source", { type: "geojson", data: resourceData });
      if (!map.getLayer("field-resource-halo")) map.addLayer({
        id: "field-resource-halo", type: "circle", source: "field-resource-source",
        paint: {
          "circle-radius": ["case", ["boolean", ["get", "changed"], false], 16, ["boolean", ["get", "selected"], false], 14, 0],
          "circle-color": ["case", ["boolean", ["get", "selected"], false], "#1e77b4", "#ffd74f"],
          "circle-opacity": ["case", ["any", ["boolean", ["get", "changed"], false], ["boolean", ["get", "selected"], false]], 0.28, 0],
        },
      });
      for (const index of [1, 2, 3]) {
        const layerId = `field-resource-pulse-${index}`;
        if (!map.getLayer(layerId)) map.addLayer({
          id: layerId,
          type: "circle",
          source: "field-resource-source",
          paint: {
            "circle-radius": ["case", ["boolean", ["get", "changed"], false], 12, 0],
            "circle-color": "rgba(0,0,0,0)",
            "circle-stroke-color": "#00dca0",
            "circle-stroke-width": 2.6,
            "circle-stroke-opacity": 0,
          },
        });
      }
      if (!map.getLayer("field-resource-point")) map.addLayer({
        id: "field-resource-point", type: "circle", source: "field-resource-source",
        paint: {
          "circle-radius": ["case", ["==", ["get", "kind"], "personnel"], 11, 12.5],
          "circle-color": ["case",
            ["!", ["boolean", ["get", "registeredToEvent"], true]], "#d86f31",
            ["match", ["get", "category"],
              "PERSONNEL", "#35b985",
              "UAV", "#4b95e5", "MAIN_RELAY_DRONE", "#4b95e5", "SERVICE_RELAY_DRONE", "#4b95e5",
              "IR_UWB_GPR", "#e97fb5", "RSSI_DETECTOR", "#e97fb5",
              "TVWS_BASE_STATION", "#37bfd0", "TVWS_CPE", "#37bfd0", "LTE_GATEWAY", "#37bfd0",
              "PRIVATE_5G_NTN_GATEWAY", "#37bfd0", "#f0a73d"],
          ],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": ["case", ["boolean", ["get", "selected"], false], 4, 2],
        },
      });
      if (!map.getLayer("field-resource-icon")) {
        map.addLayer({
          id: "field-resource-icon",
          type: "symbol",
          source: "field-resource-source",
          layout: {
            "icon-image": ["get", "resourceIcon"],
            "icon-size": wildfireDemo ? 1.08 : 0.92,
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
        });
      }
      if (!map.getLayer("field-resource-label")) map.addLayer({
        id: "field-resource-label", type: "symbol", source: "field-resource-source",
        layout: {
          "icon-image": ["get", "labelIcon"],
          "icon-anchor": "left",
          "icon-offset": [
            "match",
            ["get", "labelSlot"],
            "uav-up", ["literal", [22, -34]],
            "crew-up", ["literal", [24, -22]],
            "crew-down", ["literal", [24, 24]],
            "vehicle-down", ["literal", [20, 26]],
            "rtk-down", ["literal", [20, 30]],
            "relay-up", ["literal", [20, -28]],
            "fire-engine-down", ["literal", [22, 30]],
            ["literal", [21, 0]],
          ],
          "icon-allow-overlap": wildfireDemo,
          "icon-ignore-placement": wildfireDemo,
          "icon-padding": 4,
        },
      });

      for (const layerId of [
        "event-origin-halo",
        "event-origin-ring",
        "event-origin-point",
        "event-origin-label",
      ]) {
        map.setLayoutProperty(
          layerId,
          "visibility",
          showEvent ? "visible" : "none",
        );
      }
      for (const layerId of [
        "field-resource-halo",
        "field-resource-pulse-1",
        "field-resource-pulse-2",
        "field-resource-pulse-3",
        "field-resource-point",
        "field-resource-icon",
        "field-resource-label",
      ]) {
        map.setLayoutProperty(
          layerId,
          "visibility",
          showResources ? "visible" : "none",
        );
      }
      // 고정 순서: 배경지도 → AI 분석 결과 → 발생지점 → 수신 펄스 → 자산·인원.
      for (const id of Object.keys(domainLayerStyle)) {
        const layerId = `domain-layer-${id}`;
        const outlineLayerId = `domain-outline-${id}`;
        if (map.getLayer(layerId)) map.moveLayer(layerId);
        if (map.getLayer(outlineLayerId)) map.moveLayer(outlineLayerId);

        const labelLayerId = `${layerId}-label`;
        if (map.getLayer(labelLayerId)) {
          map.moveLayer(labelLayerId);
        }
      }
      for (const layerId of [
        "wildfire-incident-area-fill",
        "wildfire-incident-area-outline",
        "communication-topology-active", "communication-topology-delayed", "communication-topology-disconnected", "communication-topology-label",
        "event-origin-halo", "event-origin-ring", "event-origin-point",
        "field-resource-halo", "field-resource-pulse-1", "field-resource-pulse-2", "field-resource-pulse-3",
        "field-resource-point", "field-resource-icon", "field-resource-label",
        "event-origin-label",
      ]) {
        if (map.getLayer(layerId)) map.moveLayer(layerId);
      }
    };
    const selectResource = (event: maplibregl.MapLayerMouseEvent) => {
      const key = String(event.features?.[0]?.properties?.key ?? "");
      const location = locations.find((item) => keyOf(item) === key);
      if (!location) return;
      if (singleClickTimerRef.current !== null) window.clearTimeout(singleClickTimerRef.current);
      singleClickTimerRef.current = window.setTimeout(() => {
        singleClickTimerRef.current = null;
        onLocationSelect(location);
      }, 260);
    };
    const showResourceTopology = (event: maplibregl.MapLayerMouseEvent) => {
      event.originalEvent.preventDefault();
      const key = String(event.features?.[0]?.properties?.key ?? "");
      const location = locations.find((item) => keyOf(item) === key);
      if (location) onLocationTopology(location);
    };
    const openDroneVideo = (event: maplibregl.MapLayerMouseEvent) => {
      event.preventDefault();
      event.originalEvent.preventDefault();
      event.originalEvent.stopPropagation();
      if (singleClickTimerRef.current !== null) {
        window.clearTimeout(singleClickTimerRef.current);
        singleClickTimerRef.current = null;
      }
      const key = String(event.features?.[0]?.properties?.key ?? "");
      const location = locations.find((item) => keyOf(item) === key);
      if (location && ["UAV", "MAIN_RELAY_DRONE", "SERVICE_RELAY_DRONE"].includes(location.category)) {
        onLocationDoubleClick(location);
      }
    };
    const pointer = () => { map.getCanvas().style.cursor = "pointer"; };
    const unpointer = () => { map.getCanvas().style.cursor = ""; };
    if (map.isStyleLoaded()) render(); else map.once("load", render);
    map.on("click", "field-resource-point", selectResource);
    map.on("click", "field-resource-label", selectResource);
    map.on("dblclick", "field-resource-point", openDroneVideo);
    map.on("dblclick", "field-resource-label", openDroneVideo);
    map.on("contextmenu", "field-resource-point", showResourceTopology);
    map.on("contextmenu", "field-resource-label", showResourceTopology);
    map.on("mouseenter", "field-resource-point", pointer);
    map.on("mouseenter", "field-resource-label", pointer);
    map.on("mouseleave", "field-resource-point", unpointer);
    map.on("mouseleave", "field-resource-label", unpointer);
    return () => {
      if (singleClickTimerRef.current !== null) {
        window.clearTimeout(singleClickTimerRef.current);
        singleClickTimerRef.current = null;
      }
      map.off("load", render);
      map.off("click", "field-resource-point", selectResource);
      map.off("click", "field-resource-label", selectResource);
      map.off("dblclick", "field-resource-point", openDroneVideo);
      map.off("dblclick", "field-resource-label", openDroneVideo);
      map.off("contextmenu", "field-resource-point", showResourceTopology);
      map.off("contextmenu", "field-resource-label", showResourceTopology);
      map.off("mouseenter", "field-resource-point", pointer);
      map.off("mouseenter", "field-resource-label", pointer);
      map.off("mouseleave", "field-resource-point", unpointer);
      map.off("mouseleave", "field-resource-label", unpointer);
    };
  }, [locations, changedUntil, eventCenter, onLocationDoubleClick, onLocationSelect, onLocationTopology, referenceTimeMs, selectedKey, showEvent, showResources, showTopology, topology, topologyFocusKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !wildfireDemo || !showEvent || !eventCenter) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let frame = 0;

    const animate = (now: number) => {
      const phase = reduceMotion
        ? 0.35
        : (now % 1_800) / 1_800;

      if (map.getLayer("event-origin-halo")) {
        map.setPaintProperty(
          "event-origin-halo",
          "circle-radius",
          64 + phase * 46,
        );
        map.setPaintProperty(
          "event-origin-halo",
          "circle-opacity",
          0.26 - phase * 0.20,
        );
      }

      if (map.getLayer("event-origin-ring")) {
        map.setPaintProperty(
          "event-origin-ring",
          "circle-radius",
          31 + phase * 13,
        );
        map.setPaintProperty(
          "event-origin-ring",
          "circle-stroke-opacity",
          0.95 - phase * 0.45,
        );
      }

      if (!reduceMotion) {
        frame = requestAnimationFrame(animate);
      }
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [eventCenter, showEvent, wildfireDemo]);

  useEffect(() => {
    const map = mapRef.current;
    const hasActivePulse = Object.values(changedUntil).some((until) => until > Date.now());
    if (!map || !showResources) return;
    if (!hasActivePulse) {
      if (map.getLayer("field-resource-point")) {
        map.setPaintProperty("field-resource-point", "circle-stroke-color", "#ffffff");
        map.setPaintProperty("field-resource-point", "circle-stroke-width", [
          "case", ["boolean", ["get", "selected"], false], 4, 2,
        ]);
      }
      if (map.getLayer("field-resource-halo")) {
        map.setPaintProperty("field-resource-halo", "circle-radius", [
          "case", ["boolean", ["get", "changed"], false], 16,
          ["boolean", ["get", "selected"], false], 14, 0,
        ]);
        map.setPaintProperty("field-resource-halo", "circle-color", [
          "case", ["boolean", ["get", "selected"], false], "#1e77b4", "#ffd74f",
        ]);
        map.setPaintProperty("field-resource-halo", "circle-opacity", [
          "case", ["any", ["boolean", ["get", "changed"], false], ["boolean", ["get", "selected"], false]], 0.28, 0,
        ]);
      }
      return;
    }
    const startedAt = performance.now();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let lastPaintAt = 0;
    const animate = (now: number) => {
      if (!reduceMotion && lastPaintAt > 0 && now - lastPaintAt < 33) {
        frame = requestAnimationFrame(animate);
        return;
      }
      lastPaintAt = now;
      const elapsed = reduceMotion ? 500 : now - startedAt;
      const intensity = reduceMotion ? 1 : Math.sin(Math.min(1, elapsed / highlightDurationMs) * Math.PI);
      const strokeWidth = 2 + intensity * 1.2;
      const strokeColor = `rgb(255, ${Math.round(88 + intensity * 146)}, 0)`;
      if (map.getLayer("field-resource-point")) {
        map.setPaintProperty("field-resource-point", "circle-stroke-color", strokeColor);
        map.setPaintProperty("field-resource-point", "circle-stroke-width", strokeWidth);
      }
      if (map.getLayer("field-resource-halo")) {
        map.setPaintProperty("field-resource-halo", "circle-radius", 14 + intensity * 2);
        map.setPaintProperty("field-resource-halo", "circle-color", "#ffb300");
        map.setPaintProperty("field-resource-halo", "circle-opacity", 0.12 + intensity * 0.28);
      }
      if (!reduceMotion && elapsed < highlightDurationMs) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [changedUntil, highlightDurationMs, showResources]);

  return (
    <div className={`live-map-shell${tileDegraded ? " is-tile-degraded" : ""}`}>
      <div ref={containerRef} className="live-basemap" aria-label="실시간 현장 지도" />
      <div className="basemap-switch" aria-label="지도 표현 전환">
        <button type="button" className={!mutedBasemap && !terrain3d ? "active" : ""} aria-pressed={!mutedBasemap && !terrain3d} onClick={() => { setTerrain3d(false); setMutedBasemap(false); }}>2D 지도</button>
        <button type="button" className={mutedBasemap && !terrain3d ? "active emphasis" : "emphasis"} aria-pressed={mutedBasemap && !terrain3d} onClick={() => { setTerrain3d(false); setMutedBasemap(true); }}>재난 강조</button>
        {wildfireDemo && <button type="button" className={riskHeatmap ? "active heatmap" : "heatmap"} aria-pressed={riskHeatmap} onClick={() => setRiskHeatmap((value) => !value)}>위험도</button>}
        <button type="button" className={terrain3d ? "active terrain" : "terrain"} aria-pressed={terrain3d} onClick={() => { setMutedBasemap(false); setTerrain3d((value) => !value); }}>3D 지형</button>
      </div>
      {terrain3d && <section className="terrain-analysis-status" aria-label="3D 지형 분석 상태"><b>DEM 3D</b><span>{terrainConfig.resolutionLabel} · {terrainConfig.sourceLabel}</span><small>{terrainElevationM == null ? "지도 위를 이동하면 DEM 고도를 조회합니다" : `커서 지점 고도 ${terrainElevationM.toFixed(1)}m`} · 경사·Viewshed·통신 음영</small></section>}
      <section className="map-meaning-legend command-center-legend" aria-label="지도 범례">
        <strong>지도 범례</strong>
        {wildfireDemo && <span><i className="incident" />산불 발생</span>}
        <span><i className="fireline" />화선</span>
        <span><i className="spread" />확산예측</span>
        <span><i className="risk" />위험지역</span>
        <span><i className="evacuation" />대피로</span>
        {wildfireDemo && <span><i className="heat" />위험도</span>}
        <span><i className="personnel" />인원</span>
        <span><i className="asset" />자원</span>
      </section>
      {showTopology && <section className="map-topology-hint" aria-label="통신 토폴로지 상태 범례">
        <strong>{topologyFocusKey ? "선택 마커 연결 강조" : "통신 토폴로지"}</strong>
        <span><i data-state="active" />정상</span>
        <span><i data-state="delayed" />통신 지연</span>
        <span><i data-state="disconnected" />두절 추정</span>
        <small>마커 우클릭으로 연결 강조·해제</small>
      </section>}
      {tileDegraded && <p className="tile-degraded-notice" role="status">배경지도 연결 지연 · 좌표와 현장 객체는 계속 표시합니다</p>}
    </div>
  );
}
