import {useEffect,useState,type ReactNode} from "react";
import {dashboardApi} from "../../http-api/client";
import "./network-availability.css";
export type Availability = {receptionBasis?:"RTP"|null;id:string;network:"LPWA"|"TVWS";startedAt:string;endedAt:string|null;checkedAt:string;state:"UP"|"DOWN";firstReceivedAt?:string|null;recoveries?:Array<{receivedAt:string;frameCounter:number|null}>};
const clock=(date:string)=>new Date(date).toLocaleString("ko-KR",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",fractionalSecondDigits:3,hour12:false});
export function ReceptionRecoveryLog({network,data,children}:{network:"LPWA"|"TVWS";data:Availability|null;children?:ReactNode}) {
  const receivedAt=data?.recoveries?.at(-1)?.receivedAt ?? data?.firstReceivedAt;
  return <section className="network-availability" aria-label={`${network} 수신 재개 시각`}>
    <header><strong>{network} 재개 시각</strong></header>
    {receivedAt ? <time className="network-recovery-time" dateTime={receivedAt}>{clock(receivedAt)}</time> : <span className="network-recovery-time">—</span>}
    {children}
  </section>;
}

export function LpwaRecoveryLog({assetId}:{assetId:string}) {
  const [data,setData]=useState<Availability|null>(null);
  const [error,setError]=useState("");
  useEffect(()=>{
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
    async function refresh() {
      try {const response=await dashboardApi<{data:Availability|null}>(`/api/v1/dashboard/network-availability/lpwa/${encodeURIComponent(assetId)}`,{signal:controller.signal});if(!controller.signal.aborted){setData(response.data);setError("");}}
      catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error ? reason.message : "기록 조회 실패");}
      finally {if(!controller.signal.aborted)timer=setTimeout(refresh,2000);}
    }
    void refresh();return()=>{controller.abort();clearTimeout(timer);};
  },[assetId]);
  return <ReceptionRecoveryLog network="LPWA" data={data}>
    {error && <p role="alert">기록 오류: {error}</p>}
  </ReceptionRecoveryLog>;
}
