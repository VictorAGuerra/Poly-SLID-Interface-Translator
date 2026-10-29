# @swalay/poly-core

**English** · [Português](#português)

Voice-driven interface translation. Detects the language people speak and
translates your UI texts on the fly — you write the interface in one language,
Poly generates the others.

Framework-agnostic core of [Poly](https://www.npmjs.com/package/@swalay/poly-react).
Using React? Install [`@swalay/poly-react`](https://www.npmjs.com/package/@swalay/poly-react)
instead; it re-exports everything from this package.

## Features

- Language detection events from speech, with minimum confidence, noise
  filtering and a cooldown for declined languages.
- Continuous listening, or on demand (`listening: "manual"` +
  `startListening()` / `stopListening()`).
- Translates whole bundles in one request, skipping texts that are cached,
  reviewed or have nothing to translate.
- **Protected terms:** `noTranslate` list, inline `<nt>...</nt>` markup and
  `{{variables}}` are never translated. Broken translations are detected and
  retried segment by segment, so protected terms are never lost.
- **Reviewed overrides** take priority over machine translation.
- **Translate ahead of time** with the `poly cache` command: those languages
  switch instantly, even with the server offline.
- Kiosk-friendly: return to the base language after inactivity, automatic
  `lang` / `dir` (RTL) on `<html>`.
- i18next adapter included; any i18n library works by implementing
  `I18nAdapter`.

## Install

```bash
npm install @swalay/poly-core i18next
```

Requires a running [`poly-server`](https://pypi.org/project/poly-server/) (speech recognition + translation). Audio can come from the server's own microphone (`audio: "server"`, kiosk mode) or be captured in the browser (`audio: "browser"`).

## Usage

```js
import i18n from "i18next";
import { createPoly, createI18nextAdapter } from "@swalay/poly-core";

await i18n.init({ lng: "en", resources: { en: { translation: {
  "title": "Welcome to Poly Hotel",
  "name.placeholder": "e.g., <nt>John Doe</nt>",
} } } });

const poly = createPoly({
  adapter: createI18nextAdapter(i18n),
  server: "http://localhost:8000",
  noTranslate: ["Poly Hotel"],
  idleTimeout: 120_000,
});

poly.subscribe(() => {
  const { status, pending, promptTexts } = poly.getState();
  // status: "idle" | "prompting" | "switching"
  // show your own prompt with promptTexts, then call poly.accept() or poly.dismiss()
});

poly.start();
```

`createPoly` takes the same options as `<PolyProvider>`; see the
[options table](https://www.npmjs.com/package/@swalay/poly-react#options).

### Other i18n libraries

Implement `I18nAdapter` (`getBaseTexts`, `hasLanguage`, `addLanguage`,
`changeLanguage`, `getLanguage`) and pass it as `adapter`.

### Other backends

`transport` replaces the `poly-server` connection: implement `PolyTransport`
(`translate` and `connect`) to use another translation service or your own
speech recognition. `poly.handleDetection(event)` injects detections directly.

## `poly cache`

Translates your base texts ahead of time and writes one JSON file per language.

```bash
npx poly cache locales/en.json --to es,fr,ar --no-translate "Poly Hotel"
# ✓ es: 42 texts (42 new) -> poly-cache/es.json
# ✓ fr: 42 texts (42 new) -> poly-cache/fr.json
# ✓ ar: 42 texts (42 new) -> poly-cache/ar.json
```

If you installed only `@swalay/poly-react`, run `npx @swalay/poly-core cache ...`.
The command needs `poly-server` running.

| Flag | Default | |
| --- | --- | --- |
| `--to` | required | Target languages, comma-separated. |
| `--base` | from the file name (`en.json` → `en`) | Language of the base file. |
| `--server` | `http://localhost:8000` | `poly-server` URL. |
| `--out` | `poly-cache` | Output folder. |
| `--no-translate` | — | Terms never translated, comma-separated. Use the same list as the `noTranslate` option. |
| `--fresh` | — | Ignore the existing files and translate everything again. |

Then pass the files to Poly:

```js
import es from "./poly-cache/es.json" with { type: "json" };
import fr from "./poly-cache/fr.json" with { type: "json" };

createPoly({ /* ... */ cache: { es, fr } });
```

How it behaves:

- Files map source texts to translations (`{ "Guest name": "Nombre del huésped" }`),
  so they are easy to review and fix by hand.
- Running the command again only translates what is missing, keeps your edits
  and drops texts removed from the base file.
- A base text changed after the files were generated doesn't match any entry
  and is translated live, so an outdated translation is never shown.
- The prompt and listen-button texts are included: switching to a cached
  language doesn't call the server at all.
- Priority: `overrides` > `cache` > live translation.

## License

MIT

---

## Português

Tradução de interfaces guiada pela voz. Detecta o idioma falado e traduz os
textos da interface na hora: você escreve a interface em um idioma só e o Poly
gera os outros.

Este é o núcleo do [Poly](https://www.npmjs.com/package/@swalay/poly-react),
sem dependência de framework. Usa React? Instale o
[`@swalay/poly-react`](https://www.npmjs.com/package/@swalay/poly-react), que
já reexporta tudo deste pacote.

### Recursos

- Eventos de detecção do idioma pela fala, com confiança mínima, filtro de
  ruído e um intervalo antes de sugerir de novo um idioma recusado.
- Escuta contínua, ou sob demanda (`listening: "manual"` +
  `startListening()` / `stopListening()`).
- Traduz pacotes inteiros em uma requisição, pulando textos em cache,
  revisados ou sem nada a traduzir.
- **Termos protegidos:** lista `noTranslate`, marcação `<nt>...</nt>` e
  `{{variáveis}}` nunca são traduzidos. Traduções que danificam esses termos
  são detectadas e refeitas trecho a trecho, para que eles nunca se percam.
- **Traduções revisadas** têm prioridade sobre a automática.
- **Tradução antecipada** com o comando `poly cache`: esses idiomas trocam na
  hora, mesmo com o servidor fora do ar.
- Feito para quiosques: volta ao idioma base sem atividade, ajusta `lang` e
  `dir` (direita para a esquerda) do `<html>`.
- Adaptador para i18next incluído; qualquer biblioteca de i18n funciona
  implementando `I18nAdapter`.

### Instalação

```bash
npm install @swalay/poly-core i18next
```

Requer o [`poly-server`](https://pypi.org/project/poly-server/) rodando (reconhecimento de voz + tradução). O áudio pode vir do microfone do próprio servidor (`audio: "server"`, modo quiosque) ou ser capturado no navegador (`audio: "browser"`).

### Uso

```js
import i18n from "i18next";
import { createPoly, createI18nextAdapter } from "@swalay/poly-core";

await i18n.init({ lng: "en", resources: { en: { translation: {
  "title": "Welcome to Poly Hotel",
  "name.placeholder": "e.g., <nt>John Doe</nt>",
} } } });

const poly = createPoly({
  adapter: createI18nextAdapter(i18n),
  server: "http://localhost:8000",
  noTranslate: ["Poly Hotel"],
  idleTimeout: 120_000,
});

poly.subscribe(() => {
  const { status, pending, promptTexts } = poly.getState();
  // status: "idle" | "prompting" | "switching"
  // mostre o seu popup com promptTexts e chame poly.accept() ou poly.dismiss()
});

poly.start();
```

O `createPoly` recebe as mesmas opções do `<PolyProvider>`; veja a
[tabela de opções](https://www.npmjs.com/package/@swalay/poly-react#opções).

#### Outras bibliotecas de i18n

Implemente `I18nAdapter` (`getBaseTexts`, `hasLanguage`, `addLanguage`,
`changeLanguage`, `getLanguage`) e passe em `adapter`.

#### Outros backends

`transport` substitui a conexão com o `poly-server`: implemente
`PolyTransport` (`translate` e `connect`) para usar outro serviço de tradução
ou o seu próprio reconhecimento de voz. `poly.handleDetection(evento)` injeta
detecções diretamente.

### `poly cache` (comando)

Traduz os textos base com antecedência e grava um arquivo JSON por idioma.

```bash
npx poly cache locales/en.json --to es,fr,ar --no-translate "Poly Hotel"
# ✓ es: 42 texts (42 new) -> poly-cache/es.json
# ✓ fr: 42 texts (42 new) -> poly-cache/fr.json
# ✓ ar: 42 texts (42 new) -> poly-cache/ar.json
```

Se você instalou só o `@swalay/poly-react`, rode `npx @swalay/poly-core cache ...`.
O comando precisa do `poly-server` rodando.

| Flag | Padrão | |
| --- | --- | --- |
| `--to` | obrigatório | Idiomas de destino, separados por vírgula. |
| `--base` | pelo nome do arquivo (`en.json` → `en`) | Idioma do arquivo base. |
| `--server` | `http://localhost:8000` | URL do `poly-server`. |
| `--out` | `poly-cache` | Pasta de destino. |
| `--no-translate` | — | Termos que nunca são traduzidos, separados por vírgula. Use a mesma lista da opção `noTranslate`. |
| `--fresh` | — | Ignora os arquivos existentes e traduz tudo de novo. |

Depois, passe os arquivos para o Poly:

```js
import es from "./poly-cache/es.json" with { type: "json" };
import fr from "./poly-cache/fr.json" with { type: "json" };

createPoly({ /* ... */ cache: { es, fr } });
```

Como funciona:

- Os arquivos ligam os textos de origem às traduções
  (`{ "Guest name": "Nombre del huésped" }`), então são fáceis de revisar e
  corrigir à mão.
- Rodar o comando de novo só traduz o que falta, mantém suas correções e
  remove textos que saíram do arquivo base.
- Um texto base alterado depois de gerar os arquivos não bate com nenhuma
  entrada e é traduzido ao vivo, então uma tradução desatualizada nunca
  aparece.
- Os textos do popup e do botão de escuta vão junto: trocar para um idioma em
  cache nem chama o servidor.
- Prioridade: `overrides` > `cache` > tradução ao vivo.

### Licença

MIT
