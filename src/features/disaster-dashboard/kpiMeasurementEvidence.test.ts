import { describe, expect, it } from "vitest";
import {
  assessKpiMeasurement,
  referenceKpiMeasurement,
} from "./kpiMeasurementEvidence";

const now = Date.parse("2026-10-11T00:00:10.000Z");

const verified = {
  metricCode: "SHARING_SUCCESS",
  measuredValue: 98.8,
  unit: "%",
  testRunId: "RUN-20261011-001",
  measurementSource: "CORE_MEASUREMENT_API",
  rawLogRefs: ["s3://evidence/run-001/raw.ndjson"],
  verificationStatus: "VERIFIED",
  evidenceVerificationStatus: "VERIFIED",
  receivedAt: "2026-10-11T00:00:09.000Z",
};

function assess(
  row?: Record<string, unknown>,
  options: { demoMode?: boolean; apiError?: boolean } = {},
) {
  return assessKpiMeasurement({
    row,
    expectedMetricCode: "SHARING_SUCCESS",
    expectedUnit: "%",
    operator: "≥",
    target: 98,
    demoMode: options.demoMode ?? false,
    apiStatus: options.apiError
      ? { state: "ERROR", checkedAt: "2026-10-11T00:00:10Z" }
      : undefined,
    nowMs: now,
  });
}

describe("KPI 측정 출처 판정", () => {
  it("미수신 값은 측정 대기로 유지한다", () => {
    expect(assess()).toMatchObject({ state: "WAITING", value: null, official: false });
  });

  it.each([
    null,
    undefined,
    "",
    "   ",
    "not-a-number",
    Number.NaN,
    Number.POSITIVE_INFINITY,
    true,
  ])(
    "측정값 %p는 0으로 변환하지 않고 측정 대기로 처리한다",
    (measuredValue) => {
      expect(assess({ ...verified, measuredValue })).toMatchObject({
        state: "WAITING",
        value: null,
        official: false,
      });
    },
  );

  it("DEMO 값은 명시적 DEMO 모드에서만 표시하고 PASS로 판정하지 않는다", () => {
    const row = { ...verified, sourceSystem: "DEMO", synthetic: true };
    expect(assess(row).value).toBeNull();
    expect(assess(row, { demoMode: true })).toMatchObject({
      state: "DEMO",
      value: 98.8,
      official: false,
    });
  });

  it("브라우저 표본 계산값은 참고값이며 공식 PASS가 아니다", () => {
    expect(referenceKpiMeasurement(99.2, "브라우저 수신표본")).toMatchObject({
      state: "REFERENCE",
      official: false,
    });
  });

  it("지표 코드 또는 단위가 기대값과 다르면 미검증이다", () => {
    expect(assess({ ...verified, metricCode: "NETWORK_AVAILABILITY" })).toMatchObject({
      state: "UNVERIFIED",
      official: false,
    });
    expect(assess({ ...verified, unit: "초" })).toMatchObject({
      state: "UNVERIFIED",
      official: false,
    });
  });

  it("원시로그 참조만 있고 Core 증빙 검증 상태가 없으면 미검증이다", () => {
    const { evidenceVerificationStatus: _, ...referenceOnly } = verified;
    expect(assess(referenceOnly)).toMatchObject({ state: "UNVERIFIED", official: false });
  });

  it("증빙 필드가 없는 API 값은 미검증이다", () => {
    expect(assess({ metricCode: "SHARING_SUCCESS", measuredValue: 99.2, unit: "%" }).state)
      .toBe("UNVERIFIED");
  });

  it("실시간 수신 중단 시 마지막 값을 현재 값으로 표시하지 않는다", () => {
    expect(assess({ ...verified, receivedAt: "2026-10-10T23:59:00.000Z" }))
      .toMatchObject({ state: "STALE", value: null, lastValue: 98.8 });
  });

  it("API 오류 시 마지막 값을 현재 값으로 표시하지 않는다", () => {
    expect(assess(verified, { apiError: true })).toMatchObject({
      state: "ERROR",
      value: null,
      lastValue: 98.8,
      official: false,
    });
  });

  it("완료되고 Core 검증이 유효한 시험은 과거 receivedAt만으로 STALE 처리하지 않는다", () => {
    expect(assess({
      ...verified,
      testRunStatus: "COMPLETED",
      completedAt: "2026-10-10T12:00:00.000Z",
      receivedAt: "2026-10-10T12:00:01.000Z",
    })).toMatchObject({ state: "PASS", value: 98.8, official: true });
  });

  it("완료 시험의 Core 검증 유효기간이 끝나면 공식 판정하지 않는다", () => {
    expect(assess({
      ...verified,
      testRunStatus: "COMPLETED",
      completedAt: "2026-10-10T12:00:00.000Z",
      verificationValidUntil: "2026-10-10T23:59:59.000Z",
    })).toMatchObject({ state: "UNVERIFIED", official: false });
  });

  it("증빙되고 최신인 API 실측값만 공식 PASS가 된다", () => {
    expect(assess(verified)).toMatchObject({ state: "PASS", value: 98.8, official: true });
  });
});
