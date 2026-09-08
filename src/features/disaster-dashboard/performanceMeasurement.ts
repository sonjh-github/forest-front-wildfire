import type { TelemetrySample } from "./operationalEvidence";

export type PerformanceMeasurementSession = {
  runId: string;
  eventId: string;
  startedAt: string;
  networkReadyAt: string | null;
  endedAt: string | null;
};

export type TimeBasedAvailability = {
  method: "TELEMETRY_TIME_SLOT";
  totalDurationSec: number;
  availableDurationSec: number;
  downtimeSec: number;
  availabilityPct: number | null;
  sampleCount: number;
  slotCount: number;
  availableSlotCount: number;
};

export const PERFORMANCE_INTERFACE_REQUIREMENTS = {
  telemetryRequired: [
    "assetId",
    "sequence",
    "observedAt",
    "receivedAt",
  ],
  positionRequired: [
    "latitude",
    "longitude",
  ],
  sessionRequired: [
    "runId",
    "eventId",
    "startedAt",
    "networkReadyAt",
  ],
  recommended: [
    "networkId",
    "networkType",
    "linkStatus",
  ],
} as const;

function parsedMs(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sampleTimeMs(sample: TelemetrySample) {
  return parsedMs(sample.receivedAt) ?? parsedMs(sample.observedAt);
}

export function createPerformanceRunId(at = new Date()) {
  // 시험 현장 표시는 한국 표준시(KST, UTC+9)를 기준으로 고정한다.
  // 실행 환경/CI 타임존과 관계없이 화면 시각과 runId 날짜가 일치한다.
  const kst = new Date(at.getTime() + 9 * 60 * 60 * 1_000);
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");
  const date = [
    kst.getUTCFullYear(),
    pad(kst.getUTCMonth() + 1),
    pad(kst.getUTCDate()),
  ].join("");
  const time = [
    pad(kst.getUTCHours()),
    pad(kst.getUTCMinutes()),
    pad(kst.getUTCSeconds()),
  ].join("");
  return `RUN-${date}-${time}-${pad(kst.getUTCMilliseconds(), 3)}`;
}

export function calculateNetworkDeploymentMinutes(
  startedAt: string | null | undefined,
  networkReadyAt: string | null | undefined,
) {
  const start = parsedMs(startedAt);
  const ready = parsedMs(networkReadyAt);
  if (start == null || ready == null || ready < start) return null;
  return Number(((ready - start) / 60_000).toFixed(2));
}

export function filterTelemetryForSession(
  samples: TelemetrySample[],
  startedAt: string,
  endedAt: string,
) {
  const start = parsedMs(startedAt);
  const end = parsedMs(endedAt);
  if (start == null || end == null || end < start) return [];

  return samples.filter((sample) => {
    const timestamp = sampleTimeMs(sample);
    return timestamp != null && timestamp >= start && timestamp <= end;
  });
}

export function calculateTimeBasedAvailability(
  samples: TelemetrySample[],
  startedAt: string,
  endedAt: string,
  expectedIntervalSec = 3,
): TimeBasedAvailability {
  const start = parsedMs(startedAt);
  const end = parsedMs(endedAt);
  const intervalSec =
    Number.isFinite(expectedIntervalSec) && expectedIntervalSec > 0
      ? expectedIntervalSec
      : 3;

  if (start == null || end == null || end <= start) {
    return {
      method: "TELEMETRY_TIME_SLOT",
      totalDurationSec: 0,
      availableDurationSec: 0,
      downtimeSec: 0,
      availabilityPct: null,
      sampleCount: 0,
      slotCount: 0,
      availableSlotCount: 0,
    };
  }

  const slotMs = intervalSec * 1_000;
  const totalMs = end - start;
  const slotCount = Math.max(1, Math.ceil(totalMs / slotMs));
  const availableSlots = new Set<number>();
  let sampleCount = 0;

  for (const sample of samples) {
    const timestamp = sampleTimeMs(sample);
    if (timestamp == null || timestamp < start || timestamp > end) continue;
    sampleCount += 1;
    const slot = Math.min(
      slotCount - 1,
      Math.max(0, Math.floor((timestamp - start) / slotMs)),
    );
    availableSlots.add(slot);
  }

  let availableMs = 0;
  for (const slot of availableSlots) {
    const slotStart = start + slot * slotMs;
    const slotEnd = Math.min(end, slotStart + slotMs);
    availableMs += Math.max(0, slotEnd - slotStart);
  }

  const downtimeMs = Math.max(0, totalMs - availableMs);
  const availabilityPct = Number(
    ((availableMs / totalMs) * 100).toFixed(2),
  );

  return {
    method: "TELEMETRY_TIME_SLOT",
    totalDurationSec: Number((totalMs / 1_000).toFixed(2)),
    availableDurationSec: Number((availableMs / 1_000).toFixed(2)),
    downtimeSec: Number((downtimeMs / 1_000).toFixed(2)),
    availabilityPct,
    sampleCount,
    slotCount,
    availableSlotCount: availableSlots.size,
  };
}
