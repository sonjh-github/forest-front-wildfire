type Sample = {frameCounter:number|null;occurredAt:string|null;receivedAt:string|null};
function timestamp(value:string|null) {
  const result=value ? Date.parse(value) : NaN;
  return Number.isFinite(result) ? result : null;
}
function meanInterval(times:number[]) {
  if(times.length<2)return null;
  times.sort((a,b)=>a-b);
  return (times[times.length-1]-times[0])/(times.length-1);
}
export function rtkPacketMetrics(packets:Sample[]) {
  const frames=new Map<number,number|null>();
  const latestCounter=packets[0]?.frameCounter;
  const latestRun:number[]=[];
  let priorCounterObserved=false;
  if(latestCounter!=null && Number.isSafeInteger(latestCounter) && latestCounter>=0) {
    for(const packet of packets) {
      if(packet.frameCounter!==latestCounter) {
        priorCounterObserved=packet.frameCounter!=null && Number.isSafeInteger(packet.frameCounter) && packet.frameCounter>=0;
        break;
      }
      const received=timestamp(packet.receivedAt);
      if(received!==null)latestRun.push(received);
    }
  }
  const receivedTimes:number[]=[];
  const allMeasuredTimes:number[]=[];
  let validCounterCount=0;
  for(const packet of packets) {
    const received=timestamp(packet.receivedAt);
    if(received!==null)receivedTimes.push(received);
    const measured=timestamp(packet.occurredAt);
    if(measured!==null)allMeasuredTimes.push(measured);
    const counter=packet.frameCounter;
    if(counter===null || !Number.isSafeInteger(counter) || counter<0)continue;
    validCounterCount++;
    const previous=frames.get(counter);
    // Retries with a rewritten timestamp must not count as new frames.
    frames.set(counter, previous==null ? measured : measured===null ? previous : Math.min(previous,measured));
  }
  const measuredTimes=[...frames.values()].filter((time):time is number=>time!==null).sort((a,b)=>a-b);
  const counters=[...frames.keys()];
  return {
    lastNewFrameReceivedAt:priorCounterObserved && latestRun.length ? new Date(Math.min(...latestRun)).toISOString() : null,
    latestCounterRepeatedCount:latestRun.length,latestCounterObservedSpanMs:latestRun.length>=2 ? Math.max(...latestRun)-Math.min(...latestRun) : null,
    uniqueCount:frames.size,duplicateCount:validCounterCount-frames.size,
    missingCounterCount:packets.length-validCounterCount,
    minCounter:counters.length ? Math.min(...counters) : null,
    maxCounter:counters.length ? Math.max(...counters) : null,
    maxFrameIntervalMs:measuredTimes.length<2 ? null : Math.max(...measuredTimes.slice(1).map((time,index)=>time-measuredTimes[index])),
    frameIntervalMs:meanInterval(measuredTimes),frameIntervalSamples:Math.max(0,measuredTimes.length-1),
    measuredIntervalMs:meanInterval(allMeasuredTimes),measuredIntervalSamples:Math.max(0,allMeasuredTimes.length-1),
    receivedIntervalMs:meanInterval(receivedTimes),receivedIntervalSamples:Math.max(0,receivedTimes.length-1),
  };
}

export function rtkIndicatorStates(metrics:ReturnType<typeof rtkPacketMetrics>|null,receiverState:string|undefined,
  sharingWindow:{expectedCount:number;successRatePercent:number}|null|undefined,hasError=false,latestReceivedAgeMs:number|null=null,sharingIssue?:string|null) {
  const update=hasError ? "UNKNOWN" : !metrics ? "LOADING"
    : receiverState==="DELAYED" || receiverState==="NO_RECENT_RECEPTION" ? "DELAYED"
    : receiverState!=="RECEIVING" ? "UNKNOWN"
    : latestReceivedAgeMs!==null && !Number.isFinite(latestReceivedAgeMs) ? "UNKNOWN"
    : latestReceivedAgeMs!==null && latestReceivedAgeMs>5000 ? "DELAYED"
    : metrics.latestCounterObservedSpanMs!==null && metrics.latestCounterObservedSpanMs>5000 ? "STALLED"
    : metrics.frameIntervalMs===null ? "UNKNOWN" : metrics.frameIntervalMs<=5000 ? "NORMAL" : "DELAYED";
  const deliveryActive=metrics!==null && receiverState==="RECEIVING" && metrics.frameIntervalMs!==null
    && (metrics.latestCounterObservedSpanMs===null || metrics.latestCounterObservedSpanMs<=5000)
    && (latestReceivedAgeMs===null || (Number.isFinite(latestReceivedAgeMs) && latestReceivedAgeMs<=5000));
  const sharing=hasError ? "UNKNOWN" : !metrics ? "LOADING" : sharingIssue==="WAITING_HISTORY" ? "WAITING" : !deliveryActive ? "UNCONFIRMED" : !sharingWindow ? "UNKNOWN"
    : !Number.isFinite(sharingWindow.successRatePercent) || sharingWindow.successRatePercent<0 || sharingWindow.successRatePercent>100 ? "UNKNOWN"
    : sharingWindow.expectedCount<2 ? "UNCONFIRMED" : sharingWindow.successRatePercent>=98 ? "PASS" : "FAIL";
  return {update,sharing} as const;
}
