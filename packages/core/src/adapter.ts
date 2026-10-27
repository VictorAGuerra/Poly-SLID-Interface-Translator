import type { i18n as I18next } from "i18next";

/**
 * Ponte entre a biblioteca e o sistema de i18n da aplicação. O núcleo não
 * depende do i18next; qualquer biblioteca de i18n pode ser usada implementando
 * esta interface.
 */
export interface I18nAdapter {
  /** Textos do idioma base, achatados em { chave: texto }, com marcações `<nt>`. */
  getBaseTexts(): Record<string, string>;
  hasLanguage(language: string): boolean;
  addLanguage(language: string, texts: Record<string, string>): void;
  changeLanguage(language: string): void | Promise<void>;
  getLanguage(): string;
}

const NT_TAG = /<\/?nt>/g;

/** Remove as marcações `<nt>` para exibir o texto base. */
export function stripMarkup(text: string): string {
  return text.replace(NT_TAG, "");
}

type Nested = { [key: string]: unknown };

function flatten(obj: Nested, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[key] = v;
    else if (v && typeof v === "object" && !Array.isArray(v)) flatten(v as Nested, key, out);
  }
  return out;
}

function mapStrings(obj: Nested, fn: (s: string) => string): Nested {
  const out: Nested = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string") out[k] = fn(v);
    else if (v && typeof v === "object" && !Array.isArray(v)) out[k] = mapStrings(v as Nested, fn);
    else out[k] = v;
  }
  return out;
}

export interface I18nextAdapterOptions {
  /** Idioma em que a interface foi escrita. Padrão: "en". */
  baseLanguage?: string;
  /** Namespace com os textos. Padrão: o `defaultNS` da instância, ou "translation". */
  namespace?: string;
}

/**
 * Adaptador para i18next / react-i18next. Deve ser criado depois do `init()`,
 * com os textos do idioma base já carregados.
 */
export function createI18nextAdapter(
  i18n: I18next,
  options: I18nextAdapterOptions = {},
): I18nAdapter {
  const base = options.baseLanguage ?? "en";
  const defaultNS = i18n.options.defaultNS;
  const ns = options.namespace ?? (typeof defaultNS === "string" ? defaultNS : "translation");

  const bundle = i18n.getResourceBundle(base, ns) as Nested | undefined;
  if (!bundle) {
    throw new Error(
      `poly-interface: nenhum texto encontrado para o idioma base "${base}" no namespace "${ns}".`,
    );
  }

  // Guarda os originais (com <nt>) para traduzir e deixa o i18next exibir sem as marcações.
  const baseTexts = flatten(bundle);
  i18n.addResourceBundle(base, ns, mapStrings(bundle, stripMarkup), true, true);

  return {
    getBaseTexts: () => ({ ...baseTexts }),
    hasLanguage: (language) => language === base || i18n.hasResourceBundle(language, ns),
    addLanguage: (language, texts) => i18n.addResourceBundle(language, ns, texts, true, true),
    changeLanguage: async (language) => {
      await i18n.changeLanguage(language);
    },
    getLanguage: () => i18n.resolvedLanguage ?? i18n.language ?? base,
  };
}
