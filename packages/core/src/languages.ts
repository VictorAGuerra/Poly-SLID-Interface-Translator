/**
 * Normaliza códigos de idioma para a forma usada pelo i18n: "pt-BR" -> "pt",
 * " EN " -> "en". Retorna `null` quando o código é vazio.
 */
export function normalizeLanguage(code: string | null | undefined): string | null {
  if (!code) return null;
  const base = String(code).trim().toLowerCase().split(/[-_]/)[0];
  return base ? base : null;
}

const RTL_LANGUAGES = new Set([
  "ar", // árabe
  "fa", // persa
  "he", // hebraico
  "ur", // urdu
  "ps", // pashto
  "sd", // sindi
  "ug", // uigur
  "yi", // iídiche
  "dv", // divehi
  "ku", // curdo (sorani)
]);

/** Indica se o idioma é escrito da direita para a esquerda. */
export function isRtl(code: string): boolean {
  return RTL_LANGUAGES.has(normalizeLanguage(code) ?? "");
}

export function textDirection(code: string): "rtl" | "ltr" {
  return isRtl(code) ? "rtl" : "ltr";
}

/**
 * Nome do idioma escrito no próprio idioma ("pt" -> "português", "ja" -> "日本語").
 * Para quem acabou de chegar ao país, ver o nome do próprio idioma é mais claro
 * do que ver um código ou o nome em inglês.
 */
export function languageName(code: string, displayIn: string = code): string {
  try {
    const name = new Intl.DisplayNames([displayIn], { type: "language" }).of(code);
    return name ?? code;
  } catch {
    return code;
  }
}
