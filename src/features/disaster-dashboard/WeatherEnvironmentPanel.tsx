////
//// 20261011 이영준
//// 왼쪽 현장 기상 기본 화면 · 실측 API 연동 전 숫자 미표시
////

import { evaluateWeatherSnapshot, type WeatherObservation } from "./weatherObservation";

const fields: Array<{ key: keyof WeatherObservation; label: string; unit: string }> = [
  { key: "temperatureC", label: "기온", unit: "°C" },
  { key: "humidityPct", label: "상대습도", unit: "%" },
  { key: "windSpeedMps", label: "평균 풍속", unit: "m/s" },
  { key: "windDirectionDeg", label: "풍향", unit: "°" },
  { key: "windGustMps", label: "최대순간풍속", unit: "m/s" },
  { key: "precipitationMm", label: "강수량", unit: "mm" },
];

export default function WeatherEnvironmentPanel({ observation = null }: { observation?: WeatherObservation | null }) {
  const snapshot = evaluateWeatherSnapshot(observation);
  const current = snapshot.observation;
  const label = snapshot.status === "LIVE" ? "실측" : snapshot.status === "DEMO" ? "DEMO" : snapshot.status === "STALE" ? "관측 지연" : "관측 대기";
  return (
    <section className="weather-environment-panel" aria-label="현장 기상 종합정보">
      <header><strong>현장 기상 종합정보</strong><span>{label}</span></header>
      <div className="weather-environment-grid">
        {fields.map(field => {
          const value = current?.[field.key];
          return (
            <article key={field.key}>
              <span>{field.label}</span>
              <b>{typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("ko-KR") : "—"}</b>
              <small>{field.unit}</small>
            </article>
          );
        })}
      </div>
      <p>기압: — hPa (관측 필드 연동 대기)</p>
      <p>관측 지점: {current?.stationName ?? "미수신"}</p>
      <p>관측 시각: {current?.observedAt ? new Date(current.observedAt).toLocaleString("ko-KR") : "미수신"}</p>
      <p>데이터 출처: {current?.source ?? "미연결"}</p>
      <p>현재 현장 기상 Core API가 연결되지 않았습니다. 모의 풍향·풍속 값을 실측값처럼 표시하지 않습니다.</p>
    </section>
  );
}
