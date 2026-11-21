import { afterEach, describe, expect, it, vi } from "vitest";
import { createWeatherDelivery, ledRequest, weatherLedText } from "./weatherLed";
import { normalizeWeatherObservation } from "./weatherObservation";
afterEach(() => vi.unstubAllGlobals());

describe("기상 전광판", () => {
  it("연결 도구 확인은 화면 송신 없이 GET으로 조회하고 오프라인이면 설정 경로를 안내한다", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ service: "forest-wf4-bridge" })));
    vi.stubGlobal("fetch", request);
    await expect(ledRequest("health", {})).resolves.toEqual({ service: "forest-wf4-bridge" });
    expect(request).toHaveBeenCalledWith("http://127.0.0.1:8790/health", expect.objectContaining({ method: "GET", body: undefined, credentials: "omit" }));
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    await expect(ledRequest("health", {})).rejects.toThrow("연결 도구 설치·설정");
  });
  it("스크린샷의 네 지표를 한 줄로 만들고 누락값을 0으로 바꾸지 않는다", () => {
    const observation = normalizeWeatherObservation({ stationId: "test", stationName: "예산", observedAt: "2026-11-19T00:00:00Z", source: "Open-Meteo", temperatureC: 3.3, humidityPct: 75, windSpeedMps: 3.41, windDirectionDeg: 320 }, "LIVE")!;
    expect(weatherLedText(observation)).toBe("기온 3.3°C · 상대습도 75% · 평균 풍속 3.41m/s · 풍향 320°");
    expect(weatherLedText({ ...observation, temperatureC: null, windSpeedMps: 0 })).toContain("기온 —°C · 상대습도 75% · 평균 풍속 0m/s");
  });

  it("송신 중 갱신되면 가장 최근 값만 이어 보내고 동일 관측은 재송신하지 않는다", async () => {
    const sent: string[] = [];
    let finish!: () => void;
    const first = new Promise<void>(resolve => { finish = resolve; });
    const queue = createWeatherDelivery(async key => { sent.push(key); if (key === "a") await first; }, () => { throw new Error("unexpected failure"); });
    queue.enqueue("a", "first"); queue.enqueue("b", "old"); queue.enqueue("c", "newest");
    expect(sent).toEqual(["a"]);
    finish(); await first; await Promise.resolve(); await Promise.resolve();
    expect(sent).toEqual(["a", "c"]);
    queue.enqueue("c", "same"); await Promise.resolve();
    expect(sent).toEqual(["a", "c"]);
    queue.dispose(); queue.enqueue("d", "closed");
    expect(sent).toEqual(["a", "c"]);
  });

  it("송신 실패 후 대기 중인 이전 값을 자동 재시도하지 않는다", async () => {
    let fail!: (error: Error) => void;
    const blocked = new Promise<void>((_, reject) => { fail = reject; });
    const sent: string[] = []; const failures: unknown[] = [];
    const queue = createWeatherDelivery(async key => { sent.push(key); await blocked; }, error => failures.push(error));
    queue.enqueue("a", "first"); queue.enqueue("b", "queued"); fail(new Error("offline"));
    await blocked.catch(() => undefined); await Promise.resolve();
    expect(sent).toEqual(["a"]); expect(failures).toHaveLength(1);
  });
});
