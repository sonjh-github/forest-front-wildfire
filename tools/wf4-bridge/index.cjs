const net = require('node:net');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { openSession, authenticationKey } = require('./lib/udp.cjs');
const { buildPixelProgram, buildAnimatedProgram, programCommands } = require('./lib/program.cjs');
const { scrollInfo, scrollFrame } = require('./lib/scroll.cjs');

const defaults = Object.freeze({ host: '192.168.4.1', port: 6101, panelWidth: 64, panelHeight: 32, columns: 4, rows: 1 });
function integer(value, name, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) throw new TypeError(`${name}: ${min}~${max} 범위의 정수가 필요합니다.`);
  return value;
}
function geometry(options = {}) {
  const panelWidth = integer(options.panelWidth ?? defaults.panelWidth, 'panelWidth', 1, 1280);
  const panelHeight = integer(options.panelHeight ?? defaults.panelHeight, 'panelHeight', 1, 256);
  const columns = integer(options.columns ?? defaults.columns, 'columns', 1, 20);
  const rows = integer(options.rows ?? defaults.rows, 'rows', 1, 20);
  const width = integer(options.width ?? panelWidth * columns, 'width', 64, 1280);
  const height = integer(options.height ?? panelHeight * rows, 'height', 1, 256);
  if (width % 64) throw new TypeError('현재 픽셀 인코더는 전체 가로 픽셀 수가 64의 배수인 해상도를 지원합니다.');
  return { panelWidth, panelHeight, columns, rows, width, height };
}
function connection(options = {}) {
  const host = options.host ?? defaults.host;
  if (typeof host !== 'string' || !net.isIPv4(host)) throw new TypeError('host: 보드의 IPv4 주소가 필요합니다.');
  return { host, port: integer(options.port ?? defaults.port, 'port', 1, 65535) };
}
function normalizeFrame(options) {
  if (!options || typeof options !== 'object') throw new TypeError('해상도와 pixels를 전달하세요.');
  const size = geometry(options);
  const input = options.pixels;
  if (!Array.isArray(input) && !(input instanceof Uint8Array)) throw new TypeError('pixels: 0/1 또는 boolean으로 된 배열이 필요합니다.');
  let flat = input;
  if (Array.isArray(input[0])) {
    if (input.length !== size.height || input.some(row => !Array.isArray(row) || row.length !== size.width)) throw new TypeError(`pixels: ${size.height}행 × ${size.width}열이어야 합니다.`);
    flat = input.flat();
  }
  if (flat.length !== size.width * size.height) throw new TypeError(`pixels: 정확히 ${size.width * size.height}개의 값이 필요합니다.`);
  const pixels = Buffer.alloc(flat.length);
  for (let i = 0; i < flat.length; i++) {
    if (![0, 1, false, true].includes(flat[i])) throw new TypeError(`pixels[${i}]: 0/1 또는 boolean만 사용할 수 있습니다.`);
    pixels[i] = flat[i] ? 1 : 0;
  }
  return { ...size, pixels };
}
function screenPayload(width, height) {
  const body = Buffer.from('4853004200a0002000010206005460013560000000313131000000000000000000000000040000000800080000000800100008000400100008000800010000000000', 'hex');
  body.writeUInt16BE(width, 4); body.writeUInt16BE(height, 6);
  return body;
}
function buildCommands(options, transferId = crypto.randomInt(65536)) {
  const frame = normalizeFrame(options);
  const frameCount = integer(options.frameCount ?? 1, 'frameCount', 1, 30);
  const program = buildPixelProgram(frame.pixels, { ...frame, frameCount });
  return { frame, program, commands: commandsForProgram(frame, program, transferId) };
}
function commandsForProgram(frame, program, transferId) {
  return [
    { command: 0x0f, payload: Buffer.from([2, 0xff]) },
    { command: 0x13, payload: screenPayload(frame.width, frame.height) },
    { command: 0x16, payload: Buffer.from([2, 3]) },
    { command: 0x16, payload: Buffer.from([2, 6]) },
    ...programCommands(program, transferId),
  ];
}
function buildScrollCommands(options, transferId = crypto.randomInt(65536)) {
  const frame = geometry(options), info = scrollInfo({ ...frame, stripWidth: options.stripWidth, step: options.step, direction: options.direction });
  const input = options.bitmap;
  if ((!Array.isArray(input) && !(input instanceof Uint8Array)) || input.length !== info.stripWidth * info.height) throw new TypeError('텍스트 픽셀 배열 크기가 맞지 않습니다.');
  const bitmap = Buffer.alloc(input.length);
  for (let i = 0; i < input.length; i++) {
    if (![0, 1, false, true].includes(input[i])) throw new TypeError('텍스트 픽셀은 0/1이어야 합니다.');
    bitmap[i] = input[i] ? 1 : 0;
  }
  if (!bitmap.some(Boolean)) throw new TypeError('표시할 텍스트 픽셀이 없습니다.');
  // Preserve the previous 4px / 100ms speed while advancing one pixel per frame.
  info.frameIntervalMs = info.step * 25;
  const program = buildAnimatedProgram(Array.from({ length: info.frameCount }, (_, i) => scrollFrame(bitmap, info, i)), { ...frame, frameIntervalMs: info.frameIntervalMs });
  return { frame, program, commands: commandsForProgram(frame, program, transferId), info };
}
const active = new Set();
async function exclusive(options, action) {
  const target = connection(options);
  const id = `${target.host}:${target.port}`;
  if (active.has(id)) { const error = new Error('같은 보드로 전송 중입니다. 완료 후 다시 시도하세요.'); error.code = 'BUSY'; throw error; }
  active.add(id);
  try { return await action(target); }
  finally { active.delete(id); }
}
function createPixelSender(options = {}) {
  const target = connection(options);
  let password = options.password ?? '';
  authenticationKey(password);
  const idleTimeoutMs = integer(options.idleTimeoutMs ?? 30000, 'idleTimeoutMs', 1, 300000);
  let session, idleTimer, configured = null, lastHash = null, disposed = false;
  function disconnect() {
    clearTimeout(idleTimer);
    session?.close(); session = undefined; configured = null; lastHash = null;
  }
  async function usingSession(callOptions, action) {
    return exclusive(target, async () => {
      if (disposed) throw new Error('Pixel sender is closed');
      clearTimeout(idleTimer);
      try {
        session ??= await openSession(target.host, target.port, { traceFile: callOptions.traceFile ?? null, traceLimit: 1024, helloSuffix: options.helloSuffix, password });
        return await action(session);
      } catch (error) {
        session?.flushTrace(callOptions.traceFile ?? null);
        disconnect(); throw error;
      } finally {
        if (session) {
          session.flushTrace(callOptions.traceFile ?? null);
          idleTimer = setTimeout(disconnect, idleTimeoutMs);
          idleTimer.unref();
        }
      }
    });
  }
  async function send(frameOptions, scrolling = false) {
    const data = { ...options, ...frameOptions };
    const { frame, program, commands, info } = scrolling ? buildScrollCommands(data) : buildCommands(data);
    if (data.force !== undefined && typeof data.force !== 'boolean') throw new TypeError('force must be boolean');
    const signature = `${frame.width}x${frame.height}`;
    const hash = crypto.createHash('sha256').update(program).digest('hex');
    const started = performance.now();
    return usingSession(data, async current => {
      const initialized = configured !== signature;
      const skipped = !initialized && lastHash === hash && !data.force;
      const pending = skipped ? [] : initialized ? commands : commands.slice(4);
      for (const { command, payload } of pending) await current.request(command, payload);
      configured = signature; lastHash = hash;
      return { acked: true, ...target, width: frame.width, height: frame.height, litPixels: frame.pixels?.reduce((n, p) => n + p, 0), programBytes: program.length, commandCount: pending.length, initialized, skipped, durationMs: Math.round(performance.now() - started), transport: 'HDSign UDP', mode: scrolling ? 'saved-animation' : 'saved-program', frameCount: info?.frameCount, step: info?.step, frameIntervalMs: info?.frameIntervalMs };
    });
  }
  return {
    setPassword(value) {
      authenticationKey(value);
      if (active.has(`${target.host}:${target.port}`)) { const error = new Error('전송 완료 후 기기 암호를 변경하세요.'); error.code = 'BUSY'; throw error; }
      if (value !== password) { disconnect(); password = value; }
    },
    sendPixels: send,
    sendScroll: frameOptions => send(frameOptions, true),
    identify: (probeOptions = {}) => usingSession({ ...options, ...probeOptions }, async current => {
      const inquiry = await current.request(5, Buffer.from([0]));
      // Online inquiry byte 2..7 contains the six-byte Wi-Fi MAC (verified capture).
      const mac = inquiry.payload.length >= 8 ? inquiry.payload.subarray(2, 8).toString('hex') : null;
      const reply = await current.request(0x1b, Buffer.from('000c000000600000000e0001', 'hex'));
      const match = /\b(HD_WF\w*)\s+(V\d+\.\d+\.\d+)\b/.exec(reply.payload.toString('ascii'));
      if (!match) throw new Error('WF 계열 전광판의 모델 정보를 확인하지 못했습니다.');
      return { connected: true, ...target, mac, deviceName: mac ? `WF4_${mac}` : null, model: match[1], firmware: match[2], panelCount: 4, width: 256, height: 32 };
    }),
    probe: (probeOptions = {}) => usingSession({ ...options, ...probeOptions }, async current => {
      const reply = await current.request(5, Buffer.from([0]));
      return { connected: true, ...target, status: reply.status, payloadBytes: reply.payload.length };
    }),
    close() { disposed = true; disconnect(); },
  };
}
async function sendPixels(options) {
  const sender = createPixelSender(options);
  try { return await sender.sendPixels(options); }
  finally { sender.close(); }
}
async function probe(options = {}) {
  const sender = createPixelSender(options);
  try { return await sender.probe(options); }
  finally { sender.close(); }
}
module.exports = { defaults, geometry, normalizeFrame, buildCommands, buildScrollCommands, screenPayload, sendPixels, probe, createPixelSender };
