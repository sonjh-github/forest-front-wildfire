const test = require('node:test');
const assert = require('node:assert/strict');
const dgram = require('node:dgram');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createBridge, ALLOWED_ORIGIN } = require('../server.cjs');
const { DEFAULT_KEY, decode, encode } = require('../lib/udp.cjs');
const { buildScrollCommands } = require('../index.cjs');

test('production origin, read-only identification, fixed geometry and a single native animation upload', async t => {
  const board = dgram.createSocket('udp4'), key = Buffer.alloc(16, 0x27), packets = [];
  let rejectCommand, mac = '441bf6eef410';
  board.on('message', (raw, remote) => {
    const first = raw[22] === 0;
    const request = decode(raw, first ? DEFAULT_KEY : key);
    packets.push(request);
    let payload = Buffer.alloc(0);
    if (first) { payload = Buffer.alloc(24); payload.writeUInt32LE(12345); payload.writeUInt32LE(1000, 4); key.copy(payload, 8); }
    if (request.command === 5) payload = mac ? Buffer.from(`7501${mac}`, 'hex') : Buffer.alloc(0);
    if (request.command === 0x1b) payload = Buffer.from('HD_WF4_1 V6.02.426');
    board.send(encode({ ...request, payload, response: true, status: request.command === rejectCommand ? 8 : 0, key: first ? DEFAULT_KEY : key }), remote.port, remote.address);
  });
  await new Promise(resolve => board.bind(0, '127.0.0.1', resolve));
  const logDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'forest-wf4-test-'));
  const server = createBridge({ board: { host: '127.0.0.1', port: board.address().port }, logDirectory });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve)); board.close();
    for (const name of fs.readdirSync(logDirectory)) fs.unlinkSync(path.join(logDirectory, name));
    fs.rmdirSync(logDirectory);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (route, body, origin = ALLOWED_ORIGIN) => fetch(base + '/api/wf4/' + route, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const health = await fetch(base + '/health', { headers: { Origin: ALLOWED_ORIGIN } });
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('Access-Control-Allow-Origin'), ALLOWED_ORIGIN);
  assert.equal((await health.json()).service, 'forest-wf4-bridge');
  assert.equal(packets.length, 0, 'setup health check never contacts the board');
  assert.equal((await post('discover', {}, 'https://example.com')).status, 403);
  assert.equal(packets.length, 0);
  const preflight = await fetch(base + '/api/wf4/discover', { method: 'OPTIONS', headers: { Origin: ALLOWED_ORIGIN, 'Access-Control-Request-Private-Network': 'true' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), ALLOWED_ORIGIN);
  assert.equal(preflight.headers.get('Access-Control-Allow-Private-Network'), 'true');
  const discovery = await post('discover', {});
  assert.equal(discovery.status, 200);
  const device = await discovery.json();
  assert.equal(device.model, 'HD_WF4_1');
  assert.equal(device.deviceName, 'WF4_441bf6eef410');
  assert.deepEqual(packets.map(p => p.command), [0, 5, 0x1b], 'recognition never writes screen settings');
  assert.equal((await post('scroll', { bitmap: [], stripWidth: 1 })).status, 400);
  const bitmap = Array(32 * 8).fill(0); bitmap[10] = 1;
  for (const wrongMac of ['441bf6eef411', null]) {
    mac = wrongMac;
    const beforeWrong = packets.length;
    assert.equal((await post('discover', {})).status, 409);
    const rejected = await post('scroll', { bitmap, stripWidth: 8 });
    assert.equal(rejected.status, 409);
    assert.match((await rejected.json()).error, /WF4_441bf6eef410/);
    assert.ok(packets.slice(beforeWrong).every(packet => [5, 0x1b].includes(packet.command)), 'a different or unidentified board receives inquiry commands only');
  }
  mac = '441bf6eef410';
  const beforeSend = packets.length;
  const response = await post('scroll', { bitmap, stripWidth: 8, host: '192.0.2.1', width: 1024, height: 99, direction: 'right' });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.step, 1); assert.equal(result.frameIntervalMs, 25);
  assert.equal(result.width, 256); assert.equal(result.height, 32); assert.equal(result.acked, true);
  const commands = packets.slice(beforeSend);
  assert.equal(commands.filter(p => p.command === 2).length, 1);
  assert.equal(commands.filter(p => p.command === 4).length, 1);
  assert.deepEqual(Buffer.concat(commands.filter(p => p.command === 3).map(p => p.payload.subarray(5))), buildScrollCommands({ bitmap, stripWidth: 8, width: 256, height: 32, step: 1, direction: 'left' }).program);
  const beforeRepeat = packets.length;
  assert.equal((await (await post('scroll', { bitmap, stripWidth: 8 })).json()).skipped, true);
  assert.deepEqual(packets.slice(beforeRepeat).map(p => p.command), [5, 0x1b], 'identical images still verify identity but never upload again');
  rejectCommand = 3; bitmap[11] = 1;
  assert.equal((await post('scroll', { bitmap, stripWidth: 8 })).status, 502);
  assert.ok(fs.readdirSync(logDirectory).length >= 2);
});

test('dashboard password unlocks the board, stays in memory across idle reconnects and never appears in logs', async t => {
  const board = dgram.createSocket('udp4'), key = Buffer.alloc(16, 0x41), passwordKey = Buffer.from('2a8a2df2dcb922ca3a3361e1dff744d8', 'hex');
  let authentications = 0;
  board.on('message', (raw, remote) => {
    const first = raw[22] === 0;
    let request;
    try { request = decode(raw, first ? passwordKey : key); }
    catch {
      request = decode(raw, DEFAULT_KEY);
      board.send(encode({ ...request, payload: Buffer.alloc(0), response: true, status: 129, key: DEFAULT_KEY }), remote.port, remote.address);
      return;
    }
    let payload = Buffer.alloc(0);
    if (first) { authentications++; payload = Buffer.alloc(24); payload.writeUInt32LE(12345); payload.writeUInt32LE(1000, 4); key.copy(payload, 8); }
    if (request.command === 5) payload = Buffer.from('7501441bf6eef410', 'hex');
    if (request.command === 0x1b) payload = Buffer.from('HD_WF4_1 V6.02.426');
    board.send(encode({ ...request, payload, response: true, key: first ? passwordKey : key }), remote.port, remote.address);
  });
  await new Promise(resolve => board.bind(0, '127.0.0.1', resolve));
  const logDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'wf4-auth-test-'));
  const server = createBridge({ board: { host: '127.0.0.1', port: board.address().port, idleTimeoutMs: 5 }, logDirectory });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); board.close(); for (const name of fs.readdirSync(logDirectory)) fs.unlinkSync(path.join(logDirectory, name)); fs.rmdirSync(logDirectory); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const post = (route, body) => fetch(base + '/api/wf4/' + route, { method: 'POST', headers: { Origin: ALLOWED_ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await (await fetch(base + '/health')).json()).passwordAuthentication, true);
  assert.equal((await post('discover', { password: [] })).status, 400);
  const rejected = await post('discover', {});
  assert.equal(rejected.status, 502); assert.match((await rejected.json()).error, /기기 잠금 암호/);
  assert.equal((await post('discover', { password: 'fixture-pass' })).status, 200);
  await new Promise(resolve => setTimeout(resolve, 20));
  const bitmap = Array(32 * 8).fill(0); bitmap[0] = 1;
  const receipt = await post('scroll', { bitmap, stripWidth: 8 });
  assert.equal(receipt.status, 200); assert.equal((await receipt.json()).acked, true);
  assert.equal(authentications, 2, 'auto-send reconnects using the password held in memory');
  for (const name of fs.readdirSync(logDirectory)) assert.ok(!fs.readFileSync(path.join(logDirectory, name), 'utf8').includes('fixture-pass'));
});
