import {describe,it,expect} from "vitest";
import {cameraPerformance,type FrameMetrics} from "./cameraPerformance";
const frames:FrameMetrics={frameCount:101,sampleCount:100,averageIntervalMs:33,maxIntervalMs:100,lastFrameReceivedAt:"2026-10-26T00:00:00Z",silenceMs:20};
describe("TVWS 갱신과 수신 상태 점검을 구분한다",()=>{
  it("원본 프레임 간격과 100회 점검의 98% 기준을 독립적으로 판정한다",()=>{
    const result=cameraPerformance(frames,"READY",[...Array(98).fill("READY"),"FAILED","CONNECTING"],false);
    expect(result.update).toBe("NORMAL");expect(result.sharing).toBe("PASS");expect(result.successPercent).toBe(98);
    expect(cameraPerformance(frames,"READY",[...Array(97).fill("READY"),...Array(3).fill("FAILED")],false).sharing).toBe("FAIL");
  });
  it("영상이 5초 넘게 들어오지 않으면 과거 점검이 100%여도 정상으로 보이지 않는다",()=>{
    expect(cameraPerformance({...frames,silenceMs:5001},"READY",Array(100).fill("READY"),false)).toMatchObject({update:"STALLED",sharing:"UNCONFIRMED"});
    expect(cameraPerformance(frames,"FAILED",Array(100).fill("READY"),false).sharing).toBe("UNCONFIRMED");
  });
  it("평균이 빨라도 최근 최대 간격이 목표를 넘으면 갱신 지연이다",()=>{
    expect(cameraPerformance({...frames,maxIntervalMs:5000},"READY",Array(100).fill("READY"),false).update).toBe("NORMAL");
    expect(cameraPerformance({...frames,maxIntervalMs:5001},"READY",Array(100).fill("READY"),false)).toMatchObject({update:"DELAYED",sharing:"UNCONFIRMED"});
  });
  it("점검 100회가 없으면 대기하고 중지 시 정상 판정을 끝낸다",()=>{
    expect(cameraPerformance(null,"IDLE",[],false).update).toBe("WAITING");
    expect(cameraPerformance(null,"CONNECTING",[],true).update).toBe("LOADING");
    expect(cameraPerformance(frames,"READY",Array(99).fill("READY"),false).sharing).toBe("WAITING");
    expect(cameraPerformance(frames,"STOPPED",Array(100).fill("READY"),false)).toMatchObject({update:"STOPPED",sharing:"STOPPED"});
  });
});
