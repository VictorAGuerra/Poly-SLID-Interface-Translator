/// <reference types="node" />
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { parseArgs } from "node:util";

import { flattenTexts } from "./adapter.js";
import { TranslationCache } from "./cache.js";
import { createServerTransport, UnsupportedLanguageError, type PolyTransport } from "./client.js";
import { normalizeLanguage } from "./languages.js";
import { DEFAULT_PROMPT_TEXTS, DEFAULT_UI_TEXTS } from "./poly.js";
import { translateBundle } from "./translator.js";

const HELP = `Usage: poly cache <base-file.json> --to <languages> [options]

Translates your base texts ahead of time and writes one JSON file per
language. Pass them to createPoly({ cache }) and those languages switch
instantly, even with the server offline.

Options:
  --to <list>            Target languages, comma-separated (e.g. es,fr,ar)
  --base <lang>          Language of the base file. Default: from the file name (en.json -> en)
  --server <url>         poly-server URL. Default: http://localhost:8000
  --out <dir>            Output folder. Default: poly-cache
  --no-translate <list>  Terms never translated, comma-separated (same as the noTranslate option)
  --fresh                Ignore the existing files and translate everything again
  -h, --help             Show this help

Running it again only translates what is missing. Edits made by hand to the
generated files are kept, and texts removed from the base file are dropped.
`;

export interface CliIo {
  /** Padrão: o poly-server em `--server`. */
  transport?: PolyTransport;
  log(message: string): void;
  error(message: string): void;
}

class UsageError extends Error {}

/** "es, fr" e `--to es --to fr` viram ["es", "fr"]. */
function splitList(values: string[] | undefined): string[] {
  return (values ?? []).flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
}

async function readJson(file: string): Promise<unknown> {
  const raw = await readFile(file, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    throw new UsageError(`${file} is not valid JSON.`);
  }
}

/** Arquivo de um idioma já gerado: { texto de origem: tradução }. Vazio se não existir. */
async function readCacheFile(file: string): Promise<Record<string, string>> {
  let data: unknown;
  try {
    data = await readJson(file);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw e;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new UsageError(`${file} is not a Poly cache file.`);
  }
  return Object.fromEntries(
    Object.entries(data).filter((e): e is [string, string] => typeof e[1] === "string"),
  );
}

export async function runCli(argv: string[], io: Partial<CliIo> = {}): Promise<number> {
  const log = io.log ?? ((m: string) => console.log(m));
  const error = io.error ?? ((m: string) => console.error(m));

  try {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        to: { type: "string", multiple: true },
        base: { type: "string" },
        server: { type: "string", default: "http://localhost:8000" },
        out: { type: "string", default: "poly-cache" },
        "no-translate": { type: "string", multiple: true },
        fresh: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    });

    const [command, input, ...extra] = positionals;
    if (values.help || command === undefined) {
      log(HELP);
      return 0;
    }
    if (command !== "cache") throw new UsageError(`unknown command "${command}".`);
    if (!input) throw new UsageError("missing the base file (e.g. locales/en.json).");
    if (extra.length > 0) throw new UsageError(`unexpected argument "${extra[0]}".`);

    const data = await readJson(input).catch((e) => {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") throw new UsageError(`${input} not found.`);
      throw e;
    });
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new UsageError(`${input} must be a JSON object of texts.`);
    }

    const inferred = basename(input, extname(input)).toLowerCase();
    const base = normalizeLanguage(values.base ?? (/^[a-z]{2,3}([-_][a-z0-9]+)?$/.test(inferred) ? inferred : null));
    if (!base) {
      throw new UsageError(`can't tell the language of ${input} from its name; pass --base (e.g. --base en).`);
    }

    const targets = [...new Set(splitList(values.to).map((l) => normalizeLanguage(l)))].filter(
      (l): l is string => l !== null && l !== base,
    );
    if (targets.length === 0) throw new UsageError("pass the target languages with --to (e.g. --to es,fr,ar).");

    // Os textos padrão do popup e do botão de escuta vão junto, para o
    // primeiro contato com um idioma também não depender do servidor.
    const groups = [
      { source: base, texts: flattenTexts(data as Record<string, unknown>) },
      { source: "en", texts: { ...DEFAULT_PROMPT_TEXTS, ...DEFAULT_UI_TEXTS } as Record<string, string> },
    ];

    const server = values.server;
    const transport = io.transport ?? createServerTransport({ url: server });
    const noTranslate = splitList(values["no-translate"]);
    await mkdir(values.out, { recursive: true });

    let failed = false;
    for (const target of targets) {
      const file = join(values.out, `${target}.json`);
      try {
        const existing = values.fresh ? {} : await readCacheFile(file);
        const cache = new TranslationCache(null);
        for (const g of groups) {
          cache.setMany(g.source, target, Object.entries(existing));
        }
        for (const g of groups) {
          await translateBundle(g.texts, g.source, target, { transport, cache, noTranslate });
        }

        // Só os textos atuais: o que saiu do arquivo base sai do cache também.
        const result: Record<string, string> = {};
        for (const g of groups) {
          for (const text of Object.values(g.texts)) {
            const translated = cache.get(g.source, target, text);
            if (translated !== undefined) result[text] = translated;
          }
        }
        await writeFile(file, JSON.stringify(result, null, 2) + "\n");

        const total = Object.keys(result).length;
        const added = Object.keys(result).filter((t) => !(t in existing)).length;
        log(`✓ ${target}: ${total} texts (${added} new) -> ${file}`);
      } catch (e) {
        failed = true;
        if (e instanceof UnsupportedLanguageError) {
          error(`✗ ${target}: the server has no translation from ${e.source} to ${e.target}.`);
        } else if (e instanceof TypeError && e.message === "fetch failed") {
          error(`✗ could not reach poly-server at ${server}. Is it running?`);
          return 1;
        } else {
          error(`✗ ${target}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
    return failed ? 1 : 0;
  } catch (e) {
    if (e instanceof UsageError || (e as NodeJS.ErrnoException).code?.startsWith("ERR_PARSE_ARGS")) {
      error(`poly: ${(e as Error).message}\nRun "poly --help" for usage.`);
      return 2;
    }
    error(`poly: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}
