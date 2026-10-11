////
//// 20261011 이영준
//// 기상 관측 데이터 검증 테스트
////

import { describe, expect, it } from "vitest";
import {
  evaluateWeatherSnapshot,
  normalizeWeatherObservation,
  WEATHER_STALE_AFTER_MS,
} from "./weatherObservation";

const observedAt = "2026-10-11T12:00:00+09:00";
const base = {
  stationId: "WEATHER-001",
  stationName: "현장 관측소",
  observedAt,
  source: "FIELD_SENSOR",
  temperatureC: 22.5,
  humidityPct: 65,
  windSpeedMps: 4.2,
  windDirectionDeg: 225,
  windGustMps: 6.1,
  precipitationMm: 0,
  precipitationPeriodMinutes: 60,
};

const observedMs = Date.parse(observedAt);

describe("기상 데이터 정규화", () => {
  it("유효한 실측 데이터를 변환한다", () => {
    const result = normalizeWeatherObservation(base, "LIVE");
    expect(result?.sourceMode).toBe("LIVE");
    expect(result?.windSpeedMps).toBe(4.2);
  });

  it("필수 관측 정보를 확인한다", () => {
    expect(normalizeWeatherObservation({}, "LIVE")).toBeNull();
    expect(
      normalizeWeatherObservation(
        { ...base, observedAt: "2026-10-11 12:00:00" },
        "LIVE",
      ),
    ).toBeNull();
  });

  it("누락되거나 잘못된 관측값을 null로 처리한다", () => {
    const result = normalizeWeatherObservation(
      {
        ...base,
        temperatureC: "22",
        humidityPct: 101,
        windSpeedMps: -1,
        windDirectionDeg: Number.NaN,
      },
      "LIVE",
    );

    expect(result?.temperatureC).toBeNull();
    expect(result?.humidityPct).toBeNull();
    expect(result?.windSpeedMps).toBeNull();
    expect(result?.windDirectionDeg).toBeNull();
  });
});

describe("기상 데이터 상태 판정", () => {
  const live = normalizeWeatherObservation(base, "LIVE");
  const demo = normalizeWeatherObservation(base, "DEMO");

  it("최근 실측값은 LIVE로 표시한다", () => {
    expect(
      evaluateWeatherSnapshot(live, observedMs + 60_000).status,
    ).toBe("LIVE");
  });

  it("오래된 실측값은 STALE로 표시한다", () => {
    expect(
      evaluateWeatherSnapshot(
        live,
        observedMs + WEATHER_STALE_AFTER_MS + 1,
      ).status,
    ).toBe("STALE");
  });

  it("시연값은 실측 LIVE로 승격하지 않는다", () => {
    expect(
      evaluateWeatherSnapshot(demo, observedMs + 60_000).status,
    ).toBe("DEMO");
  });

  it("미수신 및 미래 시각은 UNAVAILABLE로 처리한다", () => {
    expect(evaluateWeatherSnapshot(null).status).toBe("UNAVAILABLE");
    expect(
      evaluateWeatherSnapshot(live, observedMs - 120_000).status,
    ).toBe("UNAVAILABLE");
  });
});
