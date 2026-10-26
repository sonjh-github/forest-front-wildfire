import {describe,it,expect} from "vitest";
import {VideoSharingMetrics,browserVideoReceiving} from "./videoSharingMetrics";
describe("web video sharing time",()=>{
 it("10 seconds without reception in 200 seconds is exactly 95 percent, during and after reconnection",()=>{
  const m=new VideoSharingMetrics();m.record(true,0);m.record(false,190000);
  expect(m.snapshot(200000)).toMatchObject({observedMs:200000,receivedMs:190000,interruptedMs:10000,successPercent:95,receiving:false});
  m.record(true,200000);expect(m.snapshot(200000)).toMatchObject({successPercent:95,receiving:true});
 });
 it("keeps prior outage across reconnect and ages it out only with the 200 second window",()=>{
  const m=new VideoSharingMetrics();m.record(true,0);m.record(false,90000);m.record(false,95000);m.record(true,100000);
  expect(m.snapshot(200000).successPercent).toBe(95);expect(m.snapshot(295000).successPercent).toBe(97.5);expect(m.snapshot(300000).successPercent).toBe(100);
 });
 it("starts at the first confirmed video and freezes manual stop",()=>{
  const m=new VideoSharingMetrics();m.record(false,0);expect(m.snapshot(200000).observedMs).toBe(0);
  m.record(true,210000);m.record(false,400000);expect(m.snapshot(409999).successPercent).toBeNull();
  const stopped=m.stop(410000);expect(stopped.successPercent).toBe(95);m.record(true,420000);expect(m.snapshot(900000)).toEqual(stopped);
 });
 it("integrates real elapsed time regardless of the number of timer polls",()=>{
  const m=new VideoSharingMetrics();m.record(true,0);for(let t=1;t<190000;t+=137)m.snapshot(t);m.record(false,190000);expect(m.snapshot(200000).successPercent).toBe(95);
 });
 it("does not mistake buffered frames after wifi recovery for newly received video",()=>{
  expect(browserVideoReceiving(true,true,1000,1000,6000,1100)).toBe(true);
  expect(browserVideoReceiving(false,true,1000,1000,6000,1100)).toBe(false);
  expect(browserVideoReceiving(true,true,2000,null,6000,2100)).toBe(false);
  expect(browserVideoReceiving(true,true,2000,2000,6000,2100)).toBe(true);
  expect(browserVideoReceiving(true,true,2000,2000,6000,3001)).toBe(false);
  expect(browserVideoReceiving(true,false,2000,2000,6000,2100)).toBe(false);
 });
});
