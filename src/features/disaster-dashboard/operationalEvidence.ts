export type TelemetrySample = {
  assetId: string;
  observedAt: string;
  receivedAt: string;
  latitude?: number;
  longitude?: number;
  sequence?: number;
};

export type LinkHealth = "CONNECTED" | "DELAYED" | "DISCONNECTED";

export function isPointInPolygon(point: [number, number], polygon: [number, number][]) {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
    const [xi, yi] = polygon[current];
    const [xj, yj] = polygon[previous];
    const crosses = (yi > point[1]) !== (yj > point[1])
      && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function distanceMeters(a: [number, number], b: [number, number]) {
  const toRad = (degrees: number) => degrees * Math.PI / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function evaluateRiskZone(point: [number, number], polygon: [number, number][], warningDistanceM = 100) {
  const inside = isPointInPolygon(point, polygon);
  const boundaryDistanceM = polygon.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...polygon.map((vertex) => distanceMeters(point, vertex)));
  return { inside, boundaryDistanceM: Math.round(boundaryDistanceM), shouldAlert: inside || boundaryDistanceM <= warningDistanceM };
}

export function classifyLinkHealth(lastReceivedAt: string, now: Date, expectedIntervalSec = 3): LinkHealth {
  const ageMs = now.getTime() - Date.parse(lastReceivedAt);
  if (!Number.isFinite(ageMs) || ageMs > expectedIntervalSec * 3_000) return "DISCONNECTED";
  if (ageMs > expectedIntervalSec * 1_500) return "DELAYED";
  return "CONNECTED";
}

export function calculateTelemetryMetrics(samples: TelemetrySample[], expectedIntervalSec = 3) {
  const ordered = [...samples].sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
  if (ordered.length === 0) return { averageLatencySec: 0, maxGapSec: 0, availabilityPct: 0, sharingSuccessPct: 0, received: 0, expected: 0 };
  const latencies = ordered.map((sample) => Math.max(0, Date.parse(sample.receivedAt) - Date.parse(sample.observedAt)) / 1_000);
  const gaps = ordered.slice(1).map((sample, index) => Math.max(0, Date.parse(sample.observedAt) - Date.parse(ordered[index].observedAt)) / 1_000);
  const durationSec = Math.max(expectedIntervalSec, (Date.parse(ordered.at(-1)!.observedAt) - Date.parse(ordered[0].observedAt)) / 1_000 + expectedIntervalSec);
  const expected = Math.max(1, Math.round(durationSec / expectedIntervalSec));
  const uniqueSequences = new Set(ordered.map((sample) => sample.sequence).filter((value) => value != null)).size;
  const receivedForSharing = uniqueSequences || ordered.length;
  return {
    averageLatencySec: Number((latencies.reduce((sum, value) => sum + value, 0) / latencies.length).toFixed(3)),
    maxGapSec: Number((gaps.length ? Math.max(...gaps) : 0).toFixed(3)),
    availabilityPct: Number((Math.min(1, ordered.length / expected) * 100).toFixed(2)),
    sharingSuccessPct: Number((Math.min(1, receivedForSharing / expected) * 100).toFixed(2)),
    received: ordered.length,
    expected,
  };
}

function checksum(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function buildOperationalEvidence(input: {
  eventId: string;
  runId: string;
  samples: TelemetrySample[];
  expectedIntervalSec?: number;
  startedAt: string;
  networkReadyAt: string;
}) {
  const expectedIntervalSec = input.expectedIntervalSec ?? 3;
  const metrics = calculateTelemetryMetrics(input.samples, expectedIntervalSec);
  const networkDeploymentMinutes = Number(Math.max(0, (Date.parse(input.networkReadyAt) - Date.parse(input.startedAt)) / 60_000).toFixed(2));
  const raw = JSON.stringify(input.samples);
  return {
    schemaVersion: "forest-kpi-evidence/v1",
    runId: input.runId,
    eventId: input.eventId,
    generatedAt: new Date().toISOString(),
    expectedIntervalSec,
    metrics: { ...metrics, networkDeploymentMinutes },
    integrity: { algorithm: "FNV-1a-32", checksum: checksum(raw), sampleCount: input.samples.length },
    rawSamples: input.samples,
  };
}
