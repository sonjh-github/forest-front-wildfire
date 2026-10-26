import {describe,it,expect} from "vitest";
import {cameraPerformance,type RtpMetrics} from "./cameraPerformance";
const rtp:RtpMetrics={available:true,error:null,windowMs:200000,observedMs:200000,missingSequencesTruncated:false,packetCount:100,sampleCount:99,averageIntervalMs:12,maxIntervalMs:50,lastPacketReceivedAt:"2026-10-26T00:00:00Z",silenceMs:20,sequenceSilenceMs:20,sequenceStatus:"READY",ssrc:"00000001",fromSequence:1,toSequence:100,expectedCount:100,receivedCount:98,missingCount:2,missingSequences:[40,50],duplicateCount:0,successPercent:98,jitterMs:1,rtcpSenderReports:0,connections:1};
describe("actual RTP indicators",()=>{
 it("uses the inclusive 98% sequence threshold",()=>{expect(cameraPerformance(rtp,"READY",false)).toMatchObject({update:"NORMAL",sharing:"PASS"});expect(cameraPerformance({...rtp,successPercent:97},"READY",false).sharing).toBe("FAIL");});
 it("never calls stale or duplicate-only reception healthy",()=>{
  for(const change of [{silenceMs:5001},{sequenceSilenceMs:5001}])expect(cameraPerformance({...rtp,...change,successPercent:100},"READY",false)).toMatchObject({update:"STALLED",sharing:"UNCONFIRMED"});
  expect(cameraPerformance(rtp,"FAILED",false).sharing).toBe("UNCONFIRMED");expect(cameraPerformance(null,"FAILED",false)).toMatchObject({update:"STALLED",sharing:"UNCONFIRMED"});
 });
 it("waits for a complete new session window and blocks unconfirmed resets",()=>{expect(cameraPerformance({...rtp,observedMs:199999},"READY",false).sharing).toBe("WAITING");expect(cameraPerformance({...rtp,sequenceStatus:"RESET_PENDING"},"READY",false).sharing).toBe("UNCONFIRMED");expect(cameraPerformance({...rtp,available:false},"READY",false).sharing).toBe("UNAVAILABLE");});
 it("shows maximum delay, loading and stop explicitly",()=>{expect(cameraPerformance({...rtp,maxIntervalMs:5001},"READY",false).update).toBe("DELAYED");expect(cameraPerformance(null,"CONNECTING",true).update).toBe("LOADING");expect(cameraPerformance(rtp,"STOPPED",false)).toMatchObject({update:"STOPPED",sharing:"STOPPED"});});
});
