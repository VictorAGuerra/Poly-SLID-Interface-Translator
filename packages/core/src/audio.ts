/**
 * Captura do microfone no navegador e envio para o poly-server (/ws/audio)
 * como PCM 16-bit, mono, 16 kHz.
 */

export const TARGET_SAMPLE_RATE = 16000;

/**
 * Cria um conversor da taxa do microfone (geralmente 44,1 ou 48 kHz) para
 * 16 kHz, com média simples como filtro anti-aliasing. Guarda estado entre
 * blocos para não perder amostras nas bordas.
 *
 * Esta função é copiada como texto para dentro do AudioWorklet, então não
 * pode usar nada de fora dela.
 */
export function createDownsampler(inputRate: number, outputRate = 16000) {
  const ratio = inputRate / outputRate;
  let carry: number[] = [];
  let position = 0;

  return function downsample(input: Float32Array): Int16Array {
    const data = carry.length ? Float32Array.from([...carry, ...input]) : input;
    const out: number[] = [];

    while (position + ratio <= data.length) {
      const start = Math.floor(position);
      const end = Math.floor(position + ratio);
      let sum = 0;
      for (let i = start; i < end; i++) sum += data[i] ?? 0;
      const sample = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
      out.push(sample < 0 ? sample * 0x8000 : sample * 0x7fff);
      position += ratio;
    }

    const consumed = Math.floor(position);
    carry = Array.from(data.subarray(consumed));
    position -= consumed;
    return Int16Array.from(out);
  };
}

const WORKLET_SOURCE = `
const createDownsampler = ${createDownsampler.toString()};

class PolyCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.downsample = createDownsampler(sampleRate, ${TARGET_SAMPLE_RATE});
    this.pending = [];
    this.pendingLength = 0;
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) {
      const chunk = this.downsample(channel);
      if (chunk.length) {
        this.pending.push(chunk);
        this.pendingLength += chunk.length;
      }
      // Envia a cada ~100 ms (1600 amostras) para não inundar o WebSocket.
      if (this.pendingLength >= 1600) {
        const merged = new Int16Array(this.pendingLength);
        let offset = 0;
        for (const c of this.pending) { merged.set(c, offset); offset += c.length; }
        this.port.postMessage(merged.buffer, [merged.buffer]);
        this.pending = [];
        this.pendingLength = 0;
      }
    }
    return true;
  }
}
registerProcessor("poly-capture", PolyCapture);
`;

export interface MicrophoneCapture {
  stop(): void;
}

/**
 * Abre o microfone e chama `onChunk` com blocos PCM16 a 16 kHz.
 *
 * O processamento de voz do navegador (cancelamento de eco, redução de ruído,
 * ganho automático) vem desligado: ele é feito para chamadas e, nos testes,
 * deformava o áudio nos primeiros segundos após abrir o microfone a ponto de
 * o Whisper confundir português com francês. Religue via `constraints` se
 * precisar (ex.: o quiosque reproduz áudio e precisa de cancelamento de eco).
 */
export async function captureMicrophone(
  onChunk: (pcm16: ArrayBuffer) => void,
  constraints: MediaTrackConstraints = {},
): Promise<MicrophoneCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      ...constraints,
    },
  });

  const context = new AudioContext();
  const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "application/javascript" }));
  try {
    await context.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }

  const source = context.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(context, "poly-capture");
  node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => onChunk(e.data);
  source.connect(node);
  // Navegadores podem iniciar o AudioContext suspenso até haver interação.
  if (context.state === "suspended") void context.resume();

  return {
    stop() {
      node.port.onmessage = null;
      source.disconnect();
      node.disconnect();
      for (const track of stream.getTracks()) track.stop();
      void context.close();
    },
  };
}
