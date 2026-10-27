import i18next from "i18next";
import { describe, expect, it } from "vitest";
import { createI18nextAdapter } from "../src/adapter.js";

describe("createI18nextAdapter", () => {
  it("guarda o texto base com <nt> e exibe sem as marcações", async () => {
    const i18n = i18next.createInstance();
    await i18n.init({
      lng: "en",
      resources: { en: { translation: { brand: "<nt>Poly</nt> Hotel", nested: { a: "Hi {{name}}" } } } },
    });

    const adapter = createI18nextAdapter(i18n);
    expect(adapter.getBaseTexts()).toEqual({ brand: "<nt>Poly</nt> Hotel", "nested.a": "Hi {{name}}" });
    expect(i18n.t("brand")).toBe("Poly Hotel");

    adapter.addLanguage("pt", { brand: "Hotel Poly", "nested.a": "Oi {{name}}" });
    await adapter.changeLanguage("pt");
    expect(adapter.getLanguage()).toBe("pt");
    expect(i18n.t("nested.a", { name: "Ana" })).toBe("Oi Ana");
  });

  it("falha cedo se o idioma base não tiver textos", async () => {
    const i18n = i18next.createInstance();
    await i18n.init({ lng: "en", resources: {} });
    expect(() => createI18nextAdapter(i18n)).toThrow(/base language/);
  });
});
