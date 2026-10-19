import { Fragment, useEffect, useState } from "react";
import { dashboardApi } from "../../http-api/client";
import "./rtk-packets.css";
import { rtkPacketMetrics } from "./rtkPacketMetrics";

type Packet = {
  id:string;eventExternalId:string|null;receivedAt:string|null;occurredAt:string|null;delayMs:number|null;
  storageStatus:string|null;latitude:number|null;longitude:number|null;altitude:number|null;
  fixType:string|null;fixState:string;coordinateState:string;frameCounter:number|null;
  devEui:string|null;networkType:string|null;rssiDbm:number|null;snrDb:number|null;payload:Record<string,unknown>;
};
type RtkData = {
  selectedDevice:{id:string;code:string;type:string}|null;packets:Packet[];checkedAt:string;
  receiverState:string;latestReceivedAt:string|null;lastStoredAt:string|null;
  sharingWindow?:{fromCounter:number;toCounter:number;expectedCount:number;receivedCount:number;missingCount:number;successRatePercent:number}|null;
  summary:{count:number;confirmed:number;noFix:number;zero:number;unknownFix:number};
};
const fixes:Record<string,string> = {RTK_FIXED:"RTK 고정해",RTK_FLOAT:"RTK 유동해",DGPS:"차분 측위",GNSS:"일반 GNSS",NO_FIX:"측위 미확정",UNKNOWN:"Fix 정보 미확인"};
const coordinates:Record<string,string> = {VALID:"좌표·Fix 확인",ZERO:"0,0 · 위치 미수신",MISSING:"좌표 누락",INVALID:"좌표 범위 오류",UNCONFIRMED:"수신 좌표 · 측위 미확정"};
const reception:Record<string,string> = {RECEIVING:"최근 수신 중",DELAYED:"수신 지연",NO_RECENT_RECEPTION:"최근 수신 없음",WAITING:"수신 이력 없음"};
function time(value:string|null) { return value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString("ko-KR",{timeZone:"Asia/Seoul",hour12:false}) : ""; }
function value(value:number|null, suffix="") { return value === null ? "" : `${value}${suffix}`; }
function delay(value:number|null) { return value === null ? "확인 불가" : value < 0 ? "장비 시각이 서버보다 미래 · 시각 확인 필요" : value >= 86_400_000 ? `${Math.floor(value/86_400_000)}일 ${Math.floor((value%86_400_000)/3_600_000)}시간` : value >= 3_600_000 ? `${(value/3_600_000).toFixed(1)}시간` : value >= 60_000 ? `${(value/60_000).toFixed(1)}분` : `${(value/1000).toFixed(1)}초`; }

export default function RtkPacketPanel({assetId}:{assetId:string}) {
  const [data,setData] = useState<RtkData|null>(null);
  const [error,setError] = useState("");
  const [revision,setRevision] = useState(0);
  const [refreshing,setRefreshing] = useState(true);
  const [expanded,setExpanded] = useState<string|null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let timer:ReturnType<typeof setTimeout>|undefined;
    setRefreshing(true);
    async function refresh() {
      try {
        const response = await dashboardApi<{data:RtkData}>(`/api/v1/dashboard/rtk/packets?assetId=${encodeURIComponent(assetId)}`,{signal:controller.signal});
        if (!controller.signal.aborted) {setData(response.data);setError("");}
      } catch(reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "RTK 패킷을 불러오지 못했습니다.");
      } finally {
        if (!controller.signal.aborted) {setRefreshing(false);timer = setTimeout(refresh,5000);}
      }
    }
    void refresh();
    return () => {controller.abort();if(timer)clearTimeout(timer);};
  },[assetId,revision]);
  const latest=data?.packets[0];
  const metrics=data ? rtkPacketMetrics(data.packets) : null;
  const frameStalled=metrics?.latestCounterObservedSpanMs!=null && metrics.latestCounterObservedSpanMs>5000;
  return <section className="rtk-packet-panel" aria-busy={refreshing} aria-label="RTK 최근 100개 패킷">
    <header className="rtk-packet-heading"><div><strong>현재 상태</strong><small>수신·측위·좌표·측정 시각 · 5초마다 갱신</small></div><button type="button" disabled={refreshing} onClick={() => setRevision(v=>v+1)}>{refreshing ? "조회 중…" : "새로고침"}</button></header>
    {data && <>
      <div className="rtk-status-grid" role="group" aria-label="현재 상태">
        <div><span>서버 수신 상태</span><strong data-state={error ? "UNKNOWN" : data.receiverState}>{error ? "확인 불가" : reception[data.receiverState] ?? data.receiverState}</strong><small>{time(data.latestReceivedAt)}</small></div>
        <div><span>최신 저장 패킷 Fix</span><strong data-state={latest?.fixState}>{latest ? fixes[latest.fixState] : ""}</strong><small>{latest?.fixType ?? ""}</small></div>
        <div><span>좌표 상태</span><strong data-state={latest?.coordinateState}>{latest ? coordinates[latest.coordinateState] : ""}</strong><small>{latest ? [value(latest.latitude),value(latest.longitude)].filter(Boolean).join(", ") : ""}</small></div>
        <div><span>장비 측정 시각</span><strong>{time(latest?.occurredAt ?? null)}</strong>{latest?.delayMs != null && <small>측정 → 수신 지연: {delay(latest.delayMs)}</small>}</div>
      </div>
    </>}
    {error && <p role="alert" className="rtk-packet-error">조회 실패: {error} {data ? "· 아래 값은 마지막 조회 결과입니다." : ""}</p>}
    {!data && !error && <div className="rtk-packet-loading">
      <p role="status">최근 100개 패킷을 불러오고 있습니다.</p>
      <div className="rtk-status-grid" aria-hidden="true">{["서버 수신 상태", "최신 저장 패킷 Fix", "좌표 상태", "장비 측정 시각"].map(label => <div key={label}><span>{label}</span><i className="rtk-loading-line" /><i className="rtk-loading-line short" /></div>)}</div>
      <div className="rtk-loading-table" aria-hidden="true">{Array.from({length:6},(_,index)=><i className="rtk-loading-line" key={index} />)}</div>
    </div>}
    <section className="rtk-performance-targets" aria-label="위치정보 성능 지표">
      <div><header><strong>위치정보 갱신주기</strong><b>목표 5초 이하</b></header><p>대원/차량의 위치정보 실시간 송신 주기</p><span>새 FCnt 평균 간격 <strong>{frameStalled ? "FCnt 정체" : metrics?.frameIntervalMs != null ? delay(metrics.frameIntervalMs) : metrics ? "갱신 미확인" : ""}</strong></span><small>서로 다른 FCnt의 최초 장비 측정 시각 기준</small>{metrics && <small>로그 수신 기록 간격: {metrics.measuredIntervalMs===null ? "" : delay(metrics.measuredIntervalMs)} · 중복 포함</small>}</div>
      <div><header><strong>정보 공유 성공률</strong><b>목표 98% 이상</b></header><p>실시간 대원/차량의 위치정보 성공 전달률</p><span>번호 구간 누적 수신율 <strong>{data?.sharingWindow ? `${data.sharingWindow.successRatePercent.toFixed(1)}%` : ""}</strong></span>{data?.sharingWindow && <><small>수신 {data.sharingWindow.receivedCount} / {data.sharingWindow.expectedCount}개 · 미수신 {data.sharingWindow.missingCount}개</small><small>FCnt {data.sharingWindow.fromCounter} ~ {data.sharingWindow.toCounter} · 중복은 1회 집계</small></>}{frameStalled && metrics && latest && <p className="rtk-frame-stalled" role="status">최신 {metrics.latestCounterRepeatedCount}건 연속 FCnt {latest.frameCounter} · 최소 {delay(metrics.latestCounterObservedSpanMs)} 동안 새 번호 수신 없음</p>}</div>
    </section>
    {data && <>
      <h3 className="rtk-history-heading">패킷 이력 · 최근 100개</h3>
      <p className="rtk-state-explanation">수신 중: 30초 이내 · 지연: 30~120초 · 이후 최근 수신 없음. 통신 수신과 측위 확정은 별개입니다. 좌표가 있어도 Fix 미확정이면 정상 측위로 계산하지 않습니다.</p>
      <div className="rtk-packet-counts"><span>최근 <b>{data.summary.count}</b>/100건</span><span>좌표·Fix 확인 <b>{data.summary.confirmed}</b></span><span>No Fix <b>{data.summary.noFix}</b></span><span>0,0 <b>{data.summary.zero}</b></span><span>Fix 미확인 <b>{data.summary.unknownFix}</b></span></div>
      <p className="rtk-state-explanation">아래 목록은 DB에 저장된 RTK_POSITION 패킷 기준입니다. 0,0·No Fix도 제외하지 않습니다. 서버 수신 상태는 실시간 수신 캐시를 포함합니다. 조회: {time(data.checkedAt)}</p>
      {latest && <>
        <div className="rtk-latest-meta"><span>DevEUI: {latest.devEui ?? ""}</span><span>망: {latest.networkType ?? ""}</span><span>최근 저장: {time(data.lastStoredAt)}</span></div>
        <div className="rtk-packet-table" tabIndex={0} aria-label="최근 패킷 표 · 가로 스크롤 가능">
          <table><thead><tr><th>#</th><th>서버 수신 / 장비 측정 (KST)</th><th>FCnt</th><th>Fix / 좌표 상태</th><th>위도 / 경도</th><th>고도 m</th><th>RSSI dBm</th><th>SNR dB</th><th>저장 / 원문</th></tr></thead>
          <tbody>{data.packets.map((packet,index) => <Fragment key={packet.id}>
            <tr><td>{index+1}</td><td><time>{time(packet.receivedAt)}</time><small>{time(packet.occurredAt)}</small>{packet.delayMs!==null && <small>지연 {delay(packet.delayMs)}</small>}</td><td>{value(packet.frameCounter)}</td>
              <td><strong data-state={packet.fixState}>{fixes[packet.fixState] ?? packet.fixState}</strong><small>{packet.fixType ?? ""}</small><small>{coordinates[packet.coordinateState]}</small></td>
              <td>{value(packet.latitude)}<small>{value(packet.longitude)}</small></td><td>{value(packet.altitude)}</td><td>{value(packet.rssiDbm)}</td><td>{value(packet.snrDb)}</td>
              <td><small>{packet.storageStatus === "PERSISTED" ? "저장 완료" : packet.storageStatus ?? "확인 불가"}</small><button type="button" aria-expanded={expanded===packet.id} onClick={()=>setExpanded(expanded===packet.id ? null : packet.id)}>JSON 원문</button></td></tr>
            {expanded===packet.id && <tr><td colSpan={9}><p>이벤트: {packet.eventExternalId ?? "미수신"} · 요청: {packet.id}</p><pre>{JSON.stringify(packet.payload,null,2)}</pre></td></tr>}
          </Fragment>)}</tbody></table>
        </div>
      </>}
    </>}
  </section>;
}
