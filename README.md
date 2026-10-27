# poly-i18n

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

## Pacotes

| Pacote | Descrição |
| --- | --- |
| [`@poly-i18n/core`](packages/core) | Núcleo sem framework: detecção, controle de estado, tradução com termos protegidos, cache, adaptador i18next. |
| [`@poly-i18n/react`](packages/react) | `<PolyProvider>`, `usePoly()` e `<LanguagePrompt>`. |
| [`backend`](backend) | Servidor FastAPI com Whisper (fala → idioma) e Argos (tradução). Vai virar o pacote `poly-server`. |
| [`examples/hotel-kiosk`](examples/hotel-kiosk) | Exemplo completo: check-in de hotel. |

## Uso com React + i18next

```jsx
import { PolyProvider, LanguagePrompt, createI18nextAdapter } from "@poly-i18n/react";
import "@poly-i18n/react/styles.css";
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

### Protegendo textos

```js
{
  "checkin.title": "Welcome to Poly Hotel",                 // protegido por noTranslate
  "form.namePlaceholder": "e.g., <nt>John Doe</nt>",        // protegido pela marcação <nt>
  "footer": "© {{year}}"                                    // variáveis são sempre protegidas
}
```

A marcação `<nt>` é removida na exibição. Quando o tradutor danifica um termo
protegido, a biblioteca detecta e traduz só os trechos entre os termos, para
que eles nunca se percam.

### Opções principais

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

## Desenvolvimento

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

## Licença

MIT
