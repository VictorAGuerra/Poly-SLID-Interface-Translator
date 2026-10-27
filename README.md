# Poly

**English** · [Português](#português)

Interfaces that translate themselves based on the language people speak.

Built for **self-service kiosks in places with many immigrants and tourists**:
hotels, airports, hospitals, public services. Someone speaks near the kiosk,
their language is recognized, and the interface offers to switch — already
asking the question in their language.

- **Write your UI in one language.** Other languages are generated
  automatically (offline translation with Argos) and cached.
- **Detection from speech** (Whisper), with a minimum confidence, noise
  filtering, and no nagging about a language the person already declined.
- **Protected terms:** proper names, brands and variables are never translated.
- **Reviewed translations win** over machine translation, for texts where a
  mistake is costly (healthcare, immigration, contracts).
- **Made for kiosks:** returns to the base language when nobody is using it,
  sets `lang`/`dir` (Arabic, Persian, Urdu...), large touch-friendly buttons.
- **Offline and private:** speech recognition and translation run locally;
  audio never leaves the device.

> Status: in development (0.x). The API may still change.

## Packages

| Package | Description |
| --- | --- |
| [`@swalay/poly-core`](packages/core) | Framework-agnostic core: detection, state, translation with protected terms, cache, i18next adapter. |
| [`@swalay/poly-react`](packages/react) | `<PolyProvider>`, `usePoly()` and `<LanguagePrompt>`. |
| [`backend`](backend) | FastAPI server with Whisper (speech → language) and Argos (translation). Will become the `poly-server` package. |
| [`examples/hotel-kiosk`](examples/hotel-kiosk) | Full example: hotel check-in. |

## Usage with React + i18next

```jsx
import { PolyProvider, LanguagePrompt, createI18nextAdapter } from "@swalay/poly-react";
import "@swalay/poly-react/styles.css";
import i18n from "./i18n"; // i18next initialized with your English texts

<PolyProvider
  adapter={createI18nextAdapter(i18n)}
  server="http://localhost:8000"
  noTranslate={["Poly Hotel"]}
  overrides={{ pt: { "brand.tag": "Autoatendimento" } }}
  idleTimeout={120_000}
>
  <App />            {/* keep using useTranslation() / t("key") */}
  <LanguagePrompt />
</PolyProvider>
```

### Protecting text

```js
{
  "checkin.title": "Welcome to Poly Hotel",            // protected via noTranslate
  "form.namePlaceholder": "e.g., <nt>John Doe</nt>",   // protected via <nt> markup
  "footer": "© {{year}}"                               // variables are always protected
}
```

The `<nt>` markup is stripped when displayed. If the translator damages a
protected term, the library detects it and translates only the segments
between protected terms, so they are never lost.

### Main options

| Option | Default | |
| --- | --- | --- |
| `baseLanguage` | `"en"` | Language the UI is written in. |
| `minConfidence` | `0.5` | Minimum detection confidence (0 to 1). |
| `supportedLanguages` | all | Restricts which languages are offered. |
| `autoSwitch` | `false` | Switch without asking. |
| `promptTimeout` | `9000` | Auto-closes the prompt (ms). |
| `declineCooldown` | `60000` | Don't suggest a declined language again (ms). |
| `idleTimeout` | off | Return to the base language after inactivity (ms). |
| `noTranslate` / `noTranslateKeys` | — | Terms / keys that are never translated. |
| `overrides` | — | Reviewed translations: `{ language: { key: text } }`. |

## Development

Requires Node 22 (`nvm use`), pnpm and Python 3.10+.

```bash
pnpm install
pnpm test          # package tests
pnpm build         # build packages

# backend
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 8000

# example (in another terminal, from the repo root)
pnpm dev           # http://localhost:5173
```

## License

MIT

---

## Português

Interfaces que se traduzem sozinhas a partir do idioma falado.

Pensado para **autoatendimento em lugares com muitos imigrantes e turistas**:
hotéis, aeroportos, hospitais, órgãos públicos. A pessoa fala perto do totem,
o idioma é reconhecido e a interface oferece trocar, já perguntando no idioma
dela.

- **Escreva a interface em um idioma só.** Os outros são gerados
  automaticamente (tradução offline com Argos) e ficam em cache.
- **Detecção pela fala** (Whisper), com confiança mínima, filtro de ruído e
  sem insistir num idioma que a pessoa recusou.
- **Termos protegidos:** nomes próprios, marcas e variáveis nunca são
  traduzidos.
- **Traduções revisadas têm prioridade** sobre a automática, para textos em
  que um erro de tradução custa caro (saúde, imigração, contratos).
- **Feito para quiosques:** volta ao idioma base quando ninguém está usando,
  ajusta `lang`/`dir` (árabe, persa, urdu...), botões grandes para toque.
- **Offline e privado:** reconhecimento e tradução rodam localmente; o áudio
  não sai do aparelho.

> Status: em desenvolvimento (0.x). A API ainda pode mudar.

### Pacotes

| Pacote | Descrição |
| --- | --- |
| [`@swalay/poly-core`](packages/core) | Núcleo sem framework: detecção, controle de estado, tradução com termos protegidos, cache, adaptador i18next. |
| [`@swalay/poly-react`](packages/react) | `<PolyProvider>`, `usePoly()` e `<LanguagePrompt>`. |
| [`backend`](backend) | Servidor FastAPI com Whisper (fala → idioma) e Argos (tradução). Vai virar o pacote `poly-server`. |
| [`examples/hotel-kiosk`](examples/hotel-kiosk) | Exemplo completo: check-in de hotel. |

### Uso com React + i18next

```jsx
import { PolyProvider, LanguagePrompt, createI18nextAdapter } from "@swalay/poly-react";
import "@swalay/poly-react/styles.css";
import i18n from "./i18n"; // i18next já inicializado com os textos em inglês

<PolyProvider
  adapter={createI18nextAdapter(i18n)}
  server="http://localhost:8000"
  noTranslate={["Poly Hotel"]}
  overrides={{ pt: { "brand.tag": "Autoatendimento" } }}
  idleTimeout={120_000}
>
  <App />            {/* continua usando useTranslation() / t("chave") */}
  <LanguagePrompt />
</PolyProvider>
```

#### Protegendo textos

```js
{
  "checkin.title": "Welcome to Poly Hotel",            // protegido por noTranslate
  "form.namePlaceholder": "e.g., <nt>John Doe</nt>",   // protegido pela marcação <nt>
  "footer": "© {{year}}"                               // variáveis são sempre protegidas
}
```

A marcação `<nt>` é removida na exibição. Quando o tradutor danifica um termo
protegido, a biblioteca detecta e traduz só os trechos entre os termos, para
que eles nunca se percam.

#### Opções principais

| Opção | Padrão | |
| --- | --- | --- |
| `baseLanguage` | `"en"` | Idioma em que a interface foi escrita. |
| `minConfidence` | `0.5` | Confiança mínima da detecção (0 a 1). |
| `supportedLanguages` | todos | Limita os idiomas oferecidos. |
| `autoSwitch` | `false` | Troca sem perguntar. |
| `promptTimeout` | `9000` | Fecha o popup sozinho (ms). |
| `declineCooldown` | `60000` | Não sugere de novo um idioma recusado (ms). |
| `idleTimeout` | desativado | Volta ao idioma base sem atividade (ms). |
| `noTranslate` / `noTranslateKeys` | — | Termos / chaves que nunca são traduzidos. |
| `overrides` | — | Traduções revisadas: `{ idioma: { chave: texto } }`. |

### Desenvolvimento

Requer Node 22 (`nvm use`), pnpm e Python 3.10+.

```bash
pnpm install
pnpm test          # testes dos pacotes
pnpm build         # compila os pacotes

# backend
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 8000

# exemplo (em outro terminal, na raiz)
pnpm dev           # http://localhost:5173
```

### Licença

MIT
