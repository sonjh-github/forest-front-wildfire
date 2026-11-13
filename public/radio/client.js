"use strict";
// Share the DSP between an AudioWorklet and the file:// compatibility path.
function radioProcessor(Base = AudioWorkletProcessor, register = registerProcessor, rate = sampleRate) {
  class RadioAudio extends Base {
    constructor() {
      super(); this.ring = new Float32Array(16000); this.head = 0; this.count = 0;
      this.phase = 0; this.playing = false; this.talking = false;
      this.mic = []; this.sum = 0; this.weight = 0; this.meterClock = 0;
      this.port.onmessage = ({ data }) => {
        if (data.type === "rx") {
          for (const value of data.pcm) {
            if (this.count === this.ring.length) { this.head = (this.head + 1) % this.ring.length; this.count--; }
            this.ring[(this.head + this.count) % this.ring.length] = value; this.count++;
          }
        } else if (data.type === "talk") {
          if (!data.on && this.mic.length) this.port.postMessage({ type: "mic", pcm: new Float32Array(this.mic) });
          this.mic = []; this.sum = this.weight = 0; this.talking = data.on;
          this.port.postMessage({ type: "talk", on: data.on, request: data.request });
        }
      };
    }
    process(inputs, outputs) {
      const input = inputs[0]?.[0]; const output = outputs[0][0];
      let tx = 0, rx = 0;
      const ratio = rate / 8000;
      for (let i = 0; i < output.length; i++) {
        const x = input?.[i] || 0; tx += x * x;
        if (this.talking) {
          // Integrate each input sample over an 8kHz output bin (supports 44.1kHz too).
          let left = 1;
          while (left > 1e-9) {
            const take = Math.min(left, ratio - this.weight);
            this.sum += x * take; this.weight += take; left -= take;
            if (this.weight >= ratio - 1e-9) {
              this.mic.push(this.sum / ratio); this.sum = this.weight = 0;
              if (this.mic.length === 2000) {
                this.port.postMessage({ type: "mic", pcm: new Float32Array(this.mic) }); this.mic = [];
              }
            }
          }
        }
        if (!this.playing && this.count >= 2048) this.playing = true;
        if (this.playing && this.count >= 2) {
          const a = this.ring[this.head], b = this.ring[(this.head + 1) % this.ring.length];
          output[i] = a + (b - a) * this.phase;
          this.phase += 8000 / rate;
          while (this.phase >= 1 && this.count > 1) { this.phase--; this.head = (this.head + 1) % this.ring.length; this.count--; }
        } else { output[i] = 0; this.playing = false; this.phase = 0; }
        rx += output[i] * output[i];
      }
      this.meterClock += output.length;
      if (this.meterClock > rate / 20) {
        this.meterClock = 0;
        this.port.postMessage({ type: "meter", tx: Math.sqrt(tx / output.length), rx: Math.sqrt(rx / output.length) });
      }
      return true;
    }
  }
  register("radio-audio", RadioAudio);
}

async function createRadioNode(context, { file = false, onFallback = () => {} } = {}) {
  // Chrome can reject blob:null worklet modules for opaque file origins.
  if (!file && context.audioWorklet && typeof AudioWorkletNode !== "undefined") {
    try {
      await context.audioWorklet.addModule("/radio/audio-worklet.js");
      return new AudioWorkletNode(context, "radio-audio", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    } catch (error) { onFallback("AudioWorklet 불러오기 실패: " + error.message); }
  }
  if (typeof context.createScriptProcessor !== "function")
    throw new Error("이 브라우저는 파일 실행용 오디오 처리를 지원하지 않습니다.");
  onFallback("파일 호환 오디오 모드 사용 (ScriptProcessor)");
  const node = context.createScriptProcessor(1024, 1, 1);
  const port = {
    onmessage: null,
    postMessage(data) { processor.port.onmessage({ data }); }
  };
  class LocalProcessor {
    constructor() {
      this.port = { postMessage(data) { queueMicrotask(() => port.onmessage?.({ data })); } };
    }
  }
  let Processor;
  radioProcessor(LocalProcessor, (_, type) => { Processor = type; }, context.sampleRate);
  const processor = new Processor();
  node.port = port;
  node.onaudioprocess = event => {
    processor.process([[event.inputBuffer.getChannelData(0)]], [[event.outputBuffer.getChannelData(0)]]);
  };
  return node;
}

function encodeAlaw(value) {
  let pcm = Math.max(-32768, Math.min(32767, Math.round(value * 32768)));
  let mask = 0xD5;
  if (pcm < 0) { mask = 0x55; pcm = Math.max(0, -pcm - 8); }
  const ends = [0xff, 0x1ff, 0x3ff, 0x7ff, 0xfff, 0x1fff, 0x3fff, 0x7fff];
  let segment = 0; while (segment < 8 && pcm > ends[segment]) segment++;
  if (segment >= 8) return 0x7f ^ mask;
  return ((segment << 4) | ((pcm >> (segment < 2 ? 4 : segment + 3)) & 15)) ^ mask;
}
function decodeAlaw(a) {
  a ^= 0x55; let t = (a & 15) << 4; const segment = (a & 0x70) >> 4;
  if (segment === 0) t += 8;
  else { t += 0x108; if (segment > 1) t <<= segment - 1; }
  return ((a & 0x80) ? t : -t) / 32768;
}

const $ = id => document.getElementById(id);
let current = null;
try {
  const saved = localStorage.getItem("radio.session");
  $("session").value = ["01", "03"].includes(saved) ? saved : "01";
} catch {}
function log(message) { $("log").textContent = `${new Date().toLocaleTimeString()} ${message}\n` + $("log").textContent.slice(0, 3500); }
function state(text, detail) { $("state").textContent = text; if (detail) $("detail").textContent = detail; }
function showStatus(c, status) {
  c.ready = status.audioReady && status.controlReady;
  $("ptt").disabled = !c.ready || c.busy;
  $("rssi").textContent = "RSSI " + (status.rssi ?? "—");
  if (!c.talking && !c.busy) state(c.ready ? (status.voice ? "음성 수신 중" : "통화 준비") : "상대 대기", c.ready ? "버튼을 누르고 말하세요. 수신 음성은 자동 재생됩니다." : "상대가 접속할 때까지 세션을 유지합니다.");
}
async function connectWebSocket(c) {
  c.ws = new WebSocket(c.base + "/ws/" + $("session").value);
  c.ws.binaryType = "arraybuffer"; c.commands = new Map(); c.commandSeq = 0;
  return new Promise((resolve, reject) => {
    let connected = false;
    const timeout = setTimeout(() => reject(new Error("WSS 접속 시간 초과. 서버 실행·9580 포트·인증서를 확인하세요.")), 8000);
    const error = message => {
      clearTimeout(timeout);
      if (!connected) reject(new Error(message));
      else if (current === c && !c.abort.signal.aborted) void fail(c, new Error(message));
    };
    c.ws.onopen = () => {
      c.heartbeat = setInterval(() => {
        if (c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify({ type: "ping" }));
      }, 1000);
    };
    c.ws.onmessage = ({ data }) => {
      if (current !== c) return;
      if (data instanceof ArrayBuffer) {
        c.node.port.postMessage({ type: "rx", pcm: Float32Array.from(new Uint8Array(data), decodeAlaw) }); return;
      }
      try {
        const message = JSON.parse(data);
        if (message.type === "connected") {
          if (message.sampleRate !== 8000) throw new Error("서버 샘플레이트가 일치하지 않습니다.");
          connected = true; clearTimeout(timeout); resolve(message);
        } else if (message.type === "status") showStatus(c, message);
        else if (message.type === "ack") {
          const pending = c.commands.get(message.request);
          if (pending) { clearTimeout(pending.timer); c.commands.delete(message.request); pending.resolve(); }
        } else if (message.type === "error") error("중계서버: " + message.error);
      } catch (e) { error(e.message); }
    };
    c.ws.onerror = () => error("WSS 접속 실패: " + c.base + ". 9580 포트와 서버 인증서·개인키 권한을 확인하세요.");
    c.ws.onclose = () => { clearInterval(c.heartbeat); if (!c.abort.signal.aborted) error("중계서버 연결이 종료되었습니다."); };
  });
}
async function command(c, on) {
  if (!c.ws) { await api(c, `/api/ptt/${c.id}/${on}`, { method: "POST" }); return; }
  if (c.ws.readyState !== WebSocket.OPEN) throw new Error("WSS 연결이 종료되었습니다.");
  const request = ++c.commandSeq;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { c.commands.delete(request); reject(new Error("PTT 응답 시간 초과")); }, 5000);
    c.commands.set(request, { resolve, reject, timer });
    c.ws.send(JSON.stringify({ type: "ptt", on, request }));
  });
}
async function api(c, path, options = {}) {
  const signal = options.signal || AbortSignal.any([c.abort.signal, AbortSignal.timeout(5000)]);
  let response;
  try {
    response = await fetch(c.base + path, { ...options, signal, cache: "no-store" });
  } catch (error) {
    if (error.name !== "TypeError" || signal.aborted) throw error;
    const mixed = location.protocol === "https:" && c.base.startsWith("http:");
    log(`요청 실패: ${c.base}${path} / 페이지: ${location.href}`);
    throw new Error(mixed
      ? "HTTPS 페이지에서 HTTP 서버 요청이 실패했습니다. 혼합 콘텐츠 차단 여부를 Chrome 콘솔에서 확인하세요. 파일로 실행하거나 서버 HTTPS 또는 테스트용 Chrome 예외 설정이 필요합니다."
      : `HTTP 서버 요청 실패: ${c.base}. 서버 포트·방화벽·CORS·Chrome 네트워크 접근 권한을 확인하세요. F12 콘솔에 차단 사유가 표시됩니다.`);
  }
  if (!response.ok) {
    const message = await response.text(); throw new Error(`HTTP ${response.status} ${message.slice(0, 160)}`);
  }
  return response;
}
async function talkMessage(c, on) {
  const request = ++c.request;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { c.acks.delete(request); reject(new Error("오디오 처리 응답 지연")); }, 1500);
    c.acks.set(request, () => { clearTimeout(timer); resolve(); });
    c.node.port.postMessage({ type: "talk", on, request });
  });
}
function upload(c, pcm) {
  if (c.ws) {
    if (c.ws.readyState !== WebSocket.OPEN || c.ws.bufferedAmount > 16000) { log("WSS 전송 지연: 음성 블록 폐기"); return; }
    c.ws.send(Uint8Array.from(pcm, encodeAlaw)); return;
  }
  if (c.inflight.size >= 2) { log("전송 지연: 오래된 음성 블록 폐기"); return; }
  const data = Uint8Array.from(pcm, encodeAlaw); const seq = c.seq++;
  const task = api(c, `/api/audio/${c.id}/${seq}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: data })
    .catch(error => { if (current === c && !c.abort.signal.aborted) fail(c, error); })
    .finally(() => c.inflight.delete(task));
  c.inflight.add(task);
}
async function connect() {
  $("connect").disabled = true;
  const c = { base: $("server").value.trim().replace(/\/$/, ""), abort: new AbortController(), seq: 0, inflight: new Set(), acks: new Map(), request: 0, ready: false, talking: false, busy: false, micAccepted: false };
  current = c;
  try {
    if (!["01", "03"].includes($("session").value)) throw new Error("차량 01 또는 드론 03 세션을 선택하세요.");
    const url = new URL(c.base); if (!["ws:", "wss:", "http:", "https:"].includes(url.protocol)) throw new Error("WSS 서버 주소를 입력하세요.");
    const websocket = url.protocol === "ws:" || url.protocol === "wss:";
    if (location.protocol === "https:" && (url.protocol === "ws:" || url.protocol === "http:")) throw new Error("HTTPS 페이지에서는 wss:// 또는 https:// 서버 주소를 사용하세요.");
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("이 출처에서 마이크를 사용할 수 없습니다. README의 Chrome 설정을 확인하세요.");
    log(`페이지 ${location.protocol} / 서버 ${c.base}`);
    if (!websocket) {
      state("서버 확인 중", "HTTP 중계서버에 연결할 수 있는지 확인합니다.");
      const health = await (await api(c, "/api/health")).json();
      if (health.sampleRate !== 8000 || health.blockBytes !== 2000) throw new Error("서버의 오디오 규약이 일치하지 않습니다.");
    }
    state("마이크 권한 확인", "브라우저의 마이크 사용 요청을 허용하세요.");
    c.context = new AudioContext(); await c.context.resume();
    c.media = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: false } });
    if (current !== c) { c.media.getTracks().forEach(t => t.stop()); return; }
    c.node = await createRadioNode(c.context, { file: location.protocol === "file:", onFallback: log });
    c.source = c.context.createMediaStreamSource(c.media); c.source.connect(c.node); c.node.connect(c.context.destination);
    c.node.port.onmessage = ({ data }) => {
      if (current !== c) return;
      if (data.type === "mic" && c.micAccepted) upload(c, data.pcm);
      else if (data.type === "talk") { c.acks.get(data.request)?.(); c.acks.delete(data.request); }
      else if (data.type === "meter") for (const key of ["tx", "rx"]) {
        const level = Math.min(1, data[key] * 4); $(key).value = level; $(key + "Value").textContent = Math.round(level * 100) + "%";
      }
    };
    const result = websocket ? await connectWebSocket(c) : await (await api(c, `/api/connect/${$("session").value}`, { method: "POST" })).json(); c.id = result.connection;
    try { localStorage.setItem("radio.server", c.base); localStorage.setItem("radio.session", $("session").value); } catch {}
    $("disconnect").disabled = false; $("server").disabled = $("session").disabled = true;
    state("상대 대기", "상대가 접속할 때까지 세션을 유지합니다."); log("세션 " + $("session").value + " 접속");
    if (!websocket) {
      receive(c).catch(error => { if (current === c && !c.abort.signal.aborted) fail(c, error); });
      await poll(c);
    }
  } catch (error) { if (current === c) await fail(c, error); }
}
async function receive(c) {
  const response = await api(c, `/api/audio/${c.id}`, { signal: c.abort.signal });
  const reader = response.body.getReader();
  try {
    while (!c.abort.signal.aborted) {
      const { value, done } = await reader.read(); if (done) throw new Error("수신 연결 종료");
      c.node.port.postMessage({ type: "rx", pcm: Float32Array.from(value, decodeAlaw) });
    }
  } finally { reader.releaseLock(); }
}
async function poll(c) {
  while (current === c && !c.abort.signal.aborted) {
    const status = await (await api(c, `/api/status/${c.id}`)).json();
    showStatus(c, status);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}
async function startTalk() {
  const c = current; if (!c?.ready || c.busy || c.talking) return;
  c.busy = true;
  try {
    await c.context.resume(); await command(c, true);
    c.micAccepted = true; c.talking = true; await talkMessage(c, true);
    $("ptt").classList.add("talking"); $("ptt").textContent = "송신 중 · 놓으면 종료"; state("송신 중");
  } catch (error) { await fail(c, error); }
  finally { c.busy = false; if (current === c) { $("ptt").disabled = !c.ready; if (!c.held) void stopTalk(); } }
}
async function stopTalk() {
  const c = current; if (!c || c.busy || !c.talking) return;
  c.busy = true; $("ptt").disabled = true;
  try {
    await talkMessage(c, false); c.micAccepted = false;
    await Promise.all([...c.inflight]);
    if (current !== c) return;
    state("마지막 음성 전달 중");
    await command(c, false); c.talking = false;
    $("ptt").classList.remove("talking"); $("ptt").textContent = "누르고 말하기"; state("통화 준비");
  } catch (error) { await fail(c, error); }
  finally { c.busy = false; if (current === c) $("ptt").disabled = !c.ready; }
}
async function disconnect() {
  const c = current; if (!c) return; current = null;
  c.abort.abort(); c.media?.getTracks().forEach(t => t.stop());
  clearInterval(c.heartbeat);
  if (c.commands) for (const pending of c.commands.values()) { clearTimeout(pending.timer); pending.reject(new Error("연결 해제")); }
  if (c.ws) { c.ws.close(); }
  if (c.node && "onaudioprocess" in c.node) c.node.onaudioprocess = null;
  c.source?.disconnect(); c.node?.disconnect();
  if (c.context && c.context.state !== "closed") await c.context.close();
  if (c.id && !c.ws) fetch(c.base + `/api/session/${c.id}`, { method: "DELETE", keepalive: true }).catch(() => {});
  $("connect").disabled = false; $("disconnect").disabled = $("ptt").disabled = true;
  $("server").disabled = $("session").disabled = false;
  $("ptt").classList.remove("talking"); $("ptt").textContent = "누르고 말하기";
  $("tx").value = $("rx").value = 0; $("txValue").textContent = $("rxValue").textContent = "0%"; $("rssi").textContent = "RSSI —";
  state("접속 대기", "세션 연결을 해제했습니다.");
}
async function fail(c, error) { if (current !== c) return; log(error.message); await disconnect(); state("연결 오류", error.message); }
$("connect").onclick = connect; $("disconnect").onclick = disconnect;
$("ptt").onpointerdown = event => { event.preventDefault(); if (current) current.held = true; $("ptt").setPointerCapture(event.pointerId); void startTalk(); };
function release() { if (current) current.held = false; void stopTalk(); }
$("ptt").onpointerup = release; $("ptt").onpointercancel = release; window.addEventListener("blur", release);
window.addEventListener("pointerup", release); window.addEventListener("pointercancel", release);
document.addEventListener("visibilitychange", () => { if (document.hidden) release(); });
document.addEventListener("keydown", event => { if (event.code === "Space" && !event.repeat && document.activeElement === $("ptt")) { event.preventDefault(); if (current) current.held = true; void startTalk(); } });
document.addEventListener("keyup", event => { if (event.code === "Space") release(); });
window.addEventListener("pagehide", () => {
  if (current?.ws) current.ws.close();
  else if (current?.id) fetch(current.base + `/api/session/${current.id}`, { method: "DELETE", keepalive: true }).catch(() => {});
});
window.addEventListener("message", event => {
  if (event.origin !== location.origin || event.source !== parent || event.data?.type !== "forest-radio-context") return;
  $("session").options[0].textContent = `${event.data.carName} · 세션 01`;
  $("asset").textContent = "SIM-RTK-CAR-01 → 01 · SIM-RTK-DRONE-01 → 03";
  if (!event.data.active) release();
});
