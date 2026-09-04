import { useEffect, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";
import { resolveTerrainConfig } from "./terrainConfig";
import "maplibre-gl/dist/maplibre-gl.css";
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

function createLabelImage(text: string) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.font = "700 20px sans-serif";
  const width = Math.min(310, Math.ceil(context.measureText(text).width) + 24);
  canvas.width = width;
  canvas.height = 42;
  context.font = "700 20px sans-serif";
  context.fillStyle = "rgba(255,255,255,0.94)";
  context.strokeStyle = "rgba(31,55,72,0.24)";
  context.lineWidth = 2;
  context.beginPath();
  context.roundRect(1, 1, width - 2, 40, 9);
  context.fill();
  context.stroke();
  context.fillStyle = "#203543";
  context.textBaseline = "middle";
  context.fillText(text, 12, 22, width - 24);
  return context.getImageData(0, 0, width, 42);
}

const domainLayerStyle: Record<string, { type: "line" | "fill" | "circle"; color: string; opacity?: number }> = {
  firelines: { type: "line", color: "#e23f2f" },
  "spread-predictions": { type: "fill", color: "#f06432", opacity: 0.05 },
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
  "external-wildfire-risk": { type: "fill", color: "#f05c2f", opacity: 0.2 },
  "external-landslide-forecast": { type: "fill", color: "#d39a28", opacity: 0.18 },
  "external-landslide-regional-risk": { type: "fill", color: "#8550b6", opacity: 0.2 },
  "wildfire-risk-zones": { type: "fill", color: "#ef5b35", opacity: 0.12 },
  "evacuation-routes": { type: "line", color: "#16a36d", opacity: 0.95 },
  "suppression-resources": { type: "circle", color: "#1678c8", opacity: 0.9 },
  "water-sources": { type: "circle", color: "#13a9d6", opacity: 0.9 },
  "nearby-response-resources": { type: "circle", color: "#7057d9", opacity: 0.9 },
  viewsheds: { type: "fill", color: "#e8c33f", opacity: 0.12 },
  "communication-shadows": { type: "fill", color: "#394a5a", opacity: 0.26 },
  "slope-gradients": { type: "fill", color: "#a85c36", opacity: 0.18 },
};

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
  const [mutedBasemap, setMutedBasemap] = useState(false);
  const [terrain3d, setTerrain3d] = useState(false);
  const [terrainElevationM, setTerrainElevationM] = useState<number | null>(null);
  const terrainConfig = resolveTerrainConfig(import.meta.env);
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
      if (map.getLayer("osm")) map.setPaintProperty("osm", "raster-opacity", mutedBasemap ? 0.2 : 1);
    };
    if (map.isStyleLoaded()) apply(); else map.once("load", apply);
    return () => { map.off("load", apply); };
  }, [mutedBasemap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (!map.getSource("terrain-dem")) map.addSource("terrain-dem", {
        type: "raster-dem", tiles: terrainConfig.tiles,
        tileSize: terrainConfig.tileSize, encoding: terrainConfig.encoding, maxzoom: terrainConfig.maxzoom,
        attribution: terrainConfig.attribution,
      });
      map.setTerrain(terrain3d ? { source: "terrain-dem", exaggeration: 1.35 } : null);
      map.easeTo({ pitch: terrain3d ? 58 : 0, bearing: terrain3d ? -18 : 0, duration: 650 });
    };
    if (map.isStyleLoaded()) apply(); else map.once("load", apply);
    return () => { map.off("load", apply); };
  }, [terrain3d]);

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
  }, [eventCenter, focusCenter, eventId, locations]);

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
          if (style.type === "line") map.addLayer({ id: mapLayerId, type: "line", source: sourceId, paint: { "line-color": style.color, "line-width": 4, "line-opacity": 0.88 } });
          if (style.type === "fill") map.addLayer({ id: mapLayerId, type: "fill", source: sourceId, paint: { "fill-color": style.color, "fill-opacity": style.opacity ?? 0.16, "fill-outline-color": style.color } });
          if (style.type === "circle") map.addLayer({ id: mapLayerId, type: "circle", source: sourceId, paint: { "circle-color": style.color, "circle-radius":
            layerId === "victim-candidates"
              ? 11
              : layerId === "external-firms"
                ? 9
                : 7, "circle-opacity": 0.75, "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
        }
        map.setLayoutProperty(mapLayerId, "visibility", visibleLayerIds.has(layerId) ? "visible" : "none");
      }
    };
    if (map.isStyleLoaded()) render(); else map.once("load", render);
    return () => { map.off("load", render); };
  }, [domainLayers, visibleLayerIds]);

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
          properties: {},
        }] : [],
      };
      const eventSource = map.getSource("event-origin-source") as GeoJSONSource | undefined;
      if (eventSource) eventSource.setData(eventData);
      else map.addSource("event-origin-source", { type: "geojson", data: eventData });

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
        paint: { "circle-radius": 17, "circle-color": "#ed2f38", "circle-opacity": 0.18 },
      });
      if (!map.getLayer("event-origin-point")) map.addLayer({
        id: "event-origin-point", type: "circle", source: "event-origin-source",
        paint: { "circle-radius": 9, "circle-color": "#e32636", "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 },
      });
      if (!map.hasImage("event-origin-label")) {
        const image = createLabelImage("재난 발생지점");
        if (image) map.addImage("event-origin-label", image, { pixelRatio: 2 });
      }
      if (!map.getLayer("event-origin-label")) map.addLayer({
        id: "event-origin-label", type: "symbol", source: "event-origin-source",
        layout: { "icon-image": "event-origin-label", "icon-anchor": "left", "icon-offset": [13, 0], "icon-allow-overlap": false, "icon-padding": 3 },
      });

      for (const location of locations) {
        const imageId = `field-label-${keyOf(location)}`;
        if (!map.hasImage(imageId)) {
          const image = createLabelImage(compactLabel(location));
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
          "circle-radius": ["case", ["==", ["get", "kind"], "personnel"], 8, 9],
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
      if (!map.getLayer("field-resource-label")) map.addLayer({
        id: "field-resource-label", type: "symbol", source: "field-resource-source",
        layout: {
          "icon-image": ["get", "labelIcon"],
          "icon-anchor": "left",
          "icon-offset": [13, 0],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-padding": 4,
        },
      });

      for (const layerId of ["event-origin-halo", "event-origin-point", "event-origin-label"]) {
        map.setLayoutProperty(layerId, "visibility", showEvent ? "visible" : "none");
      }
      for (const layerId of ["field-resource-halo", "field-resource-pulse-1", "field-resource-pulse-2", "field-resource-pulse-3", "field-resource-point", "field-resource-label"]) {
        map.setLayoutProperty(layerId, "visibility", showResources ? "visible" : "none");
      }
      // 고정 순서: 배경지도 → AI 분석 결과 → 발생지점 → 수신 펄스 → 자산·인원.
      for (const layerId of Object.keys(domainLayerStyle).map((id) => `domain-layer-${id}`)) {
        if (map.getLayer(layerId)) map.moveLayer(layerId);
      }
      for (const layerId of [
        "communication-topology-active", "communication-topology-delayed", "communication-topology-disconnected", "communication-topology-label",
        "event-origin-halo", "event-origin-point", "event-origin-label",
        "field-resource-halo", "field-resource-pulse-1", "field-resource-pulse-2", "field-resource-pulse-3",
        "field-resource-point", "field-resource-label",
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
    const animate = (now: number) => {
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
      <div className="basemap-switch" aria-label="배경지도 전환">
        <button type="button" className={!mutedBasemap ? "active" : ""} aria-pressed={!mutedBasemap} onClick={() => setMutedBasemap(false)}>일반지도</button>
        <button type="button" className={mutedBasemap ? "active" : ""} aria-pressed={mutedBasemap} onClick={() => setMutedBasemap(true)}>정보강조</button>
        <button type="button" className={terrain3d ? "active terrain" : "terrain"} aria-pressed={terrain3d} onClick={() => setTerrain3d((value) => !value)}>3D 지형</button>
      </div>
      {terrain3d && <section className="terrain-analysis-status" aria-label="3D 지형 분석 상태"><b>DEM 3D</b><span>{terrainConfig.resolutionLabel} · {terrainConfig.sourceLabel}</span><small>{terrainElevationM == null ? "지도 위를 이동하면 DEM 고도를 조회합니다" : `커서 지점 고도 ${terrainElevationM.toFixed(1)}m`} · 경사·Viewshed·통신 음영</small></section>}
      <section className="map-meaning-legend" aria-label="지도 범례">
        <strong>범례</strong>
        <span><i className="personnel" />현장 인원</span>
        <span><i className="asset" />장비·차량</span>
        <span><i className="observed" />관측 결과</span>
        <span><i className="predicted" />AI 예측</span>
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
