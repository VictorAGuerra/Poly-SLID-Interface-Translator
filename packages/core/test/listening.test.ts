import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { I18nAdapter } from "../src/adapter.js";
import type { DetectionHandlers, PolyTransport } from "../src/client.js";
import { createPoly, type PolyOptions } from "../src/poly.js";

function setup(opts: Partial<PolyOptions> = {}) {
  let current = "en";
  const bundles = new Map([["en", { hi: "hello" }]]);
  const adapter: I18nAdapter = {
    getBaseTexts: () => bundles.get("en")!,
    hasLanguage: (l) => bundles.has(l),
    addLanguage: (l, t) => bundles.set(l, t as { hi: string }),
    changeLanguage: (l) => {
      current = l;
    },
    getLanguage: () => current,
  };
  let handlers!: DetectionHandlers;
  const setListening = vi.fn();
  const transport: PolyTransport = {
    translate: async ({ target, texts }) =>
      Object.fromEntries(Object.entries(texts).map(([k, v]) => [k, `[${target}] ${v}`])),
    connect: vi.fn((h: DetectionHandlers) => {
      handlers = h;
      return { close: () => {}, setListening };
    }),
  };
  const poly = createPoly({ adapter, transport, storage: null, manageDocument: false, ...opts });
  poly.start();
  handlers.onConnectionChange(true);
  return { poly, transport, setListening, handlers: () => handlers };
}

describe("escuta manual", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] }));
  afterEach(() => vi.useRealTimers());

  it("no modo contínuo está sempre escutando enquanto conectado", () => {
    const { poly, transport } = setup();
    expect(poly.getState()).toMatchObject({ listenMode: "continuous", listening: true });
    expect(vi.mocked(transport.connect).mock.calls[0]![1]).toEqual({ listening: "continuous" });
    poly.startListening(); // sem efeito
    expect(poly.getState().listening).toBe(true);
  });

  it("começa e para pelo botão", () => {
    const { poly, setListening, transport } = setup({ listening: "manual" });
    expect(vi.mocked(transport.connect).mock.calls[0]![1]).toEqual({ listening: "manual" });
    expect(poly.getState().listening).toBe(false);

    poly.toggleListening();
    expect(poly.getState().listening).toBe(true);
    expect(setListening).toHaveBeenLastCalledWith(true);

    poly.toggleListening();
    expect(poly.getState().listening).toBe(false);
    expect(setListening).toHaveBeenLastCalledWith(false);
  });

  it("termina sozinho quando o servidor avisa que a fala acabou", () => {
    const { poly, handlers } = setup({ listening: "manual" });
    poly.startListening();
    handlers().onListeningChange?.(false);
    expect(poly.getState().listening).toBe(false);
  });

  it("para após 15 s se ninguém começar a falar", () => {
    const { poly, setListening } = setup({ listening: "manual" });
    poly.startListening();
    vi.advanceTimersByTime(14_000);
    expect(poly.getState().listening).toBe(true);
    vi.advanceTimersByTime(1001);
    expect(poly.getState().listening).toBe(false);
    expect(setListening).toHaveBeenLastCalledWith(false);
  });

  it("não corta quem já começou a falar", () => {
    const { poly, handlers } = setup({ listening: "manual" });
    poly.startListening();
    vi.advanceTimersByTime(1000);
    handlers().onSpeechStart?.();
    vi.advanceTimersByTime(20_000); // passou dos 15 s, mas a pessoa está falando
    expect(poly.getState().listening).toBe(true);
    handlers().onListeningChange?.(false); // silêncio
    expect(poly.getState().listening).toBe(false);
  });

  it("traduz os textos do botão ao trocar de idioma", async () => {
    const { poly } = setup({ listening: "manual" });
    expect(poly.getState().uiTexts.listen).toBe("Tap to speak");
    await poly.setLanguage("pt");
    await vi.waitFor(() => expect(poly.getState().uiTexts.listen).toBe("[pt] Tap to speak"));
    await poly.setLanguage("en");
    expect(poly.getState().uiTexts.listen).toBe("Tap to speak");
  });
});
