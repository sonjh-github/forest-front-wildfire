// Reuse the complete normal-program structure captured from HDSign.
// This sends a saved program ONCE; it is not the RAM-update path.
const fs = require('node:fs');
const path = require('node:path');
const SCREEN_WIDTH = 256;
const SCREEN_HEIGHT = 32;

function encodeAreaFrame(mask, x, y, width, height, screenWidth = SCREEN_WIDTH) {
  // Native rows align to GLOBAL 32-pixel words, including x's offset in a word.
  // This explains the eight-bit displacement between the two captured '1' items.
  const rowBytes = Math.ceil(((x % 32) + width) / 32) * 4;
  const frame = Buffer.alloc(rowBytes * height);
  for (let dy = 0; dy < height; dy++) for (let dx = 0; dx < width; dx++) {
    if (mask[(y + dy) * screenWidth + x + dx]) {
      const bit = (x % 32) + dx;
      frame[dy * rowBytes + (bit >> 3)] |= 0x80 >> (bit % 8);
    }
  }
  return frame;
}

function buildPixelProgram(mask, { width: screenWidth = SCREEN_WIDTH, height: screenHeight = SCREEN_HEIGHT, frameCount = 30 } = {}) {
  if (!Number.isInteger(frameCount) || frameCount < 1 || frameCount > 30) throw new TypeError('frameCount must be an integer from 1 to 30');
  return buildAnimatedProgram(Array(frameCount).fill(mask), { width: screenWidth, height: screenHeight });
}
function buildAnimatedProgram(masks, { width: screenWidth = SCREEN_WIDTH, height: screenHeight = SCREEN_HEIGHT, frameIntervalMs = 100 } = {}) {
  if (!Number.isInteger(screenWidth) || screenWidth < 64 || screenWidth > 1280 || screenWidth % 64 !== 0 || !Number.isInteger(screenHeight) || screenHeight < 1 || screenHeight > 256) throw new Error('Invalid native program geometry');
  if (!Number.isInteger(frameIntervalMs) || frameIntervalMs < 10 || frameIntervalMs > 1000) throw new TypeError('Invalid animation frame interval');
  if (!Array.isArray(masks) || masks.length < 1 || masks.length > 2048 || masks.some(mask => mask.length !== screenWidth * screenHeight)) throw new TypeError('Invalid animation frames');
  const frameCount = masks.length;
  if (323 + screenWidth / 8 * screenHeight * frameCount > 2 * 1024 * 1024) throw new TypeError('애니메이션은 2MB 이하로 만들어 주세요.');
  const source = fs.readFileSync(path.join(__dirname, 'program-template.bin'));
  if (source.length !== 4163 || source.toString('ascii', 0, 2) !== 'HC') throw new Error('Unexpected captured program template');
  // The captured program has two independently timed animation areas. A single
  // full-screen item gives all four physical panels one frame counter and clock.
  // HP has a 52-byte base plus one offset and one playback field per area.
  const prefix = Buffer.concat([source.subarray(0, 85), source.subarray(89, 93)]);
  prefix[33] = 1;
  prefix.writeUInt32BE(prefix.length - 29, 81);
  const header = Buffer.from(source.subarray(97, 210));
  if (header.toString('ascii', 0, 2) !== 'HA' || header.readUInt16BE(32) !== 30) throw new Error('Unexpected native image item');
  const frames = masks.map(mask => encodeAreaFrame(mask, 0, 0, screenWidth, screenHeight, screenWidth));
  header.writeUInt16BE(0, 4); header.writeUInt16BE(0, 6);
  header.writeUInt16BE(screenWidth, 8); header.writeUInt16BE(screenHeight, 10);
  header.writeUInt16BE(frameCount, 32);
  header.writeUInt16BE(frameIntervalMs, 50);
  header.writeUInt32BE(frames[0].length * frameCount, 40);
  return Buffer.concat([prefix, header, ...frames]);
}

function programCommands(data, id) {
  const chunks = [];
  for (let offset = 0; offset < data.length; offset += 4096) chunks.push(data.subarray(offset, offset + 4096));
  const start = Buffer.alloc(9);
  start[0] = 9; // Observed native start includes a four-byte total size.
  start.writeUInt16BE(id, 1); start.writeUInt16BE(chunks.length, 3); start.writeUInt32BE(data.length, 5);
  const commands = [{ command: 2, payload: start }];
  chunks.forEach((chunk, i) => {
    const p = Buffer.alloc(5 + chunk.length);
    p[0] = 5; p.writeUInt16BE(id, 1); p.writeUInt16BE(i, 3); chunk.copy(p, 5);
    commands.push({ command: 3, payload: p });
  });
  const end = Buffer.alloc(3); end[0] = 3; end.writeUInt16BE(id, 1);
  commands.push({ command: 4, payload: end });
  return commands;
}
module.exports = { buildPixelProgram, buildAnimatedProgram, encodeAreaFrame, programCommands };
