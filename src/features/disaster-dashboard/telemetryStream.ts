import type { ApiRecord, EventOverview } from "../../http-api";
import { evaluateRiskZone } from "./operationalEvidence";

export type TelemetryStreamStatus = "DISABLED" | "CONNECTING" | "CONNECTED" | "RECONNECTING" | "ERROR";

export type LiveTelemetryMessage = {
  assetId: string;
  eventId?: string;
  observedAt: string;
  receivedAt?: string;
  sequence?: number;
  latitude: number;
  longitude: number;
  altitude?: number;
  assetType?: string;
  operationalStatus?: string;
  positioningMethod?: string;
  horizontalAccuracyM?: number;
  batteryPct?: number;
  signalStrengthDbm?: number;
  latencyMs?: number;
  packetLossPct?: number;
  reportedByAssetId?: string;
  activeLink?: string;
  attributes?: Record<string, unknown>;
};

function finite(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function parseTelemetryMessage(raw: unknown): LiveTelemetryMessage | null {
  let value = raw;
  if (typeof raw === "string") {
    try { value = JSON.parse(raw); } catch { return null; }
  }
  if (!value || typeof value !== "object") return null;
  const envelope = value as Record<string, unknown>;
  const row = (envelope.data && typeof envelope.data === "object" ? envelope.data : envelope) as Record<string, unknown>;
  const coordinates = (row.geometry as { coordinates?: unknown[] } | undefined)?.coordinates;
  const longitude = finite(row.longitude ?? row.lng ?? coordinates?.[0]);
  const latitude = finite(row.latitude ?? row.lat ?? coordinates?.[1]);
  const assetId = String(row.assetId ?? row.sourceAssetId ?? "").trim();
  const observedAt = String(row.observedAt ?? row.timestamp ?? "").trim();
  if (!assetId || longitude == null || latitude == null || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90 || !Number.isFinite(Date.parse(observedAt))) return null;
  return {
    assetId, eventId: row.eventId ? String(row.eventId) : undefined, observedAt,
    receivedAt: row.receivedAt ? String(row.receivedAt) : new Date().toISOString(),
    sequence: finite(row.sequence), longitude, latitude, altitude: finite(row.altitude ?? coordinates?.[2]),
    assetType: row.assetType ? String(row.assetType) : undefined,
    operationalStatus: row.operationalStatus ? String(row.operationalStatus) : undefined,
    positioningMethod: row.positioningMethod ? String(row.positioningMethod) : undefined,
    horizontalAccuracyM: finite(row.horizontalAccuracyM), batteryPct: finite(row.batteryPct),
    signalStrengthDbm: finite(row.signalStrengthDbm), latencyMs: finite(row.latencyMs),
    packetLossPct: finite(row.packetLossPct), reportedByAssetId: row.reportedByAssetId ? String(row.reportedByAssetId) : undefined,
    activeLink: row.activeLink ? String(row.activeLink) : undefined,
    attributes: row.attributes && typeof row.attributes === "object" ? row.attributes as Record<string, unknown> : undefined,
  };
}

export class MavlinkTelemetryAccumulator {
  private states = new Map<string, Partial<LiveTelemetryMessage>>();

  push(raw: unknown): LiveTelemetryMessage | null {
    let value = raw;
    if (typeof raw === "string") {
      try { value = JSON.parse(raw); } catch { return null; }
    }
    if (!value || typeof value !== "object") return null;
    const envelope = value as Record<string, unknown>;
    if (String(envelope.protocol ?? "").toUpperCase() !== "MAVLINK") return null;
    const message = (envelope.message && typeof envelope.message === "object" ? envelope.message : envelope) as Record<string, unknown>;
    const assetId = String(envelope.assetId ?? message.assetId ?? "").trim();
    if (!assetId) return null;
    const current = this.states.get(assetId) ?? { assetId, assetType: "UAV" };
    const type = String(message.type ?? message.messageType ?? "").toUpperCase();
    const observedAt = String(envelope.observedAt ?? envelope.receivedAt ?? new Date().toISOString());
    const next: Partial<LiveTelemetryMessage> = { ...current, assetId, eventId: envelope.eventId ? String(envelope.eventId) : current.eventId, observedAt, receivedAt: envelope.receivedAt ? String(envelope.receivedAt) : new Date().toISOString(), sequence: finite(envelope.sequence) ?? current.sequence };
    if (type === "GLOBAL_POSITION_INT") {
      const latitude = finite(message.lat);
      const longitude = finite(message.lon);
      if (latitude != null) next.latitude = latitude / 10_000_000;
      if (longitude != null) next.longitude = longitude / 10_000_000;
      const altitudeMm = finite(message.relative_alt ?? message.alt);
      if (altitudeMm != null) next.altitude = altitudeMm / 1_000;
      const heading = finite(message.hdg);
      const vx = finite(message.vx);
      const vy = finite(message.vy);
      next.attributes = { ...next.attributes, headingDeg: heading == null || heading === 65535 ? undefined : heading / 100, groundSpeedMps: vx == null || vy == null ? undefined : Math.hypot(vx, vy) / 100 };
    } else if (type === "HEARTBEAT") {
      const baseMode = finite(message.base_mode) ?? 0;
      next.operationalStatus = (baseMode & 128) !== 0 ? "FLYING" : "READY";
      next.attributes = { ...next.attributes, armed: (baseMode & 128) !== 0, flightMode: String(message.flightMode ?? message.custom_mode ?? "UNKNOWN") };
    } else if (type === "SYS_STATUS") {
      next.batteryPct = finite(message.battery_remaining);
      next.attributes = { ...next.attributes, voltageBatteryMv: finite(message.voltage_battery) };
    } else if (type === "GPS_RAW_INT") {
      const fixType = finite(message.fix_type) ?? 0;
      next.positioningMethod = fixType >= 6 ? "RTK_FIXED" : fixType === 5 ? "RTK_FLOAT" : fixType >= 3 ? "GNSS" : "NO_FIX";
      const eph = finite(message.eph);
      if (eph != null && eph !== 65535) next.horizontalAccuracyM = eph / 100;
      next.attributes = { ...next.attributes, satellitesVisible: finite(message.satellites_visible) };
    } else if (type === "MISSION_CURRENT") {
      next.attributes = { ...next.attributes, missionSequence: finite(message.seq) };
    } else return null;
    this.states.set(assetId, next);
    if (next.latitude == null || next.longitude == null) return null;
    return parseTelemetryMessage(next);
  }
}

export function mergeTelemetryIntoOverview(overview: EventOverview, message: LiveTelemetryMessage): EventOverview {
  if (message.eventId && message.eventId !== overview.event.eventId) return overview;
  const existingIndex = overview.assets.findIndex((asset) => String(asset.assetId) === message.assetId);
  const previous = existingIndex >= 0 ? overview.assets[existingIndex] : {};
  if (previous.observedAt && Date.parse(String(previous.observedAt)) > Date.parse(message.observedAt)) return overview;
  const asset: ApiRecord = {
    ...previous, ...message,
    assetId: message.assetId,
    assetName: previous.assetName ?? message.assetId,
    assetType: message.assetType ?? previous.assetType ?? "ASSET",
    operationalStatus: message.operationalStatus ?? previous.operationalStatus ?? "ACTIVE",
    geometry: { type: "Point", coordinates: [message.longitude, message.latitude, message.altitude ?? null] },
    sourceSystem: "GATEWAY_STREAM",
    sourceAssetId: message.assetId,
    reportingRole: "GATEWAY",
    attributes: { ...(previous.attributes as Record<string, unknown> | undefined), ...message.attributes },
  };
  const assets = [...overview.assets];
  if (existingIndex >= 0) assets[existingIndex] = asset; else assets.push(asset);
  return { ...overview, assets };
}

function riskPolygons(overview: EventOverview): [number, number][][] {
  return ["wildfire-risk-zones", "spread-predictions", "slope-assessments"].flatMap((layerId) =>
    (overview.domainLayers[layerId] ?? []).flatMap((row) => {
      const candidate = (row.resultGeometry ?? row.predictedArea ?? row.geometry) as { type?: string; coordinates?: unknown } | undefined;
      if (candidate?.type !== "Polygon" || !Array.isArray(candidate.coordinates)) return [];
      const ring = candidate.coordinates[0];
      if (!Array.isArray(ring)) return [];
      const polygon = ring.flatMap((coordinate) => Array.isArray(coordinate) && Number.isFinite(Number(coordinate[0])) && Number.isFinite(Number(coordinate[1])) ? [[Number(coordinate[0]), Number(coordinate[1])] as [number, number]] : []);
      return polygon.length >= 3 ? [polygon] : [];
    }),
  );
}

export function applyTelemetrySafetyRules(overview: EventOverview, message: LiveTelemetryMessage, warningDistanceM = 100): EventOverview {
  const merged = mergeTelemetryIntoOverview(overview, message);
  if (merged === overview || riskPolygons(merged).length === 0) return merged;
  const evaluations = riskPolygons(merged).map((polygon) => evaluateRiskZone([message.longitude, message.latitude], polygon, warningDistanceM));
  const nearest = evaluations.find((evaluation) => evaluation.inside)
    ?? evaluations.sort((a, b) => a.boundaryDistanceM - b.boundaryDistanceM)[0];
  const alertId = `ALT-GEOFENCE-${message.assetId}`;
  const previousIndex = merged.alerts.findIndex((alert) => alert.alertId === alertId);
  const alerts = [...merged.alerts];
  if (nearest.shouldAlert) {
    const alert: ApiRecord = {
      alertId, severity: nearest.inside ? "CRITICAL" : "WARNING", status: "ACTIVE",
      title: nearest.inside ? "현장 자산 위험구역 진입" : "현장 자산 위험구역 접근",
      message: `${message.assetId}가 위험구역 ${nearest.inside ? "내부에 진입" : `경계 ${nearest.boundaryDistanceM}m 이내에 접근`}했습니다. 지정 대피로와 현장 안전을 확인하세요.`,
      issuedAt: message.receivedAt ?? new Date().toISOString(), issuerOrgCode: "공간판정 엔진", sourceAssetId: message.assetId,
    };
    if (previousIndex >= 0) alerts[previousIndex] = alert; else alerts.unshift(alert);
  } else if (previousIndex >= 0 && alerts[previousIndex].status !== "RESOLVED") {
    alerts[previousIndex] = { ...alerts[previousIndex], status: "RESOLVED", resolvedAt: message.receivedAt ?? new Date().toISOString(), message: `${message.assetId}가 위험구역 경계를 벗어났습니다.` };
  }
  return { ...merged, alerts };
}

type SocketLike = Pick<WebSocket, "close" | "send" | "readyState" | "onopen" | "onclose" | "onerror" | "onmessage">;

export class TelemetryStreamClient {
  private socket: SocketLike | null = null;
  private reconnectTimer: number | null = null;
  private attempts = 0;
  private stopped = false;
  private lastSequence = new Map<string, number>();
  private mavlink = new MavlinkTelemetryAccumulator();

  constructor(private options: {
    url: string;
    eventId: string;
    onMessage: (message: LiveTelemetryMessage) => void;
    onStatus: (status: TelemetryStreamStatus) => void;
    createSocket?: (url: string) => SocketLike;
  }) {}

  connect() {
    this.stopped = false;
    this.options.onStatus(this.attempts ? "RECONNECTING" : "CONNECTING");
    const createSocket = this.options.createSocket ?? ((url: string) => new WebSocket(url));
    try { this.socket = createSocket(this.options.url); } catch { this.scheduleReconnect(); return; }
    this.socket.onopen = () => {
      this.attempts = 0;
      this.options.onStatus("CONNECTED");
      this.socket?.send(JSON.stringify({ type: "SUBSCRIBE", eventId: this.options.eventId }));
    };
    this.socket.onmessage = (event) => {
      const message = this.mavlink.push(event.data) ?? parseTelemetryMessage(event.data);
      if (!message || (message.eventId && message.eventId !== this.options.eventId)) return;
      const previous = this.lastSequence.get(message.assetId);
      if (message.sequence != null && previous != null && message.sequence <= previous) return;
      if (message.sequence != null) this.lastSequence.set(message.assetId, message.sequence);
      this.options.onMessage(message);
    };
    this.socket.onerror = () => this.options.onStatus("ERROR");
    this.socket.onclose = () => { if (!this.stopped) this.scheduleReconnect(); };
  }

  private scheduleReconnect() {
    if (this.stopped) return;
    this.attempts += 1;
    this.options.onStatus("RECONNECTING");
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(this.attempts - 1, 5));
    this.reconnectTimer = window.setTimeout(() => this.connect(), delay);
  }

  stop() {
    this.stopped = true;
    if (this.reconnectTimer != null) window.clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = null;
  }
}
