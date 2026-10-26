import { cameraPerformance, type RtpMetrics } from "./cameraPerformance";
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
  const [rtpMetrics,setRtpMetrics]=useState<RtpMetrics|null>(null);
  const [availability,setAvailability]=useState<Availability|null>(null);
  const [receptionState, setReceptionState] = useState<ReceptionState | "IDLE" | "STOPPED">("IDLE");
  const indicators=cameraPerformance(rtpMetrics,receptionState,connecting);
  const updateLabels={WAITING:"영상 수신 대기",LOADING:"조회 중",NORMAL:"새 영상 수신 중",DELAYED:"영상 갱신 지연",STALLED:"새 영상 확인 안 됨",STOPPED:"연결 중지",UNAVAILABLE:"RTP 계측 불가"};
  const sharingLabels={WAITING:"순서번호 구간 수집 중",PASS:"RTP 수신율 목표 충족",FAIL:"RTP 수신율 목표 미달",UNCONFIRMED:"현재 영상 수신 확인 안 됨",STOPPED:"연결 중지",UNAVAILABLE:"RTP 계측 불가"};

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
          const status = await dashboardApi<{data:{status:ReceptionState;message?:string;availability?:Availability|null;rtpMetrics?:RtpMetrics|null}}>(`/api/v1/dashboard/cameras/sessions/${id}`);
          if (!active) return;
          setAvailability(status.data.availability ?? null);
          setRtpMetrics(status.data.rtpMetrics ?? null);
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
        <p>디코딩 전 영상 RTP 패킷이 계속 들어오는지 확인합니다.</p>
        <div className="camera-indicator-state" data-state={indicators.update} role="status">{updateLabels[indicators.update]}</div>
        <span>평균 패킷 수신 간격 <strong>{frameSeconds(rtpMetrics?.averageIntervalMs)}</strong></span>
        <span>최대 패킷 수신 간격 <strong>{frameSeconds(rtpMetrics?.maxIntervalMs)}</strong></span>
        <small>마지막 RTP 패킷 수신: {frameTime(rtpMetrics?.lastPacketReceivedAt)}</small>
        <small>{receptionState==="STOPPED" ? "종료 시 미수신 경과" : "현재 미수신 경과"}: {frameSeconds(rtpMetrics?.silenceMs)}</small>
        {indicators.update==="STALLED" && <p className="camera-metric-note">새 RTP 순서번호가 확인되지 않고 있습니다. 이전 평균값과 현재 수신 상태는 별개입니다.</p>}
        <details><summary>계산 근거</summary><small>중계 서버가 TCP에서 원본 영상 RTP 패킷을 읽은 시각으로 최근 {rtpMetrics?.sampleCount ?? 0}/100개 간격을 계산합니다. 누적 {rtpMetrics?.packetCount ?? 0}패킷. 프레임 간격과는 다릅니다.</small><small>순서번호가 5초 넘게 증가하지 않으면 수신 중으로 판정하지 않습니다. 지터 {frameSeconds(rtpMetrics?.jitterMs)} · RTCP 송신 보고 {rtpMetrics?.rtcpSenderReports ?? 0}건.</small></details>
      </div>
      <div><header><strong>정보 공유 성공률</strong><b>목표 98% 이상</b></header>
        <p>현재 세션의 최신 RTP 순서번호 100개 구간에서 누락을 확인합니다.</p>
        <div className="camera-indicator-state" data-state={indicators.sharing} role="status">{sharingLabels[indicators.sharing]}</div>
        <span>RTP 패킷 수신율 <strong>{indicators.sharing==="PASS" || indicators.sharing==="FAIL" ? `${rtpMetrics!.successPercent!.toFixed(1)}%` : "—"}</strong></span>
        <small>순서번호 {rtpMetrics?.fromSequence ?? "—"} ~ {rtpMetrics?.toSequence ?? "—"} · 수신 {rtpMetrics?.receivedCount ?? 0} / {rtpMetrics?.expectedCount ?? 0}개 · 누락 {rtpMetrics?.missingCount ?? 0}개</small>
        <small>중복 {rtpMetrics?.duplicateCount ?? 0}개 · 중복은 한 번만 집계</small>
        {indicators.sharing==="WAITING" && <small>순서번호 100개 구간이 쌓이면 판정합니다. 재접속·송신원 변경 시 새로 수집합니다.</small>}
        {rtpMetrics?.missingSequences.length ? <small>누락 번호: {rtpMetrics.missingSequences.join(", ")}</small> : null}
        {rtpMetrics?.error && <small role="alert">{rtpMetrics.error}</small>}
        <details><summary>비교 방법</summary><small>고유 수신 번호 ÷ 기대 번호 100개 × 100. RTP 16비트 순서번호의 순환과 지연 도착을 반영합니다. SSRC {rtpMetrics?.ssrc ?? "—"} · 연결 {rtpMetrics?.connections ?? 0}회.</small><small>현재 RTSP/TCP 연결에서 관측한 수신율입니다. TCP 재전송으로 복구된 손실과 단절 중 전송되지 않은 구간은 확인할 수 없어 TVWS 무선망 자체의 손실률을 뜻하지 않습니다.</small></details>
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
