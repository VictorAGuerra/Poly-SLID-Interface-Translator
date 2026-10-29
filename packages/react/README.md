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
import en from "./locales/en.json";

i18n.use(initReactI18next).init({ lng: "en", resources: { en: { translation: en } } });

export default i18n;
```

```json
// locales/en.json
{
  "title": "Welcome to Poly Hotel",
  "name.placeholder": "e.g., <nt>John Doe</nt>",
  "footer": "© {{year}}"
}
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

### Protecting text

- `noTranslate={["Poly Hotel"]}` protects a term in every text.
- `<nt>...</nt>` protects a piece of one text; the markup is stripped when
  displayed.
- `{{variables}}` are always protected.

If the translator damages a protected term, Poly notices and translates only
the segments between protected terms, so they are never lost.

### Translating ahead of time

By default a language is translated the first time someone speaks it. To
switch instantly, and keep working with the server offline, generate the
translations while building the app:

```bash
npx @swalay/poly-core cache locales/en.json --to es,fr,ar --no-translate "Poly Hotel"
# ✓ es: 42 texts (42 new) -> poly-cache/es.json
```

```jsx
import es from "./poly-cache/es.json";
import fr from "./poly-cache/fr.json";
import ar from "./poly-cache/ar.json";

<PolyProvider cache={{ es, fr, ar }} /* ... */>
```

Each file maps source texts to translations, so you can review and fix them by
hand. Running the command again only translates what is missing, keeps your
edits and drops texts removed from the base file. A base text changed after
the files were generated is translated live. See the
[`poly cache` reference](https://www.npmjs.com/package/@swalay/poly-core#poly-cache).

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

`<ListenButton>` also accepts a render function for a custom button:

```jsx
<ListenButton>
  {({ listening, disabled, toggle, uiTexts }) => (
    <button disabled={disabled} onClick={toggle}>
      {listening ? uiTexts.listening : uiTexts.listen}
    </button>
  )}
</ListenButton>
```

### `usePoly()`

```jsx
const {
  language, connected, status, pending, lastDetection, listening, error,
  setLanguage, reset, accept, dismiss, startListening, stopListening, toggleListening,
} = usePoly();
```

`status` is `"idle"`, `"prompting"` (waiting for an answer) or `"switching"`.
`reset()` returns to the base language and forgets declined languages, for the
next person at the kiosk.

## Options

Pass them as props to `<PolyProvider>`. They are read once, on mount; to
change them, remount the provider (change its `key`) or pass your own instance
with `poly={createPoly(...)}`.

| Option | Default | |
| --- | --- | --- |
| `adapter` | required | Bridge to your i18n library. `createI18nextAdapter(i18n)` for i18next. |
| `server` | — | `poly-server` URL. |
| `audio` | `"server"` | `"server"`: the server's microphone (kiosk). `"browser"`: the browser captures and streams the mic (needs HTTPS or localhost). |
| `listening` | `"continuous"` | `"continuous"`: always listening. `"manual"`: only after a tap on `<ListenButton>`, until the person stops speaking or taps again. |
| `listenTimeout` | `15000` | Manual mode: stop if nobody starts speaking within this time (ms). |
| `baseLanguage` | `"en"` | Language the UI is written in. |
| `minConfidence` | `0.5` | Minimum detection confidence (0 to 1). |
| `supportedLanguages` | all | Restricts which languages are offered. |
| `autoSwitch` | `false` | Switch without asking. |
| `promptTimeout` | `9000` | Auto-closes the prompt (ms). |
| `declineCooldown` | `60000` | Don't suggest a declined language again (ms). |
| `idleTimeout` | off | Return to the base language after inactivity (ms). |
| `noTranslate` / `noTranslateKeys` | — | Terms / keys that are never translated. |
| `overrides` | — | Reviewed translations: `{ language: { key: text } }`. They take priority. |
| `cache` | — | Files generated by `poly cache`: `{ language: { source text: translation } }`. |
| `promptTexts` / `uiTexts` | English | Prompt and listen-button texts, in your base language. |
| `storage` | `localStorage` | Where live translations are kept between visits. `null` keeps them in memory only. |
| `manageDocument` | `true` | Sets `lang` and `dir` (RTL) on `<html>` when the language changes. |
| `onError` | `console.warn` | Called with connection and translation errors. |

## License

MIT

---

## Português

Componentes React do Poly: interfaces que se traduzem sozinhas a partir do
idioma falado. Pensado para autoatendimento em lugares com muitos imigrantes e
turistas.

A pessoa fala perto da tela, o idioma é reconhecido e um popup oferece trocar,
já perguntando no idioma dela.

### Instalação

```bash
npm install @swalay/poly-react i18next react-i18next
```

Requer o [`poly-server`](https://pypi.org/project/poly-server/) rodando (reconhecimento de voz + tradução):

```bash
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install "poly-server[mic]"
poly-server serve
```

### Uso

Escreva os textos em um idioma só, com i18next, como de costume:

```js
// i18n.js
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";

i18n.use(initReactI18next).init({ lng: "en", resources: { en: { translation: en } } });

export default i18n;
```

```json
// locales/en.json
{
  "title": "Welcome to Poly Hotel",
  "name.placeholder": "e.g., <nt>John Doe</nt>",
  "footer": "© {{year}}"
}
```

Envolva o app:

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
  <App />            {/* continue usando useTranslation() / t("chave") */}
  <LanguagePrompt />
</PolyProvider>
```

#### Protegendo textos

- `noTranslate={["Poly Hotel"]}` protege um termo em todos os textos.
- `<nt>...</nt>` protege um trecho de um texto; a marcação é removida na
  exibição.
- `{{variáveis}}` são sempre protegidas.

Se o tradutor danificar um termo protegido, o Poly percebe e traduz só os
trechos entre os termos, para que eles nunca se percam.

#### Traduzindo com antecedência

Por padrão, um idioma é traduzido na primeira vez em que alguém o fala. Para
trocar na hora, e continuar funcionando com o servidor fora do ar, gere as
traduções junto com o build do app:

```bash
npx @swalay/poly-core cache locales/en.json --to es,fr,ar --no-translate "Poly Hotel"
# ✓ es: 42 texts (42 new) -> poly-cache/es.json
```

```jsx
import es from "./poly-cache/es.json";
import fr from "./poly-cache/fr.json";
import ar from "./poly-cache/ar.json";

<PolyProvider cache={{ es, fr, ar }} /* ... */>
```

Cada arquivo liga os textos de origem às traduções, então dá para revisar e
corrigir à mão. Rodar o comando de novo só traduz o que falta, mantém suas
correções e remove textos que saíram do arquivo base. Um texto base alterado
depois de gerar os arquivos é traduzido ao vivo. Veja a
[referência do `poly cache`](https://www.npmjs.com/package/@swalay/poly-core#poly-cache).

#### Popup personalizado

O `<LanguagePrompt>` vem com um estilo padrão (personalizável pelas variáveis
CSS `--poly-*`). Para controle total, renderize o seu:

```jsx
<LanguagePrompt>
  {({ open, busy, pendingName, promptTexts, accept, dismiss }) =>
    open && (
      <MeuDialogo title={promptTexts.title}>
        {promptTexts.detected} {pendingName}
        <button disabled={busy} onClick={accept}>{promptTexts.confirm}</button>
        <button disabled={busy} onClick={dismiss}>{promptTexts.keep}</button>
      </MeuDialogo>
    )}
</LanguagePrompt>
```

#### Escuta sob demanda

Por padrão, o Poly escuta o tempo todo. Com `listening="manual"`, ele só escuta
depois de um toque, até a pessoa parar de falar (com a mesma tolerância a
silêncio do modo contínuo) ou tocar de novo; o que já foi dito é reconhecido
mesmo assim. No modo de áudio pelo navegador, o microfone só fica aberto
durante a escuta.

```jsx
<PolyProvider listening="manual" /* ... */>
  <App />
  <ListenButton />   {/* ícone de microfone; rótulo acessível no idioma atual */}
  <LanguagePrompt />
</PolyProvider>
```

O `<ListenButton>` também aceita uma função de renderização para um botão
próprio:

```jsx
<ListenButton>
  {({ listening, disabled, toggle, uiTexts }) => (
    <button disabled={disabled} onClick={toggle}>
      {listening ? uiTexts.listening : uiTexts.listen}
    </button>
  )}
</ListenButton>
```

#### `usePoly()`

```jsx
const {
  language, connected, status, pending, lastDetection, listening, error,
  setLanguage, reset, accept, dismiss, startListening, stopListening, toggleListening,
} = usePoly();
```

`status` é `"idle"`, `"prompting"` (aguardando resposta) ou `"switching"`.
`reset()` volta ao idioma base e esquece os idiomas recusados, para a próxima
pessoa no totem.

### Opções

Passe como props do `<PolyProvider>`. Elas são lidas uma vez, na montagem; para
trocá-las, remonte o provider (mudando a `key`) ou passe uma instância própria
com `poly={createPoly(...)}`.

| Opção | Padrão | |
| --- | --- | --- |
| `adapter` | obrigatório | Ponte com a sua biblioteca de i18n. `createI18nextAdapter(i18n)` para i18next. |
| `server` | — | URL do `poly-server`. |
| `audio` | `"server"` | `"server"`: microfone do servidor (quiosque). `"browser"`: o navegador captura e envia o áudio (exige HTTPS ou localhost). |
| `listening` | `"continuous"` | `"continuous"`: escuta o tempo todo. `"manual"`: só depois de tocar no `<ListenButton>`, até a pessoa parar de falar ou tocar de novo. |
| `listenTimeout` | `15000` | Modo manual: para se ninguém começar a falar dentro deste tempo (ms). |
| `baseLanguage` | `"en"` | Idioma em que a interface foi escrita. |
| `minConfidence` | `0.5` | Confiança mínima da detecção (0 a 1). |
| `supportedLanguages` | todos | Limita os idiomas oferecidos. |
| `autoSwitch` | `false` | Troca sem perguntar. |
| `promptTimeout` | `9000` | Fecha o popup sozinho (ms). |
| `declineCooldown` | `60000` | Não sugere de novo um idioma recusado (ms). |
| `idleTimeout` | desativado | Volta ao idioma base sem atividade (ms). |
| `noTranslate` / `noTranslateKeys` | — | Termos / chaves que nunca são traduzidos. |
| `overrides` | — | Traduções revisadas: `{ idioma: { chave: texto } }`. Têm prioridade. |
| `cache` | — | Arquivos gerados pelo `poly cache`: `{ idioma: { texto de origem: tradução } }`. |
| `promptTexts` / `uiTexts` | inglês | Textos do popup e do botão de escuta, no seu idioma base. |
| `storage` | `localStorage` | Onde as traduções ao vivo ficam guardadas entre visitas. `null` guarda só em memória. |
| `manageDocument` | `true` | Ajusta `lang` e `dir` (direita para a esquerda) do `<html>` ao trocar de idioma. |
| `onError` | `console.warn` | Recebe erros de conexão e de tradução. |

### Licença

MIT
