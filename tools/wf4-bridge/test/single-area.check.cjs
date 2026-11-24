const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAnimatedProgram } = require('../lib/program.cjs');
const { buildScrollCommands } = require('../index.cjs');

function area(program) {
  assert.equal(program[33], 1, 'one animation region for the whole four-panel screen');
  const offset = 29 + program.readUInt32BE(81);
  assert.equal(offset, 89, 'single-area HP offset table');
  assert.equal(program.toString('ascii', offset, offset + 2), 'HA');
  const frameBytes = program.readUInt16BE(offset + 8) / 8 * program.readUInt16BE(offset + 10);
  const frameCount = program.readUInt16BE(offset + 32);
  assert.equal(program.readUInt32BE(offset + 40), frameBytes * frameCount);
  assert.equal(program.length, offset + 113 + frameCount * frameBytes, 'no second independently timed region');
  return { offset, frameCount, frameBytes, pixels: program.subarray(offset + 113) };
}

test('all four panels and the central seam share one native frame', () => {
  for (const width of [64, 256, 1024, 1280]) {
    const height = 32;
    const masks = Array.from({ length: 4 }, (_, frame) => Uint8Array.from({ length: width * height }, (_, index) => (index * 13 + frame * 7) % 17 < 4 ? 1 : 0));
    const program = buildAnimatedProgram(masks, { width, height, frameIntervalMs: 25 });
    const decoded = area(program);
    assert.equal(program.readUInt16BE(decoded.offset + 4), 0);
    assert.equal(program.readUInt16BE(decoded.offset + 6), 0);
    assert.equal(program.readUInt16BE(decoded.offset + 8), width);
    assert.equal(program.readUInt16BE(decoded.offset + 50), 25);
    masks.forEach((mask, frame) => {
      for (let index = 0; index < mask.length; index++) {
        const actual = (decoded.pixels[frame * decoded.frameBytes + (index >> 3)] >> (7 - index % 8)) & 1;
        assert.equal(actual, mask[index], 'every panel boundary preserves the source pixels');
      }
    });
  }
});

test('one-pixel scrolling remains continuous across x=127/128 and the repeat boundary', () => {
  const stripWidth = 13, width = 256, height = 32;
  const bitmap = Uint8Array.from({ length: stripWidth * height }, (_, index) => (index * 7 + 3) % 11 < 5 ? 1 : 0);
  const { program } = buildScrollCommands({ bitmap, stripWidth, width, height, step: 1 });
  const decoded = area(program);
  assert.equal(decoded.frameCount, width + stripWidth + 1);
  for (let frame = 0; frame < decoded.frameCount; frame++) {
    const left = width - frame;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const sourceX = x - left;
      const expected = sourceX >= 0 && sourceX < stripWidth ? bitmap[y * stripWidth + sourceX] : 0;
      const index = y * width + x;
      const actual = (decoded.pixels[frame * decoded.frameBytes + (index >> 3)] >> (7 - index % 8)) & 1;
      assert.equal(actual, expected, 'one coherent frame across all four panels');
    }
  }
  assert.ok(decoded.pixels.subarray(0, decoded.frameBytes).every(value => value === 0));
  assert.ok(decoded.pixels.subarray(-decoded.frameBytes).every(value => value === 0));
});
