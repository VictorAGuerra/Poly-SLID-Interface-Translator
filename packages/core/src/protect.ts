/**
 * Proteção de trechos que não devem ser traduzidos: variáveis de interpolação
 * (`{{name}}`), termos marcados no texto (`<nt>Poly Hotel</nt>`) e termos da
 * lista global `noTranslate`.
 *
 * Os trechos protegidos são trocados por marcadores `XPH0X`, `XPH1X`, ... antes
 * de ir para o tradutor. Em testes com o Argos esse formato foi o que melhor
 * sobreviveu entre vários idiomas, mas não é infalível: às vezes o tradutor
 * transcreve o marcador ou entra em loop. Por isso toda tradução mascarada é
 * validada, e quem chama deve cair para `segments` quando a validação falha.
 */

export interface ProtectOptions {
  /** Termos que nunca são traduzidos (nomes próprios, marcas...). */
  noTranslate?: readonly string[];
}

export interface ProtectedText {
  /** Texto com os trechos protegidos trocados por marcadores. */
  masked: string;
  /** Trechos protegidos, na ordem dos marcadores. */
  tokens: string[];
  /**
   * O texto quebrado em partes: strings a traduzir e índices de `tokens`.
   * Usado como plano B quando a tradução mascarada não passa na validação.
   */
  parts: Array<string | number>;
}

const NT_TAG = /<nt>([\s\S]*?)<\/nt>/g;
const INTERPOLATION = /\{\{[^{}]*\}\}/g;

export function placeholder(index: number): string {
  return `XPH${index}X`;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function protect(text: string, options: ProtectOptions = {}): ProtectedText {
  // Cada regra encontra intervalos [início, fim, valor]; depois juntamos tudo
  // em ordem, ignorando sobreposições (a primeira regra ganha).
  const ranges: Array<[number, number, string]> = [];

  for (const m of text.matchAll(NT_TAG)) {
    ranges.push([m.index, m.index + m[0].length, m[1] ?? ""]);
  }
  for (const m of text.matchAll(INTERPOLATION)) {
    ranges.push([m.index, m.index + m[0].length, m[0]]);
  }

  // Termos mais longos primeiro, para "Poly Hotel Rio" ganhar de "Poly Hotel".
  const terms = [...(options.noTranslate ?? [])]
    .filter((t) => t.trim() !== "")
    .sort((a, b) => b.length - a.length);
  for (const term of terms) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`, "gu");
    for (const m of text.matchAll(re)) {
      ranges.push([m.index, m.index + m[0].length, m[0]]);
    }
  }

  ranges.sort((a, b) => a[0] - b[0]);

  const tokens: string[] = [];
  const parts: Array<string | number> = [];
  let masked = "";
  let cursor = 0;

  for (const [start, end, value] of ranges) {
    if (start < cursor) continue; // sobreposto a um trecho já protegido
    const before = text.slice(cursor, start);
    if (before) parts.push(before);
    masked += before;

    const index = tokens.length;
    tokens.push(value);
    parts.push(index);
    masked += placeholder(index);
    cursor = end;
  }

  const rest = text.slice(cursor);
  if (rest) parts.push(rest);
  masked += rest;

  return { masked, tokens, parts };
}

/** Indica se há algo a traduzir além de marcadores, números e pontuação. */
export function hasTranslatableContent(p: ProtectedText): boolean {
  return p.parts.some((part) => typeof part === "string" && /\p{L}/u.test(part));
}

/**
 * Restaura os trechos protegidos numa tradução mascarada. Retorna `null` se a
 * tradução não for confiável: marcador ausente, duplicado ou texto degenerado.
 */
export function restore(translated: string, p: ProtectedText): string | null {
  if (looksDegenerate(translated, p.masked)) return null;

  let out = translated;
  for (let i = 0; i < p.tokens.length; i++) {
    // Tolera variações de caixa e espaços que o tradutor às vezes introduz.
    const re = new RegExp(`X\\s*P\\s*H\\s*${i}\\s*X`, "gi");
    const matches = out.match(re);
    if (!matches || matches.length !== 1) return null;
    out = out.replace(re, () => p.tokens[i] ?? "");
  }

  // Sobrou algum marcador que não existia no original?
  if (/XPH\d+X/i.test(out)) return null;
  return out;
}

/** Junta as partes de volta, dado um texto traduzido para cada parte string. */
export function joinParts(p: ProtectedText, translate: (segment: string) => string): string {
  return p.parts
    .map((part) => (typeof part === "number" ? (p.tokens[part] ?? "") : translate(part)))
    .join("");
}

function looksDegenerate(translated: string, source: string): boolean {
  if (translated.length > Math.max(40, source.length * 4)) return true;
  // Mesma "palavra" repetida muitas vezes seguidas: sintoma clássico de loop.
  return /(\S{1,12})(?:\s+\1){7,}/u.test(translated);
}
