import { describe, expect, it } from "vitest";
import {
  calculateNetworkDeploymentMinutes,
  calculateTimeBasedAvailability,
  createPerformanceRunId,
  filterTelemetryForSession,
} from "./performanceMeasurement";
import type { TelemetrySample } from "./operationalEvidence";

function row(second: number, sequence = second + 1): TelemetrySample {
  return {
    assetId: "CMD-01",
    sequence,
    observedAt: new Date(Date.UTC(2026, 8, 9, 0, 0, second)).toISOString(),
    receivedAt: new Date(Date.UTC(2026, 8, 9, 0, 0, second, 200)).toISOString(),
    latitude: 36.35,
    longitude: 127.38,
  };
}

describe("performance measurement session", () => {
  it("시험 실행 ID를 재현 가능한 형식으로 만든다", () => {
    expect(
      createPerformanceRunId(new Date("2026-09-09T00:01:02.345Z")),
    ).toBe("RUN-20260909-090102-345");
  });

  it("구축 시작부터 망 준비 완료까지 분 단위로 계산한다", () => {
    expect(
      calculateNetworkDeploymentMinutes(
        "2026-09-09T00:00:00Z",
        "2026-09-09T00:06:24Z",
      ),
    ).toBe(6.4);
  });

  it("시험 실행 구간 안의 텔레메트리만 분리한다", () => {
    const samples = [row(0), row(3), row(6), row(9)];
    const filtered = filterTelemetryForSession(
      samples,
      "2026-09-09T00:00:02Z",
      "2026-09-09T00:00:07Z",
    );
    expect(filtered.map((sample) => sample.sequence)).toEqual([4, 7]);
  });

  it("경과시간을 시간 슬롯으로 나눠 가용시간과 장애시간을 계산한다", () => {
    const availability = calculateTimeBasedAvailability(
      [row(1), row(4), row(10)],
      "2026-09-09T00:00:00Z",
      "2026-09-09T00:00:12Z",
      3,
    );

    expect(availability.slotCount).toBe(4);
    expect(availability.availableSlotCount).toBe(3);
    expect(availability.totalDurationSec).toBe(12);
    expect(availability.availableDurationSec).toBe(9);
    expect(availability.downtimeSec).toBe(3);
    expect(availability.availabilityPct).toBe(75);
  });
});
