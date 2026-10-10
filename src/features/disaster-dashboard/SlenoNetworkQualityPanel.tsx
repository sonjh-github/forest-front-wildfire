import {
  useEffect,
  useState,
} from "react";

import {
  forestApi,
} from "../../http-api/forest-api";

import type {
  SlenoDeviceQuality,
  SlenoNetworkQuality,
} from "../../http-api/sleno-quality";

import "./sleno-network-quality.css";

function ms(
  value: number | null,
) {
  if (value == null) {
    return "-";
  }

  if (value < 1000) {
    return `${Math.round(value)}ms`;
  }

  return `${(
    value / 1000
  ).toFixed(2)}s`;
}

function metric(
  value: number | null,
  suffix = "",
) {
  return value == null
    ? "-"
    : `${value}${suffix}`;
}

function deviceLabel(
  row: SlenoDeviceQuality,
) {
  return (
    row.vendorDeviceId ??
    row.assetName ??
    row.assetCode ??
    row.assetId
  );
}

export default function SlenoNetworkQualityPanel() {
  const [
    quality,
    setQuality,
  ] =
    useState<SlenoNetworkQuality | null>(
      null,
    );

  const [
    error,
    setError,
  ] =
    useState("");

  useEffect(() => {
    let disposed = false;

    const refresh =
      async () => {
        try {
          const response =
            await forestApi
              .slenoNetworkQuality(
                1500,
              );

          if (!disposed) {
            setQuality(
              response.data,
            );

            setError("");
          }
        } catch (reason) {
          if (!disposed) {
            setError(
              reason instanceof Error
                ? reason.message
                : "SLENO_API_ERROR",
            );
          }
        }
      };

    void refresh();

    const interval =
      window.setInterval(
        refresh,
        3000,
      );

    return () => {
      disposed = true;

      window.clearInterval(
        interval,
      );
    };
  }, []);

  const devices =
    quality?.devices ?? [];

  const physicalLive =
    devices.filter(
      (row) =>
        !row.isSimulatedDevice &&
        row.state === "LIVE",
    ).length;

  const status =
    error
      ? "ERROR"
      : !quality ||
          quality.deviceCount === 0
        ? "WAITING"
        : quality.liveCount > 0
          ? "LIVE"
          : quality.staleCount > 0
            ? "STALE"
            : "OFFLINE";

  return (
    <article
      className="sleno-quality-card"
      data-status={status}
    >
      <header>
        <div>
          <strong>
            Sleno 실제 통신품질
          </strong>

          <small>
            JININFRA · frameCounter
            · RSSI · SNR
          </small>
        </div>

        <b>
          {error
            ? "API 조회 오류"
            : physicalLive > 0
              ? "API 분류 · PHYSICAL LIVE"
              : quality?.deviceCount
                ? "API 수신 데이터"
                : "데이터 대기"}
        </b>
      </header>

      {error ? (
        <p className="sleno-quality-error">
          실제 통신품질 API 조회 실패
          · {error}
        </p>
      ) : null}

      <div className="sleno-summary-grid">
        <span>
          Counter Gap
          <b>
            {quality?.frameLossPct ==
            null
              ? "-"
              : `${quality.frameLossPct}%`}
          </b>
        </span>

        <span>
          Counter 연속률
          <b>
            {quality
              ?.frameDeliveryPct ==
            null
              ? "-"
              : `${quality.frameDeliveryPct}%`}
          </b>
        </span>

        <span>
          수신
          <b>
            {quality
              ?.totalReceivedFrames ??
              "-"}
          </b>
        </span>

        <span>
          유실
          <b>
            {quality
              ?.totalLostFrames ??
              "-"}
          </b>
        </span>
      </div>

      <small className="sleno-source-note">
        {quality
          ? `API 출처: ${quality.source ?? "미확인"} · 시스템: ${quality.sourceSystem ?? "미확인"} · synthetic: ${String(quality.synthetic ?? "미확인")} · 산출 시각: ${quality.calculatedAt ?? "미확인"}`
          : "API 데이터 출처 미확인"}
        {" · "}
        장비 물리/모의 구분은 API 분류값 기준 ·
        frameCounter 기준 참고 지표 ·
        실제 무선 패킷 유실률 확정값 아님
      </small>

      <div className="sleno-device-list">
        {devices.length === 0 ? (
          <p>
            Sleno persisted frame
            수신 대기
          </p>
        ) : null}

        {devices.map((row) => (
          <details
            key={row.assetId}
            className="sleno-device"
            open={
              !row.isSimulatedDevice
            }
          >
            <summary>
              <span>
                <strong>
                  {deviceLabel(row)}
                </strong>

                <small>
                  {row.networkType ??
                    "망 미확인"}
                  {" · "}
                  {row.fixType ??
                    "FIX 미확인"}
                </small>
              </span>

              <b
                data-state={
                  row.state
                }
              >
                {row.isSimulatedDevice
                  ? `SIM · ${row.state}`
                  : row.state}
              </b>
            </summary>

            <div className="sleno-device-kpis">
              <span>
                Frame
                <b>
                  {row.latestFrameCounter ??
                    "-"}
                </b>
              </span>

              <span>
                Received
                <b>
                  {row.receivedFrames}
                </b>
              </span>

              <span>
                Expected
                <b>
                  {row.expectedFrames}
                </b>
              </span>

              <span>
                Counter Gap
                <b>
                  {row.lostFrames}
                </b>
              </span>

              <span>
                Gap %
                <b>
                  {metric(
                    row.frameLossPct,
                    "%",
                  )}
                </b>
              </span>

              <span>
                Counter 연속률
                <b>
                  {metric(
                    row.frameDeliveryPct,
                    "%",
                  )}
                </b>
              </span>

              <span>
                Duplicate
                <b>
                  {row.duplicateFrames}
                </b>
              </span>

              <span>
                Reset
                <b>
                  {row.counterResets}
                </b>
              </span>

              <span>
                AVG
                <b>
                  {ms(
                    row.updateIntervalAvgMs,
                  )}
                </b>
              </span>

              <span>
                P95
                <b>
                  {ms(
                    row.updateIntervalP95Ms,
                  )}
                </b>
              </span>

              <span>
                MAX
                <b>
                  {ms(
                    row.updateIntervalMaxMs,
                  )}
                </b>
              </span>

              <span>
                Fresh
                <b>
                  {row.freshnessSec ==
                  null
                    ? "-"
                    : `${row.freshnessSec}s`}
                </b>
              </span>

              <span>
                RSSI
                <b>
                  {metric(
                    row.latestRssiDbm,
                    " dBm",
                  )}
                </b>
              </span>

              <span>
                RSSI AVG
                <b>
                  {metric(
                    row.averageRssiDbm,
                    " dBm",
                  )}
                </b>
              </span>

              <span>
                RSSI MIN
                <b>
                  {metric(
                    row.minimumRssiDbm,
                    " dBm",
                  )}
                </b>
              </span>

              <span>
                SNR
                <b>
                  {metric(
                    row.latestSnrDb,
                    " dB",
                  )}
                </b>
              </span>

              <span>
                SNR AVG
                <b>
                  {metric(
                    row.averageSnrDb,
                    " dB",
                  )}
                </b>
              </span>

              <span>
                SNR MIN
                <b>
                  {metric(
                    row.minimumSnrDb,
                    " dB",
                  )}
                </b>
              </span>
            </div>

            <small className="sleno-device-foot">
              {row.isSimulatedDevice
                ? "SIM 장비 식별자 · 실제 파이프라인 수신"
                : "API 분류상 물리 장비 식별자"}
              {" · "}
              {row.medium ??
                "medium 미확인"}
              {" · "}
              {row.lastReceivedAt ??
                "수신 시각 없음"}
            </small>
          </details>
        ))}
      </div>
    </article>
  );
}
