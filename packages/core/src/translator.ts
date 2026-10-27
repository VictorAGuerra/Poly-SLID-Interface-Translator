import type { TranslationCache } from "./cache.js";
import type { PolyTransport } from "./client.js";
import {
  hasTranslatableContent,
  joinParts,
  protect,
  restore,
  type ProtectedText,
} from "./protect.js";

export interface TranslateBundleOptions {
  transport: PolyTransport;
  cache?: TranslationCache | null;
  noTranslate?: readonly string[];
  /** Chaves que nunca são traduzidas (o texto base é usado como está). */
  noTranslateKeys?: readonly string[];
  /** Traduções revisadas por humanos para o idioma alvo; têm prioridade. */
  overrides?: Record<string, string>;
}

/**
 * Traduz um pacote { chave: texto } do idioma `source` para `target`.
 *
 * Estratégia, por texto:
 *  1. Traduções revisadas (`overrides`) e chaves fixas não passam pelo tradutor.
 *  2. Textos sem nada traduzível (só termos protegidos/números) ficam iguais.
 *  3. Traduz com os termos protegidos mascarados e valida o resultado.
 *  4. Se a validação falhar, traduz só os trechos entre os termos protegidos.
 *     A frase pode sair menos natural, mas os termos ficam garantidos.
 */
export async function translateBundle(
  texts: Record<string, string>,
  source: string,
  target: string,
  options: TranslateBundleOptions,
): Promise<Record<string, string>> {
  const { transport, cache, overrides = {} } = options;
  const fixedKeys = new Set(options.noTranslateKeys ?? []);
  const out: Record<string, string> = {};

  // texto original -> chaves que o usam (textos repetidos vão uma vez só).
  // Não dá para agrupar pelo texto mascarado: "e.g., <nt>A</nt>" e
  // "e.g., <nt>B</nt>" mascaram igual, mas restauram termos diferentes.
  const pending = new Map<string, { p: ProtectedText; keys: string[] }>();

  for (const [key, text] of Object.entries(texts)) {
    if (key in overrides) {
      out[key] = overrides[key] ?? text;
      continue;
    }
    const p = protect(text, { noTranslate: options.noTranslate });
    if (source === target || fixedKeys.has(key) || !hasTranslatableContent(p)) {
      out[key] = joinParts(p, (s) => s);
      continue;
    }
    const cached = cache?.get(source, target, text);
    if (cached !== undefined) {
      out[key] = cached;
      continue;
    }
    const entry = pending.get(text) ?? { p, keys: [] };
    entry.keys.push(key);
    pending.set(text, entry);
  }

  if (pending.size === 0) return out;

  const entries = [...pending.values()];

  // Passo 1: tradução mascarada.
  const maskedResult = await transport.translate({
    source,
    target,
    texts: Object.fromEntries(entries.map((e, i) => [String(i), e.p.masked])),
  });

  const fallback: typeof entries = [];
  const resolved: Array<[(typeof entries)[number], string]> = [];

  entries.forEach((e, i) => {
    const restored = restore(maskedResult[String(i)] ?? "", e.p);
    if (restored === null) fallback.push(e);
    else resolved.push([e, restored]);
  });

  // Passo 2: plano B, só os trechos entre termos protegidos.
  if (fallback.length > 0) {
    const segments = new Set<string>();
    for (const e of fallback) {
      for (const part of e.p.parts) {
        if (typeof part === "string" && /\p{L}/u.test(part)) segments.add(part.trim());
      }
    }
    const segList = [...segments];
    const segResult = await transport.translate({
      source,
      target,
      texts: Object.fromEntries(segList.map((s, i) => [String(i), s])),
    });
    const segMap = new Map(segList.map((s, i) => [s, segResult[String(i)] ?? s]));

    for (const e of fallback) {
      const joined = joinParts(e.p, (part) => {
        const trimmed = part.trim();
        const translated = segMap.get(trimmed);
        if (translated === undefined) return part;
        // Preserva os espaços em volta do trecho original.
        const lead = part.match(/^\s*/)?.[0] ?? "";
        const trail = part.match(/\s*$/)?.[0] ?? "";
        return lead + translated + trail;
      });
      resolved.push([e, joined]);
    }
  }

  const toCache: Array<[string, string]> = [];
  for (const [e, translated] of resolved) {
    for (const key of e.keys) {
      out[key] = translated;
      const original = texts[key];
      if (original !== undefined) toCache.push([original, translated]);
    }
  }
  cache?.setMany(source, target, toCache);

  return out;
}
