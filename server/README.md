# poly-server

**English** · [Português](#português)

Speech language detection and offline UI translation server for
[Poly](https://www.npmjs.com/package/@swalay/poly-react), voice-driven
interfaces for self-service kiosks.

- **Speech → language** with [faster-whisper](https://github.com/SYSTRAN/faster-whisper).
- **UI translation** with [Argos Translate](https://github.com/argosopentech/argos-translate),
  fully offline, with an English pivot when there's no direct language pair
  and a persistent SQLite cache.
- **Two audio modes:** the server's own microphone (kiosk: screen and server on
  the same machine) or audio streamed from the browser.
- Nothing leaves the device: no cloud APIs.

## Install

```bash
# CPU-only PyTorch first (Argos needs it); avoids ~3 GB of CUDA libraries
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install "poly-server[mic]"
```

The `mic` extra enables local microphone capture (needs PortAudio:
`sudo apt install libportaudio2` on Debian/Ubuntu). Skip it if audio only
comes from the browser.

## Run

```bash
poly-server serve                     # http://127.0.0.1:8000, local microphone
poly-server serve --no-mic            # browser audio only
poly-server devices                   # list microphones
poly-server serve --mic-device 2
```

### Offline kiosks

Download everything once during installation, then run without network:

```bash
poly-server download --base en --languages pt,es,fr,ar,ja,zh
poly-server serve --offline
```

To ship the UI translations with the app, so languages switch instantly
without calling the server, generate them with
[`poly cache`](https://www.npmjs.com/package/@swalay/poly-core#poly-cache):

```bash
npx @swalay/poly-core cache locales/en.json --to pt,es,fr,ar,ja,zh
```

## Configuration

Every option can be set with a `POLY_*` environment variable:

| Variable | Default | |
| --- | --- | --- |
| `POLY_HOST` / `POLY_PORT` | `127.0.0.1` / `8000` | |
| `POLY_CORS_ORIGINS` | `*` | Comma-separated allowed origins. |
| `POLY_MIC` | `true` | Capture the local microphone. |
| `POLY_MIC_DEVICE` | system default | Input device index or name. |
| `POLY_WHISPER_MODEL` | `base` | `tiny`, `base`, `small`, `medium`, `large-v3`. |
| `POLY_WHISPER_DEVICE` | `auto` | `cpu`, `cuda`, `auto`. |
| `POLY_WHISPER_COMPUTE_TYPE` | `int8` | |
| `POLY_VAD_MODE` | `2` | 0 (lenient) to 3 (aggressive) voice detection. |
| `POLY_END_TRIGGER_MS` | `600` | Silence that ends an utterance. |
| `POLY_MAX_UTTERANCE_SEC` | `12` | |
| `POLY_CACHE_DIR` | `~/.cache/poly-server` | Models and translation cache. |
| `POLY_AUTO_DOWNLOAD` | `true` | Download translation packages on demand. |

## API

| Endpoint | |
| --- | --- |
| `GET /health` | `{ ok, version, mic }` |
| `POST /i18n/auto-translate` | `{ source_lang, target_lang, texts: { key: text } }` → `{ target_lang, texts }`. Returns `422` with `code: "unsupported_language_pair"` when no translation exists. |
| `WS /ws` | Recognition events from the local microphone, broadcast to every client. Send `{"type":"config","listening":"manual"}` to listen only on demand, then `{"type":"listen","action":"start"\|"stop"}`; the server replies with `{"type":"listening","listening":bool}` and `{"type":"speech_start"}`. |
| `WS /ws/audio` | Send binary PCM16 LE mono 16 kHz; receive `{"type":"speech_start"}` / `{"type":"utterance_end"}` as speech starts and ends, then the recognition event. Text messages: `{"type":"flush"}` recognizes the speech in progress, `{"type":"reset"}` discards it. |

Event: `{ "type": "asr", "language": "pt", "confidence": 0.97, "text": "...", "latency_sec": 1.4 }`

### Embedding

```python
from poly_server import Settings, create_app

app = create_app(Settings(mic=False, whisper_model="small"))
```

`create_app` also accepts custom `recognizer` and `translator` objects, to plug
in another speech model or translation service.

## License

MIT

---

## Português

Servidor de detecção do idioma falado e tradução offline de interfaces para o
[Poly](https://www.npmjs.com/package/@swalay/poly-react), interfaces guiadas
pela voz para autoatendimento.

- **Fala → idioma** com [faster-whisper](https://github.com/SYSTRAN/faster-whisper).
- **Tradução da interface** com [Argos Translate](https://github.com/argosopentech/argos-translate),
  100% offline, passando pelo inglês quando não há pacote direto entre dois
  idiomas, e com cache persistente em SQLite.
- **Dois modos de áudio:** o microfone do próprio servidor (quiosque: tela e
  servidor na mesma máquina) ou o áudio enviado pelo navegador.
- Nada sai do aparelho: nenhuma API na nuvem.

### Instalação

```bash
# PyTorch só para CPU primeiro (o Argos precisa dele); evita ~3 GB de bibliotecas CUDA
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install "poly-server[mic]"
```

O extra `mic` habilita a captura do microfone local (precisa do PortAudio:
`sudo apt install libportaudio2` no Debian/Ubuntu). Dispense-o se o áudio vier
só do navegador.

### Execução

```bash
poly-server serve                     # http://127.0.0.1:8000, microfone local
poly-server serve --no-mic            # só áudio do navegador
poly-server devices                   # lista os microfones
poly-server serve --mic-device 2
```

#### Quiosques offline

Baixe tudo uma vez na instalação e depois rode sem rede:

```bash
poly-server download --base en --languages pt,es,fr,ar,ja,zh
poly-server serve --offline
```

Para distribuir as traduções da interface junto com o app, e os idiomas
trocarem na hora sem chamar o servidor, gere-as com o
[`poly cache`](https://www.npmjs.com/package/@swalay/poly-core#poly-cache-comando):

```bash
npx @swalay/poly-core cache locales/en.json --to pt,es,fr,ar,ja,zh
```

### Configuração

Toda opção pode ser definida por uma variável de ambiente `POLY_*`:

| Variável | Padrão | |
| --- | --- | --- |
| `POLY_HOST` / `POLY_PORT` | `127.0.0.1` / `8000` | |
| `POLY_CORS_ORIGINS` | `*` | Origens permitidas, separadas por vírgula. |
| `POLY_MIC` | `true` | Captura o microfone local. |
| `POLY_MIC_DEVICE` | padrão do sistema | Índice ou nome do dispositivo de entrada. |
| `POLY_WHISPER_MODEL` | `base` | `tiny`, `base`, `small`, `medium`, `large-v3`. |
| `POLY_WHISPER_DEVICE` | `auto` | `cpu`, `cuda`, `auto`. |
| `POLY_WHISPER_COMPUTE_TYPE` | `int8` | |
| `POLY_VAD_MODE` | `2` | Detecção de voz de 0 (tolerante) a 3 (agressiva). |
| `POLY_END_TRIGGER_MS` | `600` | Silêncio que encerra uma fala. |
| `POLY_MAX_UTTERANCE_SEC` | `12` | |
| `POLY_CACHE_DIR` | `~/.cache/poly-server` | Modelos e cache de traduções. |
| `POLY_AUTO_DOWNLOAD` | `true` | Baixa pacotes de tradução sob demanda. |

### API

| Endpoint | |
| --- | --- |
| `GET /health` | `{ ok, version, mic }` |
| `POST /i18n/auto-translate` | `{ source_lang, target_lang, texts: { chave: texto } }` → `{ target_lang, texts }`. Retorna `422` com `code: "unsupported_language_pair"` quando não há tradução. |
| `WS /ws` | Eventos de reconhecimento do microfone local, enviados a todos os clientes. Envie `{"type":"config","listening":"manual"}` para escutar só sob demanda e depois `{"type":"listen","action":"start"\|"stop"}`; o servidor responde com `{"type":"listening","listening":bool}` e `{"type":"speech_start"}`. |
| `WS /ws/audio` | Envie PCM16 LE mono 16 kHz em binário; receba `{"type":"speech_start"}` / `{"type":"utterance_end"}` quando a fala começa e termina, e depois o evento de reconhecimento. Mensagens de texto: `{"type":"flush"}` reconhece a fala em andamento, `{"type":"reset"}` a descarta. |

Evento: `{ "type": "asr", "language": "pt", "confidence": 0.97, "text": "...", "latency_sec": 1.4 }`

#### Uso embutido

```python
from poly_server import Settings, create_app

app = create_app(Settings(mic=False, whisper_model="small"))
```

O `create_app` também aceita objetos `recognizer` e `translator` próprios, para
usar outro modelo de fala ou serviço de tradução.

### Licença

MIT
