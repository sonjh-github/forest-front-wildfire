import { describe, expect, it } from "vitest";
import {
  calculateInformationSharingByPayload,
  calculateInformationSharingSuccess,
  calculateNetworkDeploymentMinutes,
  calculateOfficialAvailability,
  calculatePositionUpdateStatistics,
  calculateTimeBasedAvailability,
  createPerformanceRunId,
  filterOfficialPositionSamples,
  filterTelemetryForSession,
  normalizePerformanceMeasurementSession,
  type InformationSharingAttempt,
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
  it("시험 실행 ID를 KST 기준 형식으로 만든다", () => {
    expect(
      createPerformanceRunId(new Date("2026-09-09T00:01:02.345Z")),
    ).toBe("RUN-20260909-090102-345");
  });

  it("구축팀 투입부터 망 준비 완료까지 분 단위로 계산한다", () => {
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

  it("공식 위치 갱신주기 측정은 대원·차량 표본만 사용한다", () => {
    const samples: TelemetrySample[] = [
      { ...row(0), assetId: "CREW-01", entityType: "PERSONNEL", assetType: "PERSONNEL" },
      { ...row(1), assetId: "CMD-01", entityType: "ASSET", assetType: "COMMAND_VEHICLE" },
      { ...row(2), assetId: "DRONE-01", entityType: "ASSET", assetType: "UAV" },
    ];

    expect(
      filterOfficialPositionSamples(samples).map((sample) => sample.assetId),
    ).toEqual(["CREW-01", "CMD-01"]);
  });

  it("위치 갱신 이벤트의 평균과 최대 갱신주기를 함께 계산한다", () => {
    const stats = calculatePositionUpdateStatistics([
      row(0),
      row(2),
      row(5),
    ]);
    expect(stats.intervalCount).toBe(2);
    expect(stats.averageGapSec).toBe(2.5);
    expect(stats.maxGapSec).toBe(3);
  });

  it("위치 갱신 간격의 P95를 계산한다", () => {
    let second = 0;
    const samples = [row(second, 1)];

    for (let gap = 1; gap <= 20; gap += 1) {
      second += gap;
      samples.push(row(second, gap + 1));
    }

    const stats = calculatePositionUpdateStatistics(samples);
    expect(stats.intervalCount).toBe(20);
    expect(stats.averageGapSec).toBe(10.5);
    expect(stats.p95GapSec).toBe(19);
    expect(stats.maxGapSec).toBe(20);
  });

  it("정보공유 성공률을 전송 시도 대비 성공 수신 건수로 계산한다", () => {
    const attempts: InformationSharingAttempt[] = Array.from(
      { length: 100 },
      (_, index) => ({
        transmissionId: `TX-${index + 1}`,
        attemptedAt: "2026-09-09T00:00:00Z",
        receivedAt:
          index < 99 ? "2026-09-09T00:00:01Z" : null,
        status: index < 99 ? "SUCCESS" : "FAILED",
      }),
    );
    const stats = calculateInformationSharingSuccess(attempts);
    expect(stats.attempts).toBe(100);
    expect(stats.successes).toBe(99);
    expect(stats.failures).toBe(1);
    expect(stats.successPct).toBe(99);
  });

  it("정보공유 성공률을 메시지·위치·영상 유형별로 분리한다", () => {
    const attempts: InformationSharingAttempt[] = [
      { transmissionId: "M1", attemptedAt: "2026-09-09T00:00:00Z", receivedAt: "2026-09-09T00:00:01Z", status: "SUCCESS", payloadType: "MESSAGE" },
      { transmissionId: "M2", attemptedAt: "2026-09-09T00:00:00Z", receivedAt: null, status: "FAILED", payloadType: "MESSAGE" },
      { transmissionId: "P1", attemptedAt: "2026-09-09T00:00:00Z", receivedAt: "2026-09-09T00:00:01Z", status: "SUCCESS", payloadType: "POSITION" },
      { transmissionId: "V1", attemptedAt: "2026-09-09T00:00:00Z", receivedAt: "2026-09-09T00:00:01Z", status: "SUCCESS", payloadType: "VIDEO" },
    ];

    const byPayload = calculateInformationSharingByPayload(attempts);
    expect(byPayload.MESSAGE.successPct).toBe(50);
    expect(byPayload.POSITION.successPct).toBe(100);
    expect(byPayload.VIDEO.successPct).toBe(100);
  });

  it("통신망 가용률을 총 운영시간과 서비스 중단시간 공식으로 계산한다", () => {
    const stats = calculateOfficialAvailability(
      "2026-09-09T00:00:00Z",
      "2026-09-09T00:01:40Z",
      [
        {
          startedAt: "2026-09-09T00:00:10Z",
          endedAt: "2026-09-09T00:00:15Z",
        },
        {
          startedAt: "2026-09-09T00:00:40Z",
          endedAt: "2026-09-09T00:00:43Z",
        },
      ],
    );
    expect(stats.totalOperationSec).toBe(100);
    expect(stats.downtimeSec).toBe(8);
    expect(stats.availableOperationSec).toBe(92);
    expect(stats.availabilityPct).toBe(92);
  });

  it("중첩 장애시간은 중복 합산하지 않는다", () => {
    const stats = calculateOfficialAvailability(
      "2026-09-09T00:00:00Z",
      "2026-09-09T00:01:40Z",
      [
        {
          startedAt: "2026-09-09T00:00:10Z",
          endedAt: "2026-09-09T00:00:20Z",
        },
        {
          startedAt: "2026-09-09T00:00:15Z",
          endedAt: "2026-09-09T00:00:25Z",
        },
      ],
    );
    expect(stats.downtimeSec).toBe(15);
    expect(stats.availabilityPct).toBe(85);
  });

  it("과거 세션 데이터도 공식 평가 필드를 기본값으로 보정한다", () => {
    const normalized = normalizePerformanceMeasurementSession({
      runId: "RUN-1",
      eventId: "EVENT-1",
      startedAt: "2026-09-09T00:00:00Z",
      networkReadyAt: null,
      endedAt: null,
    });
    expect(normalized.sharingAttempts).toEqual([]);
    expect(normalized.serviceInterruptions).toEqual([]);
    expect(normalized.activeServiceInterruptionStartedAt).toBeNull();
  });

  it("기존 텔레메트리 시간슬롯 가용률은 참고값으로 유지한다", () => {
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
