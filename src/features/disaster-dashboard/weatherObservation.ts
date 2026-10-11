////
//// 20261011 이영준
//// 현장 기상 관측 데이터 정규화 및 상태 판정
////

export type WeatherSourceMode = "LIVE" | "DEMO";
export type WeatherDataStatus =
  | "LIVE"
  | "DEMO"
  | "STALE"
  | "UNAVAILABLE";

export interface WeatherObservation {
  stationId: string;
  stationName: string;
  observedAt: string;
  source: string;
  sourceMode: WeatherSourceMode;
  temperatureC: number | null;
  humidityPct: number | null;
  windSpeedMps: number | null;
  windDirectionDeg: number | null;
  windGustMps: number | null;
  precipitationMm: number | null;
  precipitationPeriodMinutes: number | null;
}

export interface WeatherSnapshot {
  status: WeatherDataStatus;
  observation: WeatherObservation | null;
  ageMs: number | null;
}

export const WEATHER_STALE_AFTER_MS = 10 * 60 * 1000;
const FUTURE_TOLERANCE_MS = 60 * 1000;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function requiredString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function metric(
  value: unknown,
  min: number,
  max: number,
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return value >= min && value <= max ? value : null;
}

function validObservedAt(value: unknown): string | null {
  if (typeof value !== "string") return null;

  // 시간대 정보 없는 날짜를 로컬 관측 시각으로 오인하지 않는다.
  const isoWithZone =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

  if (!isoWithZone.test(value)) return null;

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? value : null;
}

export function normalizeWeatherObservation(
  payload: unknown,
  sourceMode: WeatherSourceMode,
): WeatherObservation | null {
  const raw = record(payload);
  if (!raw) return null;

  const stationId = requiredString(raw.stationId);
  const stationName = requiredString(raw.stationName);
  const observedAt = validObservedAt(raw.observedAt);
  const source = requiredString(raw.source);

  if (!stationId || !stationName || !observedAt || !source) {
    return null;
  }

  return {
    stationId,
    stationName,
    observedAt,
    source,
    sourceMode,
    temperatureC: metric(raw.temperatureC, -90, 65),
    humidityPct: metric(raw.humidityPct, 0, 100),
    windSpeedMps: metric(raw.windSpeedMps, 0, 150),
    windDirectionDeg: metric(raw.windDirectionDeg, 0, 360),
    windGustMps: metric(raw.windGustMps, 0, 150),
    precipitationMm: metric(raw.precipitationMm, 0, 2000),
    precipitationPeriodMinutes: metric(
      raw.precipitationPeriodMinutes,
      1,
      1440,
    ),
  };
}

export function evaluateWeatherSnapshot(
  observation: WeatherObservation | null,
  nowMs: number = Date.now(),
): WeatherSnapshot {
  if (!observation) {
    return { status: "UNAVAILABLE", observation: null, ageMs: null };
  }

  const timestamp = Date.parse(observation.observedAt);
  if (!Number.isFinite(timestamp) || !Number.isFinite(nowMs)) {
    return { status: "UNAVAILABLE", observation: null, ageMs: null };
  }

  const ageMs = nowMs - timestamp;

  if (ageMs < -FUTURE_TOLERANCE_MS) {
    return { status: "UNAVAILABLE", observation: null, ageMs: null };
  }

  if (observation.sourceMode === "DEMO") {
    return { status: "DEMO", observation, ageMs };
  }

  return {
    status: ageMs > WEATHER_STALE_AFTER_MS ? "STALE" : "LIVE",
    observation,
    ageMs,
  };
}
