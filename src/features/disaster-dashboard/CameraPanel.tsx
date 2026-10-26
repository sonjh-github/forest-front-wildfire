import { cameraPerformance, type FrameMetrics } from "./cameraPerformance";
import { ReceptionRecoveryLog, type Availability } from "./NetworkAvailability";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { dashboardApi, DASHBOARD_API_BASE_URL } from "../../http-api/client";
import VideoPlayback from "./VideoPlayback";
import "./camera-panel.css";

type ReceptionState = "READY" | "CONNECTING" | "STALLED" | "FAILED";
const frameSeconds=(ms:number|null|undefined)=>ms==null ? "—" : `${(ms/1000).toFixed(3)}초`;
const frameTime=(date:string|null|undefined)=>date ? new Date(date).toLocaleString("ko-KR",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",fractionalSecondDigits:3,hour12:false}) : "—";
type CameraSession = { id: string; playbackPath: string };
export default function CameraPanel() {
  const [uri, setUri] = useState("rtsp://210.99.70.120:1935/live/cctv001.stream");
  const [requestedUri, setRequestedUri] = useState("");
  const [playbackUri, setPlaybackUri] = useState("");
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [showAddress, setShowAddress] = useState(false);

  const measurementGeneration=useRef(0);
  const [frameMetrics,setFrameMetrics]=useState<FrameMetrics|null>(null);
  const [availability,setAvailability]=useState<Availability|null>(null);
  const [checks, setChecks] = useState<ReceptionState[]>([]);
  const [receptionState, setReceptionState] = useState<ReceptionState | "IDLE" | "STOPPED">("IDLE");
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const indicators=cameraPerformance(frameMetrics,receptionState,checks,connecting);
  const updateLabels={WAITING:"영상 수신 대기",LOADING:"조회 중",NORMAL:"새 영상 수신 중",DELAYED:"영상 갱신 지연",STALLED:"새 영상 확인 안 됨",STOPPED:"연결 중지"};
  const sharingLabels={WAITING:"점검 기록 수집 중",PASS:"수신 확인 목표 충족",FAIL:"수신 확인 목표 미달",UNCONFIRMED:"현재 영상 수신 확인 안 됨",STOPPED:"연결 중지"};

  useEffect(() => {
    if (!requestedUri) return;
    const generation=++measurementGeneration.current;
    let active = true;
    let id: string | undefined;
    const stop = () => {
      if (id) void dashboardApi<{data:{availability:Availability|null;frameMetrics?:FrameMetrics|null}}>(`/api/v1/dashboard/cameras/sessions/${id}/stop`, {method:"POST"}).then(response=>{if(generation===measurementGeneration.current){setAvailability(response.data.availability);setFrameMetrics(response.data.frameMetrics ?? null);}}).catch(() => {});
      id = undefined;
    };
    setAvailability(null);
    setFrameMetrics(null);
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
          const status = await dashboardApi<{data:{status:ReceptionState;message?:string;availability?:Availability|null;frameMetrics?:FrameMetrics|null}}>(`/api/v1/dashboard/cameras/sessions/${id}`);
          if (!active) return;
          setAvailability(status.data.availability ?? null);
          setFrameMetrics(status.data.frameMetrics ?? null);
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
    <section className="camera-performance-targets" aria-label="TVWS 영상 성능 지표">
      <div><header><strong>영상정보 갱신주기</strong><b>목표 5초 이하</b></header>
        <p>지금 새 영상 데이터가 계속 들어오는지 확인합니다.</p>
        <div className="camera-indicator-state" data-state={indicators.update} role="status">{updateLabels[indicators.update]}</div>
        <span>평균 갱신 간격 <strong>{frameSeconds(frameMetrics?.averageIntervalMs)}</strong></span>
        <span>최대 갱신 간격 <strong>{frameSeconds(frameMetrics?.maxIntervalMs)}</strong></span>
        <small>마지막 새 영상 수신: {frameTime(frameMetrics?.lastFrameReceivedAt)}</small>
        <small>{receptionState==="STOPPED" ? "종료 시 미수신 경과" : "현재 미수신 경과"}: {frameSeconds(frameMetrics?.silenceMs)}</small>
        {indicators.update==="STALLED" && <p className="camera-metric-note">새 영상 프레임이 확인되지 않고 있습니다. 이전 평균값과 현재 수신 상태는 별개입니다.</p>}
        <details><summary>계산 근거</summary><small>15fps 변환 전 원본 프레임을 서버에서 하나씩 확인한 시각으로 최근 {frameMetrics?.sampleCount ?? 0}/100개 간격을 계산합니다. 누적 {frameMetrics?.frameCount ?? 0}프레임.</small><small>디코딩·일괄 수신의 영향을 포함합니다. 0.1초 상태 점검 간격을 영상 갱신 간격으로 사용하지 않습니다.</small></details>
      </div>
      <div><header><strong>정보 공유 성공률</strong><b>목표 98% 이상</b></header>
        <p>최근 100회 영상 수신 상태 점검을 기준으로 확인합니다.</p>
        <div className="camera-indicator-state" data-state={indicators.sharing} role="status">{sharingLabels[indicators.sharing]}</div>
        <span>영상 수신 확인율 <strong>{indicators.sharing==="PASS" || indicators.sharing==="FAIL" ? `${indicators.successPercent!.toFixed(1)}%` : "—"}</strong></span>
        <small>점검 {indicators.sampleCount}/100회 · 수신 확인 {indicators.successes}회 · 미확인 {indicators.sampleCount-indicators.successes}회</small>
        {indicators.sharing==="WAITING" && <small>100회 점검이 쌓이면 판정합니다.</small>}
        <details><summary>비교 방법</summary><small>0.1초 간격으로 RTSP 영상 수신 상태를 확인한 최근 100회 중 정상 확인된 비율입니다. 준비·실패도 포함합니다.</small><small>원본 프레임 연속번호가 제공되지 않아 FCnt 번호 비교나 프레임 전달률을 계산하는 값은 아닙니다.</small><small>{checkedAt ? `마지막 점검: ${new Date(checkedAt).toLocaleTimeString("ko-KR",{timeZone:"Asia/Seoul",hour12:false})}` : "점검 대기"} · 주소 변경·새 연결 시 초기화합니다.</small></details>
      </div>
    </section>
    <ReceptionRecoveryLog network="TVWS" data={availability} />
    <div className="camera-screen" aria-live="polite">
      {playbackUri ? <VideoPlayback streamUri={playbackUri} enabled label="현장 카메라" />
        : <p>{connecting ? "카메라에서 영상을 수신하고 있습니다…" : "연결된 카메라가 없습니다."}</p>}
    </div>
    <small>카메라는 중계 서버에서 접근 가능한 네트워크에 있어야 합니다. 주소는 저장되지 않으며, 탭을 닫으면 연결이 종료됩니다.</small>
  </section>;
}
