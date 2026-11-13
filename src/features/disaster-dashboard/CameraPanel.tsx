import {VideoSharingMetrics,type VideoSharingSnapshot} from "./videoSharingMetrics";
import { cameraPerformance, type RtpMetrics } from "./cameraPerformance";
import { ReceptionRecoveryLog, type Availability } from "./NetworkAvailability";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { dashboardApi, DASHBOARD_API_BASE_URL, HttpApiError } from "../../http-api/client";
import VideoPlayback from "./VideoPlayback";
import "./camera-panel.css";

type ReceptionState = "READY" | "CONNECTING" | "STALLED" | "FAILED";
const frameSeconds=(ms:number|null|undefined)=>ms==null ? "—" : `${(ms/1000).toFixed(3)}초`;
const frameTime=(date:string|null|undefined)=>date ? new Date(date).toLocaleString("ko-KR",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",fractionalSecondDigits:3,hour12:false}) : "—";
type CameraSession = { id: string; playbackPath: string };
export default function CameraPanel({initialUri, title}: {initialUri: string; title: string}) {
  const [uri, setUri] = useState(initialUri);
  const addressId = useId();
  const [expanded, setExpanded] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!expanded) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
      if (event.key === "Tab") {
        const controls = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), summary, video, [tabindex="0"]') ?? []).filter(node => node.getClientRects().length);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panelRef.current)) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", keydown);
    return () => { window.removeEventListener("keydown", keydown); document.body.style.overflow = overflow; if(previous?.isConnected) previous.focus(); else panelRef.current?.querySelector('button')?.focus(); };
  }, [expanded]);
  const [requestedUri, setRequestedUri] = useState("");
  const [playbackUri, setPlaybackUri] = useState("");
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [showAddress, setShowAddress] = useState(false);

  const sharingRecorder=useRef<VideoSharingMetrics|null>(null);
  const [sharing,setSharing]=useState<VideoSharingSnapshot|null>(null);
  const receptionChange=useCallback((receiving:boolean,at:number)=>sharingRecorder.current?.record(receiving,at),[]);
  useEffect(()=>{
    if(!requestedUri)return;
    const recorder=new VideoSharingMetrics();sharingRecorder.current=recorder;setSharing(recorder.snapshot(performance.now()));
    const offline=()=>recorder.record(false,performance.now());
    window.addEventListener("offline",offline);
    const timer=setInterval(()=>setSharing(recorder.snapshot(performance.now())),250);
    return ()=>{clearInterval(timer);window.removeEventListener("offline",offline);recorder.stop(performance.now());};
  },[requestedUri]);
  const sharingState=sharing?.stopped ? "STOPPED" : sharing?.successPercent==null ? "WAITING" : sharing.successPercent>=98 ? "PASS" : "FAIL";
  const sharingLabels={WAITING:"200초 수집 중",PASS:"정보 공유 목표 충족",FAIL:"정보 공유 목표 미달",STOPPED:"측정 중지"};
  const measurementGeneration=useRef(0);
  const [rtpMetrics,setRtpMetrics]=useState<RtpMetrics|null>(null);
  const [availability,setAvailability]=useState<Availability|null>(null);
  const [receptionState, setReceptionState] = useState<ReceptionState | "IDLE" | "STOPPED">("IDLE");
  const indicators=cameraPerformance(rtpMetrics,receptionState,connecting);
  const updateLabels={WAITING:"영상 수신 대기",LOADING:"조회 중",NORMAL:"새 영상 수신 중",DELAYED:"영상 갱신 지연",STALLED:"새 영상 확인 안 됨",STOPPED:"연결 중지",UNAVAILABLE:"RTP 계측 불가"};

  useEffect(() => {
    if (!requestedUri) return;
    const generation=++measurementGeneration.current;
    let active = true;
    let id: string | undefined;
    const stop = () => {
      if (id) void dashboardApi<{data:{availability:Availability|null;rtpMetrics?:RtpMetrics|null}}>(`/api/v1/dashboard/cameras/sessions/${id}/stop`, {method:"POST"}).then(response=>{if(generation===measurementGeneration.current){setAvailability(response.data.availability);setRtpMetrics(response.data.rtpMetrics ?? null);}}).catch(() => {});
      id = undefined;
    };
    setAvailability(null);
    setRtpMetrics(null);
    setReceptionState("CONNECTING");
    const recordCheck = (state: ReceptionState) => {
      setReceptionState(state);
    };
    setConnecting(true);
    setPlaybackUri("");
    setError("");
    void (async () => {
      let playbackPath="",ready=false;
      const deadline=Date.now()+30000;
      while(active) {
        let checkStartedAt=performance.now();
        try {
          if(!id) {
            const response=await dashboardApi<{data:CameraSession}>("/api/v1/dashboard/cameras/sessions",{method:"POST",body:JSON.stringify({uri:requestedUri})});
            id=response.data.id;playbackPath=response.data.playbackPath;
            if(!active){stop();return;}
          }
          checkStartedAt=performance.now();
          const status=await dashboardApi<{data:{status:ReceptionState;message?:string;availability?:Availability|null;rtpMetrics?:RtpMetrics|null}}>(`/api/v1/dashboard/cameras/sessions/${id}`);
          if(!active)return;
          setAvailability(status.data.availability ?? null);setRtpMetrics(status.data.rtpMetrics ?? null);recordCheck(status.data.status);
          if(status.data.status==="FAILED") {
            setError(status.data.message ?? "영상 수신 실패 · 자동 재연결 중");setPlaybackUri("");setConnecting(false);ready=false;
          } else {
            setError("");
            if(!ready && status.data.status!=="READY" && Date.now()>=deadline){setError("영상 수신이 지연되고 있습니다. 자동으로 재연결을 기다립니다.");setConnecting(false);}
            if(status.data.status==="READY" && !ready){ready=true;setPlaybackUri(`${DASHBOARD_API_BASE_URL}${playbackPath}`);setConnecting(false);}
          }
        } catch(caught) {
          if(!active)return;
          setError("웹 연결을 확인할 수 없습니다. 자동 재연결 중이며 미수신 시간은 계속 집계합니다.");setConnecting(false);
          if(caught instanceof HttpApiError && caught.status===404){id=undefined;ready=false;setPlaybackUri("");}
          if(caught instanceof HttpApiError && [400,429].includes(caught.status)) {
            setError(caught.message);recordCheck("FAILED");stop();setRequestedUri("");return;
          }
          await new Promise(resolve=>setTimeout(resolve,Math.max(0,3000-(performance.now()-checkStartedAt))));continue;
        }
        await new Promise(resolve=>setTimeout(resolve,Math.max(0,3000-(performance.now()-checkStartedAt))));
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

  return <section ref={panelRef} tabIndex={-1} className={`camera-panel camera-tile${expanded ? " is-expanded" : ""}`} role={expanded ? "dialog" : "region"} aria-modal={expanded || undefined} aria-label={title}>
    <header className="camera-tile-header"><strong>{title}</strong><button type="button" onClick={() => setExpanded(value => !value)} aria-label={expanded ? `${title} 축소` : `${title} 확대`}>{expanded ? "축소 ✕" : "확대 ⛶"}</button></header>
    <div className="camera-tile-body">
      <div className="camera-screen">
        {playbackUri ? <VideoPlayback streamUri={playbackUri} enabled label={title} onReceptionChange={receptionChange} />
          : <p>{connecting ? "영상 연결 중…" : "영상을 연결하세요"}</p>}
        {!expanded && <button type="button" className="camera-expand-surface" onClick={() => setExpanded(true)} aria-label={`${title} 영상 크게 보기`} />}
      </div>
      <aside className="camera-tile-metrics" aria-label={`${title} 통신 지표`}>
        <section><strong>통신 성공률</strong><b>{sharing?.successPercent==null ? "—" : `${sharing.successPercent.toFixed(1)}%`}</b><small>{sharingLabels[sharingState]}</small><small>{Math.floor((sharing?.observedMs ?? 0)/1000)} / 200초</small></section>
        <section><strong>영상 갱신주기</strong><span>평균 <b>{frameSeconds(rtpMetrics?.averageIntervalMs)}</b></span><span>최대 <b>{frameSeconds(rtpMetrics?.maxIntervalMs)}</b></span><small>{updateLabels[indicators.update]}</small></section>
      </aside>
    </div>
    {error && <p className="camera-error" role="alert">{error}</p>}
    <div className="camera-tile-controls">
      <button type="button" disabled={!uri.trim() || uri.trim() === requestedUri} onClick={connect}>{connecting ? "연결 중…" : "영상 연결"}</button>
      <button type="button" disabled={!requestedUri} onClick={() => { if(sharingRecorder.current)setSharing(sharingRecorder.current.stop(performance.now())); setRequestedUri(""); setPlaybackUri(""); setConnecting(false); setReceptionState("STOPPED"); }}>중지</button>
      <details className="camera-address-settings"><summary>주소 편집</summary><form onSubmit={connect}>
        <label htmlFor={addressId}>RTSP 주소</label>
        <input id={addressId} type={showAddress ? "text" : "password"} value={uri} onChange={event => setUri(event.target.value)} autoComplete="off" spellCheck={false} required />
        <label className="camera-address-toggle"><input type="checkbox" checked={showAddress} onChange={event => setShowAddress(event.target.checked)} />주소 표시</label>
        <button type="submit" disabled={!uri.trim() || uri.trim() === requestedUri}>이 주소로 연결</button>
      </form></details>
    </div>
    {expanded && <div className="camera-expanded-details"><ReceptionRecoveryLog network="TVWS" data={availability} /><small>마지막 RTP 수신 {frameTime(rtpMetrics?.lastPacketReceivedAt)} · 미수신 경과 {frameSeconds(rtpMetrics?.silenceMs)}</small><small>최근 200초 정상 수신 {((sharing?.receivedMs ?? 0)/1000).toFixed(1)}초 · 미수신 {((sharing?.interruptedMs ?? 0)/1000).toFixed(1)}초</small></div>}
  </section>;
}
