import type { ApiRecord } from "../../http-api";
import {
  twinState,
} from "../../http-api/live-drone-twin";

const value = (
  input: unknown,
  unit = "",
  digits = 1,
) =>
  typeof input === "number" &&
  Number.isFinite(input)
    ? `${input.toFixed(digits)}${unit}`
    : "수신 전";

function fixLabel(input: unknown) {
  if (
    typeof input !== "number" ||
    !Number.isFinite(input)
  ) {
    return "수신 전";
  }

  switch (input) {
    case 0:
      return "0 · GPS 없음";
    case 1:
      return "1 · Fix 없음";
    case 2:
      return "2 · 2D Fix";
    case 3:
      return "3 · 3D Fix";
    case 4:
      return "4 · DGPS";
    case 5:
      return "5 · RTK FLOAT";
    case 6:
      return "6 · RTK FIXED";
    case 7:
      return "7 · STATIC";
    case 8:
      return "8 · PPP";
    default:
      return `Fix ${input}`;
  }
}

export function DroneTwinDetail({
  asset,
}: {
  asset: ApiRecord;
}) {
  const attrs =
    (asset.attributes ?? {}) as ApiRecord;

  const linkQuality =
    (attrs.linkQuality ?? {}) as ApiRecord;

  if (
    asset.sourceSystem !== "GCS_UPLINK"
  ) {
    return null;
  }

  const state = twinState(
    asset.observedAt,
    asset.receivedAt,
  );

  return (
    <>
      <div>
        <dt>위치 동기화</dt>
        <dd>
          <strong data-twin-state={state}>
            {state}
          </strong>
          {" · "}
          {state === "LIVE"
            ? "최근 위치 수신"
            : "마지막 수신 위치"}
        </dd>
      </div>

      <div>
        <dt>최종 위치 시각</dt>
        <dd>
          {String(
            asset.observedAt ?? "수신 전",
          )}
        </dd>
      </div>

      <div>
        <dt>Core 접수 시각</dt>
        <dd>
          {String(
            asset.receivedAt ?? "수신 전",
          )}
        </dd>
      </div>

      <div>
        <dt>측위 방식</dt>
        <dd>
          {String(
            asset.positioningMethod ??
              "수신 전",
          )}
        </dd>
      </div>

      <div>
        <dt>GPS Fix / 위성</dt>
        <dd>
          {fixLabel(attrs.gpsFixType)}
          {" / "}
          {String(
            attrs.satellitesVisible ??
              "수신 전",
          )}
        </dd>
      </div>

      <div>
        <dt>HDOP / VDOP</dt>
        <dd>
          {value(attrs.hdop, "", 2)}
          {" / "}
          {value(attrs.vdop, "", 2)}
        </dd>
      </div>

      <div>
        <dt>수평 / 수직 정확도</dt>
        <dd>
          {value(
            asset.horizontalAccuracyM ??
              attrs.horizontalAccuracy,
            "m",
            2,
          )}
          {" / "}
          {value(
            attrs.verticalAccuracy,
            "m",
            2,
          )}
        </dd>
      </div>

      <div>
        <dt>상대 고도 / 전압</dt>
        <dd>
          {value(
            attrs.relativeAltitudeM,
            "m",
          )}
          {" / "}
          {value(
            attrs.batteryVoltageV,
            "V",
          )}
        </dd>
      </div>

      <div>
        <dt>Roll / Pitch / Yaw</dt>
        <dd>
          {value(attrs.rollDeg, "°")}
          {" / "}
          {value(attrs.pitchDeg, "°")}
          {" / "}
          {value(attrs.yawDeg, "°")}
        </dd>
      </div>

      <div>
        <dt>위치 원천</dt>
        <dd>
          {String(
            attrs.telemetryPositionSource ??
              "GLOBAL_POSITION_INT(33)",
          )}
        </dd>
      </div>

      <div>
        <dt>MAVLink</dt>
        <dd>
          {(
            attrs.mavlinkVersion ??
            linkQuality.mavlinkVersion
          ) == null
            ? "수신 전"
            : `v${
                attrs.mavlinkVersion ??
                linkQuality.mavlinkVersion
              }`}
          {" · "}
          {attrs.mavlinkSigned === true
            ? attrs.mavlinkSignatureVerified ===
              true
              ? "서명 검증됨"
              : "서명 존재 · 미검증"
            : "미서명"}
        </dd>
      </div>

      <div>
        <dt>System / Component</dt>
        <dd>
          {String(
            attrs.systemId ??
              linkQuality.mavlinkSystemId ??
              "수신 전",
          )}
          {" / "}
          {String(
            attrs.componentId ??
              linkQuality.mavlinkComponentId ??
              "수신 전",
          )}
        </dd>
      </div>

      <div>
        <dt>패킷 손실</dt>
        <dd>
          {value(
            asset.packetLossPct ??
              linkQuality.packetLossPct,
            "%",
            2,
          )}
        </dd>
      </div>

      <div>
        <dt>MAVLink SEQ</dt>
        <dd>
          {String(
            linkQuality.mavlinkSequence ??
              "수신 전",
          )}
        </dd>
      </div>

      <div>
        <dt>SEQ 수신 / 손실 / 예상</dt>
        <dd>
          {String(
            linkQuality.windowReceived ??
              "수신 전",
          )}
          {" / "}
          {String(
            linkQuality.windowLost ??
              "수신 전",
          )}
          {" / "}
          {String(
            linkQuality.windowExpected ??
              "수신 전",
          )}
        </dd>
      </div>

      <div>
        <dt>수신주기 AVG / P95 / MAX</dt>
        <dd>
          {value(
            linkQuality.periodAvgMs,
            "ms",
            1,
          )}
          {" / "}
          {value(
            linkQuality.periodP95Ms,
            "ms",
            1,
          )}
          {" / "}
          {value(
            linkQuality.periodMaxMs,
            "ms",
            1,
          )}
        </dd>
      </div>

      <div>
        <dt>지상 / 수직 속도</dt>
        <dd>
          {value(
            attrs.groundSpeedMps,
            "m/s",
          )}
          {" / "}
          {value(
            attrs.verticalSpeedMps,
            "m/s",
          )}
        </dd>
      </div>

      <div>
        <dt>수신 소스</dt>
        <dd>
          {String(
            attrs.sourceAddress ??
              "수신 전",
          )}
        </dd>
      </div>

      <div>
        <dt>물리 / Canonical ID</dt>
        <dd>
          {String(asset.sourceAssetId)}
          {" / "}
          {String(asset.assetId)}
        </dd>
      </div>
    </>
  );
}

import "./drone-twin.css";
