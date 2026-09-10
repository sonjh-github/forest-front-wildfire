import { useEffect, useMemo, useState } from "react";
import type { LiveLocation } from "./UnifiedDisasterDashboard";
import {
  calculatePacketSequence,
  packetSequenceAssetIds,
  type TelemetrySample,
} from "./operationalEvidence";
import "./network-sequence-quality.css";

type Props = {
  telemetrySamples: TelemetrySample[];
  locations: LiveLocation[];
};

type CellState = "RECEIVED" | "LOST" | "EMPTY";

function recentCells(
  samples: TelemetrySample[],
  assetId: string,
  count: number,
) {
  const summary = calculatePacketSequence(samples, assetId, count);

  if (summary.toSequence == null) {
    return {
      summary,
      cells: Array.from({ length: count }, (_, index) => ({
        sequence: index + 1,
        state: "EMPTY" as CellState,
      })),
    };
  }

  const start =
    summary.toSequence <= count
      ? 1
      : summary.toSequence - count + 1;

  const known = new Map(
    summary.slots.map((slot) => [slot.sequence, slot.state]),
  );

  return {
    summary,
    cells: Array.from({ length: count }, (_, index) => {
      const sequence = start + index;
      return {
        sequence,
        state: (known.get(sequence) ?? "EMPTY") as CellState,
      };
    }),
  };
}

export default function NetworkSequenceQualityPanel({
  telemetrySamples,
  locations,
}: Props) {
  const sequenceIds = useMemo(
    () => packetSequenceAssetIds(telemetrySamples),
    [telemetrySamples],
  );

  const deviceIds = useMemo(() => {
    const ids = new Set<string>(sequenceIds);

    for (const location of locations) {
      if (location.kind !== "asset") continue;
      ids.add(String(location.id));
    }

    return [...ids].slice(0, 8);
  }, [locations, sequenceIds]);

  const [selectedAssetId, setSelectedAssetId] = useState("");

  useEffect(() => {
    if (
      deviceIds.length > 0 &&
      (!selectedAssetId || !deviceIds.includes(selectedAssetId))
    ) {
      setSelectedAssetId(deviceIds[0]);
    }
  }, [deviceIds, selectedAssetId]);

  const rows = useMemo(
    () =>
      deviceIds.map((assetId) => {
        const recent100 = recentCells(
          telemetrySamples,
          assetId,
          100,
        );
        const recent20 = recentCells(
          telemetrySamples,
          assetId,
          20,
        );

        const hasSequence = recent100.summary.expected > 0;
        const lossPct = recent100.summary.lossPct ?? 0;

        const quality =
          !hasSequence
            ? "WAITING"
            : lossPct === 0
              ? "GOOD"
              : lossPct <= 2
                ? "WATCH"
                : "LOSS";

        return {
          assetId,
          summary: recent100.summary,
          cells: recent20.cells,
          hasSequence,
          quality,
        };
      }),
    [deviceIds, telemetrySamples],
  );

  const measuredRows = rows.filter((row) => row.hasSequence);
  const lossDeviceCount = measuredRows.filter(
    (row) => row.summary.lost > 0,
  ).length;

  const averageLossPct =
    measuredRows.length > 0
      ? Math.round(
          (measuredRows.reduce(
            (sum, row) => sum + (row.summary.lossPct ?? 0),
            0,
          ) /
            measuredRows.length) *
            100,
        ) / 100
      : null;

  const worst =
    measuredRows.length > 0
      ? measuredRows.reduce((current, row) =>
          (row.summary.lossPct ?? 0) >
          (current.summary.lossPct ?? 0)
            ? row
            : current,
        )
      : null;

  const selected = selectedAssetId
    ? recentCells(telemetrySamples, selectedAssetId, 100)
    : null;

  return (
    <article
      className="network-seq-card"
      data-status={lossDeviceCount > 0 ? "DEGRADED" : "ACTIVE"}
    >
      <header className="network-seq-card-header">
        <div>
          <strong>장비별 SEQ 통신 품질</strong>
          <small>최근 100 SEQ · 누락 번호 = Packet Loss</small>
        </div>
        <b>
          {measuredRows.length > 0
            ? `${measuredRows.length}대 측정`
            : "SEQ 대기"}
        </b>
      </header>

      <div className="network-seq-kpis">
        <span>
          평균 Loss
          <b>
            {averageLossPct == null ? "-" : `${averageLossPct}%`}
          </b>
        </span>
        <span>
          손실 장비
          <b>{lossDeviceCount}대</b>
        </span>
        <span>
          최악 장비
          <b>
            {worst
              ? `${worst.assetId} ${worst.summary.lossPct ?? 0}%`
              : "-"}
          </b>
        </span>
      </div>

      <div className="network-seq-list">
        {rows.map((row) => (
          <button
            type="button"
            key={row.assetId}
            className={
              row.assetId === selectedAssetId
                ? "network-seq-row is-selected"
                : "network-seq-row"
            }
            data-quality={row.quality}
            onClick={() => setSelectedAssetId(row.assetId)}
          >
            <span className="network-seq-row-top">
              <strong>{row.assetId}</strong>
              <b>
                {row.hasSequence
                  ? `LOSS ${row.summary.lossPct ?? 0}%`
                  : "SEQ 대기"}
              </b>
            </span>

            <span className="network-seq-strip" aria-hidden="true">
              {row.cells.map((cell) => (
                <span
                  key={cell.sequence}
                  className={cell.state.toLowerCase()}
                />
              ))}
            </span>

            <small>
              {row.hasSequence
                ? `수신 ${row.summary.received} · 유실 ${row.summary.lost} · 성공 ${row.summary.successPct ?? "-"}%`
                : "sequence 필드 수신 대기"}
            </small>
          </button>
        ))}
      </div>

      {selected && selected.summary.expected > 0 && (
        <details className="network-seq-details">
          <summary>
            <span>선택 장비 100 SEQ 상세</span>
            <b>{selectedAssetId}</b>
          </summary>

          <div className="network-seq-100-grid">
            {selected.cells.map((cell) => (
              <span
                key={cell.sequence}
                className={cell.state.toLowerCase()}
                title={`SEQ ${cell.sequence}`}
              >
                {cell.sequence}
              </span>
            ))}
          </div>
        </details>
      )}
    </article>
  );
}
