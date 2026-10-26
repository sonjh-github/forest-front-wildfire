export type FrameMetrics = {frameCount:number;sampleCount:number;averageIntervalMs:number|null;maxIntervalMs:number|null;lastFrameReceivedAt:string|null;silenceMs:number|null};
export type RtpMetrics = {available:boolean;error:string|null;packetCount:number;sampleCount:number;averageIntervalMs:number|null;maxIntervalMs:number|null;lastPacketReceivedAt:string|null;silenceMs:number|null;sequenceSilenceMs:number|null;sequenceStatus:string;ssrc:string|null;fromSequence:number|null;toSequence:number|null;expectedCount:number;receivedCount:number;missingCount:number;missingSequences:number[];duplicateCount:number;successPercent:number|null;jitterMs:number|null;rtcpSenderReports:number;connections:number};
export function cameraPerformance(rtp:RtpMetrics|null,receptionState:string,connecting:boolean) {
  const update=receptionState==="STOPPED" ? "STOPPED" : rtp && !rtp.available ? "UNAVAILABLE" : rtp?.lastPacketReceivedAt==null ? connecting ? "LOADING" : "WAITING"
    : receptionState==="FAILED" || rtp.silenceMs===null || rtp.silenceMs>5000 || rtp.sequenceSilenceMs===null || rtp.sequenceSilenceMs>5000 ? "STALLED"
    : rtp.averageIntervalMs===null ? "WAITING" : rtp.averageIntervalMs>5000 || (rtp.maxIntervalMs!==null && rtp.maxIntervalMs>5000) ? "DELAYED" : "NORMAL";
  const sharing=update==="STOPPED" ? "STOPPED" : update==="UNAVAILABLE" ? "UNAVAILABLE" : update==="STALLED" || rtp?.sequenceStatus==="RESET_PENDING" ? "UNCONFIRMED" : !rtp || rtp.expectedCount<100 || rtp.sequenceStatus!=="READY" ? "WAITING" : rtp.successPercent!==null && rtp.successPercent>=98 ? "PASS" : "FAIL";
  return {update,sharing} as const;
}
