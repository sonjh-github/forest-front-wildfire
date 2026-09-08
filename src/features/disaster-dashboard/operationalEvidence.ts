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

function distanceToSegmentMeters(point: [number, number], start: [number, number], end: [number, number]) {
  const latitudeScale = 111_320;
  const longitudeScale = latitudeScale * Math.cos(point[1] * Math.PI / 180);
  const ax = (start[0] - point[0]) * longitudeScale;
  const ay = (start[1] - point[1]) * latitudeScale;
  const bx = (end[0] - point[0]) * longitudeScale;
  const by = (end[1] - point[1]) * latitudeScale;
  const dx = bx - ax;
  const dy = by - ay;
  const denominator = dx * dx + dy * dy;
  const ratio = denominator === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / denominator));
  return Math.hypot(ax + ratio * dx, ay + ratio * dy);
}

export function evaluateRiskZone(point: [number, number], polygon: [number, number][], warningDistanceM = 100) {
  const inside = isPointInPolygon(point, polygon);
  const boundaryDistanceM = polygon.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...polygon.map((vertex, index) => distanceToSegmentMeters(point, vertex, polygon[(index + 1) % polygon.length])));
  return { inside, boundaryDistanceM: Math.round(boundaryDistanceM), shouldAlert: inside || boundaryDistanceM <= warningDistanceM };
}

export function classifyLinkHealth(lastReceivedAt: string, now: Date, expectedIntervalSec = 3): LinkHealth {
  const ageMs = now.getTime() - Date.parse(lastReceivedAt);
  if (!Number.isFinite(ageMs) || ageMs > expectedIntervalSec * 3_000) return "DISCONNECTED";
  if (ageMs > expectedIntervalSec * 1_500) return "DELAYED";
  return "CONNECTED";
}

export type PacketSequenceSlot = {
  sequence: number;
  state: "RECEIVED" | "LOST";
  observedAt: string | null;
  receivedAt: string | null;
};

export type PacketSequenceSummary = {
  assetId: string | null;
  slots: PacketSequenceSlot[];
  fromSequence: number | null;
  toSequence: number | null;
  received: number;
  lost: number;
  expected: number;
  successPct: number | null;
  lossPct: number | null;
};

export function packetSequenceAssetIds(samples: TelemetrySample[]) {
  const latestByAsset = new Map<string, number>();

  for (const sample of samples) {
    const sequence = sample.sequence;
    if (sequence == null || !Number.isInteger(sequence)) continue;

    const timestamp = Date.parse(sample.observedAt);
    const normalized = Number.isFinite(timestamp) ? timestamp : 0;
    latestByAsset.set(
      sample.assetId,
      Math.max(latestByAsset.get(sample.assetId) ?? 0, normalized),
    );
  }

  return [...latestByAsset.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([assetId]) => assetId);
}

export function calculatePacketSequence(
  samples: TelemetrySample[],
  assetId?: string,
  maxSlots = 36,
): PacketSequenceSummary {
  const assetIds = packetSequenceAssetIds(samples);
  const selectedAssetId =
    assetId && assetIds.includes(assetId)
      ? assetId
      : assetIds[0] ?? null;

  if (!selectedAssetId) {
    return {
      assetId: null,
      slots: [],
      fromSequence: null,
      toSequence: null,
      received: 0,
      lost: 0,
      expected: 0,
      successPct: null,
      lossPct: null,
    };
  }

  const bySequence = new Map<number, TelemetrySample>();

  for (const sample of samples) {
    if (sample.assetId !== selectedAssetId) continue;

    const sequence = sample.sequence;
    if (sequence == null || !Number.isInteger(sequence)) continue;

    bySequence.set(sequence, sample);
  }

  const sequences = [...bySequence.keys()].sort((a, b) => a - b);

  if (sequences.length === 0) {
    return {
      assetId: selectedAssetId,
      slots: [],
      fromSequence: null,
      toSequence: null,
      received: 0,
      lost: 0,
      expected: 0,
      successPct: null,
      lossPct: null,
    };
  }

  const toSequence = sequences[sequences.length - 1];
  const slotLimit = Math.max(1, Math.floor(maxSlots));
  const fromSequence = Math.max(sequences[0], toSequence - slotLimit + 1);

  const slots = Array.from(
    { length: toSequence - fromSequence + 1 },
    (_, index): PacketSequenceSlot => {
      const sequence = fromSequence + index;
      const sample = bySequence.get(sequence);

      return {
        sequence,
        state: sample ? "RECEIVED" : "LOST",
        observedAt: sample?.observedAt ?? null,
        receivedAt: sample?.receivedAt ?? null,
      };
    },
  );

  const received = slots.filter((slot) => slot.state === "RECEIVED").length;
  const lost = slots.length - received;
  const expected = slots.length;

  return {
    assetId: selectedAssetId,
    slots,
    fromSequence,
    toSequence,
    received,
    lost,
    expected,
    successPct:
      expected > 0
        ? Number(((received / expected) * 100).toFixed(2))
        : null,
    lossPct:
      expected > 0
        ? Number(((lost / expected) * 100).toFixed(2))
        : null,
  };
}

export function calculatePacketSequenceMetrics(
  samples: TelemetrySample[],
  maxSlotsPerAsset = 120,
) {
  const summaries = packetSequenceAssetIds(samples).map((assetId) =>
    calculatePacketSequence(samples, assetId, maxSlotsPerAsset),
  );

  const received = summaries.reduce((sum, row) => sum + row.received, 0);
  const lost = summaries.reduce((sum, row) => sum + row.lost, 0);
  const expected = summaries.reduce((sum, row) => sum + row.expected, 0);

  return {
    assetCount: summaries.length,
    received,
    lost,
    expected,
    successPct:
      expected > 0
        ? Number(((received / expected) * 100).toFixed(2))
        : null,
    lossPct:
      expected > 0
        ? Number(((lost / expected) * 100).toFixed(2))
        : null,
  };
}

export function calculateTelemetryMetrics(
  samples: TelemetrySample[],
  expectedIntervalSec = 3,
) {
  const ordered = [...samples].sort(
    (a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt),
  );

  if (ordered.length === 0) {
    return {
      averageLatencySec: 0,
      maxGapSec: 0,
      availabilityPct: 0,
      sharingSuccessPct: 0,
      packetLossPct: null,
      sequenceReceived: 0,
      sequenceLost: 0,
      sequenceExpected: 0,
      received: 0,
      expected: 0,
    };
  }

  const latencies = ordered.map(
    (sample) =>
      Math.max(
        0,
        Date.parse(sample.receivedAt) - Date.parse(sample.observedAt),
      ) / 1_000,
  );

  const grouped = new Map<string, TelemetrySample[]>();

  for (const sample of ordered) {
    const rows = grouped.get(sample.assetId) ?? [];
    rows.push(sample);
    grouped.set(sample.assetId, rows);
  }

  const gaps: number[] = [];
  let expected = 0;

  for (const rows of grouped.values()) {
    rows.sort(
      (a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt),
    );

    for (let index = 1; index < rows.length; index += 1) {
      gaps.push(
        Math.max(
          0,
          Date.parse(rows[index].observedAt) -
            Date.parse(rows[index - 1].observedAt),
        ) / 1_000,
      );
    }

    const durationSec = Math.max(
      expectedIntervalSec,
      (Date.parse(rows.at(-1)!.observedAt) -
        Date.parse(rows[0].observedAt)) /
        1_000 +
        expectedIntervalSec,
    );

    expected += Math.max(
      1,
      Math.round(durationSec / expectedIntervalSec),
    );
  }

  const availabilityPct = Number(
    (Math.min(1, ordered.length / Math.max(1, expected)) * 100).toFixed(2),
  );

  const sequenceMetrics = calculatePacketSequenceMetrics(ordered);

  return {
    averageLatencySec: Number(
      (
        latencies.reduce((sum, value) => sum + value, 0) /
        latencies.length
      ).toFixed(3),
    ),
    maxGapSec: Number(
      (gaps.length ? Math.max(...gaps) : 0).toFixed(3),
    ),
    availabilityPct,
    sharingSuccessPct:
      sequenceMetrics.successPct ?? availabilityPct,
    packetLossPct: sequenceMetrics.lossPct,
    sequenceReceived: sequenceMetrics.received,
    sequenceLost: sequenceMetrics.lost,
    sequenceExpected: sequenceMetrics.expected,
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
  startedAt?: string;
  networkReadyAt?: string;
}) {
  const expectedIntervalSec = input.expectedIntervalSec ?? 3;
  const metrics = calculateTelemetryMetrics(input.samples, expectedIntervalSec);
  const elapsed = input.startedAt && input.networkReadyAt ? Date.parse(input.networkReadyAt) - Date.parse(input.startedAt) : NaN;
  const networkDeploymentMinutes = Number.isFinite(elapsed) && elapsed >= 0 ? Number((elapsed / 60_000).toFixed(2)) : null;
  const raw = JSON.stringify(input.samples);
  return {
    schemaVersion: "forest-kpi-evidence/v1",
    runId: input.runId,
    eventId: input.eventId,
    generatedAt: new Date().toISOString(),
    expectedIntervalSec,
    metrics: { ...metrics,
      averageLatencySec: input.samples.length ? metrics.averageLatencySec : null,
      maxGapSec: input.samples.length > 1 ? metrics.maxGapSec : null,
      availabilityPct: input.samples.length ? metrics.availabilityPct : null,
      sharingSuccessPct: input.samples.length ? metrics.sharingSuccessPct : null,
      networkDeploymentMinutes },
    measurementScope: "Received-sample estimates only; not official RFP KPI results",
    integrity: { algorithm: "FNV-1a-32", checksum: checksum(raw), sampleCount: input.samples.length },
    rawSamples: input.samples,
  };
}
