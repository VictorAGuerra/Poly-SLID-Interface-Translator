import { describe, expect, it } from "vitest";
import { isRtl, languageName, normalizeLanguage } from "../src/languages.js";

describe("languages", () => {
  it("normaliza códigos", () => {
    expect(normalizeLanguage(" pt-BR ")).toBe("pt");
    expect(normalizeLanguage("zh_Hant")).toBe("zh");
    expect(normalizeLanguage("")).toBeNull();
  });
  it("identifica idiomas RTL", () => {
    expect(isRtl("ar")).toBe(true);
    expect(isRtl("fa-IR")).toBe(true);
    expect(isRtl("pt")).toBe(false);
  });
  it("mostra o nome do idioma nele mesmo", () => {
    expect(languageName("pt")).toBe("português");
    expect(languageName("xx-invalid!")).toBe("xx-invalid!");
  });
});
