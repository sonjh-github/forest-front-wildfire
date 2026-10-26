import {describe,it,expect} from "vitest";
import {cameraPerformance,type RtpMetrics} from "./cameraPerformance";
const rtp:RtpMetrics={available:true,error:null,windowMs:200000,observedMs:200000,missingSequencesTruncated:false,packetCount:100,sampleCount:99,averageIntervalMs:12,maxIntervalMs:50,lastPacketReceivedAt:"2026-10-26T00:00:00Z",silenceMs:20,sequenceSilenceMs:20,sequenceStatus:"READY",ssrc:"00000001",fromSequence:1,toSequence:100,expectedCount:100,receivedCount:98,missingCount:2,missingSequences:[40,50],duplicateCount:0,successPercent:98,jitterMs:1,rtcpSenderReports:0,connections:1};
describe("server RTP update status remains separate from browser sharing",()=>{
 it("reports current source progress",()=>{expect(cameraPerformance(rtp,"READY",false).update).toBe("NORMAL");});
 it("does not call duplicate-only or stale source reception healthy",()=>{
  for(const change of [{silenceMs:5001},{sequenceSilenceMs:5001}])expect(cameraPerformance({...rtp,...change},"READY",false).update).toBe("STALLED");
  expect(cameraPerformance(null,"FAILED",false).update).toBe("STALLED");
 });
 it("reports maximum delay, startup and stop",()=>{expect(cameraPerformance({...rtp,maxIntervalMs:5001},"READY",false).update).toBe("DELAYED");expect(cameraPerformance(null,"CONNECTING",true).update).toBe("LOADING");expect(cameraPerformance(rtp,"STOPPED",false).update).toBe("STOPPED");});
});
