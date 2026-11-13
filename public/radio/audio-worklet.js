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


radioProcessor();
