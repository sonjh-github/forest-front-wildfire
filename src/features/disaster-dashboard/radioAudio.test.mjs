import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

it("resamples microphone audio to 8kHz blocks only while PTT is active", () => {
  const messages = [];
  let Processor;
  class Base { port = { postMessage: (data) => messages.push(data), onmessage: (_event) => {} }; }
  runInNewContext(readFileSync("public/radio/audio-worklet.js", "utf8"), {
    AudioWorkletProcessor: Base, sampleRate: 48000,
    registerProcessor: (_name, type) => { Processor = type; },
  });
  const processor = new Processor();
  const input = new Float32Array(128).fill(.25), output = new Float32Array(128);
  for (let i = 0; i < 100; i++) processor.process([[input]], [[output]]);
  expect(messages.filter(message => message.type === "mic")).toHaveLength(0);
  processor.port.onmessage({ data: { type: "talk", on: true, request: 1 } });
  for (let i = 0; i < 94; i++) processor.process([[input]], [[output]]);
  const block = messages.find(message => message.type === "mic").pcm;
  expect(block.length).toBe(2000);
  expect(block[0]).toBeCloseTo(.25);
  processor.port.onmessage({ data: { type: "talk", on: false, request: 2 } });
  const count = messages.filter(message => message.type === "mic").length;
  for (let i = 0; i < 100; i++) processor.process([[input]], [[output]]);
  expect(messages.filter(message => message.type === "mic").length).toBe(count);
});
