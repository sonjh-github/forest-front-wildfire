import { useEffect, useRef, useState } from "react";
import { ledRequest } from "./weatherLed";

type OperatingSystem = "windows" | "macos" | "linux";
const platforms = { windows: "Windows", macos: "macOS", linux: "Linux" };

export default function WeatherLedSetup() {
  const [platform, setPlatform] = useState<OperatingSystem>(() => {
    const agent = typeof navigator === "undefined" ? "" : navigator.userAgent;
    return /Macintosh|Mac OS X/.test(agent) ? "macos" : /Linux/.test(agent) && !/Android/.test(agent) ? "linux" : "windows";
  });
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState("");
  const [failed, setFailed] = useState(false);
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);

  async function check() {
    setChecking(true);
    setResult("");
    setFailed(false);
    try {
      const health = await ledRequest<{ service: string }>("health", {}, lifetime.current?.signal);
      if (health.service !== "forest-wf4-bridge") throw new Error("연결 도구를 확인할 수 없습니다. 다운로드한 도구를 다시 실행하세요.");
      if (lifetime.current?.signal.aborted) return;
      setResult("연결 도구 실행 중입니다. WF4 Wi-Fi에 연결한 뒤 전광판 장치 인식을 누르세요.");
    } catch (error) {
      if (lifetime.current?.signal.aborted) return;
      setFailed(true);
      setResult(error instanceof Error ? error.message : "연결 도구를 확인하지 못했습니다.");
    } finally { if (!lifetime.current?.signal.aborted) setChecking(false); }
  }

  return <details className="weather-led-setup">
    <summary>연결 도구 설치·설정</summary>
    <div className="weather-led-setup-body">
      <label>운영체제
        <select value={platform} onChange={event => setPlatform(event.target.value as OperatingSystem)}>
          {Object.entries(platforms).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <ol>
        <li><a href="https://nodejs.org/en/download/archive/v26.13.1" target="_blank" rel="noreferrer">Node.js 26.13.1 설치</a><p>26.13.1이 이미 설치됐다면 다음 단계로 진행하세요. 설치 후에는 실행 창을 새로 여세요.</p></li>
        <li><a className="weather-led-download" href="/wf4-bridge.zip" download={`WF4-${platforms[platform]}.zip`}>{platforms[platform]} 연결 도구 다운로드</a><p>ZIP 파일의 압축을 모두 풀어 주세요.</p></li>
        <li>{platform === "windows" ? <><code>start.cmd</code>를 더블클릭하세요. 실행 창은 열어 두세요.</> : <>압축을 푼 폴더의 터미널에서 <code>sh ./start.sh</code>를 실행하고 창을 열어 두세요.</>}</li>
        <li>PC를 WF4 Wi-Fi에 연결하고 인터넷 연결도 유지하세요. 아래에서 도구 실행을 확인한 뒤 전광판 장치 인식을 누르세요.</li>
      </ol>
      <button type="button" disabled={checking} onClick={() => void check()}>{checking ? "연결 도구 확인 중…" : "연결 도구 실행 확인"}</button>
      {result && <p role="status" aria-live="polite" className={failed ? "weather-led-error" : ""}>{result}</p>}
      <p>브라우저가 로컬 네트워크 접근 권한을 요청하면 허용해 주세요. Wi-Fi 어댑터가 하나라면 인터넷에는 유선이나 다른 어댑터가 필요합니다.</p>
    </div>
  </details>;
}
