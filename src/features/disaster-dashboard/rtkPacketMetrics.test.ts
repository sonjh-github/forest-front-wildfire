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
  it("FCnt 정체 시 과거 수신율이 100%라도 현재 성공으로 판정하지 않는다",()=>{
    const stalled=rtkPacketMetrics([sample(2,10),sample(2,0)]);
    expect(rtkIndicatorStates(stalled,"RECEIVING",{expectedCount:100,successRatePercent:100})).toEqual({update:"STALLED",sharing:"UNCONFIRMED"});
  });
  it("갱신이 정상이어도 수신율 97%는 별도로 목표 미달이다",()=>{
    expect(rtkIndicatorStates(receiving,"RECEIVING",{expectedCount:100,successRatePercent:97})).toEqual({update:"NORMAL",sharing:"FAIL"});
  });
  it("최근 수신이 없으면 과거 평균이 빨라도 갱신 지연이다",()=>{
    expect(rtkIndicatorStates(receiving,"NO_RECENT_RECEPTION",{expectedCount:100,successRatePercent:99})).toEqual({update:"DELAYED",sharing:"UNCONFIRMED"});
  });
  it("최근 수신 중이어도 마지막 패킷이 5초를 넘으면 갱신 지연이다",()=>{
    const window={expectedCount:100,successRatePercent:99};
    expect(rtkIndicatorStates(receiving,"RECEIVING",window,false,5000).update).toBe("NORMAL");
    expect(rtkIndicatorStates(receiving,"RECEIVING",window,false,5001)).toEqual({update:"DELAYED",sharing:"UNCONFIRMED"});
  });
  it("번호 범위가 10개이면 그 범위의 수신율을 평가한다",()=>{
    expect(rtkIndicatorStates(receiving,"RECEIVING",{expectedCount:10,successRatePercent:100}).sharing).toBe("PASS");
  });
  it("로딩과 오류를 구분하고 오류 시 과거 결과를 정상으로 판정하지 않는다",()=>{
    expect(rtkIndicatorStates(null,undefined,null)).toEqual({update:"LOADING",sharing:"LOADING"});
    expect(rtkIndicatorStates(receiving,"RECEIVING",{expectedCount:100,successRatePercent:100},true)).toEqual({update:"UNKNOWN",sharing:"UNKNOWN"});
  });
});

it("새 번호가 계속 수신되면 평균 간격 목표와 전달률 목표는 각각 평가한다",()=>{
  const slow=rtkPacketMetrics([sample(2,6),sample(1,0)]);
  expect(rtkIndicatorStates(slow,"RECEIVING",{expectedCount:100,successRatePercent:100},false,0)).toEqual({update:"DELAYED",sharing:"PASS"});
});

it("같은 번호만 반복되면 번호 구간이 없으므로 현재 전달을 성공 처리하지 않는다",()=>{
  const repeated=rtkPacketMetrics(Array.from({length:100},(_,i)=>sample(412,200-i*2)));
  expect(rtkIndicatorStates(repeated,"RECEIVING",null).sharing).toBe("UNCONFIRMED");
});

it("웹의 최신 패킷으로부터 100건 전 기록이 없으면 대기 상태를 우선 표시한다",()=>{
  const metrics=rtkPacketMetrics([sample(412,10),sample(412,0)]);
  expect(rtkIndicatorStates(metrics,"RECEIVING",null,false,0,"WAITING_HISTORY").sharing).toBe("WAITING");
  expect(rtkIndicatorStates(metrics,"RECEIVING",null,true,0,"WAITING_HISTORY").sharing).toBe("UNKNOWN");
});
