# @swalay/poly-react

**English** · [Português](#português)

React bindings for Poly: interfaces that translate themselves based on the
language people speak. Built for self-service kiosks in places with many
immigrants and tourists.

Someone speaks near the screen, their language is recognized, and a prompt
offers to switch — already asking the question in their language.

## Install

```bash
npm install @swalay/poly-react i18next react-i18next
```

Requires a running [`poly-server`](https://pypi.org/project/poly-server/) (speech recognition + translation):

```bash
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install "poly-server[mic]"
poly-server serve
```

## Usage

Write your texts in one language with i18next as usual:

```js
// i18n.js
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

i18n.use(initReactI18next).init({
  lng: "en",
  resources: { en: { translation: {
    "title": "Welcome to Poly Hotel",                 // protected via noTranslate
    "name.placeholder": "e.g., <nt>John Doe</nt>",    // protected via <nt>
    "footer": "© {{year}}",                           // variables are always protected
  } } },
});

export default i18n;
```

Wrap your app:

```jsx
import { PolyProvider, LanguagePrompt, createI18nextAdapter } from "@swalay/poly-react";
import "@swalay/poly-react/styles.css";
import i18n from "./i18n";

<PolyProvider
  adapter={createI18nextAdapter(i18n)}
  server="http://localhost:8000"
  noTranslate={["Poly Hotel"]}
  overrides={{ pt: { title: "Bem-vindo ao Poly Hotel" } }}
  idleTimeout={120_000}
>
  <App />            {/* keep using useTranslation() / t("key") */}
  <LanguagePrompt />
</PolyProvider>
```

### Custom prompt

`<LanguagePrompt>` ships with a default style (customizable through
`--poly-*` CSS variables). For full control, render your own:

```jsx
<LanguagePrompt>
  {({ open, busy, pendingName, promptTexts, accept, dismiss }) =>
    open && (
      <MyDialog title={promptTexts.title}>
        {promptTexts.detected} {pendingName}
        <button disabled={busy} onClick={accept}>{promptTexts.confirm}</button>
        <button disabled={busy} onClick={dismiss}>{promptTexts.keep}</button>
      </MyDialog>
    )}
</LanguagePrompt>
```

### Listen on demand

By default Poly listens all the time. With `listening="manual"` it only listens
after a tap, until the person stops speaking (same silence tolerance as the
continuous mode) or taps again — whatever was said so far is still recognized.
In browser audio mode the microphone is only open while listening.

```jsx
<PolyProvider listening="manual" /* ... */>
  <App />
  <ListenButton />   {/* microphone icon; accessible label in the current UI language */}
  <LanguagePrompt />
</PolyProvider>
```

`<ListenButton>` also accepts a render function for a custom button, and
`usePoly()` exposes `listening`, `startListening()`, `stopListening()` and
`toggleListening()`.

### `usePoly()`

```jsx
const { language, connected, status, lastDetection, setLanguage, reset } = usePoly();
```

## Options

| Option | Default | |
| --- | --- | --- |
| `audio` | `"server"` | `"server"`: the server's microphone (kiosk). `"browser"`: the browser captures and streams the mic (needs HTTPS or localhost). |
| `listening` | `"continuous"` | `"continuous"`: always listening. `"manual"`: only after a tap on `<ListenButton>`, until the person stops speaking or taps again. |
| `listenTimeout` | `3000` | Manual mode: stop if nobody starts speaking within this time (ms). |
| `baseLanguage` | `"en"` | Language the UI is written in. |
| `minConfidence` | `0.5` | Minimum detection confidence (0 to 1). |
| `supportedLanguages` | all | Restricts which languages are offered. |
| `autoSwitch` | `false` | Switch without asking. |
| `promptTimeout` | `9000` | Auto-closes the prompt (ms). |
| `declineCooldown` | `60000` | Don't suggest a declined language again (ms). |
| `idleTimeout` | off | Return to the base language after inactivity (ms). |
| `noTranslate` / `noTranslateKeys` | — | Terms / keys that are never translated. |
| `overrides` | — | Reviewed translations: `{ language: { key: text } }`. |
| `promptTexts` | English | Prompt texts in your base language. |

## License

MIT

---

## Português

Componentes React do Poly: interfaces que se traduzem sozinhas a partir do
idioma falado. Pensado para autoatendimento em lugares com muitos imigrantes e
turistas.

A pessoa fala perto da tela, o idioma é reconhecido e um popup oferece trocar,
já perguntando no idioma dela.

- `<PolyProvider>`: configura e conecta ao `poly-server`.
- `<LanguagePrompt>`: popup pronto (estilo personalizável pelas variáveis
  `--poly-*`) ou totalmente customizado via render prop.
- `<ListenButton>`: botão com ícone de microfone. Com `listening="manual"`,
  escuta só depois de um toque, até a pessoa parar de falar ou tocar de novo.
- `usePoly()`: idioma atual, conexão, última detecção e ações
  (`setLanguage`, `reset`, `toggleListening`...).

Os textos são escritos em um idioma só, com i18next. Termos marcados com
`noTranslate`, `<nt>...</nt>` ou `{{variáveis}}` nunca são traduzidos, e
traduções revisadas em `overrides` têm prioridade sobre a automática. Veja os
exemplos acima.
