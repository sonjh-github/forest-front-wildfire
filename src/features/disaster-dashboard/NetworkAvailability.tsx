import {useEffect,useState,type ReactNode} from "react";
import {dashboardApi} from "../../http-api/client";
import "./network-availability.css";
export type Availability = {id:string;network:"LPWA"|"TVWS";startedAt:string;endedAt:string|null;checkedAt:string;state:"UP"|"DOWN";totalMs:number;upMs:number;downMs:number;availabilityPercent:number|null};
const seconds=(ms:number)=>`${(ms/1000).toFixed(1)}초`;
const clock=(date:string)=>new Date(date).toLocaleString("ko-KR",{timeZone:"Asia/Seoul",hour12:false});
export function NetworkAvailability({network,data,children}:{network:"LPWA"|"TVWS";data:Availability|null;children?:ReactNode}) {
  const stale=data && !data.endedAt && Date.now()-Date.parse(data.checkedAt)>5000;
  const state=!data ? "측정 대기" : data.endedAt ? "측정 종료" : stale ? "점검 확인 필요" : data.state==="UP" ? "서비스 정상" : "서비스 중단";
  return <section className="network-availability" aria-label={`${network} 통신망 가용률`}>
    <header><strong>{network} 통신망 가용률</strong><b data-state={data?.endedAt || stale ? "ENDED" : data?.state}>{state}</b></header>
    <strong className="network-availability-value">{data?.availabilityPercent!=null ? `${data.availabilityPercent.toFixed(2)}%` : "—"}</strong>
    <div className="network-availability-times"><span>총 운영시간 <b>{data ? seconds(data.totalMs) : "—"}</b></span><span>정상시간 <b>{data ? seconds(data.upMs) : "—"}</b></span><span>중단시간 <b>{data ? seconds(data.downMs) : "—"}</b></span></div>
    <small>(총 운영시간 − 총 중단시간) ÷ 총 운영시간 × 100 · 서비스 수신 기준</small>
    <small>{network==="LPWA" ? "2초 송신 기준 · 새 FCnt를 확인한 뒤 정상 판정, 6초간 새 번호가 없으면 중단. 중복 재전송은 제외합니다." : "현재 연결한 RTSP 주소 기준 · 영상이 10초 이내 갱신되면 정상. 주소를 바꿔 연결하면 새 측정을 시작합니다."}</small>
    <small>서버에서 약 1초 간격으로 상태·시간 누적 · 연결 준비와 단말·카메라 고장도 중단에 포함합니다.</small>
    {data && <small>시작 {clock(data.startedAt)}{data.endedAt ? ` · 종료 ${clock(data.endedAt)}` : ""}</small>}
    {children}
  </section>;
}
export function LpwaAvailability({assetId}:{assetId:string}) {
  const [data,setData]=useState<Availability|null>(null);
  const [error,setError]=useState("");const [busy,setBusy]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
    async function refresh() {
      try {const response=await dashboardApi<{data:Availability|null}>(`/api/v1/dashboard/network-availability/lpwa/${encodeURIComponent(assetId)}`,{signal:controller.signal});if(!controller.signal.aborted){setData(response.data);setError("");}}
      catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error ? reason.message : "측정 조회 실패");}
      finally {if(!controller.signal.aborted)timer=setTimeout(refresh,2000);}
    }
    void refresh();return()=>{controller.abort();clearTimeout(timer);};
  },[assetId,busy]);
  async function control(action:"start"|"stop") {
    setBusy(true);
    try {const response=await dashboardApi<{data:Availability}>(`/api/v1/dashboard/network-availability/lpwa/${encodeURIComponent(assetId)}/${action}`,{method:"POST"});setData(response.data);setError("");}
    catch(reason){setError(reason instanceof Error ? reason.message : "측정 변경 실패");}finally{setBusy(false);}
  }
  const running=data && !data.endedAt;
  return <NetworkAvailability network="LPWA" data={data}>
    <div className="network-availability-actions"><button type="button" disabled={busy || Boolean(error)} onClick={()=>void control(running ? "stop" : "start")}>{busy ? "처리 중…" : running ? "측정 중지" : data ? "새 측정 시작" : "측정 시작"}</button><small>창을 닫아도 측정은 계속됩니다. 측정 중지 시 종료됩니다. 서버 재시작 시 마지막 확인 시점으로 종료합니다.</small></div>
    {error && <p role="alert">측정 오류: {error}</p>}
  </NetworkAvailability>;
}
