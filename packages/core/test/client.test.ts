import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mic = vi.hoisted(() => ({ stop: vi.fn(), onChunk: null as null | ((b: ArrayBuffer) => void), opened: 0 }));
vi.mock("../src/audio.js", () => ({
  captureMicrophone: vi.fn(async (onChunk: (b: ArrayBuffer) => void) => {
    mic.opened++;
    mic.onChunk = onChunk;
    return { stop: mic.stop };
  }),
}));

import { createServerTransport } from "../src/client.js";

class FakeWebSocket {
  static OPEN = 1;
  static last: FakeWebSocket;
  readyState = 0;
  binaryType = "";
  sent: Array<string | ArrayBuffer> = [];
  onopen?: () => void;
  onclose?: () => void;
  onmessage?: (m: { data: string }) => void;
  constructor(readonly url: string) {
    FakeWebSocket.last = this;
  }
  send(d: string | ArrayBuffer) {
    this.sent.push(d);
  }
  close() {}
  serverOpens() {
    this.readyState = 1;
    this.onopen?.();
  }
  serverSends(data: object) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

const asr = { type: "asr", language: "pt", confidence: 0.9, text: "olá", latency_sec: 1 };

function handlers() {
  return { onDetection: vi.fn(), onConnectionChange: vi.fn(), onListeningChange: vi.fn(), onError: vi.fn() };
}

describe("createServerTransport", () => {
  beforeEach(() => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    mic.opened = 0;
    mic.stop.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("microfone do servidor, modo manual: configura e envia comandos", () => {
    const h = handlers();
    const conn = createServerTransport({ url: "http://k:8000" }).connect(h, { listening: "manual" });
    const ws = FakeWebSocket.last;
    expect(ws.url).toBe("ws://k:8000/ws");
    ws.serverOpens();
    expect(ws.sent).toEqual([JSON.stringify({ type: "config", listening: "manual" })]);

    if (typeof conn === "function") throw new Error("esperava conexão");
    conn.setListening?.(true);
    expect(ws.sent.at(-1)).toBe(JSON.stringify({ type: "listen", action: "start" }));
    ws.serverSends({ type: "listening", listening: true });
    ws.serverSends(asr);
    ws.serverSends({ type: "listening", listening: false });
    expect(h.onListeningChange.mock.calls).toEqual([[true], [false]]);
    expect(h.onDetection).toHaveBeenCalledWith(expect.objectContaining({ language: "pt" }));
  });

  it("áudio do navegador, modo manual: só abre o microfone ao clicar e fecha no fim da fala", async () => {
    const h = handlers();
    const conn = createServerTransport({ url: "http://k:8000", audio: "browser" }).connect(h, { listening: "manual" });
    const ws = FakeWebSocket.last;
    expect(ws.url).toBe("ws://k:8000/ws/audio");
    ws.serverOpens();
    expect(mic.opened).toBe(0);

    if (typeof conn === "function") throw new Error("esperava conexão");
    conn.setListening?.(true);
    await vi.waitFor(() => expect(mic.opened).toBe(1));
    mic.onChunk!(new ArrayBuffer(8));
    expect(ws.sent).toEqual([JSON.stringify({ type: "reset" }), expect.any(ArrayBuffer)]);

    // O servidor avisa o fim da fala antes de terminar o reconhecimento.
    ws.serverSends({ type: "utterance_end" });
    expect(mic.stop).toHaveBeenCalled();
    expect(h.onListeningChange.mock.calls).toEqual([[true], [false]]);
    mic.onChunk!(new ArrayBuffer(8)); // bloco atrasado do worklet: não é enviado
    expect(ws.sent.filter((d) => d instanceof ArrayBuffer)).toHaveLength(1);

    ws.serverSends(asr);
    expect(h.onDetection).toHaveBeenCalledTimes(1);
  });

  it("áudio do navegador, parar no meio: pede o reconhecimento do que já foi dito", async () => {
    const h = handlers();
    const conn = createServerTransport({ url: "http://k:8000", audio: "browser" }).connect(h, { listening: "manual" });
    const ws = FakeWebSocket.last;
    ws.serverOpens();
    if (typeof conn === "function") throw new Error("esperava conexão");
    conn.setListening?.(true);
    await vi.waitFor(() => expect(mic.opened).toBe(1));
    conn.setListening?.(false);
    expect(ws.sent.at(-1)).toBe(JSON.stringify({ type: "flush" }));
    expect(mic.stop).toHaveBeenCalled();
  });

  it("áudio do navegador, modo contínuo: abre o microfone ao conectar", async () => {
    createServerTransport({ url: "http://k:8000", audio: "browser" }).connect(handlers());
    await vi.waitFor(() => expect(mic.opened).toBe(1));
  });
});
