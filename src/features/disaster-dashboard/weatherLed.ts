import type { WeatherObservation } from "./weatherObservation";

const BRIDGE = "http://127.0.0.1:8790";
export const LED_HEIGHT = 32;

export function weatherLedText(observation: WeatherObservation): string {
  const value = (number: number | null) => number !== null && Number.isFinite(number) ? String(Number(number.toFixed(2))) : "—";
  return `기온 ${value(observation.temperatureC)}°C · 상대습도 ${value(observation.humidityPct)}% · 평균 풍속 ${value(observation.windSpeedMps)}m/s · 풍향 ${value(observation.windDirectionDeg)}°`;
}

export interface LedDevice { connected: boolean; model: string; firmware: string; width: number; height: number }
export interface LedReceipt { acked: boolean; skipped: boolean; frameCount: number; durationMs: number }

export async function ledRequest<T>(path: "discover" | "scroll" | "health", body: object, signal?: AbortSignal): Promise<T> {
  let response: Response;
  const health = path === "health";
  const timeout = AbortSignal.timeout(health ? 5000 : 30_000);
  try {
    response = await fetch(health ? `${BRIDGE}/health` : `${BRIDGE}/api/wf4/${path}`, {
      method: health ? "GET" : "POST", headers: health ? undefined : { "Content-Type": "application/json" }, body: health ? undefined : JSON.stringify(body),
      credentials: "omit", cache: "no-store", signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error("연결 도구 설치·설정에서 도구를 다운로드해 실행하세요. 실행 중이라면 브라우저의 로컬 네트워크 접근 권한을 확인하세요.");
  }
  const result = await response.json().catch(() => { throw new Error("연결 도구의 응답을 확인할 수 없습니다. 다운로드한 연결 도구가 실행 중인지 확인하세요."); });
  if (!response.ok) throw new Error(result.error || "전광판 송신에 실패했습니다.");
  return result as T;
}

let fontReady: Promise<FontFace> | undefined;
export async function weatherLedBitmap(text: string) {
  fontReady ??= new FontFace("WF4NanumSquare", "url(/fonts/wf4/NanumSquareB.ttf)", { weight: "700" }).load().then(font => { document.fonts.add(font); return font; }).catch(error => { fontReady = undefined; throw error; });
  try { await fontReady; } catch { throw new Error("나눔스퀘어 글꼴을 불러오지 못했습니다. 화면을 새로고침하세요."); }
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("이 브라우저에서 전광판 이미지를 만들 수 없습니다.");
  context.font = '700 24px "WF4NanumSquare"';
  const stripWidth = Math.ceil(context.measureText(text).width) + 8;
  if (stripWidth > 2048) throw new Error("전광판 문구가 너무 깁니다.");
  canvas.width = stripWidth;
  canvas.height = LED_HEIGHT;
  context.font = '700 24px "WF4NanumSquare"';
  context.fillStyle = "#fff";
  context.textBaseline = "middle";
  context.fillText(text, 4, LED_HEIGHT / 2);
  const rgba = context.getImageData(0, 0, stripWidth, LED_HEIGHT).data;
  const bitmap = Array.from({ length: stripWidth * LED_HEIGHT }, (_, index) => rgba[index * 4 + 3] >= 96 ? 1 : 0);
  return { bitmap, stripWidth };
}

// A slow upload must finish before the newest observation replaces it.
// Intermediate observations are discarded; an error requires device recognition again.
export function createWeatherDelivery(send: (key: string, text: string) => Promise<void>, failed: (error: unknown) => void) {
  let pending: { key: string; text: string } | null = null;
  let running = false;
  let active = true;
  let lastKey = "";
  async function drain() {
    running = true;
    while (active && pending) {
      const next = pending;
      pending = null;
      if (next.key === lastKey) continue;
      try { await send(next.key, next.text); lastKey = next.key; }
      catch (error) { pending = null; if (active) failed(error); break; }
    }
    running = false;
  }
  return {
    enqueue(key: string, text: string) { if (!active) return; pending = { key, text }; if (!running) void drain(); },
    clear() { pending = null; },
    reset() { lastKey = ""; pending = null; },
    dispose() { active = false; pending = null; },
  };
}
