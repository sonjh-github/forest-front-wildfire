import type { TelemetrySample } from "./operationalEvidence";

export type InformationSharingAttempt = {
  transmissionId: string;
  attemptedAt: string;
  receivedAt: string | null;
  status: "SUCCESS" | "FAILED";
};

export type ServiceInterruption = {
  startedAt: string;
  endedAt: string | null;
};

export type PerformanceMeasurementSession = {
  runId: string;
  eventId: string;
  startedAt: string;
  networkReadyAt: string | null;
  endedAt: string | null;
  sharingAttempts: InformationSharingAttempt[];
  serviceInterruptions: ServiceInterruption[];
  activeServiceInterruptionStartedAt: string | null;
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

export type PositionUpdateStatistics = {
  sampleCount: number;
  assetCount: number;
  intervalCount: number;
  averageGapSec: number | null;
  maxGapSec: number | null;
};

export type InformationSharingStatistics = {
  attempts: number;
  successes: number;
  failures: number;
  successPct: number | null;
};

export type OfficialAvailability = {
  method: "SERVICE_INTERRUPTION";
  totalOperationSec: number;
  availableOperationSec: number;
  downtimeSec: number;
  availabilityPct: number | null;
  interruptionCount: number;
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
    "startedAt(teamDeployedAt)",
    "networkReadyAt",
  ],
  sharingRequired: [
    "transmissionId",
    "attemptedAt",
    "deliveryStatus(SUCCESS|FAILED)",
    "receivedAt|ackAt",
  ],
  availabilityRequired: [
    "networkId",
    "linkStatus(UP|DOWN)",
    "statusChangedAt",
  ],
  recommended: [
    "networkType",
    "reasonCode",
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

export function normalizePerformanceMeasurementSession(
  value: Partial<PerformanceMeasurementSession>,
): PerformanceMeasurementSession {
  return {
    runId: String(value.runId ?? ""),
    eventId: String(value.eventId ?? ""),
    startedAt: String(value.startedAt ?? ""),
    networkReadyAt: value.networkReadyAt ?? null,
    endedAt: value.endedAt ?? null,
    sharingAttempts: Array.isArray(value.sharingAttempts)
      ? value.sharingAttempts
      : [],
    serviceInterruptions: Array.isArray(value.serviceInterruptions)
      ? value.serviceInterruptions
      : [],
    activeServiceInterruptionStartedAt:
      value.activeServiceInterruptionStartedAt ?? null,
  };
}

export function createPerformanceRunId(at = new Date()) {
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

export function calculatePositionUpdateStatistics(
  samples: TelemetrySample[],
): PositionUpdateStatistics {
  const grouped = new Map<string, number[]>();

  for (const sample of samples) {
    const timestamp = sampleTimeMs(sample);
    if (timestamp == null) continue;
    const rows = grouped.get(sample.assetId) ?? [];
    rows.push(timestamp);
    grouped.set(sample.assetId, rows);
  }

  const gapsSec: number[] = [];
  let sampleCount = 0;

  for (const rows of grouped.values()) {
    rows.sort((a, b) => a - b);
    sampleCount += rows.length;
    for (let index = 1; index < rows.length; index += 1) {
      gapsSec.push(Math.max(0, rows[index] - rows[index - 1]) / 1_000);
    }
  }

  return {
    sampleCount,
    assetCount: grouped.size,
    intervalCount: gapsSec.length,
    averageGapSec:
      gapsSec.length > 0
        ? Number(
            (
              gapsSec.reduce((sum, value) => sum + value, 0) /
              gapsSec.length
            ).toFixed(3),
          )
        : null,
    maxGapSec:
      gapsSec.length > 0
        ? Number(Math.max(...gapsSec).toFixed(3))
        : null,
  };
}

export function calculateInformationSharingSuccess(
  attempts: InformationSharingAttempt[],
): InformationSharingStatistics {
  const successes = attempts.filter(
    (attempt) => attempt.status === "SUCCESS",
  ).length;
  const failures = attempts.length - successes;

  return {
    attempts: attempts.length,
    successes,
    failures,
    successPct:
      attempts.length > 0
        ? Number(((successes / attempts.length) * 100).toFixed(2))
        : null,
  };
}

export function calculateOfficialAvailability(
  operationStartedAt: string,
  operationEndedAt: string,
  interruptions: ServiceInterruption[],
  activeInterruptionStartedAt: string | null = null,
): OfficialAvailability {
  const start = parsedMs(operationStartedAt);
  const end = parsedMs(operationEndedAt);

  if (start == null || end == null || end <= start) {
    return {
      method: "SERVICE_INTERRUPTION",
      totalOperationSec: 0,
      availableOperationSec: 0,
      downtimeSec: 0,
      availabilityPct: null,
      interruptionCount: 0,
    };
  }

  const ranges: Array<[number, number]> = [];

  for (const interruption of interruptions) {
    const rawStart = parsedMs(interruption.startedAt);
    const rawEnd = parsedMs(interruption.endedAt);
    if (rawStart == null || rawEnd == null || rawEnd <= rawStart) continue;
    const clampedStart = Math.max(start, rawStart);
    const clampedEnd = Math.min(end, rawEnd);
    if (clampedEnd > clampedStart) {
      ranges.push([clampedStart, clampedEnd]);
    }
  }

  const activeStart = parsedMs(activeInterruptionStartedAt);
  if (activeStart != null && end > activeStart) {
    const clampedStart = Math.max(start, activeStart);
    if (end > clampedStart) ranges.push([clampedStart, end]);
  }

  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];

  for (const range of ranges) {
    const previous = merged.at(-1);
    if (!previous || range[0] > previous[1]) {
      merged.push([...range]);
    } else {
      previous[1] = Math.max(previous[1], range[1]);
    }
  }

  const downtimeMs = merged.reduce(
    (sum, [rangeStart, rangeEnd]) => sum + rangeEnd - rangeStart,
    0,
  );
  const totalMs = end - start;
  const availableMs = Math.max(0, totalMs - downtimeMs);

  return {
    method: "SERVICE_INTERRUPTION",
    totalOperationSec: Number((totalMs / 1_000).toFixed(2)),
    availableOperationSec: Number((availableMs / 1_000).toFixed(2)),
    downtimeSec: Number((downtimeMs / 1_000).toFixed(2)),
    availabilityPct: Number(
      ((availableMs / totalMs) * 100).toFixed(2),
    ),
    interruptionCount: merged.length,
  };
}

// 기존 시간슬롯 방식은 브라우저 텔레메트리 참고값 전용.
// 공식 통신망 가용률 판정에는 calculateOfficialAvailability를 사용한다.
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
