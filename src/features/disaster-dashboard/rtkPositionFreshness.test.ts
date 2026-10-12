import { describe, expect, it } from "vitest";
import {
  RTK_STALE_AFTER_MS,
  rtkPositionFetchStatus,
} from "./rtkPositionFreshness";

describe("RTK 위치 조회 및 관측 최신성", () => {
  const now = Date.parse("2026-10-10T04:00:00.000Z");
  const observation = (ageMs: number) =>
    new Date(now - ageMs).toISOString();

  it("최근 관측이면 조회 성공으로 표시한다", () => {
    expect(rtkPositionFetchStatus(observation(1_000), false, true, now))
      .toBe("조회 성공 · 최근 관측");
  });

  it("60초 경계부터 STALE로 표시한다", () => {
    expect(rtkPositionFetchStatus(
      observation(RTK_STALE_AFTER_MS),
      false,
      true,
      now,
    )).toBe("STALE · 마지막 관측 위치");
  });

  it("HTTP 조회가 성공해도 과거 좌표면 STALE이다", () => {
    expect(rtkPositionFetchStatus(
      observation(300_000),
      false,
      true,
      now,
    )).toBe("STALE · 마지막 관측 위치");
  });

  it("조회 실패 시 이전 좌표와 조회 실패를 구분한다", () => {
    expect(rtkPositionFetchStatus(
      observation(1_000),
      true,
      true,
      now,
    )).toBe("조회 실패 · 마지막 확인 위치");
  });

  it("이전 좌표가 없으면 위치를 확인할 수 없다", () => {
    expect(rtkPositionFetchStatus("", true, false, now))
      .toBe("위치 확인 불가");
  });

  it("정상-장애-복구에 따라 위치 조회 표시가 전환된다", () => {
    const observedAt = observation(1_000);
    const states = [
      rtkPositionFetchStatus(observedAt, false, true, now),
      rtkPositionFetchStatus(observedAt, true, true, now),
      rtkPositionFetchStatus(observedAt, false, true, now),
    ];

    expect(states).toEqual([
      "조회 성공 · 최근 관측",
      "조회 실패 · 마지막 확인 위치",
      "조회 성공 · 최근 관측",
    ]);
  });

  it("미래 관측 시각을 최근 관측으로 오인하지 않는다", () => {
    expect(rtkPositionFetchStatus(
      observation(-30_000),
      false,
      true,
      now,
    )).toBe("관측 시각 확인 필요 · 미래 시각");
  });

  it("유효하지 않은 시각을 최근 관측으로 오인하지 않는다", () => {
    expect(rtkPositionFetchStatus(
      "invalid-date",
      false,
      true,
      now,
    )).toBe("관측 시각 확인 불가");
  });
});
