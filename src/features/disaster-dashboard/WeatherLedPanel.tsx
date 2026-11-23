import { useEffect, useRef, useState } from "react";
import type { WeatherObservation } from "./weatherObservation";
import { createWeatherDelivery, ledRequest, weatherLedBitmap, weatherLedText, WF4_DEVICE_NAME, type LedDevice, type LedReceipt } from "./weatherLed";
import WeatherLedSetup from "./WeatherLedSetup";

const password = "qwer1234";

export default function WeatherLedPanel({ observation, fresh, eventId }: { observation: WeatherObservation | null; fresh: boolean; eventId: string }) {
  const [device, setDevice] = useState<LedDevice | null>(null);
  const [recognizing, setRecognizing] = useState(false);
  const [sending, setSending] = useState(false);
  const [automatic, setAutomatic] = useState(true);
  const [failure, setFailure] = useState("");
  const delivery = useRef<ReturnType<typeof createWeatherDelivery> | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  const text = observation ? weatherLedText(observation) : "기상정보 조회 후 표시됩니다.";
  const key = `${eventId}:${observation?.observedAt}:${text}`;

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    delivery.current = createWeatherDelivery(async (_key, line) => {
      setSending(true);
      setFailure("");
      const bitmap = await weatherLedBitmap(line);
      controller.signal.throwIfAborted();
      const receipt = await ledRequest<LedReceipt>("scroll", bitmap, controller.signal);
      if (!receipt.acked) throw new Error("전광판의 송신 확인을 받지 못했습니다.");
      if (!controller.signal.aborted) {
        setSending(false);
      }
    }, error => {
      setSending(false);
      setDevice(null);
      setFailure(error instanceof Error ? error.message : "전광판 송신에 실패했습니다.");
    });
    return () => { controller.abort(); delivery.current?.dispose(); };
  }, []);

  useEffect(() => {
    if (device && automatic && observation && fresh) delivery.current?.enqueue(key, text);
    else delivery.current?.clear();
  }, [device, automatic, !!observation, fresh, key, text]);

  async function recognize() {
    setRecognizing(true);
    setFailure("");
    try {
      if (password) {
        const health = await ledRequest<{ passwordAuthentication?: boolean }>("health", {}, lifetime.current?.signal);
        if (!health.passwordAuthentication) throw new Error("기기 암호를 지원하는 최신 연결 도구가 필요합니다. 기존 도구를 종료하고 새 ZIP을 다운로드해 실행하세요.");
      }
      const found = await ledRequest<LedDevice>("discover", password ? { password } : {}, lifetime.current?.signal);
      if (!found.connected || found.width !== 256 || found.height !== 32) throw new Error("4장 전광판의 장치 정보를 확인하지 못했습니다.");
      if (found.deviceName !== WF4_DEVICE_NAME) throw new Error(`${WF4_DEVICE_NAME} 전용입니다. 해당 Wi-Fi에 연결하고 최신 연결 도구를 실행하세요.`);
      if (lifetime.current?.signal.aborted) return;
      delivery.current?.reset();
      setDevice(found);
    } catch (error) {
      if (lifetime.current?.signal.aborted) return;
      setDevice(null);
      setFailure(error instanceof Error ? error.message : "장치를 인식하지 못했습니다.");
    } finally { if (!lifetime.current?.signal.aborted) setRecognizing(false); }
  }

  return <section className="weather-led-panel" aria-label="기상정보 전광판">
    <strong>기상정보 전광판</strong>
    <WeatherLedSetup />
    <div className="weather-led-preview" title={text}>{text}</div>
    <label className="weather-led-password">기기 잠금 암호<input type="password" value={password} readOnly autoComplete="off" /></label>
    <button type="button" onClick={() => void recognize()} disabled={recognizing || sending}>{recognizing ? "인식 중…" : "전광판 장치 인식"}</button>
    <label><input type="checkbox" checked={automatic} onChange={event => setAutomatic(event.target.checked)} />기상정보 갱신 시 자동 송신</label>
    <button type="button" disabled={!device || !observation || !fresh || sending || recognizing} onClick={() => { delivery.current?.reset(); delivery.current?.enqueue(key, text); }}>{sending ? "송신 중…" : "전광판으로 보내기"}</button>
    {failure && <p role="status" aria-live="polite" className="weather-led-error">{failure}</p>}
    {!fresh && <p>최신 기상정보를 조회하면 자동 송신을 이어갑니다.</p>}
  </section>;
}
