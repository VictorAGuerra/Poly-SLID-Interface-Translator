import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { I18nAdapter } from "../src/adapter.js";
import type { DetectionEvent, PolyTransport } from "../src/client.js";
import { createPoly, type PolyOptions } from "../src/poly.js";

function setup(opts: Partial<PolyOptions> = {}) {
  const bundles = new Map<string, Record<string, string>>([["en", { hi: "hello" }]]);
  let current = "en";
  const adapter: I18nAdapter = {
    getBaseTexts: () => bundles.get("en")!,
    hasLanguage: (l) => bundles.has(l),
    addLanguage: (l, t) => bundles.set(l, t),
    changeLanguage: (l) => {
      current = l;
    },
    getLanguage: () => current,
  };
  const transport: PolyTransport = {
    translate: vi.fn(async ({ target, texts }) =>
      Object.fromEntries(Object.entries(texts).map(([k, v]) => [k, `[${target}] ${v}`])),
    ),
    connect: () => () => {},
  };
  const poly = createPoly({ adapter, transport, storage: null, manageDocument: false, ...opts });
  return { poly, bundles, transport, current: () => current };
}

const speech = (language: string, confidence = 0.9, text = "bom dia"): DetectionEvent => ({
  language,
  confidence,
  text,
  latencySec: null,
});

describe("createPoly", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] }));
  afterEach(() => vi.useRealTimers());

  it("pergunta com o popup já traduzido e troca ao aceitar", async () => {
    const { poly, bundles, current } = setup();
    poly.handleDetection(speech("pt-BR"));
    expect(poly.getState().status).toBe("prompting");
    expect(poly.getState().pending?.language).toBe("pt");

    await vi.waitFor(() => expect(poly.getState().promptReady).toBe(true));
    expect(poly.getState().promptTexts.confirm).toBe("[pt] Switch");

    await poly.accept();
    expect(poly.getState()).toMatchObject({ status: "idle", language: "pt", pending: null });
    expect(bundles.get("pt")).toEqual({ hi: "[pt] hello" });
    expect(current()).toBe("pt");
  });

  it("ignora baixa confiança, texto curto, idioma atual e idiomas fora da lista", () => {
    const { poly } = setup({ supportedLanguages: ["pt", "es"] });
    poly.handleDetection(speech("pt", 0.2));
    poly.handleDetection(speech("pt", 0.9, "ah"));
    poly.handleDetection(speech("en"));
    poly.handleDetection(speech("ja"));
    expect(poly.getState().status).toBe("idle");
  });

  it("não sugere de novo um idioma recusado durante o cooldown", () => {
    const { poly } = setup({ declineCooldown: 1000 });
    poly.handleDetection(speech("pt"));
    poly.dismiss();
    poly.handleDetection(speech("pt"));
    expect(poly.getState().status).toBe("idle");
    vi.advanceTimersByTime(1001);
    poly.handleDetection(speech("pt"));
    expect(poly.getState().status).toBe("prompting");
  });

  it("fecha o popup sozinho após o tempo limite", () => {
    const { poly } = setup({ promptTimeout: 500 });
    poly.handleDetection(speech("pt"));
    vi.advanceTimersByTime(501);
    expect(poly.getState().status).toBe("idle");
  });

  it("troca direto com autoSwitch", async () => {
    const { poly } = setup({ autoSwitch: true });
    poly.handleDetection(speech("es"));
    await vi.waitFor(() => expect(poly.getState().language).toBe("es"));
  });

  it("volta ao idioma base após inatividade", async () => {
    const { poly } = setup({ idleTimeout: 1000 });
    poly.start();
    await poly.setLanguage("ja");
    vi.advanceTimersByTime(1001);
    await vi.waitFor(() => expect(poly.getState().language).toBe("en"));
  });

  it("informa erro de tradução e permanece no idioma atual", async () => {
    const onError = vi.fn();
    const { poly, transport } = setup({ onError });
    vi.mocked(transport.translate).mockRejectedValue(new Error("sem pacote"));
    await poly.setLanguage("xx");
    expect(poly.getState()).toMatchObject({ status: "idle", language: "en" });
    expect(onError).toHaveBeenCalled();
  });
});
