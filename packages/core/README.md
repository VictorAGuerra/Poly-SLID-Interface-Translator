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
- Translates whole bundles in one request, skipping texts that are cached,
  reviewed or have nothing to translate.
- **Protected terms:** `noTranslate` list, inline `<nt>...</nt>` markup and
  `{{variables}}` are never translated. Broken translations are detected and
  retried segment by segment, so protected terms are never lost.
- **Reviewed overrides** take priority over machine translation.
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

## License

MIT

---

## Português

Tradução de interfaces guiada pela voz. Detecta o idioma falado e traduz os
textos da interface na hora: você escreve a interface em um idioma só e o Poly
gera os outros.

Este é o núcleo do Poly, sem dependência de framework. Usa React? Instale o
[`@swalay/poly-react`](https://www.npmjs.com/package/@swalay/poly-react), que
já reexporta tudo deste pacote.

- Detecção do idioma pela fala, com confiança mínima, filtro de ruído e sem
  insistir num idioma recusado.
- **Termos protegidos:** lista `noTranslate`, marcação `<nt>...</nt>` e
  `{{variáveis}}` nunca são traduzidos.
- **Traduções revisadas** têm prioridade sobre a automática.
- Feito para quiosques: volta ao idioma base sem atividade, ajusta `lang` e
  `dir` (idiomas da direita para a esquerda).
- Adaptador para i18next incluído.

Requer o `poly-server` rodando (reconhecimento de voz + tradução).
