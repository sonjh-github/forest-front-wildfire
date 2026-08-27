import { useState } from "react";

export type DeviceLogViewRow = {
  id: string;
  receivedAt: string;
  assetId: string;
  deviceName: string;
  vendor: string;
  deviceType: string;
  status: string;
  message: string;
};

type DeviceLogListProps = {
  lastRegisteredAt: Date | null;
  apiReady?: boolean;
  logs?: DeviceLogViewRow[];
  loading?: boolean;
  error?: string | null;
  onSearch?: (assetId: string) => void;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function DeviceLogList({
  lastRegisteredAt,
  apiReady = false,
  logs = [],
  loading = false,
  error = null,
  onSearch,
}: DeviceLogListProps) {
  const [assetId, setAssetId] = useState("");

  const normalizedAssetId = assetId.trim();
  const hasAssetId = normalizedAssetId.length > 0;
  const validAssetId = UUID_PATTERN.test(normalizedAssetId);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!apiReady || loading || !validAssetId || !onSearch) {
      return;
    }

    onSearch(normalizedAssetId);
  }

  return (
    <section className="device-log-panel" aria-label="장비 로그 목록">
      <header>
        <div>
          <small>DEVICE LOG LIST</small>
          <h2>장비 로그 목록</h2>
        </div>
        <span>{apiReady ? "Core API 연결됨" : "Core API 연결 준비"}</span>
      </header>

      <form className="device-log-filter" onSubmit={handleSubmit}>
        <label htmlFor="device-log-asset-id">assetId</label>

        <div className="device-log-input-group">
          <input
            id="device-log-asset-id"
            type="text"
            value={assetId}
            onChange={(event) => setAssetId(event.target.value)}
            placeholder="Core asset UUID 입력"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={hasAssetId && !validAssetId}
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
              : "Core에서 발급된 assetId UUID를 입력합니다."}
          </small>
        </div>

        <button
          type="submit"
          disabled={
            !apiReady ||
            loading ||
            !validAssetId ||
            !onSearch
          }
          title={
            !apiReady
              ? "Core 로그 API 연결 후 사용할 수 있습니다."
              : !validAssetId
                ? "올바른 assetId UUID를 입력하세요."
                : "assetId 기준 장비 로그 조회"
          }
        >
          {loading ? "조회 중..." : "로그 조회"}
        </button>
      </form>

      {error && (
        <div className="device-log-error" role="alert">
          <strong>장비 로그를 불러오지 못했습니다.</strong>
          <span>{error}</span>
        </div>
      )}

      <div className="device-log-table-wrap">
        <table>
          <thead>
            <tr>
              <th>수신 시각</th>
              <th>assetId</th>
              <th>장비</th>
              <th>업체</th>
              <th>deviceType</th>
              <th>상태</th>
              <th>메시지</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7}>
                  <div className="device-log-empty">
                    <strong>장비 로그를 조회하고 있습니다.</strong>
                  </div>
                </td>
              </tr>
            ) : logs.length > 0 ? (
              logs.map((log) => (
                <tr key={log.id}>
                  <td>{log.receivedAt}</td>
                  <td>{log.assetId}</td>
                  <td>{log.deviceName}</td>
                  <td>{log.vendor}</td>
                  <td>{log.deviceType}</td>
                  <td>{log.status}</td>
                  <td>{log.message}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7}>
                  <div className="device-log-empty">
                    <strong>
                      {!hasAssetId
                        ? "조회할 장비의 assetId를 입력하세요."
                        : !validAssetId
                          ? "assetId 형식을 확인하세요."
                          : apiReady
                            ? "조회할 준비가 되었습니다."
                            : "Core 로그 API 연결을 기다리고 있습니다."}
                    </strong>
                    <span>
                      Core 로그 API 연결 후 assetId 기준으로 실데이터를 조회합니다.
                    </span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {lastRegisteredAt && (
        <p className="device-registration-note">
          최근 장비 등록 처리: {lastRegisteredAt.toLocaleString("ko-KR")}
        </p>
      )}
    </section>
  );
}