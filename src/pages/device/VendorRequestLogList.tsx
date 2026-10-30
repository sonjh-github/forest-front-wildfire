import { useCallback, useEffect, useState } from "react";
import { loadVendorRequestLogs, type VendorRequestLog } from "../../http-api/vendor-request-log-api";

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ko-KR", { hour12: false });
}

function summarize(value: unknown) {
  const text = value == null ? "-" : JSON.stringify(value);
  return text.length > 140 ? `${text.slice(0, 137)}...` : text;
}

export default function VendorRequestLogList() {
  const [logs, setLogs] = useState<VendorRequestLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setLogs(await loadVendorRequestLogs(100));
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "운영 로그를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return (
    <section className="device-log-panel vendor-request-log-panel" aria-label="Vendor 요청 응답 운영기록">
      <header>
        <div>
          <small>LIVE VENDOR REQUEST LOGS</small>
          <h2>장비 연동 운영기록</h2>
        </div>
        <button type="button" className="log-refresh" onClick={() => void refresh()}>새로고침</button>
      </header>
      {error && <div className="device-log-error" role="alert"><strong>운영기록 조회 실패</strong><span>{error}</span></div>}
      <div className="device-log-table-wrap">
        <table>
          <thead><tr><th>수신 시각</th><th>구분</th><th>요청</th><th>응답</th><th>처리시간</th><th>주소</th><th>요청 본문</th><th>응답 본문</th></tr></thead>
          <tbody>
            {logs.map((log) => <tr key={log.log_id}>
              <td>{formatTime(log.received_at)}</td>
              <td><span className="device-log-status">{log.category}</span></td>
              <td>{log.method}</td>
              <td>{log.status_code}</td>
              <td>{log.duration_ms}ms</td>
              <td className="device-log-message-cell" title={log.url}>{log.url}</td>
              <td className="device-log-message-cell" title={JSON.stringify(log.request_body)}>{summarize(log.request_body)}</td>
              <td className="device-log-message-cell" title={JSON.stringify(log.response_body)}>{summarize(log.response_body)}</td>
            </tr>)}
            {!logs.length && <tr><td colSpan={8}><div className="device-log-empty"><strong>{loading ? "운영기록을 불러오는 중입니다." : "아직 수신된 Vendor 요청이 없습니다."}</strong><span>Vendor API 요청이 들어오면 Core SQLite 저장 후 5초 이내 표시됩니다.</span></div></td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
