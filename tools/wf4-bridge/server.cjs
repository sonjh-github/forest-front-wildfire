const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { createPixelSender } = require('./index.cjs');
const ALLOWED_ORIGIN = 'https://wildfire.forest.tobeunicorn.kr';
const TARGET_DEVICE = 'WF4_441bf6eef410';
const FIXED = { panelWidth: 64, panelHeight: 32, columns: 4, rows: 1, width: 256, height: 32, direction: 'left' };
function createBridge({ board = { host: '192.168.4.1', port: 6101 }, logDirectory = path.join(__dirname, 'logs') } = {}) {
  const sender = createPixelSender(board);
  const server = http.createServer(async (request, response) => {
    const reply = (status, body) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(body)); };
    if (!/^(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(request.headers.host || '')) return reply(403, { error: '로컬 연결만 지원합니다.' });
    const origin = request.headers.origin;
    if (origin && origin !== ALLOWED_ORIGIN) return reply(403, { error: '허용되지 않은 서비스입니다.' });
    if (origin === ALLOWED_ORIGIN) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Vary', 'Origin');
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      response.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
    if (request.method === 'OPTIONS') { response.writeHead(204); return response.end(); }
    if (request.method === 'GET' && request.url === '/health') return reply(200, { service: 'forest-wf4-bridge', deviceName: TARGET_DEVICE, ...FIXED });
    if (request.method !== 'POST' || !['/api/wf4/discover', '/api/wf4/scroll'].includes(request.url)) return reply(404, { error: '지원하지 않는 경로입니다.' });
    let traceFile;
    try {
      if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] || '')) throw new TypeError('JSON 요청이 필요합니다.');
      let bytes = 0; const chunks = [];
      for await (const chunk of request) { bytes += chunk.length; if (bytes > 1024 * 1024) throw new TypeError('요청이 너무 큽니다.'); chunks.push(chunk); }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new TypeError('JSON 형식이 올바르지 않습니다.'); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new TypeError('JSON 객체가 필요합니다.');
      fs.mkdirSync(logDirectory, { recursive: true });
      traceFile = path.join(logDirectory, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.json`);
      const device = await sender.identify({ traceFile });
      if (device.deviceName !== TARGET_DEVICE) {
        const error = new Error(`${TARGET_DEVICE} 전용입니다. 해당 Wi-Fi에 연결하세요. 다른 장치에는 송신하지 않았습니다.`);
        error.code = 'WRONG_DEVICE';
        throw error;
      }
      const result = request.url === '/api/wf4/discover'
        ? device
        : await sender.sendScroll({ bitmap: body.bitmap, stripWidth: body.stripWidth, step: 4, ...FIXED, traceFile });
      reply(200, result);
    } catch (error) {
      const status = error instanceof TypeError ? 400 : ['BUSY', 'WRONG_DEVICE'].includes(error.code) ? 409 : 502;
      const message = /timeout/i.test(error.message) ? 'WF4가 응답하지 않습니다. 보드 전원과 WF4 Wi-Fi 연결을 확인하세요.' : error.message.split(';')[0];
      reply(status, { error: message });
    } finally {
      if (fs.existsSync(logDirectory)) {
        const logs = fs.readdirSync(logDirectory).filter(f => /^\d{13}-[a-f0-9]{8}\.json$/.test(f)).sort().reverse();
        for (const file of logs.slice(30)) { try { fs.unlinkSync(path.join(logDirectory, file)); } catch { /* Diagnostics must not interrupt device control. */ } }
      }
    }
  });
  server.on('close', () => sender.close());
  return server;
}
if (require.main === module) {
  const requiredVersion = require('./package.json').engines.node;
  if (process.versions.node !== requiredVersion) {
    console.error(`Node.js ${requiredVersion} 설치가 필요합니다. 현재 버전: ${process.versions.node}`);
    process.exitCode = 1;
  } else {
    const server = createBridge();
    server.on('error', error => {
      console.error(error.code === 'EADDRINUSE' ? '8790 포트를 사용 중입니다. 이미 실행한 연결 도구가 있는지 확인하고 대시보드에서 연결 도구 실행 확인을 누르세요.' : `연결 도구 실행 실패: ${error.message}`);
      process.exitCode = 1;
    });
    server.listen(8790, '127.0.0.1', () => console.log('전광판 연결 도구 실행 중 · 산불 서비스에서 장치 인식을 누르세요. 이 창을 열어 두세요. 종료: Ctrl+C'));
  }
}
module.exports = { createBridge, FIXED, ALLOWED_ORIGIN };
