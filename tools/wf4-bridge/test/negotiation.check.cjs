const test = require('node:test');
const assert = require('node:assert/strict');
const dgram = require('node:dgram');
const os = require('node:os');
const { DEFAULT_KEY, buildHello, encode, decode, openSession } = require('../lib/udp.cjs');

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
