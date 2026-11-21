const test = require('node:test');
const assert = require('node:assert/strict');
const dgram = require('node:dgram');
const os = require('node:os');
const { DEFAULT_KEY, authenticationKey, buildHello, encode, decode, openSession } = require('../lib/udp.cjs');

test('negotiation uses the routed adapter instead of the first VPN/Ethernet adapter', t => {
  t.mock.method(os, 'networkInterfaces', () => ({
    VPN: [{ address: '100.64.0.2', internal: false, mac: '02:00:00:00:00:01' }],
    Ethernet: [{ address: '169.254.1.2', internal: false, mac: '02:00:00:00:00:02' }],
    WiFi: [{ address: '192.168.4.3', internal: false, mac: '02:00:00:00:00:03' }],
  }));
  const hello = buildHello(1000, '2026/11/21 13:00:00', undefined, '192.168.4.3');
  assert.match(hello.subarray(4).toString('utf8'), /MAC::02-00-00-00-00-03\0$/);
});

test('status 129 on command 0 is rejected once and sends no screen commands', async t => {
  const board = dgram.createSocket('udp4');
  const commands = [];
  board.on('message', (raw, remote) => {
    const request = decode(raw, DEFAULT_KEY);
    commands.push(request.command);
    board.send(encode({ ...request, key: DEFAULT_KEY, response: true, status: 129, payload: Buffer.alloc(0) }), remote.port, remote.address);
  });
  await new Promise(resolve => board.bind(0, '127.0.0.1', resolve));
  t.after(() => board.close());
  await assert.rejects(openSession('127.0.0.1', board.address().port), error => error.code === 'UDP_REJECTED' && error.command === 0 && error.status === 129);
  assert.deepEqual(commands, [0]);
});

test('HDSign device-password key has a fixed salt and preserves unlocked-board compatibility', () => {
  assert.deepEqual(authenticationKey(''), DEFAULT_KEY);
  assert.equal(authenticationKey('fixture-pass').toString('hex'), '2a8a2df2dcb922ca3a3361e1dff744d8');
  assert.throws(() => authenticationKey(null), TypeError);
  assert.throws(() => authenticationKey('bad\0value'), TypeError);
});

test('locked board authenticates using the supplied password and then negotiates a session key', async t => {
  const board = dgram.createSocket('udp4'), key = Buffer.alloc(16, 0x37), firstKey = Buffer.from('2a8a2df2dcb922ca3a3361e1dff744d8', 'hex');
  board.on('message', (raw, remote) => {
    const first = raw[22] === 0, request = decode(raw, first ? firstKey : key);
    let payload = Buffer.from('inquiry');
    if (first) { payload = Buffer.alloc(24); payload.writeUInt32LE(12345); payload.writeUInt32LE(1000, 4); key.copy(payload, 8); }
    board.send(encode({ ...request, payload, response: true, key: first ? firstKey : key }), remote.port, remote.address);
  });
  await new Promise(resolve => board.bind(0, '127.0.0.1', resolve));
  t.after(() => board.close());
  const session = await openSession('127.0.0.1', board.address().port, { password: 'fixture-pass' });
  t.after(() => session.close());
  assert.equal((await session.request(5, Buffer.from([0]))).payload.toString(), 'inquiry');
});

test('one-pixel scrolling preserves speed and does not silently skip pixels on long weather text', () => {
  const { buildScrollCommands } = require('../index.cjs');
  const { scrollInfo, scrollFrame } = require('../lib/scroll.cjs');
  const info = scrollInfo({ width: 256, height: 32, stripWidth: 900, step: 1 });
  assert.equal(info.step, 1); assert.equal(info.frameCount, 1157);
  const bitmap = new Uint8Array(900 * 32); bitmap[0] = 1;
  assert.equal(scrollFrame(bitmap, info, 1).findIndex(Boolean), 255);
  assert.equal(scrollFrame(bitmap, info, 2).findIndex(Boolean), 254);
  const small = Array(32 * 8).fill(0); small[0] = 1;
  const result = buildScrollCommands({ bitmap: small, stripWidth: 8, width: 256, height: 32, step: 1 });
  assert.equal(result.info.step / result.info.frameIntervalMs, 4 / 100);
  assert.equal(result.program.readUInt16BE(97 + 50), 25);
  assert.throws(() => scrollInfo({ width: 256, height: 32, stripWidth: 2048, step: 1 }), /문구가 너무 깁니다/);
});
