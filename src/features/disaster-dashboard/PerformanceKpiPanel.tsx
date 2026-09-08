import { useEffect, useMemo, useState } from "react";
import type { ApiRecord, EventOverview } from "../../http-api";
import {
  calculatePacketSequence,
  calculatePacketSequenceMetrics,
  calculateTelemetryMetrics,
  packetSequenceAssetIds,
  type TelemetrySample,
} from "./operationalEvidence";
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

export default function PerformanceKpiPanel({
  overview,
  telemetrySamples,
}: Props) {
  const demoMode = overview.domainDetail?.mode === "SIMULATION";

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

  const [selectedAssetId, setSelectedAssetId] = useState("");

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
        50,
      ),
    [selectedAssetId, telemetrySamples],
  );

  const deployment = metricByCode(overview, "NETWORK_DEPLOYMENT_TIME");
  const location = metricByCode(overview, "LOCATION_LATENCY");
  const sharing = metricByCode(overview, "SHARING_SUCCESS");
  const availability = metricByCode(overview, "NETWORK_AVAILABILITY");

  const locationFallback =
    telemetrySamples.length > 1 && telemetryMetrics.maxGapSec > 0
      ? telemetryMetrics.maxGapSec
      : null;

  const sharingFallback =
    packetMetrics.expected > 0
      ? packetMetrics.successPct
      : null;

  const availabilityFallback =
    telemetrySamples.length > 0
      ? telemetryMetrics.availabilityPct
      : null;

  const cards: MetricCard[] = [
    {
      id: "deployment",
      label: "통신망 구축시간",
      value: measuredNumber(deployment),
      unit: "분",
      operator: "≤",
      target: PROJECT_ENHANCED_TARGET.networkDeploymentMinutes,
      officialTarget: OFFICIAL_RFP_BASELINE.networkDeploymentMinutes,
      source: deployment
        ? `${demoMode ? "DEMO" : "수신 KPI"} · ${String(
            deployment.sourceSystem ?? "출처 미상",
          )}`
        : "시작·망 준비 완료 시각 수신 대기",
      note: "현장 도착/구축 시작부터 망 준비 완료까지",
    },
    {
      id: "location",
      label: "위치정보 갱신",
      value: measuredNumber(location) ?? locationFallback,
      unit: "초",
      operator: "≤",
      target: PROJECT_ENHANCED_TARGET.locationUpdateSeconds,
      officialTarget: OFFICIAL_RFP_BASELINE.locationUpdateSeconds,
      source: location
        ? `${demoMode ? "DEMO" : "수신 KPI"} · ${String(
            location.sourceSystem ?? "출처 미상",
          )}`
        : locationFallback != null
          ? "브라우저 수신표본 최대 갱신 간격"
          : "위치 텔레메트리 수신 대기",
      note: "실제 위치 갱신 주기는 동일 자산의 연속 수신 간격 기준",
    },
    {
      id: "sharing",
      label: "정보공유 성공률",
      value: measuredNumber(sharing) ?? sharingFallback,
      unit: "%",
      operator: "≥",
      target: PROJECT_ENHANCED_TARGET.sharingSuccessPct,
      officialTarget: OFFICIAL_RFP_BASELINE.sharingSuccessPct,
      source: sharing
        ? `${demoMode ? "DEMO" : "수신 KPI"} · ${String(
            sharing.sourceSystem ?? "출처 미상",
          )}`
        : sharingFallback != null
          ? `Sequence ${packetMetrics.received}/${packetMetrics.expected}`
          : "Sequence 수신 대기",
      note: "Sequence 번호 공백을 패킷 유실로 판정한 참고 성공률",
    },
    {
      id: "availability",
      label: "네트워크 가용률",
      value: measuredNumber(availability) ?? availabilityFallback,
      unit: "%",
      operator: "≥",
      target: PROJECT_ENHANCED_TARGET.availabilityPct,
      officialTarget: OFFICIAL_RFP_BASELINE.availabilityPct,
      source: availability
        ? `${demoMode ? "DEMO" : "수신 KPI"} · ${String(
            availability.sourceSystem ?? "출처 미상",
          )}`
        : availabilityFallback != null
          ? "브라우저 수신표본 기준 참고값"
          : "NMS/텔레메트리 수신 대기",
      note: "공식 가용률은 총 운영시간과 장애시간 기반 별도 산정",
    },
  ];

  return (
    <section
      className="performance-kpi-dashboard"
      aria-label="성능기준 평가"
    >
      <header className="performance-kpi-heading">
        <div>
          <strong>성능기준 4종 실시간 평가</strong>
          <small>
            {demoMode
              ? "DEMO 측정 · 공식 시험결과 아님"
              : "수신 데이터 기반 현재 측정값"}
          </small>
        </div>
        <span className={demoMode ? "demo" : "live"}>
          {demoMode ? "DEMO" : "LIVE"}
        </span>
      </header>

      <div className="performance-kpi-grid">
        {cards.map((card) => {
          const passed = evaluate(
            card.value,
            card.operator,
            card.target,
          );

          return (
            <article
              key={card.id}
              className="performance-kpi-card"
              data-status={
                passed == null
                  ? "WAITING"
                  : passed
                    ? "PASS"
                    : "FAIL"
              }
            >
              <div className="performance-kpi-card-title">
                <strong>{card.label}</strong>
                <span>
                  {passed == null
                    ? "측정 대기"
                    : passed
                      ? "PASS"
                      : "FAIL"}
                </span>
              </div>

              <p>{displayValue(card.value, card.unit)}</p>

              <dl>
                <div>
                  <dt>강화 목표</dt>
                  <dd>
                    {card.operator}
                    {card.target}
                    {card.unit}
                  </dd>
                </div>
                <div>
                  <dt>공식 RFP</dt>
                  <dd>
                    {card.operator}
                    {card.officialTarget}
                    {card.unit}
                  </dd>
                </div>
              </dl>

              <small>{card.source}</small>
              <small>{card.note}</small>
            </article>
          );
        })}
      </div>

      <section
        className="packet-sequence-panel"
        aria-label="패킷 로스 시퀀스"
      >
        <header>
          <div>
            <strong>Packet Loss Sequence</strong>
            <small>
              자산별 sequence 번호 공백을 시간 순으로 표시
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
              aria-label={`Sequence ${sequence.fromSequence}부터 ${sequence.toSequence}까지`}
            >
              {sequence.slots.map((slot) => (
                <span
                  key={slot.sequence}
                  className={
                    slot.state === "RECEIVED"
                      ? "received"
                      : "lost"
                  }
                  title={`SEQ ${slot.sequence} · ${
                    slot.state === "RECEIVED"
                      ? "수신"
                      : "유실"
                  }`}
                >
                  {slot.sequence % 100}
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
              <b>
                SEQ {sequence.fromSequence}–{sequence.toSequence}
              </b>
            </div>
          </>
        ) : (
          <p className="packet-sequence-empty">
            Sequence 번호가 포함된 텔레메트리 수신을 기다리고 있습니다.
          </p>
        )}

        <p className="packet-sequence-notice">
          동일 자산의 sequence를 독립적으로 계산합니다. DEMO 데이터와
          브라우저 수신표본은 공식 성능시험 결과로 사용하지 않습니다.
        </p>
      </section>
    </section>
  );
}
