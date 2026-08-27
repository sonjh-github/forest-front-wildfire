import { useState } from "react";
import { HttpApiError } from "../../http-api/client";
import {
  loadAssetLogs,
  type DashboardDeviceLog,
} from "../../http-api/device-log-api";

type DeviceLogListProps = {
  lastRegisteredAt: Date | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function formatReceivedAt(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("ko-KR", {
    hour12: false,
  });
}

function summarizePayload(log: DashboardDeviceLog) {
  const payload =
    log.normalized_payload ??
    log.payload;

  if (!payload) {
    return "-";
  }

  const data =
    typeof payload.data === "object" &&
    payload.data !== null
      ? payload.data as Record<string, unknown>
      : null;

  if (data) {
    const summaryKeys = [
      "operationalStatus",
      "positioningMethod",
      "activeLink",
      "rtcmAvailable",
      "connectedTerminals",
    ];

    const summary = summaryKeys
      .filter((key) => key in data)
      .map((key) => {
        const value = data[key];

        return `${key}=${
          typeof value === "object"
            ? JSON.stringify(value)
            : String(value)
        }`;
      });

    if (summary.length > 0) {
      return summary.join(" · ");
    }
  }

  const serialized = JSON.stringify(payload);

  if (serialized.length <= 160) {
    return serialized;
  }

  return `${serialized.slice(0, 157)}...`;
}

function resolveErrorMessage(error: unknown) {
  if (error instanceof HttpApiError) {
    if (error.status === 404) {
      return "해당 assetId의 물리 장비를 찾을 수 없습니다.";
    }

    if (error.status === 400) {
      return error.message || "조회 요청 형식을 확인하세요.";
    }

    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "알 수 없는 오류가 발생했습니다.";
}

export default function DeviceLogList({
  lastRegisteredAt,
}: DeviceLogListProps) {
  const [assetId, setAssetId] = useState("");
  const [searchedAssetId, setSearchedAssetId] = useState<string | null>(null);
  const [logs, setLogs] = useState<DashboardDeviceLog[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedAssetId = assetId.trim();
  const hasAssetId = normalizedAssetId.length > 0;
  const validAssetId = UUID_PATTERN.test(normalizedAssetId);

  async function handleSearch(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!validAssetId || loading) {
      return;
    }

    setLoading(true);
    setError(null);
    setLogs([]);
    setHasMore(false);
    setNextCursor(null);

    try {
      const data = await loadAssetLogs(
        normalizedAssetId,
        { limit: 20 },
      );

      setSearchedAssetId(normalizedAssetId);
      setLogs(data.logs);
      setHasMore(data.page.hasMore);
      setNextCursor(data.page.nextCursor);
    } catch (requestError) {
      setSearchedAssetId(normalizedAssetId);
      setError(resolveErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadMore() {
    if (
      !searchedAssetId ||
      !nextCursor ||
      !hasMore ||
      loadingMore
    ) {
      return;
    }

    setLoadingMore(true);
    setError(null);

    try {
      const data = await loadAssetLogs(
        searchedAssetId,
        {
          limit: 20,
          cursor: nextCursor,
        },
      );

      setLogs((current) => [
        ...current,
        ...data.logs,
      ]);

      setHasMore(data.page.hasMore);
      setNextCursor(data.page.nextCursor);
    } catch (requestError) {
      setError(resolveErrorMessage(requestError));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section
      className="device-log-panel"
      aria-label="장비 관련 로그 목록"
    >
      <header>
        <div>
          <small>DEVICE RELATED LOGS</small>
          <h2>장비 관련 로그</h2>
        </div>

        <span>assetId 기준 조회</span>
      </header>

      <form
        className="device-log-filter"
        onSubmit={handleSearch}
      >
        <label htmlFor="device-log-asset-id">
          assetId
        </label>

        <div className="device-log-input-group">
          <input
            id="device-log-asset-id"
            type="text"
            value={assetId}
            onChange={(event) =>
              setAssetId(event.target.value)
            }
            placeholder="Core asset UUID 입력"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={
              hasAssetId && !validAssetId
            }
            aria-describedby="device-log-asset-id-help"
          />

          <small
            id="device-log-asset-id-help"
            className={
              hasAssetId && !validAssetId
                ? "device-log-validation invalid"
                : "device-log-validation"
            }
          >
            {hasAssetId && !validAssetId
              ? "올바른 UUID 형식의 assetId를 입력하세요."
              : "Core에서 발급된 물리 장비 UUID를 입력합니다."}
          </small>
        </div>

        <button
          type="submit"
          disabled={!validAssetId || loading}
        >
          {loading ? "조회 중..." : "로그 조회"}
        </button>
      </form>

      {searchedAssetId && (
        <p className="device-log-query-note">
          조회 assetId: {searchedAssetId}
        </p>
      )}

      {error && (
        <div
          className="device-log-error"
          role="alert"
        >
          <strong>
            장비 로그를 불러오지 못했습니다.
          </strong>
          <span>{error}</span>
        </div>
      )}

      <div className="device-log-table-wrap">
        <table>
          <thead>
            <tr>
              <th>수신 시각</th>
              <th>업체</th>
              <th>메시지 유형</th>
              <th>송신 장비</th>
              <th>보고 장비</th>
              <th>상태</th>
              <th>메시지</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7}>
                  <div className="device-log-empty">
                    <strong>
                      장비 로그를 조회하고 있습니다.
                    </strong>
                  </div>
                </td>
              </tr>
            ) : logs.length > 0 ? (
              logs.map((log) => (
                <tr key={log.request_id}>
                  <td>
                    {formatReceivedAt(
                      log.received_at,
                    )}
                  </td>
                  <td>{log.vendor_code}</td>
                  <td>
                    {log.payload_type ?? "-"}
                  </td>
                  <td className="device-log-id-cell">
                    {log.source_device_id ?? "-"}
                  </td>
                  <td className="device-log-id-cell">
                    {log.reported_by_device_id ?? "-"}
                  </td>
                  <td>
                    <span className="device-log-status">
                      {log.status ?? "-"}
                    </span>
                  </td>
                  <td
                    className="device-log-message-cell"
                    title={JSON.stringify(
                      log.normalized_payload ??
                        log.payload ??
                        {},
                    )}
                  >
                    {summarizePayload(log)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7}>
                  <div className="device-log-empty">
                    <strong>
                      {!searchedAssetId
                        ? "조회할 장비의 assetId를 입력하세요."
                        : error
                          ? "조회 결과를 표시할 수 없습니다."
                          : "조회된 관련 로그가 없습니다."}
                    </strong>

                    <span>
                      Core에 저장된 장비 연동 메시지를
                      assetId 기준 최신순으로 조회합니다.
                    </span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {hasMore && nextCursor && (
        <div className="device-log-pagination">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore}
          >
            {loadingMore
              ? "불러오는 중..."
              : "더 보기"}
          </button>
        </div>
      )}

      {lastRegisteredAt && (
        <p className="device-registration-note">
          최근 장비 등록 처리:{" "}
          {lastRegisteredAt.toLocaleString("ko-KR")}
        </p>
      )}
    </section>
  );
}