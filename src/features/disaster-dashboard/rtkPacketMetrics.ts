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
  const measuredTimes=[...frames.values()].filter((time):time is number=>time!==null);
  const counters=[...frames.keys()];
  return {
    uniqueCount:frames.size,duplicateCount:validCounterCount-frames.size,
    missingCounterCount:packets.length-validCounterCount,
    minCounter:counters.length ? Math.min(...counters) : null,
    maxCounter:counters.length ? Math.max(...counters) : null,
    frameIntervalMs:meanInterval(measuredTimes),frameIntervalSamples:Math.max(0,measuredTimes.length-1),
    measuredIntervalMs:meanInterval(allMeasuredTimes),measuredIntervalSamples:Math.max(0,allMeasuredTimes.length-1),
    receivedIntervalMs:meanInterval(receivedTimes),receivedIntervalSamples:Math.max(0,receivedTimes.length-1),
  };
}
