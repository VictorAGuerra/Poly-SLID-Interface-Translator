import { describe, expect, it } from "vitest";
import { hasTranslatableContent, protect, restore } from "../src/protect.js";

describe("protect", () => {
  it("mascara interpolação, <nt> e termos da lista", () => {
    const p = protect("Welcome to <nt>Poly</nt> Hotel, {{name}}! Wi-Fi is free.", {
      noTranslate: ["Wi-Fi"],
    });
    expect(p.masked).toBe("Welcome to XPH0X Hotel, XPH1X! XPH2X is free.");
    expect(p.tokens).toEqual(["Poly", "{{name}}", "Wi-Fi"]);
  });

  it("prefere o termo mais longo e respeita limites de palavra", () => {
    const p = protect("Poly Hotel Rio and Polyester", { noTranslate: ["Poly", "Poly Hotel Rio"] });
    expect(p.tokens).toEqual(["Poly Hotel Rio"]);
    expect(p.masked).toBe("XPH0X and Polyester");
  });

  it("detecta textos sem nada traduzível", () => {
    expect(hasTranslatableContent(protect("{{year}} © 2026"))).toBe(false);
    expect(hasTranslatableContent(protect("Hello {{name}}"))).toBe(true);
  });
});

describe("restore", () => {
  const p = protect("Hello {{name}}, your room at Poly Hotel is ready.", { noTranslate: ["Poly Hotel"] });

  it("restaura os termos protegidos", () => {
    expect(restore("Olá XPH0X, seu quarto no XPH1X está pronto.", p)).toBe(
      "Olá {{name}}, seu quarto no Poly Hotel está pronto.",
    );
  });

  it("tolera caixa e espaços no marcador", () => {
    expect(restore("Olá xph0x, quarto no XPH 1 X.", p)).toBe("Olá {{name}}, quarto no Poly Hotel.");
  });

  it("rejeita marcador perdido ou duplicado", () => {
    expect(restore("مرحباً (إكس بي إكس)، غرفتك جاهزة", p)).toBeNull();
    expect(restore("XPH0X XPH0X XPH1X", p)).toBeNull();
  });

  it("rejeita saída degenerada (loop do tradutor)", () => {
    expect(restore(`XPH0X XPH1X ${"X ".repeat(60)}`, p)).toBeNull();
  });
});
