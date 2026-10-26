import {VideoSharingMetrics,type VideoSharingSnapshot} from "./videoSharingMetrics";
import { cameraPerformance, type RtpMetrics } from "./cameraPerformance";
import { ReceptionRecoveryLog, type Availability } from "./NetworkAvailability";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { dashboardApi, DASHBOARD_API_BASE_URL, HttpApiError } from "../../http-api/client";
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
        <button type="button" disabled={!requestedUri} onClick={() => { if(sharingRecorder.current)setSharing(sharingRecorder.current.stop(performance.now())); setRequestedUri(""); setPlaybackUri(""); setConnecting(false); setReceptionState("STOPPED"); }}>연결 중지</button>
      </div>
    </form>
    {error && <p className="camera-error" role="alert">{error}</p>}
    <section className="camera-performance-targets" aria-label="TVWS 영상 성능 지표">
      <div><header><strong>영상정보 갱신주기</strong><b>목표 5초 이하</b></header>
        <p>디코딩 전 영상 RTP 패킷이 계속 들어오는지 확인합니다.</p>
        <div className="camera-indicator-state" data-state={indicators.update} role="status">{updateLabels[indicators.update]}</div>
        <span>평균 패킷 수신 간격 <strong>{frameSeconds(rtpMetrics?.averageIntervalMs)}</strong></span>
        <span>최대 패킷 수신 간격 <strong>{frameSeconds(rtpMetrics?.maxIntervalMs)}</strong></span>
        <small>마지막 RTP 패킷 수신: {frameTime(rtpMetrics?.lastPacketReceivedAt)}</small>
        <small>{receptionState==="STOPPED" ? "종료 시 미수신 경과" : "현재 미수신 경과"}: {frameSeconds(rtpMetrics?.silenceMs)}</small>
        {indicators.update==="STALLED" && <p className="camera-metric-note">새 RTP 순서번호가 확인되지 않고 있습니다. 이전 평균값과 현재 수신 상태는 별개입니다.</p>}
        <details><summary>계산 근거</summary><small>중계 서버가 TCP에서 원본 영상 RTP 패킷을 읽은 시각으로 최근 200초 동안의 {rtpMetrics?.sampleCount ?? 0}개 간격을 계산합니다. 누적 {rtpMetrics?.packetCount ?? 0}패킷. 프레임 간격과는 다릅니다.</small><small>순서번호가 5초 넘게 증가하지 않으면 수신 중으로 판정하지 않습니다. 지터 {frameSeconds(rtpMetrics?.jitterMs)} · RTCP 송신 보고 {rtpMetrics?.rtcpSenderReports ?? 0}건.</small></details>
      </div>
      <div><header><strong>정보 공유 성공률</strong><b>목표 98% 이상</b></header>
        <p>최근 200초 중 이 웹 PC가 새 영상을 정상 수신한 시간의 비율입니다.</p>
        <div className="camera-indicator-state" data-state={sharingState} role="status">{sharingLabels[sharingState]}</div>
        <span>정보 공유 성공률 <strong>{sharing?.successPercent==null ? "—" : `${sharing.successPercent.toFixed(1)}%`}</strong></span>
        <small>정상 수신 {((sharing?.receivedMs ?? 0)/1000).toFixed(1)}초 · 미수신 {((sharing?.interruptedMs ?? 0)/1000).toFixed(1)}초</small>
        <small>집계 {Math.floor((sharing?.observedMs ?? 0)/1000)} / 200초 · 현재 {sharing?.stopped ? "측정 중지" : sharing?.receiving ? "영상 수신 중" : "새 영상 미수신"}</small>
        {sharingState==="WAITING" && <small>첫 영상 수신부터 자동 집계합니다. 200초가 쌓이면 판정하며, 연결이 끊겨도 집계는 유지합니다.</small>}
        <details><summary>계산 방법 · RTP 참고</summary><small>(200초 − 웹 영상 미수신 시간) ÷ 200초 × 100. 미수신 10초이면 95%입니다. PC 오프라인, 영상 멈춤, 재연결 대기 시간을 포함합니다. 와이파이 복구 후 새 영상 데이터를 받아 재생할 때 수신을 재개합니다.</small><small>웹 PC 기준이며 서버 RTP 수신·재개 시각과 별도입니다. 주소 변경·새 연결 버튼으로 새로 시작하고, 자동 재연결 중에는 기록을 초기화하지 않습니다.</small><small>서버 RTP 참고: 번호 {rtpMetrics?.fromSequence ?? "—"} ~ {rtpMetrics?.toSequence ?? "—"} · 수신 {rtpMetrics?.receivedCount ?? 0}/{rtpMetrics?.expectedCount ?? 0}개 · 누락 {rtpMetrics?.missingCount ?? 0}개 · 중복 {rtpMetrics?.duplicateCount ?? 0}개. 이 번호 수신율을 정보 공유 성공률로 사용하지 않습니다.</small></details>
      </div>
    </section>
    <ReceptionRecoveryLog network="TVWS" data={availability} />
    <div className="camera-screen" aria-live="polite">
      {playbackUri ? <VideoPlayback streamUri={playbackUri} enabled label="현장 카메라" onReceptionChange={receptionChange} />
        : <p>{connecting ? "카메라에서 영상을 수신하고 있습니다…" : "연결된 카메라가 없습니다."}</p>}
    </div>
    <small>카메라는 중계 서버에서 접근 가능한 네트워크에 있어야 합니다. 주소는 저장되지 않으며, 탭을 닫으면 연결이 종료됩니다.</small>
  </section>;
}
