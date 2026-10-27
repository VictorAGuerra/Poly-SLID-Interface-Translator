import { describe, expect, it, vi } from "vitest";
import { TranslationCache } from "../src/cache.js";
import type { PolyTransport, TranslateRequest } from "../src/client.js";
import { translateBundle } from "../src/translator.js";

/** Tradutor falso: põe em maiúsculas; "quebra" marcadores quando `breakTokens`. */
function fakeTransport(breakTokens = false) {
  const calls: TranslateRequest[] = [];
  const transport: PolyTransport = {
    translate: vi.fn(async (req: TranslateRequest) => {
      calls.push(req);
      return Object.fromEntries(
        Object.entries(req.texts).map(([k, v]) => [
          k,
          breakTokens ? v.replace(/XPH\d+X/g, "ix-pe-ix").toUpperCase() : v.replace(/[a-z]+/g, (w) => w.toUpperCase()),
        ]),
      );
    }),
    connect: () => () => {},
  };
  return { transport, calls };
}

describe("translateBundle", () => {
  it("traduz preservando termos protegidos e deduplica textos iguais", async () => {
    const { transport, calls } = fakeTransport();
    const out = await translateBundle(
      { a: "welcome to Poly Hotel", b: "welcome to Poly Hotel", c: "hi {{name}}" },
      "en",
      "xx",
      { transport, noTranslate: ["Poly Hotel"] },
    );
    expect(out).toEqual({ a: "WELCOME TO Poly Hotel", b: "WELCOME TO Poly Hotel", c: "HI {{name}}" });
    expect(Object.keys(calls[0]!.texts)).toHaveLength(2);
  });

  it("não confunde textos que mascaram igual mas protegem termos diferentes", async () => {
    const { transport } = fakeTransport();
    const out = await translateBundle(
      { name: "e.g., <nt>John Doe</nt>", email: "e.g., <nt>john@doe.com</nt>" },
      "en",
      "xx",
      { transport },
    );
    expect(out).toEqual({ name: "E.G., John Doe", email: "E.G., john@doe.com" });
  });

  it("cai para tradução por trechos quando o marcador se perde", async () => {
    const { transport, calls } = fakeTransport(true);
    const out = await translateBundle({ a: "welcome to <nt>Poly</nt>, enjoy" }, "en", "xx", { transport });
    expect(out.a).toBe("WELCOME TO Poly, ENJOY");
    expect(calls).toHaveLength(2);
  });

  it("usa overrides e chaves fixas sem chamar o tradutor", async () => {
    const { transport } = fakeTransport();
    const out = await translateBundle(
      { title: "hello", brand: "<nt>Poly</nt> Hotel", year: "{{y}} ©" },
      "en",
      "pt",
      { transport, overrides: { title: "Olá (revisado)" }, noTranslateKeys: ["brand"] },
    );
    expect(out).toEqual({ title: "Olá (revisado)", brand: "Poly Hotel", year: "{{y}} ©" });
    expect(transport.translate).not.toHaveBeenCalled();
  });

  it("reaproveita o cache", async () => {
    const { transport } = fakeTransport();
    const cache = new TranslationCache();
    await translateBundle({ a: "hello" }, "en", "xx", { transport, cache });
    const out = await translateBundle({ b: "hello" }, "en", "xx", { transport, cache });
    expect(out.b).toBe("HELLO");
    expect(transport.translate).toHaveBeenCalledTimes(1);
  });
});
