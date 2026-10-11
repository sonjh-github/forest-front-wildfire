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
  receivedAt: "2026-10-11T00:00:09.000Z",
};

describe("KPI 측정 출처 판정", () => {
  it("미수신 값은 측정 대기로 유지한다", () => {
    expect(assessKpiMeasurement({
      operator: "≥",
      target: 98,
      demoMode: false,
      apiStatus: { state: "EMPTY", checkedAt: "2026-10-11T00:00:10Z" },
      nowMs: now,
    }).state).toBe("WAITING");
  });

  it("DEMO 값은 명시적 DEMO 모드에서만 표시하고 PASS로 판정하지 않는다", () => {
    const row = { ...verified, sourceSystem: "DEMO", synthetic: true };
    expect(assessKpiMeasurement({ row, operator: "≥", target: 98, demoMode: false, nowMs: now }).value)
      .toBeNull();
    expect(assessKpiMeasurement({ row, operator: "≥", target: 98, demoMode: true, nowMs: now }).state)
      .toBe("DEMO");
  });

  it("브라우저 표본 계산값은 참고값이며 공식 PASS가 아니다", () => {
    expect(referenceKpiMeasurement(99.2, "브라우저 수신표본")).toMatchObject({
      state: "REFERENCE",
      official: false,
    });
  });

  it("증빙 필드가 없는 API 값은 미검증이다", () => {
    expect(assessKpiMeasurement({
      row: { metricCode: "SHARING_SUCCESS", measuredValue: 99.2 },
      operator: "≥",
      target: 98,
      demoMode: false,
      nowMs: now,
    }).state).toBe("UNVERIFIED");
  });

  it("STALE 또는 API 오류에서는 마지막 값을 현재 값으로 표시하지 않는다", () => {
    expect(assessKpiMeasurement({
      row: { ...verified, receivedAt: "2026-10-10T23:59:00.000Z" },
      operator: "≥",
      target: 98,
      demoMode: false,
      nowMs: now,
    })).toMatchObject({ state: "STALE", value: null, lastValue: 98.8 });

    expect(assessKpiMeasurement({
      row: verified,
      operator: "≥",
      target: 98,
      demoMode: false,
      apiStatus: { state: "ERROR", checkedAt: "2026-10-11T00:00:10Z" },
      nowMs: now,
    })).toMatchObject({ state: "ERROR", value: null });
  });

  it("증빙되고 최신인 API 실측값만 공식 PASS가 된다", () => {
    expect(assessKpiMeasurement({
      row: verified,
      operator: "≥",
      target: 98,
      demoMode: false,
      nowMs: now,
    })).toMatchObject({ state: "PASS", value: 98.8, official: true });
  });
});
