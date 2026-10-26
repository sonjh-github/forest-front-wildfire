import {useEffect,useState,type ReactNode} from "react";
import {dashboardApi} from "../../http-api/client";
import "./network-availability.css";
export type Availability = {receptionBasis?:"RTP"|null;id:string;network:"LPWA"|"TVWS";startedAt:string;endedAt:string|null;checkedAt:string;state:"UP"|"DOWN";firstReceivedAt?:string|null;recoveries?:Array<{receivedAt:string;frameCounter:number|null}>};
const clock=(date:string)=>new Date(date).toLocaleString("ko-KR",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",fractionalSecondDigits:3,hour12:false});
export function ReceptionRecoveryLog({network,data,children}:{network:"LPWA"|"TVWS";data:Availability|null;children?:ReactNode}) {
  const stale=data && !data.endedAt && Date.now()-Date.parse(data.checkedAt)>5000;
  const state=!data ? "기록 대기" : data.endedAt ? "기록 종료" : stale ? "점검 확인 필요" : data.state==="UP" ? "수신 중" : "수신 대기";
  const recoveries=data?.recoveries ?? [];
  const latest=recoveries.at(-1);
  return <section className="network-availability" aria-label={`${network} 수신 재개 기록`}>
    <header><strong>{network} 수신 재개 시각</strong><b data-state={data?.endedAt || stale ? "ENDED" : data?.state}>{state}</b></header>
    <span>{network==="LPWA" ? "중단 후 첫 새 FCnt 수신 시각" : "중단 후 첫 RTP 패킷 수신 시각"}</span>
    <strong className="network-recovery-time">{latest ? clock(latest.receivedAt) : "아직 수신 재개 기록이 없습니다."}</strong>
    {latest?.frameCounter!=null && <small>수신 FCnt {latest.frameCounter}</small>}
    <small>서버 시각 · KST · 밀리초 표시</small>
    <small>{network==="LPWA" ? "새 FCnt가 6초간 없으면 중단으로 판정합니다. 재개 시 서버에 실제 저장된 첫 새 FCnt 수신 시각을 기록합니다." : "영상 RTP 패킷이 10초간 없으면 중단으로 판정합니다. 재개 시 디코딩 전 첫 RTP 패킷을 수신한 서버 시각을 기록합니다."}</small>
    {data?.firstReceivedAt && <small>최초 연결 수신: {clock(data.firstReceivedAt)} · 중단 후 재수신과 별도</small>}
    {recoveries.length>0 && <ol className="network-recovery-list" aria-label="수신 재개 이력">{recoveries.map((item,index)=><li key={`${item.receivedAt}-${index}`}><time dateTime={item.receivedAt}>{clock(item.receivedAt)}</time>{item.frameCounter!=null && <span>FCnt {item.frameCounter}</span>}</li>)}</ol>}
    {data && <small>기록 시작 {clock(data.startedAt)}{data.endedAt ? ` · 종료 ${clock(data.endedAt)}` : ""}</small>}
    {children}
  </section>;
}
export function LpwaRecoveryLog({assetId}:{assetId:string}) {
  const [data,setData]=useState<Availability|null>(null);
  const [error,setError]=useState("");const [busy,setBusy]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
    async function refresh() {
      try {const response=await dashboardApi<{data:Availability|null}>(`/api/v1/dashboard/network-availability/lpwa/${encodeURIComponent(assetId)}`,{signal:controller.signal});if(!controller.signal.aborted){setData(response.data);setError("");}}
      catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error ? reason.message : "기록 조회 실패");}
      finally {if(!controller.signal.aborted)timer=setTimeout(refresh,2000);}
    }
    void refresh();return()=>{controller.abort();clearTimeout(timer);};
  },[assetId,busy]);
  async function control(action:"start"|"stop") {
    setBusy(true);
    try {const response=await dashboardApi<{data:Availability}>(`/api/v1/dashboard/network-availability/lpwa/${encodeURIComponent(assetId)}/${action}`,{method:"POST"});setData(response.data);setError("");}
    catch(reason){setError(reason instanceof Error ? reason.message : "기록 변경 실패");}finally{setBusy(false);}
  }
  const running=data && !data.endedAt;
  return <ReceptionRecoveryLog network="LPWA" data={data}>
    <div className="network-availability-actions"><button type="button" disabled={busy || Boolean(error)} onClick={()=>void control(running ? "stop" : "start")}>{busy ? "처리 중…" : running ? "기록 중지" : data ? "새 기록 시작" : "기록 시작"}</button><small>케이블 분리 전에 기록을 시작하세요. 케이블 탈착 시각은 별도로 기록하시면 됩니다. 창을 닫아도 기록은 계속됩니다.</small></div>
    {error && <p role="alert">기록 오류: {error}</p>}
  </ReceptionRecoveryLog>;
}
