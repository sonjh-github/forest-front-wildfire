import { LpwaRecoveryLog } from "./NetworkAvailability";
import { Fragment, useEffect, useState } from "react";
import { dashboardApi } from "../../http-api/client";
import "./rtk-packets.css";
import { rtkPacketMetrics, rtkIndicatorStates } from "./rtkPacketMetrics";

type Packet = {
  id:string;eventExternalId:string|null;receivedAt:string|null;occurredAt:string|null;delayMs:number|null;
  storageStatus:string|null;latitude:number|null;longitude:number|null;altitude:number|null;
  fixType:string|null;fixState:string;coordinateState:string;frameCounter:number|null;
  devEui:string|null;networkType:string|null;rssiDbm:number|null;snrDb:number|null;payload:Record<string,unknown>;
};
type RtkData = {
  selectedDevice:{id:string;code:string;type:string}|null;packets:Packet[];checkedAt:string;
  receiverState:string;latestReceivedAt:string|null;lastStoredAt:string|null;
  sharingIssue?:string|null;
  sharingComparison?:{offset:number;requiredRecords:number;availableRecords:number;latest:Pick<Packet,"frameCounter"|"receivedAt"|"occurredAt">|null;baseline:Pick<Packet,"frameCounter"|"receivedAt"|"occurredAt">|null};
  sharingWindow?:{missingRanges:Array<{from:number;to:number}>;sampleCount:number;fromCounter:number;toCounter:number;expectedCount:number;receivedCount:number;missingCount:number;successRatePercent:number}|null;
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
  const latestReceivedAgeMs=data && latest?.receivedAt ? Math.max(0,Date.parse(data.checkedAt)-Date.parse(latest.receivedAt)) : null;
  const comparison=data?.sharingComparison;
  const sharingWindow=comparison && data?.sharingWindow?.sampleCount!=null ? data.sharingWindow : null;
  const sharingIssue=comparison ? data?.sharingIssue : data ? "WAITING_HISTORY" : undefined;
  const indicatorStates=rtkIndicatorStates(metrics,data?.receiverState,sharingWindow,Boolean(error),latestReceivedAgeMs,sharingIssue);
  const updateLabels={LOADING:"조회 중",UNKNOWN:"확인 불가",NORMAL:"새 데이터 갱신 정상",DELAYED:"새 데이터 갱신 지연",STALLED:"새 데이터 확인 안 됨"};
  const sharingLabels={WAITING:"대기 중",LOADING:"조회 중",UNKNOWN:"계산 불가",PASS:"수신율 목표 충족",FAIL:"수신율 목표 미달",UNCONFIRMED:sharingIssue==="NO_PROGRESS" ? "번호 변화 없음" : "현재 전달 확인 안 됨"};
  const sharingEvaluable=indicatorStates.sharing==="PASS" || indicatorStates.sharing==="FAIL";
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
      <div><header><strong>위치정보 갱신주기</strong><b>목표 5초 이하</b></header>
        <p>지금 새 위치 데이터가 계속 들어오는지 확인합니다.</p>
        <div className="rtk-indicator-state" data-state={indicatorStates.update} role="status">{updateLabels[indicatorStates.update]}</div>
        <span>평균 갱신 간격 <strong>{metrics?.frameIntervalMs!=null ? delay(metrics.frameIntervalMs) : "—"}</strong></span>
        <span>최대 갱신 간격 <strong>{metrics?.maxFrameIntervalMs!=null ? delay(metrics.maxFrameIntervalMs) : "—"}</strong></span>
        <small>마지막 새 데이터 수신: {metrics?.lastNewFrameReceivedAt ? time(metrics.lastNewFrameReceivedAt) : "현재 조회 기록만으로 확인 불가"}</small>
        {indicatorStates.update==="STALLED" && metrics && <p className="rtk-frame-stalled">수신은 계속되고 있지만, 최신 {metrics.latestCounterRepeatedCount}건의 데이터 번호가 같습니다.</p>}
        <details className="rtk-metric-evidence"><summary>계산 근거</summary><small>서로 다른 데이터 번호의 최초 측정 시각으로 간격을 계산합니다.</small>{metrics && latest && <><small>최신 FCnt {latest.frameCounter} · 동일 번호 연속 {metrics.latestCounterRepeatedCount}건</small><small>조회 기록 범위 {delay(metrics.latestCounterObservedSpanMs)} · 실제 정체 시작 시각을 뜻하지 않습니다.</small><small>중복 포함 로그 간격: {metrics.measuredIntervalMs===null ? "" : delay(metrics.measuredIntervalMs)}</small></>}</details>
      </div>
      <div><header><strong>정보 공유 성공률</strong><b>목표 98% 이상</b></header>
        <p>웹에 표시된 최신 패킷과 100건 전 기록을 비교합니다.</p>
        <div className="rtk-indicator-state" data-state={indicatorStates.sharing} role="status">{sharingLabels[indicatorStates.sharing]}</div>
        {indicatorStates.sharing==="WAITING" ? <p className="rtk-delivery-counts">100건 전 기록을 기다리고 있습니다.<small>{comparison ? `현재 ${comparison.availableRecords}건 / 비교에 ${comparison.requiredRecords}건 필요` : "비교 기록 조회 대기"}</small></p>
        : comparison?.baseline && comparison.latest && <div className="rtk-counter-comparison" role="group" aria-label="100건 전과 최신 패킷 비교">
          <div><small>100건 전 번호</small><strong>{value(comparison.baseline.frameCounter)}</strong><small>{time(comparison.baseline.receivedAt)}</small></div>
          <span aria-hidden="true">→</span>
          <div><small>최신 번호</small><strong>{value(comparison.latest.frameCounter)}</strong><small>{time(comparison.latest.receivedAt)}</small></div>
        </div>}
        {sharingWindow && <><p className="rtk-delivery-counts">누락 번호 <b>{sharingWindow.missingCount}개</b></p>
          <div className="rtk-missing-numbers" data-missing={sharingWindow.missingCount>0} role="group" aria-label="누락 번호 목록">{sharingWindow.missingCount>0 ? sharingWindow.missingRanges.map(range=>range.from===range.to ? String(range.from) : `${range.from}~${range.to}`).join(", ") : "비교한 두 번호 사이에 빠진 번호는 없습니다."}</div>
          {sharingEvaluable && <span>구간 수신율 <strong>{sharingWindow.successRatePercent.toFixed(1)}%</strong></span>}
        </>}
        {sharingIssue==="NO_PROGRESS" && <p className="rtk-frame-stalled">두 시점의 번호가 같습니다. 새 번호가 추가되지 않아 성공률을 판정하지 않습니다.</p>}
        {sharingIssue==="COUNTER_ORDER" && <small>번호가 되돌아갔거나 순서가 바뀌어 누락 번호를 계산할 수 없습니다.</small>}
        {sharingIssue==="INVALID_COUNTER" && <small>번호가 없거나 잘못된 기록이 있어 계산을 보류합니다.</small>}
        <details className="rtk-metric-evidence"><summary>비교 방법</summary><small>동일한 조회 결과에서 최신 기록과 100건 전인 101번째 기록을 가져옵니다.</small><small>100건 전 번호 다음부터 최신 번호까지 실제 수신하지 못한 번호를 찾습니다. 같은 번호는 한 번만 셉니다.</small>{sharingWindow && <small>평가 번호 {sharingWindow.fromCounter}~{sharingWindow.toCounter} · {sharingWindow.expectedCount}개 중 {sharingWindow.receivedCount}개 수신</small>}</details>
      </div>
    </section>
    {data?.selectedDevice?.type==="RTK_TERMINAL" && <LpwaRecoveryLog key={assetId} assetId={assetId} />}
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
