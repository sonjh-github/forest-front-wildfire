import { ReceptionRecoveryLog, type Availability } from "./NetworkAvailability";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { dashboardApi, DASHBOARD_API_BASE_URL } from "../../http-api/client";
import VideoPlayback from "./VideoPlayback";
import "./camera-panel.css";

type ReceptionState = "READY" | "CONNECTING" | "STALLED" | "FAILED";
const receptionLabels = {READY:"정상 수신",CONNECTING:"연결 준비 중",STALLED:"영상 수신 지연",FAILED:"수신 실패",IDLE:"점검 대기",STOPPED:"연결 중지"};
type CameraSession = { id: string; playbackPath: string };
export default function CameraPanel() {
  const [uri, setUri] = useState("rtsp://210.99.70.120:1935/live/cctv001.stream");
  const [requestedUri, setRequestedUri] = useState("");
  const [playbackUri, setPlaybackUri] = useState("");
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [showAddress, setShowAddress] = useState(false);

  const measurementGeneration=useRef(0);
  const [availability,setAvailability]=useState<Availability|null>(null);
  const [checks, setChecks] = useState<ReceptionState[]>([]);
  const [receptionState, setReceptionState] = useState<ReceptionState | "IDLE" | "STOPPED">("IDLE");
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const successfulChecks = checks.filter(state => state === "READY").length;

  useEffect(() => {
    if (!requestedUri) return;
    const generation=++measurementGeneration.current;
    let active = true;
    let id: string | undefined;
    const stop = () => {
      if (id) void dashboardApi<{data:{availability:Availability|null}}>(`/api/v1/dashboard/cameras/sessions/${id}/stop`, {method:"POST"}).then(response=>{if(generation===measurementGeneration.current)setAvailability(response.data.availability);}).catch(() => {});
      id = undefined;
    };
    setAvailability(null);
    setChecks([]);
    setCheckedAt(null);
    setReceptionState("CONNECTING");
    const recordCheck = (state: ReceptionState) => {
      setChecks(previous => [...previous,state].slice(-100));
      setReceptionState(state);
      setCheckedAt(Date.now());
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
        let ready = false;
        while (active) {
          const checkStartedAt = performance.now();
          const status = await dashboardApi<{data:{status:ReceptionState;message?:string;availability?:Availability|null}}>(`/api/v1/dashboard/cameras/sessions/${id}`);
          if (!active) return;
          setAvailability(status.data.availability ?? null);
          if (status.data.status === "FAILED") {setError(status.data.message ?? "영상 수신 실패");setPlaybackUri("");setConnecting(false);ready=false;recordCheck("FAILED");await new Promise(resolve=>setTimeout(resolve,100));continue;}
          setError("");
          if (!ready && status.data.status !== "READY" && Date.now() >= deadline) {setError("영상 수신이 지연되고 있습니다. 수신 재개 시각을 기다리고 있습니다.");setConnecting(false);}
          recordCheck(status.data.status);
          if (status.data.status === "READY" && !ready) {
            ready = true;
            setPlaybackUri(`${DASHBOARD_API_BASE_URL}${response.data.playbackPath}`);
            setConnecting(false);
          }
          await new Promise((resolve) => setTimeout(resolve, Math.max(0,100 - (performance.now() - checkStartedAt))));
        }
      } catch (caught) {
        stop();
        if (active) {
          recordCheck("FAILED");
          setPlaybackUri("");
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
    <p>RTSP 주소를 입력해 현장 카메라 영상을 확인하세요. 연결 중에도 주소를 편집하고 변경한 주소로 다시 연결할 수 있습니다.</p>
    <form onSubmit={connect}>
      <label htmlFor="camera-rtsp">RTSP 주소</label>
      <input id="camera-rtsp" type={showAddress ? "text" : "password"} value={uri}
        onChange={(event) => setUri(event.target.value)} placeholder="rtsp://카메라주소:554/경로"
        autoComplete="off" spellCheck={false} required />
      <label className="camera-address-toggle"><input type="checkbox" checked={showAddress} onChange={(event) => setShowAddress(event.target.checked)} />주소 표시</label>
      <div className="camera-actions">
        <button type="submit" disabled={!uri.trim() || uri.trim() === requestedUri}>{connecting && uri.trim() === requestedUri ? "연결 중…" : requestedUri ? "변경한 주소로 연결" : "영상 연결"}</button>
        <button type="button" disabled={!requestedUri} onClick={() => { setRequestedUri(""); setPlaybackUri(""); setConnecting(false); setReceptionState("STOPPED"); }}>연결 중지</button>
      </div>
    </form>
    {error && <p className="camera-error" role="alert">{error}</p>}
    <ReceptionRecoveryLog network="TVWS" data={availability} />
    <section className="camera-reception" aria-label="RTSP 통신 성공률">
      <header><strong>RTSP 통신 성공률</strong><b data-state={receptionState}>{receptionLabels[receptionState]}</b></header>
      <p className="camera-reception-rate">{checks.length ? `${(successfulChecks / checks.length * 100).toFixed(1)}%` : "—"}</p>
      <p>최근 {checks.length}/100회 점검 · 정상 {successfulChecks}회</p>
      <small>준비 {checks.filter(state => state === "CONNECTING").length} · 지연 {checks.filter(state => state === "STALLED").length} · 실패 {checks.filter(state => state === "FAILED").length}</small>
      <small>0.1초 간격 · 최근 100회(약 10초) 중계 서버 영상 갱신 확인 · 10초 이내 갱신 시 정상. 정상 횟수 ÷ 전체 점검 횟수이며 준비 중도 포함합니다.</small>
      <small>{checkedAt ? `마지막 점검: ${new Date(checkedAt).toLocaleTimeString("ko-KR",{timeZone:"Asia/Seoul",hour12:false})}` : "영상 연결 후 집계를 시작합니다."} 주소 변경·새 연결 시 집계를 초기화합니다. 패킷 손실률과는 다릅니다.</small>
    </section>
    <div className="camera-screen" aria-live="polite">
      {playbackUri ? <VideoPlayback streamUri={playbackUri} enabled label="현장 카메라" />
        : <p>{connecting ? "카메라에서 영상을 수신하고 있습니다…" : "연결된 카메라가 없습니다."}</p>}
    </div>
    <small>카메라는 중계 서버에서 접근 가능한 네트워크에 있어야 합니다. 주소는 저장되지 않으며, 탭을 닫으면 연결이 종료됩니다.</small>
  </section>;
}
