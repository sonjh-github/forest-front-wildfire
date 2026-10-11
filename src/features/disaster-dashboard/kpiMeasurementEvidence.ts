import type { ApiRecord, KpiApiStatus } from "../../http-api";

export type KpiOperator = "≤" | "≥";

export type KpiEvidenceState =
  | "PASS"
  | "FAIL"
  | "DEMO"
  | "REFERENCE"
  | "UNVERIFIED"
  | "STALE"
  | "ERROR"
  | "WAITING";

export type KpiEvidenceAssessment = {
  state: KpiEvidenceState;
  value: number | null;
  lastValue: number | null;
  source: string;
  reason: string;
  testRunId: string | null;
  official: boolean;
};

export const KPI_STALE_AFTER_MS = 15_000;

export const KPI_MEASUREMENT_INTERFACE_REQUIREMENTS = {
  required: [
    "metricCode",
    "measuredValue",
    "unit",
    "testRunId",
    "measurementSource",
    "rawLogRefs[]",
    "verificationStatus=VERIFIED",
    "receivedAt",
  ],
  freshness: `receivedAt 기준 ${KPI_STALE_AFTER_MS / 1_000}초 이내`,
  note:
    "프론트엔드는 원시로그를 생성하거나 검증하지 않습니다. Core가 원시로그 참조와 검증 상태를 제공해야 공식 판정이 가능합니다.",
} as const;

function text(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

function measuredValue(row: ApiRecord | undefined) {
  if (!row) return null;
  const value = Number(row.measuredValue);
  return Number.isFinite(value) ? value : null;
}

function isExplicitDemo(row: ApiRecord | undefined) {
  if (!row) return false;
  const source = String(
    row.measurementSource ?? row.sourceSystem ?? row.evidenceScope ?? "",
  ).toUpperCase();
  return (
    row.synthetic === true ||
    row.previewOnly === true ||
    source.includes("DEMO") ||
    source.includes("SIMULATION") ||
    source.includes("PREVIEW")
  );
}

function rawLogRefs(row: ApiRecord) {
  if (Array.isArray(row.rawLogRefs)) {
    return row.rawLogRefs.filter((value) => text(value) != null);
  }
  const single = text(row.rawLogEvidence);
  return single ? [single] : [];
}

function isFresh(row: ApiRecord, nowMs: number) {
  const receivedAt = text(row.receivedAt);
  if (!receivedAt) return false;
  const receivedMs = Date.parse(receivedAt);
  if (!Number.isFinite(receivedMs)) return false;
  const ageMs = nowMs - receivedMs;
  return ageMs >= 0 && ageMs < KPI_STALE_AFTER_MS;
}

function thresholdPassed(
  value: number,
  operator: KpiOperator,
  target: number,
) {
  return operator === "≤" ? value <= target : value >= target;
}

export function assessKpiMeasurement({
  row,
  operator,
  target,
  demoMode,
  apiStatus,
  nowMs = Date.now(),
}: {
  row?: ApiRecord;
  operator: KpiOperator;
  target: number;
  demoMode: boolean;
  apiStatus?: KpiApiStatus;
  nowMs?: number;
}): KpiEvidenceAssessment {
  const value = measuredValue(row);
  const demo = isExplicitDemo(row);
  const source = text(row?.measurementSource ?? row?.sourceSystem) ?? "출처 미확인";

  if (apiStatus?.state === "ERROR") {
    return {
      state: "ERROR",
      value: null,
      lastValue: value,
      source,
      reason: "KPI API 조회 오류로 현재 실측값을 표시하지 않습니다.",
      testRunId: null,
      official: false,
    };
  }

  if (!row || value == null) {
    return {
      state: "WAITING",
      value: null,
      lastValue: null,
      source: "측정 데이터 없음",
      reason: "Core KPI 측정값 수신 대기",
      testRunId: null,
      official: false,
    };
  }

  if (demo || demoMode) {
    if (!demoMode) {
      return {
        state: "WAITING",
        value: null,
        lastValue: value,
        source,
        reason: "DEMO 값은 명시적 DEMO 모드에서만 표시합니다.",
        testRunId: null,
        official: false,
      };
    }

    return {
      state: "DEMO",
      value,
      lastValue: value,
      source,
      reason: "DEMO 기준값이며 공식 PASS 판정 대상이 아닙니다.",
      testRunId: text(row.testRunId ?? row.testExecutionId ?? row.runId),
      official: false,
    };
  }

  const testRunId = text(row.testRunId ?? row.testExecutionId ?? row.runId);
  const measurementSource = text(row.measurementSource);
  const verificationStatus = text(row.verificationStatus)?.toUpperCase();
  const logs = rawLogRefs(row);

  if (
    !testRunId ||
    !measurementSource ||
    logs.length === 0 ||
    verificationStatus !== "VERIFIED"
  ) {
    return {
      state: "UNVERIFIED",
      value,
      lastValue: value,
      source,
      reason:
        "시험실행 ID·측정 출처·원시로그 참조·VERIFIED 상태가 모두 필요합니다.",
      testRunId,
      official: false,
    };
  }

  if (
    row.dataStatus === "STALE" ||
    row.freshnessStatus === "STALE" ||
    !isFresh(row, nowMs)
  ) {
    return {
      state: "STALE",
      value: null,
      lastValue: value,
      source: measurementSource,
      reason: "수신이 중단되었거나 측정값이 STALE 상태입니다.",
      testRunId,
      official: false,
    };
  }

  return {
    state: thresholdPassed(value, operator, target) ? "PASS" : "FAIL",
    value,
    lastValue: value,
    source: measurementSource,
    reason: `Core 검증 완료 · 원시로그 ${logs.length}건`,
    testRunId,
    official: true,
  };
}

export function referenceKpiMeasurement(
  value: number | null,
  source: string,
): KpiEvidenceAssessment {
  return {
    state: value == null ? "WAITING" : "REFERENCE",
    value,
    lastValue: value,
    source,
    reason:
      value == null
        ? "참고 표본 수신 대기"
        : "브라우저 표본 또는 수동 입력 참고값이며 공식 성능시험 결과가 아닙니다.",
    testRunId: null,
    official: false,
  };
}
