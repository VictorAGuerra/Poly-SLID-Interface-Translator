import { describe, expect, it } from "vitest";
import { createDownsampler } from "../src/audio.js";

function sine(rate: number, seconds: number, freq = 440) {
  return Float32Array.from({ length: Math.round(rate * seconds) }, (_, i) => 0.5 * Math.sin((2 * Math.PI * freq * i) / rate));
}

describe("createDownsampler", () => {
  it.each([48000, 44100, 16000])("converte %i Hz para 16 kHz sem perder amostras entre blocos", (rate) => {
    const down = createDownsampler(rate);
    const input = sine(rate, 1);
    let total = 0;
    for (let i = 0; i < input.length; i += 128) total += down(input.subarray(i, i + 128)).length;
    expect(Math.abs(total - 16000)).toBeLessThanOrEqual(1);
  });

  it("preserva a amplitude do sinal em PCM16", () => {
    const out = createDownsampler(48000)(sine(48000, 0.1));
    const peak = Math.max(...Array.from(out, Math.abs));
    expect(peak).toBeGreaterThan(0.45 * 0x7fff);
    expect(peak).toBeLessThanOrEqual(0x7fff);
  });

  it("funciona copiada como texto (como dentro do AudioWorklet)", () => {
    const copy = new Function(`return (${createDownsampler.toString()})`)() as typeof createDownsampler;
    expect(copy(48000)(sine(48000, 0.01)).length).toBe(160);
  });
});
