import { useEffect, useMemo, useState } from "react";
import type { ApiRecord, EventOverview } from "../../http-api";
import {
  buildOperationalEvidence,
  calculatePacketSequence,
  calculatePacketSequenceMetrics,
  calculateTelemetryMetrics,
  packetSequenceAssetIds,
  type TelemetrySample,
} from "./operationalEvidence";
import {
  calculateInformationSharingSuccess,
  calculateNetworkDeploymentMinutes,
  calculateOfficialAvailability,
  calculatePositionUpdateStatistics,
  createPerformanceRunId,
  filterOfficialPositionSamples,
  filterTelemetryForSession,
  normalizePerformanceMeasurementSession,
  PERFORMANCE_INTERFACE_REQUIREMENTS,
  type InformationSharingAttempt,
  type PerformanceMeasurementSession,
  type SharingPayloadType,
} from "./performanceMeasurement";
import {
  OFFICIAL_RFP_BASELINE,
  PROJECT_ENHANCED_TARGET,
} from "./officialRfpGaps";
import "./performance-kpi-panel.css";

type Props = {
  overview: EventOverview;
  telemetrySamples: TelemetrySample[];
};

type Operator = "≤" | "≥";

type MetricCard = {
  id: string;
  label: string;
  value: number | null;
  unit: string;
  operator: Operator;
  target: number;
  officialTarget: number;
  source: string;
  note: string;
};

function measuredNumber(row: ApiRecord | undefined) {
  if (!row) return null;
  const value = Number(row.measuredValue);
  return Number.isFinite(value) ? value : null;
}

function metricByCode(overview: EventOverview, code: string) {
  return overview.kpis.find(
    (row) => String(row.metricCode ?? "") === code,
  ) as ApiRecord | undefined;
}

function evaluate(value: number | null, operator: Operator, target: number) {
  if (value == null) return null;
  return operator === "≤" ? value <= target : value >= target;
}

function displayValue(value: number | null, unit: string) {
  if (value == null) return "측정 대기";
  return `${value.toLocaleString("ko-KR", {
    maximumFractionDigits: 2,
  })}${unit}`;
}

function displayTime(value: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "-";
  return parsed.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function displayDuration(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const remain = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
}

function loadStoredSession(key: string): PerformanceMeasurementSession | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PerformanceMeasurementSession;
    return parsed?.runId && parsed?.startedAt
      ? normalizePerformanceMeasurementSession(parsed)
      : null;
  } catch {
    return null;
  }
}

function downloadJson(fileName: string, payload: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function PerformanceKpiPanel({
  overview,
  telemetrySamples,
}: Props) {
  const demoMode = overview.domainDetail?.mode === "SIMULATION";
  const eventId = String(overview.event.eventId);
  const storageKey = `forest-performance-session:${eventId}`;

  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [session, setSession] =
    useState<PerformanceMeasurementSession | null>(
      () => loadStoredSession(storageKey),
    );
  const [clockMs, setClockMs] = useState(Date.now());

  useEffect(() => {
    setSession(loadStoredSession(storageKey));
  }, [storageKey]);

  useEffect(() => {
    try {
      if (session) {
        window.sessionStorage.setItem(storageKey, JSON.stringify(session));
      } else {
        window.sessionStorage.removeItem(storageKey);
      }
    } catch {
      // sessionStorage가 차단된 환경에서도 측정은 계속 진행한다.
    }
  }, [session, storageKey]);

  useEffect(() => {
    if (!session || session.endedAt) return;
    setClockMs(Date.now());
    const timer = window.setInterval(() => setClockMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [session]);

  const telemetryMetrics = useMemo(
    () => calculateTelemetryMetrics(telemetrySamples, 3),
    [telemetrySamples],
  );

  const packetMetrics = useMemo(
    () => calculatePacketSequenceMetrics(telemetrySamples, 120),
    [telemetrySamples],
  );

  const assetIds = useMemo(
    () => packetSequenceAssetIds(telemetrySamples),
    [telemetrySamples],
  );

  useEffect(() => {
    if (
      assetIds.length > 0 &&
      (!selectedAssetId || !assetIds.includes(selectedAssetId))
    ) {
      setSelectedAssetId(assetIds[0]);
    }
  }, [assetIds, selectedAssetId]);

  const sequence = useMemo(
    () =>
      calculatePacketSequence(
        telemetrySamples,
        selectedAssetId || undefined,
        100,
      ),
    [selectedAssetId, telemetrySamples],
  );

  const sequenceDisplaySlots = useMemo(() => {
    if (sequence.toSequence == null) return [];

    const startSequence =
      sequence.toSequence <= 100
        ? 1
        : sequence.toSequence - 99;

    const known = new Map(
      sequence.slots.map((slot) => [slot.sequence, slot]),
    );

    return Array.from({ length: 100 }, (_, index) => {
      const sequenceNumber = startSequence + index;
      const slot = known.get(sequenceNumber);

      if (slot) {
        return {
          ...slot,
          displayState: slot.state as "RECEIVED" | "LOST",
        };
      }

      return {
        sequence: sequenceNumber,
        observedAt: null,
        receivedAt: null,
        displayState: "EMPTY" as const,
      };
    });
  }, [sequence]);

  const effectiveEndAt = session
    ? session.endedAt ?? new Date(clockMs).toISOString()
    : null;

  const officialOperationStartedAt = session?.networkReadyAt ?? null;

  const sessionSamples = useMemo(
    () =>
      session && effectiveEndAt && officialOperationStartedAt
        ? filterTelemetryForSession(
            telemetrySamples,
            officialOperationStartedAt,
            effectiveEndAt,
          )
        : [],
    [
      effectiveEndAt,
      officialOperationStartedAt,
      session,
      telemetrySamples,
    ],
  );

  const sessionPositionSamples = useMemo(
    () => filterOfficialPositionSamples(sessionSamples),
    [sessionSamples],
  );

  const sessionPositionStats = useMemo(
    () => calculatePositionUpdateStatistics(sessionPositionSamples),
    [sessionPositionSamples],
  );

  const sessionPacketMetrics = useMemo(
    () => calculatePacketSequenceMetrics(sessionSamples, 1_200),
    [sessionSamples],
  );

  const sessionSharingStats = useMemo(
    () =>
      calculateInformationSharingSuccess(
        session?.sharingAttempts ?? [],
      ),
    [session],
  );

  const sessionAvailability = useMemo(
    () =>
      session && effectiveEndAt && session.networkReadyAt
        ? calculateOfficialAvailability(
            session.networkReadyAt,
            effectiveEndAt,
            session.serviceInterruptions,
            session.activeServiceInterruptionStartedAt,
          )
        : calculateOfficialAvailability("", "", []),
    [effectiveEndAt, session],
  );

  // 긴급통신망 구축시간: 구축팀 투입 시 시작하고 망 준비 완료 시 정지한다.
  const deploymentTimerEndAt =
    session?.networkReadyAt ?? effectiveEndAt;

  const deploymentTimerSec =
    session && deploymentTimerEndAt
      ? Math.max(
          0,
          (Date.parse(deploymentTimerEndAt) -
            Date.parse(session.startedAt)) /
            1_000,
        )
      : 0;

  const deploymentTargetSec =
    PROJECT_ENHANCED_TARGET.networkDeploymentMinutes * 60;

  const deploymentTimerResult =
    session?.networkReadyAt
      ? deploymentTimerSec <= deploymentTargetSec
        ? "PASS"
        : "FAIL"
      : null;

  const deploymentMeasured = calculateNetworkDeploymentMinutes(
    session?.startedAt,
    session?.networkReadyAt,
  );

  const sessionLocationMeasured = sessionPositionStats.maxGapSec;
  const sessionSharingMeasured = sessionSharingStats.successPct;
  const sessionAvailabilityMeasured = sessionAvailability.availabilityPct;

  const deployment = metricByCode(overview, "NETWORK_DEPLOYMENT_TIME");
  const location = metricByCode(overview, "LOCATION_LATENCY");
  const sharing = metricByCode(overview, "SHARING_SUCCESS");
  const availability = metricByCode(overview, "NETWORK_AVAILABILITY");

  const locationFallback =
    telemetrySamples.length > 1 && telemetryMetrics.maxGapSec > 0
      ? telemetryMetrics.maxGapSec
      : null;

  const sharingFallback =
    packetMetrics.expected > 0 ? packetMetrics.successPct : null;

  const availabilityFallback =
    telemetrySamples.length > 0 ? telemetryMetrics.availabilityPct : null;

  // 세션 시작 전 proof는 카드와 동일한 KPI 소스를 사용한다.
  // 브라우저 수신표본 기반 fallback은 KPI 원본이 없을 때만 참고값으로 사용한다.
  const overviewDeploymentValue = measuredNumber(deployment);
  const overviewLocationValue = measuredNumber(location);
  const overviewSharingValue = measuredNumber(sharing);
  const overviewAvailabilityValue = measuredNumber(availability);

  const sessionMode = session != null;

  const metricEvidence: Record<string, string> = {
    deployment: session
      ? `투입 ${displayTime(session.startedAt)} → ${
          session.networkReadyAt
            ? `준비 ${displayTime(session.networkReadyAt)}`
            : "구축 중"
        }`
      : "차량 도착·구축팀 투입 시 측정 시작",
    location:
      sessionMode && sessionPositionStats.intervalCount > 0
        ? `AVG ${sessionPositionStats.averageGapSec}초 · MAX ${sessionPositionStats.maxGapSec}초`
        : locationFallback != null
          ? `MAX ${locationFallback}초`
          : "위치 갱신 이벤트 대기",
    sharing:
      sessionMode && sessionSharingStats.attempts > 0
        ? `${sessionSharingStats.successes}/${sessionSharingStats.attempts} 성공 수신`
        : sharingFallback != null
          ? `참고 Sequence ${packetMetrics.received}/${packetMetrics.expected}`
          : "전송/수신 이벤트 대기",
    availability:
      sessionMode && session?.networkReadyAt
        ? `운영 ${sessionAvailability.totalOperationSec}초 · 장애 ${sessionAvailability.downtimeSec}초`
        : availabilityFallback != null
          ? "브라우저 수신표본 참고"
          : "망 준비 완료 후 측정",
  };

  const cards: MetricCard[] = [
    {
      id: "deployment",
      label: "통신망 구축시간",
      value: sessionMode
        ? deploymentMeasured
        : measuredNumber(deployment),
      unit: "분",
      operator: "≤",
      target: PROJECT_ENHANCED_TARGET.networkDeploymentMinutes,
      officialTarget: OFFICIAL_RFP_BASELINE.networkDeploymentMinutes,
      source: sessionMode
        ? session.networkReadyAt
          ? `${session.runId} · 차량 도착·구축팀 투입→망 준비 완료 실측`
          : `${session.runId} · 망 준비 완료 입력 대기`
        : deployment
          ? `${demoMode ? "DEMO" : "수신 KPI"} · ${String(
              deployment.sourceSystem ?? "출처 미상",
            )}`
          : "시작·망 준비 완료 시각 수신 대기",
      note: "공식 근거: RFP 차량도착→현장통신망 구축 완료 / 계획서 구축팀 투입시각 측정",
    },
    {
      id: "location",
      label: "위치정보 갱신",
      value: sessionMode
        ? sessionLocationMeasured
        : measuredNumber(location) ?? locationFallback,
      unit: "초",
      operator: "≤",
      target: PROJECT_ENHANCED_TARGET.locationUpdateSeconds,
      officialTarget: OFFICIAL_RFP_BASELINE.locationUpdateSeconds,
      source: sessionMode
        ? sessionLocationMeasured != null
          ? `${session.runId} · 대원·차량 평균 ${sessionPositionStats.averageGapSec}초 · 최대 ${sessionPositionStats.maxGapSec}초 · ${sessionPositionStats.intervalCount}구간`
          : `${session.runId} · 연속 위치 갱신 이벤트 수신 대기`
        : location
          ? `${demoMode ? "DEMO" : "수신 KPI"} · ${String(
              location.sourceSystem ?? "출처 미상",
            )}`
          : locationFallback != null
            ? "브라우저 수신표본 최대 갱신 간격"
            : "위치 텔레메트리 수신 대기",
      note: "공식 방법: 대원·차량 위치 갱신 이벤트의 평균·최대 갱신주기 산출; PASS는 최대값 기준",
    },
    {
      id: "sharing",
      label: "정보공유 성공률",
      value: sessionMode
        ? sessionSharingMeasured
        : measuredNumber(sharing) ?? sharingFallback,
      unit: "%",
      operator: "≥",
      target: PROJECT_ENHANCED_TARGET.sharingSuccessPct,
      officialTarget: OFFICIAL_RFP_BASELINE.sharingSuccessPct,
      source: sessionMode
        ? sessionSharingStats.attempts > 0
          ? `${session.runId} · 전송시도 ${sessionSharingStats.attempts}건 · 성공수신 ${sessionSharingStats.successes}건 · 실패 ${sessionSharingStats.failures}건`
          : `${session.runId} · 전송 시도/성공 수신 이벤트 대기`
        : sharing
          ? `${demoMode ? "DEMO" : "수신 KPI"} · ${String(
              sharing.sourceSystem ?? "출처 미상",
            )}`
          : sharingFallback != null
            ? `Sequence ${packetMetrics.received}/${packetMetrics.expected}`
            : "Sequence 수신 대기",
      note: "공식 방법: 성공 수신 건수 ÷ 전송 시도 건수 × 100; Sequence Loss는 별도 진단",
    },
    {
      id: "availability",
      label: "네트워크 가용률",
      value: sessionMode
        ? sessionAvailabilityMeasured
        : measuredNumber(availability) ?? availabilityFallback,
      unit: "%",
      operator: "≥",
      target: PROJECT_ENHANCED_TARGET.availabilityPct,
      officialTarget: OFFICIAL_RFP_BASELINE.availabilityPct,
      source: sessionMode
        ? session.networkReadyAt
          ? `${session.runId} · 총 운영 ${sessionAvailability.totalOperationSec}초 · 중단 ${sessionAvailability.downtimeSec}초`
          : `${session.runId} · 망 준비 완료 입력 대기`
        : availability
          ? `${demoMode ? "DEMO" : "수신 KPI"} · ${String(
              availability.sourceSystem ?? "출처 미상",
            )}`
          : availabilityFallback != null
            ? "브라우저 수신표본 기준 참고값"
            : "NMS/텔레메트리 수신 대기",
      note: sessionMode
        ? "공식 방법: (총 운영시간-총 서비스 중단시간) ÷ 총 운영시간 × 100"
        : "측정 세션 시작 시 공식 운영시간·중단시간 방식으로 전환",
    },
  ];

  const startSession = () => {
    const now = new Date();
    setClockMs(now.getTime());
    setSession({
      runId: createPerformanceRunId(now),
      eventId,
      startedAt: now.toISOString(),
      networkReadyAt: null,
      endedAt: null,
      sharingAttempts: [],
      serviceInterruptions: [],
      activeServiceInterruptionStartedAt: null,
    });
  };

  const markNetworkReady = () => {
    setSession((current) =>
      current && !current.networkReadyAt && !current.endedAt
        ? { ...current, networkReadyAt: new Date().toISOString() }
        : current,
    );
  };

  const finishSession = () => {
    setSession((current) => {
      if (!current || current.endedAt) return current;
      const endedAt = new Date().toISOString();
      const serviceInterruptions =
        current.activeServiceInterruptionStartedAt
          ? [
              ...current.serviceInterruptions,
              {
                startedAt: current.activeServiceInterruptionStartedAt,
                endedAt,
              },
            ]
          : current.serviceInterruptions;

      return {
        ...current,
        endedAt,
        serviceInterruptions,
        activeServiceInterruptionStartedAt: null,
      };
    });
  };

  const addSharingAttempts = (
    successCount: number,
    failureCount: number,
    payloadType: SharingPayloadType = "MESSAGE",
  ) => {
    setSession((current) => {
      if (
        !current ||
        !current.networkReadyAt ||
        current.endedAt
      ) {
        return current;
      }

      const attemptedAt = new Date().toISOString();
      const base = current.sharingAttempts.length;
      const rows: InformationSharingAttempt[] = [];

      for (let index = 0; index < successCount; index += 1) {
        rows.push({
          transmissionId: `${current.runId}-TX-${base + rows.length + 1}`,
          attemptedAt,
          receivedAt: attemptedAt,
          status: "SUCCESS",
          payloadType,
        });
      }

      for (let index = 0; index < failureCount; index += 1) {
        rows.push({
          transmissionId: `${current.runId}-TX-${base + rows.length + 1}`,
          attemptedAt,
          receivedAt: null,
          status: "FAILED",
          payloadType,
        });
      }

      return {
        ...current,
        sharingAttempts: [...current.sharingAttempts, ...rows],
      };
    });
  };

  const beginServiceInterruption = () => {
    setSession((current) =>
      current &&
      current.networkReadyAt &&
      !current.endedAt &&
      !current.activeServiceInterruptionStartedAt
        ? {
            ...current,
            activeServiceInterruptionStartedAt:
              new Date().toISOString(),
          }
        : current,
    );
  };

  const endServiceInterruption = () => {
    setSession((current) => {
      if (
        !current ||
        !current.activeServiceInterruptionStartedAt ||
        current.endedAt
      ) {
        return current;
      }

      const endedAt = new Date().toISOString();
      return {
        ...current,
        serviceInterruptions: [
          ...current.serviceInterruptions,
          {
            startedAt: current.activeServiceInterruptionStartedAt,
            endedAt,
          },
        ],
        activeServiceInterruptionStartedAt: null,
      };
    });
  };

  const resetSession = () => {
    setSession(null);
    setClockMs(Date.now());
  };

  const exportSessionEvidence = () => {
    if (!session || !effectiveEndAt) return;

    const evidence = buildOperationalEvidence({
      eventId,
      runId: session.runId,
      samples: sessionSamples,
      startedAt: session.startedAt,
      networkReadyAt: session.networkReadyAt ?? undefined,
    });

    const payload = {
      ...evidence,
      schemaVersion: "forest-kpi-evidence/v3",
      mode: overview.domainDetail?.mode ?? "UNKNOWN",
      session: {
        ...session,
        measuredUntil: effectiveEndAt,
      },
      metrics: {
        ...evidence.metrics,
        networkDeploymentMinutes: deploymentMeasured,
        averageGapSec: sessionPositionStats.averageGapSec,
        maxGapSec: sessionPositionStats.maxGapSec,
        positionIntervalCount: sessionPositionStats.intervalCount,
        positionMeasurementSubject: "PERSONNEL_OR_VEHICLE",
        positionMeasurementSampleCount: sessionPositionSamples.length,
        sharingSuccessPct: sessionSharingMeasured,
        sharingAttemptCount: sessionSharingStats.attempts,
        sharingSuccessCount: sessionSharingStats.successes,
        sharingFailureCount: sessionSharingStats.failures,
        packetLossPct: sessionPacketMetrics.lossPct,
        sequenceReceived: sessionPacketMetrics.received,
        sequenceLost: sessionPacketMetrics.lost,
        sequenceExpected: sessionPacketMetrics.expected,
        availabilityPct: sessionAvailabilityMeasured,
        totalOperationSec: sessionAvailability.totalOperationSec,
        availableOperationSec: sessionAvailability.availableOperationSec,
        downtimeSec: sessionAvailability.downtimeSec,
        availabilityMethod: sessionAvailability.method,
      },
      officialMeasurementEvents: {
        sharingAttempts: session.sharingAttempts,
        serviceInterruptions: session.serviceInterruptions,
        activeServiceInterruptionStartedAt:
          session.activeServiceInterruptionStartedAt,
      },
      measurements: overview.kpis,
      officialRfpBaseline: OFFICIAL_RFP_BASELINE,
      projectEnhancedTarget: PROJECT_ENHANCED_TARGET,
      interfaceRequirements: PERFORMANCE_INTERFACE_REQUIREMENTS,
      limitations: [
        demoMode
          ? "DEMO 데이터는 공식 성능시험 결과가 아님"
          : "브라우저 측정값은 실장비 원시로그와 대조 필요",
        "정보공유 성공률은 전송시도/성공수신 이벤트 기준이며 Packet Loss Sequence는 별도 진단 지표",
        "통신망 가용률은 망 준비 완료 이후 총 운영시간과 서비스 중단 이벤트 기준",
        "공식 판정은 실제 시험실행 ID와 송신/ACK/NMS 원시로그가 연결된 측정값만 사용",
      ],
    };

    downloadJson(
      `${session.runId}-performance-evidence.json`,
      payload,
    );
  };

  return (
    <section
      className="performance-kpi-dashboard"
      aria-label="성능기준 평가"
    >
      <header className="performance-kpi-heading">
        <div>
          <strong>성능기준 4종 실시간 평가</strong>
          <small>
            {sessionMode
              ? `${session.runId} · 측정 세션 기반`
              : demoMode
                ? "DEMO 기준값 · 측정 시작 시 실측값으로 전환"
                : "측정 시작 시 수신 데이터 기반 실측값으로 전환"}
          </small>
        </div>
        <span className={demoMode ? "demo" : "live"}>
          {demoMode ? "DEMO" : "LIVE"}
        </span>
      </header>

      <section
        className="performance-measurement-session"
        data-state={
          !session
            ? "IDLE"
            : session.endedAt
              ? "DONE"
              : "RUNNING"
        }
        aria-label="성능 측정 세션"
      >
        <header>
          <div>
            <strong>측정 제어</strong>
            <small>
              구축팀 투입 → 망 준비 완료 · 이후 4개 지표 실시간 측정
            </small>
          </div>
          <span>
            {!session
              ? "대기"
              : !session.networkReadyAt
                ? "측정 중"
                : deploymentTimerResult}
          </span>
        </header>

        <div className="performance-deployment-timeline">
          <div>
            <span>구축팀 투입</span>
            <b>{displayTime(session?.startedAt ?? null)}</b>
          </div>
          <i>→</i>
          <strong>
            {session ? displayDuration(deploymentTimerSec) : "00:00"}
          </strong>
          <i>→</i>
          <div>
            <span>망 준비 완료</span>
            <b>{displayTime(session?.networkReadyAt ?? null)}</b>
          </div>
          <em>
            ≤ {PROJECT_ENHANCED_TARGET.networkDeploymentMinutes}분
          </em>
        </div>

        <div className="performance-session-actions">
          <button
            type="button"
            onClick={startSession}
            disabled={Boolean(session && !session.endedAt)}
          >
            {!session
              ? "차량 도착·구축팀 투입"
              : session.endedAt
                ? "새 측정 시작"
                : "측정 중"}
          </button>
          <button
            type="button"
            onClick={markNetworkReady}
            disabled={
              !session ||
              Boolean(session.networkReadyAt) ||
              Boolean(session.endedAt)
            }
          >
            망 준비 완료
          </button>
          <button
            type="button"
            onClick={finishSession}
            disabled={
              !session ||
              Boolean(session.endedAt) ||
              !session.networkReadyAt
            }
            title={
              session && !session.networkReadyAt
                ? "망 준비 완료를 먼저 기록해야 측정을 종료할 수 있습니다."
                : undefined
            }
          >
            측정 종료
          </button>
          <button
            type="button"
            className="secondary"
            onClick={resetSession}
            disabled={!session}
          >
            초기화
          </button>
        </div>

        <details className="performance-measurement-details">
          <summary>상세 측정·검증</summary>
          <div className="performance-measurement-details-body">
            <div className="performance-session-live">
          <span>
            위치 이벤트 <b>{sessionSamples.length}</b>
          </span>
          <span>
            공유 성공{" "}
            <b>
              {sessionSharingStats.successes}/
              {sessionSharingStats.attempts}
            </b>
          </span>
          <span>
            Seq Loss(참고){" "}
            <b>
              {sessionPacketMetrics.lossPct == null
                ? "-"
                : `${sessionPacketMetrics.lossPct}%`}
            </b>
          </span>
          <span>
            장애 누적 <b>{sessionAvailability.downtimeSec}초</b>
          </span>
        </div>

        <section className="performance-official-events">
          <header>
            <strong>공식 평가 이벤트 입력</strong>
            <small>
              실제 연동 시 송신/ACK 및 NMS linkStatus 이벤트로 자동 대체
            </small>
          </header>

          <div className="performance-official-event-grid">
            <div>
              <span>정보공유</span>
              <b>
                시도 {sessionSharingStats.attempts} · 성공{" "}
                {sessionSharingStats.successes} · 실패{" "}
                {sessionSharingStats.failures}
              </b>
              <div>
                <button
                  type="button"
                  onClick={() => addSharingAttempts(1, 0, "MESSAGE")}
                  disabled={
                    !session?.networkReadyAt ||
                    Boolean(session?.endedAt)
                  }
                >
                  메시지 성공 +1
                </button>
                <button
                  type="button"
                  onClick={() => addSharingAttempts(1, 0, "POSITION")}
                  disabled={!session?.networkReadyAt || Boolean(session?.endedAt)}
                >
                  위치 성공 +1
                </button>
                <button
                  type="button"
                  onClick={() => addSharingAttempts(1, 0, "VIDEO")}
                  disabled={!session?.networkReadyAt || Boolean(session?.endedAt)}
                >
                  영상 성공 +1
                </button>
                <button
                  type="button"
                  onClick={() => addSharingAttempts(0, 1, "MESSAGE")}
                  disabled={
                    !session?.networkReadyAt ||
                    Boolean(session?.endedAt)
                  }
                >
                  메시지 실패 +1
                </button>
                {demoMode ? (
                  <button
                    type="button"
                    onClick={() => addSharingAttempts(99, 1)}
                    disabled={
                      !session?.networkReadyAt ||
                      Boolean(session?.endedAt)
                    }
                  >
                    DEMO 100건(99성공)
                  </button>
                ) : null}
              </div>
            </div>

            <div>
              <span>통신망 서비스</span>
              <b>
                {session?.activeServiceInterruptionStartedAt
                  ? "DOWN · 장애 측정 중"
                  : "UP"}
              </b>
              <div>
                <button
                  type="button"
                  onClick={beginServiceInterruption}
                  disabled={
                    !session?.networkReadyAt ||
                    Boolean(session?.endedAt) ||
                    Boolean(
                      session?.activeServiceInterruptionStartedAt,
                    )
                  }
                >
                  서비스 중단 시작
                </button>
                <button
                  type="button"
                  onClick={endServiceInterruption}
                  disabled={
                    !session?.activeServiceInterruptionStartedAt ||
                    Boolean(session?.endedAt)
                  }
                >
                  서비스 복구
                </button>
              </div>
            </div>
          </div>
        </section>

        <button
          type="button"
          className="performance-session-export"
          onClick={exportSessionEvidence}
          disabled={
            !session ||
            !session.networkReadyAt ||
            !session.endedAt
          }
          title={
            session && !session.endedAt
              ? "측정 종료 후 최종 증적을 내보낼 수 있습니다."
              : undefined
          }
        >
          측정 세션·KPI JSON 증적 내보내기
        </button>
          </div>
        </details>
      </section>

      <div className="performance-kpi-grid">
        {cards.map((card) => {
          const deploymentRunning =
            card.id === "deployment" &&
            Boolean(session) &&
            !session?.networkReadyAt;

          const passed = deploymentRunning
            ? null
            : evaluate(card.value, card.operator, card.target);

          const status =
            deploymentRunning
              ? "RUNNING"
              : passed == null
                ? "WAITING"
                : passed
                  ? "PASS"
                  : "FAIL";

          const display =
            card.id === "deployment" && session
              ? displayDuration(deploymentTimerSec)
              : displayValue(card.value, card.unit);

          const progressValue =
            card.id === "deployment" && session
              ? deploymentTimerSec / Math.max(1, deploymentTargetSec)
              : card.value == null
                ? 0
                : card.operator === "≤"
                  ? card.value / Math.max(0.001, card.target)
                  : card.value / 100;

          const progressPct = Math.max(
            0,
            Math.min(100, progressValue * 100),
          );

          return (
            <article
              key={card.id}
              className="performance-kpi-card performance-vital-card"
              data-status={status}
            >
              <div className="performance-kpi-card-title">
                <strong>{card.label}</strong>
                <span>
                  {status === "RUNNING"
                    ? "LIVE"
                    : status === "WAITING"
                      ? "대기"
                      : status}
                </span>
              </div>

              <div className="performance-vital-value">
                <p>{display}</p>
                <small>
                  기준 {card.operator}{card.target}{card.unit}
                </small>
              </div>

              <div className="performance-vital-track">
                <span style={{ width: `${progressPct}%` }} />
                <i />
              </div>
            </article>
          );
        })}
      </div>

      <details className="performance-proof-hub">
        <summary>
          <span>ⓘ</span>
          성능지표 증명 근거 1–4 보기
        </summary>

        <div className="performance-proof-list">
          <article>
            <b>1</b>
            <div className="performance-proof-main">
              <strong>통신망 구축시간 ≤ 7분</strong>
              <p>RFP 10분 · 계획서 7분 · 차량도착/팀투입→망 준비</p>
            </div>
            <em>
              {sessionMode
                ? `LIVE ${displayDuration(deploymentTimerSec)}`
                : overviewDeploymentValue != null
                  ? `${demoMode ? "DEMO " : ""}${overviewDeploymentValue}분`
                  : "대기"}
            </em>
          </article>

          <article>
            <b>2</b>
            <div className="performance-proof-main">
              <strong>위치정보 갱신주기 ≤ 3초</strong>
              <p>RFP 5초 · 계획서 3초 · 대원·차량 AVG/MAX</p>
            </div>
            <em>
              {sessionMode
                ? sessionPositionStats.intervalCount > 0 &&
                  sessionPositionStats.maxGapSec != null
                  ? `LIVE MAX ${sessionPositionStats.maxGapSec.toFixed(1)}초`
                  : "LIVE 대기"
                : overviewLocationValue != null
                  ? `${demoMode ? "DEMO " : ""}${overviewLocationValue}초`
                  : locationFallback != null
                    ? `참고 MAX ${locationFallback.toFixed(1)}초`
                    : "-"}
            </em>
          </article>

          <article>
            <b>3</b>
            <div className="performance-proof-main">
              <strong>정보공유 성공률 ≥ 98%</strong>
              <p>메시지·영상·위치 · 성공수신/전송시도</p>
            </div>
            <em>
              {sessionMode
                ? sessionSharingStats.attempts > 0
                  ? `LIVE ${sessionSharingStats.successes}/${sessionSharingStats.attempts} · ${
                      sessionSharingMeasured ?? "-"
                    }%`
                  : "LIVE 대기"
                : overviewSharingValue != null
                  ? `${demoMode ? "DEMO " : ""}${overviewSharingValue}%`
                  : sharingFallback != null
                    ? `참고 ${sharingFallback}%`
                    : "-"}
            </em>
          </article>

          <article>
            <b>4</b>
            <div className="performance-proof-main">
              <strong>통신망 가용률 ≥ 98%</strong>
              <p>연속운영 · (운영시간-중단시간)/운영시간</p>
            </div>
            <em>
              {sessionMode
                ? session?.networkReadyAt && sessionAvailabilityMeasured != null
                  ? `LIVE ${sessionAvailabilityMeasured}%`
                  : "LIVE 대기"
                : overviewAvailabilityValue != null
                  ? `${demoMode ? "DEMO " : ""}${overviewAvailabilityValue}%`
                  : availabilityFallback != null
                    ? `참고 ${availabilityFallback}%`
                    : "-"}
            </em>
          </article>
        </div>
      </details>

      <section
        className="packet-sequence-panel"
        aria-label="패킷 로스 시퀀스"
      >
        <header>
          <div>
            <strong>Packet Loss Sequence</strong>
            <small>
              선택 장비의 최근 100개 sequence를 10×10으로 표시
            </small>
          </div>

          <select
            aria-label="패킷 시퀀스 자산 선택"
            value={selectedAssetId}
            onChange={(event) =>
              setSelectedAssetId(event.target.value)
            }
            disabled={assetIds.length === 0}
          >
            {assetIds.length === 0 ? (
              <option value="">수신 대기</option>
            ) : (
              assetIds.map((assetId) => (
                <option key={assetId} value={assetId}>
                  {assetId}
                </option>
              ))
            )}
          </select>
        </header>

        {sequence.expected > 0 ? (
          <>
            <div className="packet-sequence-summary">
              <div>
                <span>수신</span>
                <strong>{sequence.received}</strong>
              </div>
              <div>
                <span>유실</span>
                <strong>{sequence.lost}</strong>
              </div>
              <div>
                <span>성공률</span>
                <strong>{sequence.successPct}%</strong>
              </div>
              <div>
                <span>Loss</span>
                <strong>{sequence.lossPct}%</strong>
              </div>
            </div>

            <div
              className="packet-sequence-grid"
              role="img"
              aria-label={
                sequenceDisplaySlots.length > 0
                  ? `Sequence ${sequenceDisplaySlots[0].sequence}부터 ${
                      sequenceDisplaySlots[sequenceDisplaySlots.length - 1].sequence
                    }까지`
                  : "Sequence 수신 대기"
              }
            >
              {sequenceDisplaySlots.map((slot) => (
                <span
                  key={slot.sequence}
                  className={
                    slot.displayState === "RECEIVED"
                      ? "received"
                      : slot.displayState === "LOST"
                        ? "lost"
                        : "empty"
                  }
                  title={`SEQ ${slot.sequence} · ${
                    slot.displayState === "RECEIVED"
                      ? "수신"
                      : slot.displayState === "LOST"
                        ? "유실"
                        : "관측 전/대기"
                  }`}
                >
                  {slot.sequence}
                </span>
              ))}
            </div>

            <div className="packet-sequence-legend">
              <span>
                <i className="received" /> 정상 수신
              </span>
              <span>
                <i className="lost" /> Sequence 유실
              </span>
              <span>
                <i className="empty" /> 관측 전/대기
              </span>
              <b>
                {sequenceDisplaySlots.length > 0
                  ? `SEQ ${sequenceDisplaySlots[0].sequence}–${
                      sequenceDisplaySlots[sequenceDisplaySlots.length - 1].sequence
                    }`
                  : "SEQ -"}
              </b>
            </div>
          </>
        ) : (
          <p className="packet-sequence-empty">
            Sequence 번호가 포함된 텔레메트리 수신을 기다리고 있습니다.
          </p>
        )}

        <p className="packet-sequence-notice">
          동일 자산 기준으로 100칸을 고정 표시하며, 관측 전/대기 칸은
          유실률 계산에 포함하지 않습니다. DEMO 데이터와 브라우저 수신표본은
          공식 성능시험 결과로 사용하지 않습니다.
        </p>
      </section>

      <details className="performance-interface-requirements">
        <summary>실장비 인터페이스 필요 필드</summary>
        <div>
          <span>텔레메트리 필수</span>
          <code>
            {PERFORMANCE_INTERFACE_REQUIREMENTS.telemetryRequired.join(
              " / ",
            )}
          </code>
        </div>
        <div>
          <span>위치 필수</span>
          <code>
            {PERFORMANCE_INTERFACE_REQUIREMENTS.positionRequired.join(
              " / ",
            )}
          </code>
        </div>
        <div>
          <span>시험 세션 필수</span>
          <code>
            {PERFORMANCE_INTERFACE_REQUIREMENTS.sessionRequired.join(
              " / ",
            )}
          </code>
        </div>
        <div>
          <span>정보공유 성공률 필수</span>
          <code>
            {PERFORMANCE_INTERFACE_REQUIREMENTS.sharingRequired.join(
              " / ",
            )}
          </code>
        </div>
        <div>
          <span>통신망 가용률 필수</span>
          <code>
            {PERFORMANCE_INTERFACE_REQUIREMENTS.availabilityRequired.join(
              " / ",
            )}
          </code>
        </div>
        <div>
          <span>권장</span>
          <code>
            {PERFORMANCE_INTERFACE_REQUIREMENTS.recommended.join(
              " / ",
            )}
          </code>
        </div>
      </details>
    </section>
  );
}
