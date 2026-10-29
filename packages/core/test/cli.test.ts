/// <reference types="node" />
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/cli.js";
import { UnsupportedLanguageError, type PolyTransport, type TranslateRequest } from "../src/client.js";

/** Tradutor falso: "[es] texto". */
function fakeTransport(unsupported: string[] = []) {
  const calls: TranslateRequest[] = [];
  const transport: PolyTransport = {
    translate: vi.fn(async (req: TranslateRequest) => {
      calls.push(req);
      if (unsupported.includes(req.target)) throw new UnsupportedLanguageError(req.source, req.target);
      return Object.fromEntries(Object.entries(req.texts).map(([k, v]) => [k, `[${req.target}] ${v}`]));
    }),
    connect: () => () => {},
  };
  return { transport, calls };
}

let dir: string;
const out = () => join(dir, "poly-cache");
const readOut = async (lang: string) =>
  JSON.parse(await readFile(join(out(), `${lang}.json`), "utf8")) as Record<string, string>;

async function run(args: string[], transport: PolyTransport) {
  const logs: string[] = [];
  const errors: string[] = [];
  const code = await runCli(args, { transport, log: (m) => logs.push(m), error: (m) => errors.push(m) });
  return { code, logs, errors };
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "poly-cli-"));
  await writeFile(
    join(dir, "en.json"),
    JSON.stringify({ title: "Welcome to <nt>Poly Hotel</nt>", form: { name: "Guest name", count: "42" } }),
  );
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe("poly cache", () => {
  it("gera um arquivo por idioma, indexado pelo texto de origem", async () => {
    const { transport } = fakeTransport();
    const { code, logs } = await run(["cache", join(dir, "en.json"), "--to", "es, fr", "--out", out()], transport);

    expect(code).toBe(0);
    const es = await readOut("es");
    expect(es).toMatchObject({
      "Welcome to <nt>Poly Hotel</nt>": "[es] Welcome to Poly Hotel",
      "Guest name": "[es] Guest name",
      // Textos do popup e do botão de escuta vão junto.
      Switch: "[es] Switch",
      "Tap to speak": "[es] Tap to speak",
    });
    // Nada a traduzir: fica de fora (o Poly usa o texto como está).
    expect(es).not.toHaveProperty("42");
    expect((await readOut("fr"))["Guest name"]).toBe("[fr] Guest name");
    expect(logs[0]).toMatch(/^✓ es: \d+ texts/);
  });

  it("deduz o idioma base pelo nome do arquivo ou usa --base", async () => {
    const { transport, calls } = fakeTransport();
    await writeFile(join(dir, "textos.json"), JSON.stringify({ a: "Olá" }));

    expect((await run(["cache", join(dir, "textos.json"), "--to", "es", "--out", out()], transport)).code).toBe(2);
    expect((await run(["cache", "--base", "pt-BR", join(dir, "textos.json"), "--to", "es", "--out", out()], transport)).code).toBe(0);
    expect(calls[0]).toMatchObject({ source: "pt", target: "es" });
  });

  it("ao rodar de novo, só traduz o que falta, mantém edições e remove textos que saíram", async () => {
    const { transport, calls } = fakeTransport();
    const args = ["cache", join(dir, "en.json"), "--to", "es", "--out", out()];
    await run(args, transport);

    const edited = { ...(await readOut("es")), "Guest name": "Nombre del huésped", "Old text": "Texto viejo" };
    await writeFile(join(out(), "es.json"), JSON.stringify(edited));
    await writeFile(join(dir, "en.json"), JSON.stringify({ form: { name: "Guest name" }, extra: "Room number" }));
    calls.length = 0;

    const { logs } = await run(args, transport);
    const es = await readOut("es");
    expect(es["Guest name"]).toBe("Nombre del huésped");
    expect(es["Room number"]).toBe("[es] Room number");
    expect(es).not.toHaveProperty("Old text");
    expect(calls.flatMap((c) => Object.values(c.texts))).toEqual(["Room number"]);
    expect(logs[0]).toMatch(/\(1 new\)/);
  });

  it("--fresh traduz tudo de novo", async () => {
    const { transport } = fakeTransport();
    const args = ["cache", join(dir, "en.json"), "--to", "es", "--out", out()];
    await run(args, transport);
    await writeFile(join(out(), "es.json"), JSON.stringify({ "Guest name": "editado" }));

    await run([...args, "--fresh"], transport);
    expect((await readOut("es"))["Guest name"]).toBe("[es] Guest name");
  });

  it("passa os termos de --no-translate ao tradutor como protegidos", async () => {
    const { transport, calls } = fakeTransport();
    await writeFile(join(dir, "en.json"), JSON.stringify({ a: "Stay at Poly Hotel" }));
    await run(["cache", join(dir, "en.json"), "--to", "es", "--out", out(), "--no-translate", "Poly Hotel"], transport);
    expect(Object.values(calls[0]!.texts)).not.toContain("Stay at Poly Hotel");
    expect((await readOut("es"))["Stay at Poly Hotel"]).toBe("[es] Stay at Poly Hotel");
  });

  it("segue para os outros idiomas quando um não é suportado", async () => {
    const { transport } = fakeTransport(["xx"]);
    const { code, errors } = await run(["cache", join(dir, "en.json"), "--to", "xx,es", "--out", out()], transport);
    expect(code).toBe(1);
    expect(errors[0]).toMatch(/no translation from en to xx/);
    expect(await readOut("es")).toHaveProperty("Guest name");
  });

  it("explica erros de uso", async () => {
    const { transport } = fakeTransport();
    expect((await run(["cache", join(dir, "en.json")], transport)).errors[0]).toMatch(/--to/);
    expect((await run(["cache", join(dir, "nope.json"), "--to", "es"], transport)).errors[0]).toMatch(/not found/);
    expect((await run(["translate"], transport)).code).toBe(2);
    expect((await run([], transport)).logs[0]).toMatch(/^Usage: poly cache/);
  });
});
