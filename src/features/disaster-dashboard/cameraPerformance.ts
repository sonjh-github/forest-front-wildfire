export type FrameMetrics = {frameCount:number;sampleCount:number;averageIntervalMs:number|null;maxIntervalMs:number|null;lastFrameReceivedAt:string|null;silenceMs:number|null};
export function cameraPerformance(frames:FrameMetrics|null,receptionState:string,checks:string[],connecting:boolean) {
  const update=receptionState==="STOPPED" ? "STOPPED" : frames?.lastFrameReceivedAt==null ? connecting ? "LOADING" : "WAITING"
    : receptionState==="FAILED" || receptionState==="STALLED" || frames.silenceMs===null || frames.silenceMs>5000 ? "STALLED"
    : frames.averageIntervalMs===null ? "WAITING" : frames.averageIntervalMs>5000 || (frames.maxIntervalMs!==null && frames.maxIntervalMs>5000) ? "DELAYED" : "NORMAL";
  const samples=checks.slice(-100);
  const successes=samples.filter(state=>state==="READY").length;
  const sharing=update==="STOPPED" ? "STOPPED" : update!=="NORMAL" && samples.length>=100 ? "UNCONFIRMED" : samples.length<100 ? "WAITING" : successes>=98 ? "PASS" : "FAIL";
  return {update,sharing,successes,sampleCount:samples.length,successPercent:samples.length ? successes/samples.length*100 : null} as const;
}
