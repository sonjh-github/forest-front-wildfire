// HDSign wire format verified against wf4-20261116-110717.pcapng.
const crypto = require('node:crypto');
const dgram = require('node:dgram');
const fs = require('node:fs');
const os = require('node:os');
const DEFAULT_KEY = crypto.createHash('md5').update(Buffer.alloc(32)).digest();

function buildHello(contextId, timestamp, csvSuffix, localAddress) {
  if (csvSuffix === undefined) {
    const id = crypto.createHash('md5').update(os.hostname()).digest('hex').slice(0, 16).toUpperCase();
    const interfaces = Object.values(os.networkInterfaces()).flat();
    const adapter = localAddress ? interfaces.find(n => n.address === localAddress) : interfaces.find(n => !n.internal && n.mac !== '00:00:00:00:00:00');
    const mac = adapter?.mac || '00:00:00:00:00:00';
    csvSuffix = `,,HDSign,${id},,${id},MAC::${mac.replaceAll(':', '-').toUpperCase()}`;
  }
  if (typeof csvSuffix !== 'string' || !csvSuffix.startsWith(',,HDSign,') || /[\r\n\0]/.test(csvSuffix)) throw new Error('Invalid connection template');
  const clock = timestamp || new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date()).replaceAll('-', '/');
  const text = Buffer.from(clock + csvSuffix + '\0', 'utf8');
  const hello = Buffer.alloc(4 + text.length);
  hello.writeUInt32LE(contextId);
  text.copy(hello, 4);
  return hello;
}

function encrypt(data, key) {
  const cipher = crypto.createCipheriv('aes-128-ecb', key, null);
  return Buffer.concat([cipher.update(data), cipher.final()]);
}
function decrypt(data, key) {
  const cipher = crypto.createDecipheriv('aes-128-ecb', key, null);
  return Buffer.concat([cipher.update(data), cipher.final()]);
}
function encode({ command, payload, key, clientId = 0, contextId = 1000, marker = 0, sequence = 1, flags = 0xc1, response = false, status = 0 }) {
  const body = (flags & 1) && payload.length ? encrypt(payload, key) : payload;
  const headerLength = response ? 24 : 23;
  const data = Buffer.alloc(headerLength + body.length + 17);
  data.write(response ? 'DH' : 'HD');
  data.writeUInt16LE(data.length, 2);
  data[4] = headerLength;
  data.writeUInt32LE(clientId, 5);
  data.writeUInt32LE(contextId, 9);
  data.writeUInt32LE(marker, 13);
  data[17] = flags;
  data.writeUInt32LE(sequence, 18);
  data[22] = command;
  if (response) data[23] = status;
  body.copy(data, headerLength);
  crypto.createHmac('md5', key).update(data.subarray(0, -17)).digest().copy(data, data.length - 17);
  data[data.length - 1] = 0xaa;
  return data;
}
function decode(data, key) {
  if (data.length < 40 || !['HD', 'DH'].includes(data.toString('ascii', 0, 2))) throw new Error('Invalid HDSign prefix');
  const response = data.toString('ascii', 0, 2) === 'DH';
  const headerLength = response ? 24 : 23;
  if (data[4] !== headerLength || data.length !== data.readUInt16LE(2) || data.at(-1) !== 0xaa) throw new Error('Invalid HDSign frame length/header');
  const expected = crypto.createHmac('md5', key).update(data.subarray(0, -17)).digest();
  if (!crypto.timingSafeEqual(expected, data.subarray(-17, -1))) throw new Error('Invalid HDSign HMAC');
  const body = data.subarray(headerLength, -17);
  return { response, clientId: data.readUInt32LE(5), contextId: data.readUInt32LE(9), marker: data.readUInt32LE(13), sequence: data.readUInt32LE(18), command: data[22], flags: data[17], status: response ? data[23] : 0, payload: (data[17] & 1) && body.length ? decrypt(body, key) : body };
}

async function openSession(host, port = 6101, { traceFile = null, traceLimit = 128, helloSuffix } = {}) {
  const socket = dgram.createSocket('udp4');
  let key = DEFAULT_KEY;
  let clientId = 0;
  let contextId = 1000;
  let sequence = 0;
  // HDSign initializes this field with ~rand15(), then advances it per request.
  let marker = (0xffffffff - crypto.randomInt(32768)) >>> 0;
  let pending;
  let socketError;
  let closed = false;
  const trace = [];
  const record = (direction, data) => {
    trace.push({ time: new Date().toISOString(), direction, hex: data.toString('hex') });
    if (trace.length > traceLimit) trace.shift();
  };
  const flushTrace = (file = traceFile) => {
    traceFile = file;
    try { if (file) fs.writeFileSync(file, JSON.stringify({ host, port, trace }, null, 2) + '\n'); }
    catch (error) { console.error(`Cannot save UDP trace: ${error.message}`); }
  };
  const close = () => {
    if (closed) return;
    closed = true;
    flushTrace();
    if (pending) pending.reject(new Error('UDP session closed'));
    try { socket.close(); }
    catch (error) { if (error.code !== 'ERR_SOCKET_DGRAM_NOT_RUNNING') throw error; }
  };
  socket.on('error', error => { socketError = error; if (pending) pending.reject(error); });
  socket.on('message', (data, remote) => {
    if (!pending || remote.address !== host || remote.port !== port) return;
    // Ignore other processes' broadcasts and late responses on the same subnet.
    if (data.length < 24 || data.toString('ascii', 0, 2) !== 'DH' || data.readUInt32LE(18) !== pending.sequence || data[22] !== pending.command) return;
    if (data.readUInt32LE(9) !== contextId) return;
    record('RX', data);
    try {
      let reply;
      try { reply = decode(data, key); }
      catch (error) {
        // HDSign's own validator (0x458353..0x4583A5) also checks the default key.
        // Some board replies use it instead of the negotiated session key.
        if (!/HMAC/.test(error.message) || key.equals(DEFAULT_KEY)) throw error;
        reply = decode(data, DEFAULT_KEY);
      }
      if (!reply.response || reply.contextId !== contextId) return;
      if (reply.status !== 0 && reply.status !== 6) {
        const error = new Error(`UDP command 0x${reply.command.toString(16)} rejected: status ${reply.status}; RX=${data.toString('hex')}`);
        error.code = 'UDP_REJECTED'; error.command = reply.command; error.status = reply.status;
        throw error;
      }
      pending.resolve(reply);
    } catch (error) {
      if (!error.message.includes('RX=')) error.message += `; command=0x${pending.command.toString(16)} sequence=${pending.sequence}; RX=${data.toString('hex')}`;
      pending.reject(error);
    }
  });
  function request(command, payload) {
    if (closed) return Promise.reject(new Error('UDP session closed'));
    if (socketError) return Promise.reject(socketError);
    if (pending) return Promise.reject(new Error('Overlapping UDP requests'));
    const current = ++sequence;
    const flags = command === 3 || command === 0x19 ? 0xc0 : 0xc1;
    const tx = encode({ command, payload, key, clientId, contextId, marker, sequence: current, flags });
    record('TX', tx);
    marker = marker === 0xffffffff ? 0 : (marker + 1 + crypto.randomInt(32768) % (0xffffffff - marker)) >>> 0;
    return new Promise((resolve, reject) => {
      const finish = (error, reply) => { clearTimeout(timer); pending = undefined; error ? reject(error) : resolve(reply); };
      const timer = setTimeout(() => finish(new Error(`UDP command 0x${command.toString(16)} timeout; TX=${tx.toString('hex')}`)), 3000);
      pending = { command, sequence: current, resolve: reply => finish(null, reply), reject: error => finish(error) };
      socket.send(tx, error => { if (error && pending?.sequence === current) pending.reject(error); });
    });
  }
  try {
    // Resolve the actual route before choosing the MAC advertised in negotiation.
    // Connecting a UDP socket does not send a controller command.
    await new Promise((resolve, reject) => {
      socket.once('error', reject);
      socket.connect(port, host, () => { socket.off('error', reject); resolve(); });
    });
    // Reproduce the complete observed context ID + CSV log + NUL request body.
    const reply = await request(0, buildHello(contextId, undefined, helloSuffix, socket.address().address));
    if (reply.payload.length < 24) throw new Error('Incomplete HDSign negotiation reply');
    clientId = reply.payload.readUInt32LE(0);
    contextId = reply.payload.readUInt32LE(4);
    key = Buffer.from(reply.payload.subarray(8, 24));
    return { request, close, flushTrace, clientId, contextId };
  } catch (error) { close(); throw error; }
}
module.exports = { DEFAULT_KEY, encode, decode, buildHello, openSession };
