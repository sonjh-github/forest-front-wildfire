import {describe,it,expect} from "vitest";
import {rtkPacketMetrics} from "./rtkPacketMetrics";
const sample=(frameCounter:number|null,seconds:number,receivedSeconds=seconds)=>({frameCounter,occurredAt:new Date(seconds*1000).toISOString(),receivedAt:new Date(receivedSeconds*1000).toISOString()});
describe("RTK FCnt 핵심 지표",()=>{
  it("100번 반복 수신해도 고유 FCnt는 하나이며 새 프레임 간격을 만들지 않는다",()=>{
    const result=rtkPacketMetrics(Array.from({length:100},(_,i)=>sample(11320,i*2)));
    expect(result.uniqueCount).toBe(1);expect(result.duplicateCount).toBe(99);
    expect(result.latestCounterObservedSpanMs).toBe(198000);expect(result.latestCounterRepeatedCount).toBe(100);
    expect(result.frameIntervalMs).toBeNull();expect(result.receivedIntervalMs).toBe(2000);expect(result.measuredIntervalMs).toBe(2000);
  });
  it("순서와 재전송에 관계없이 FCnt별 최초 측정으로 평균 간격을 계산한다",()=>{
    const result=rtkPacketMetrics([sample(2,14,40),sample(1,100,35),sample(0,0,30),sample(1,4,20)]);
    expect(result.uniqueCount).toBe(3);expect(result.duplicateCount).toBe(1);
    expect(result.frameIntervalMs).toBe(7000);expect(result.frameIntervalSamples).toBe(2);
    expect(result.receivedIntervalMs).toBeCloseTo(20000/3);
  });
  it("과거 프레임이 섞여 있어도 최신 FCnt가 정체된 구간을 따로 센다",()=>{
    const result=rtkPacketMetrics([sample(3,30),sample(3,20),sample(3,10),sample(2,5)]);
    expect(result.uniqueCount).toBe(2);expect(result.latestCounterRepeatedCount).toBe(3);
    expect(result.latestCounterObservedSpanMs).toBe(20000);
  });
  it("FCnt 0은 유효하며 누락·음수·소수는 고유값과 중복에서 제외한다",()=>{
    const result=rtkPacketMetrics([sample(0,0),sample(null,1),sample(-1,2),sample(1.2,3)]);
    expect(result.uniqueCount).toBe(1);expect(result.minCounter).toBe(0);expect(result.missingCounterCount).toBe(3);
  });
  it("빈 목록·잘못된 시각은 간격을 0초로 오인하지 않는다",()=>{
    expect(rtkPacketMetrics([]).receivedIntervalMs).toBeNull();
    const result=rtkPacketMetrics([{frameCounter:1,occurredAt:"invalid",receivedAt:null},sample(2,2)]);
    expect(result.uniqueCount).toBe(2);expect(result.frameIntervalMs).toBeNull();
  });
  it("서로 다른 FCnt의 동일 측정 시각은 실제 0초 간격으로 보존한다",()=>{
    expect(rtkPacketMetrics([sample(0,1),sample(1,1)]).frameIntervalMs).toBe(0);
  });
});
