import { useEffect, useState, type FormEvent } from "react";
import { dashboardApi, DASHBOARD_API_BASE_URL } from "../../http-api/client";
import VideoPlayback from "./VideoPlayback";
import "./camera-panel.css";

type CameraSession = { id: string; playbackPath: string };
export default function CameraPanel() {
  const [uri, setUri] = useState("rtsp://210.99.70.120:1935/live/cctv001.stream");
  const [requestedUri, setRequestedUri] = useState("");
  const [playbackUri, setPlaybackUri] = useState("");
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [showAddress, setShowAddress] = useState(false);

  useEffect(() => {
    if (!requestedUri) return;
    let active = true;
    let id: string | undefined;
    const stop = () => {
      if (id) void dashboardApi(`/api/v1/dashboard/cameras/sessions/${id}/stop`, {method:"POST"}).catch(() => {});
      id = undefined;
    };
    setConnecting(true);
    setPlaybackUri("");
    setError("");
    void (async () => {
      try {
        const response = await dashboardApi<{data:CameraSession}>("/api/v1/dashboard/cameras/sessions", {
          method:"POST", body:JSON.stringify({uri:requestedUri}),
        });
        id = response.data.id;
        if (!active) { stop(); return; }
        const deadline = Date.now() + 30_000;
        while (active && Date.now() < deadline) {
          const status = await dashboardApi<{data:{status:string;message?:string}}>(`/api/v1/dashboard/cameras/sessions/${id}`);
          if (!active) return;
          if (status.data.status === "FAILED") throw new Error(status.data.message);
          if (status.data.status === "READY") {
            setPlaybackUri(`${DASHBOARD_API_BASE_URL}${response.data.playbackPath}`);
            setConnecting(false);
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        if (active) throw new Error("영상 연결 시간이 초과됐습니다. 카메라 주소와 네트워크를 확인하세요.");
      } catch (caught) {
        stop();
        if (active) {
          setError(caught instanceof Error ? caught.message : "카메라 연결에 실패했습니다.");
          setConnecting(false);
          setRequestedUri("");
        }
      }
    })();
    return () => { active = false; stop(); };
  }, [requestedUri]);

  function connect(event: FormEvent) {
    event.preventDefault();
    try {
      const parsed = new URL(uri.trim());
      if (parsed.protocol !== "rtsp:" || !parsed.hostname) throw new Error();
      setError("");
      setRequestedUri(uri.trim());
    } catch { setError("rtsp:// 형식의 카메라 주소를 입력하세요."); }
  }

  return <section className="camera-panel" aria-label="카메라 영상">
    <p>RTSP 주소를 입력해 현장 카메라 영상을 확인하세요.</p>
    <form onSubmit={connect}>
      <label htmlFor="camera-rtsp">RTSP 주소</label>
      <input id="camera-rtsp" type={showAddress ? "text" : "password"} value={uri}
        onChange={(event) => setUri(event.target.value)} placeholder="rtsp://카메라주소:554/경로"
        autoComplete="off" spellCheck={false} required disabled={Boolean(requestedUri)} />
      <label className="camera-address-toggle"><input type="checkbox" checked={showAddress} onChange={(event) => setShowAddress(event.target.checked)} />주소 표시</label>
      <div className="camera-actions">
        <button type="submit" disabled={!uri.trim() || Boolean(requestedUri)}>{connecting ? "연결 중…" : "영상 연결"}</button>
        <button type="button" disabled={!requestedUri} onClick={() => { setRequestedUri(""); setPlaybackUri(""); setConnecting(false); }}>연결 중지</button>
      </div>
    </form>
    {error && <p className="camera-error" role="alert">{error}</p>}
    <div className="camera-screen" aria-live="polite">
      {playbackUri ? <VideoPlayback streamUri={playbackUri} enabled label="현장 카메라" />
        : <p>{connecting ? "카메라에서 영상을 수신하고 있습니다…" : "연결된 카메라가 없습니다."}</p>}
    </div>
    <small>카메라는 중계 서버에서 접근 가능한 네트워크에 있어야 합니다. 주소는 저장되지 않으며, 탭을 닫으면 연결이 종료됩니다.</small>
  </section>;
}
