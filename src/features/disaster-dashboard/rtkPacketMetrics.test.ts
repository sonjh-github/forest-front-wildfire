import {describe,it,expect} from "vitest";
import {rtkPacketMetrics,rtkIndicatorStates} from "./rtkPacketMetrics";
const sample=(frameCounter:number|null,seconds:number,receivedSeconds=seconds)=>({frameCounter,occurredAt:new Date(seconds*1000).toISOString(),receivedAt:new Date(receivedSeconds*1000).toISOString()});
describe("RTK FCnt 핵심 지표",()=>{
  it("100번 반복 수신해도 고유 FCnt는 하나이며 새 프레임 간격을 만들지 않는다",()=>{
    const result=rtkPacketMetrics(Array.from({length:100},(_,i)=>sample(11320,i*2)));
    expect(result.uniqueCount).toBe(1);expect(result.duplicateCount).toBe(99);
    expect(result.lastNewFrameReceivedAt).toBeNull();expect(result.latestCounterObservedSpanMs).toBe(198000);expect(result.latestCounterRepeatedCount).toBe(100);
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
    expect(result.lastNewFrameReceivedAt).toBe(new Date(10000).toISOString());
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

describe("두 지표의 상태를 독립적으로 판정한다",()=>{
  const receiving=rtkPacketMetrics([sample(2,5),sample(1,0)]);
  it("갱신 5초와 성공률 98%를 각각 포함해 목표 충족으로 본다",()=>{
    expect(rtkIndicatorStates(receiving,"RECEIVING",{expectedCount:100,successRatePercent:98})).toEqual({update:"NORMAL",sharing:"PASS"});
  });
  it("FCnt가 정체돼도 과거 번호 구간의 수신율 상태와 섞지 않는다",()=>{
    const stalled=rtkPacketMetrics([sample(2,10),sample(2,0)]);
    expect(rtkIndicatorStates(stalled,"RECEIVING",{expectedCount:100,successRatePercent:100})).toEqual({update:"STALLED",sharing:"PASS"});
  });
  it("갱신이 정상이어도 수신율 97%는 별도로 목표 미달이다",()=>{
    expect(rtkIndicatorStates(receiving,"RECEIVING",{expectedCount:100,successRatePercent:97})).toEqual({update:"NORMAL",sharing:"FAIL"});
  });
  it("최근 수신이 없으면 과거 평균이 빨라도 갱신 지연이다",()=>{
    expect(rtkIndicatorStates(receiving,"NO_RECENT_RECEPTION",{expectedCount:100,successRatePercent:99}).update).toBe("DELAYED");
  });
  it("최근 수신 중이어도 마지막 패킷이 5초를 넘으면 갱신 지연이다",()=>{
    const window={expectedCount:100,successRatePercent:99};
    expect(rtkIndicatorStates(receiving,"RECEIVING",window,false,5000).update).toBe("NORMAL");
    expect(rtkIndicatorStates(receiving,"RECEIVING",window,false,5001).update).toBe("DELAYED");
  });
  it("초기 10개만 받은 100%는 100개 구간 목표 판정을 보류한다",()=>{
    expect(rtkIndicatorStates(receiving,"RECEIVING",{expectedCount:10,successRatePercent:100}).sharing).toBe("INSUFFICIENT");
  });
  it("로딩과 오류를 구분하고 오류 시 과거 결과를 정상으로 판정하지 않는다",()=>{
    expect(rtkIndicatorStates(null,undefined,null)).toEqual({update:"LOADING",sharing:"LOADING"});
    expect(rtkIndicatorStates(receiving,"RECEIVING",{expectedCount:100,successRatePercent:100},true)).toEqual({update:"UNKNOWN",sharing:"UNKNOWN"});
  });
});
