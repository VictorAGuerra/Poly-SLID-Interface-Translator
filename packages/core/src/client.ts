import { captureMicrophone, type MicrophoneCapture } from "./audio.js";
import { normalizeLanguage } from "./languages.js";

/** Um idioma detectado na fala. */
export interface DetectionEvent {
  language: string;
  /** Probabilidade do idioma detectado, de 0 a 1. */
  confidence: number;
  /** Texto reconhecido (transcrição). */
  text: string;
  /** Tempo gasto na transcrição, em segundos, quando o servidor informa. */
  latencySec: number | null;
}

/** O servidor não tem tradução entre esses dois idiomas. */
export class UnsupportedLanguageError extends Error {
  constructor(
    readonly source: string,
    readonly target: string,
  ) {
    super(`poly: no translation available for ${source} -> ${target}`);
    this.name = "UnsupportedLanguageError";
  }
}

export interface TranslateRequest {
  source: string;
  target: string;
  texts: Record<string, string>;
}

/**
 * - "continuous": escuta o tempo todo.
 * - "manual": só escuta depois de `setListening(true)` (ex.: um botão), até o
 *   fim da fala (silêncio) ou `setListening(false)`.
 */
export type ListeningMode = "continuous" | "manual";

export interface DetectionHandlers {
  onDetection(event: DetectionEvent): void;
  onConnectionChange(connected: boolean): void;
  /** Escuta manual começou ou terminou. */
  onListeningChange?(listening: boolean): void;
  /** A pessoa começou a falar. */
  onSpeechStart?(): void;
  /** Erros que não derrubam a conexão (ex.: permissão de microfone negada). */
  onError?(error: Error): void;
}

export interface TransportConnection {
  close(): void;
  /** Liga/desliga a escuta no modo manual. */
  setListening?(listening: boolean): void;
}

/**
 * Tudo o que a biblioteca precisa de um backend. A implementação padrão fala
 * com o `poly-server`, mas dá para trocar por outra (testes, outro serviço de
 * tradução, reconhecimento de voz no próprio navegador...).
 */
export interface PolyTransport {
  translate(request: TranslateRequest): Promise<Record<string, string>>;
  /**
   * Começa a receber detecções. Retorna a conexão (ou, por compatibilidade,
   * só uma função que a encerra).
   */
  connect(handlers: DetectionHandlers, options?: { listening?: ListeningMode }): TransportConnection | (() => void);
}

export interface ServerTransportOptions {
  /** URL base do servidor, ex.: "http://localhost:8000". */
  url: string;
  /**
   * De onde vem o áudio:
   * - "server" (padrão): o servidor captura o próprio microfone (quiosque,
   *   navegador e servidor na mesma máquina).
   * - "browser": o navegador captura o microfone e envia o áudio ao servidor.
   *   Exige HTTPS (ou localhost) e permissão de microfone.
   */
  audio?: "server" | "browser";
  /** Restrições extras do microfone no modo "browser" (ex.: `deviceId`). */
  microphone?: MediaTrackConstraints;
  /** URL do WebSocket. Padrão: `url` + "/ws" ou "/ws/audio", conforme `audio`. */
  wsUrl?: string;
  /** Espera máxima entre tentativas de reconexão, em ms. */
  maxReconnectDelay?: number;
}

function toError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

export function createServerTransport(options: ServerTransportOptions): PolyTransport {
  const base = options.url.replace(/\/+$/, "");
  const browserAudio = options.audio === "browser";
  const wsUrl = options.wsUrl ?? `${base.replace(/^http/, "ws")}${browserAudio ? "/ws/audio" : "/ws"}`;
  const maxDelay = options.maxReconnectDelay ?? 10_000;

  return {
    async translate({ source, target, texts }) {
      const res = await fetch(`${base}/i18n/auto-translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_lang: source, target_lang: target, texts }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        if (res.status === 422 && body.includes("unsupported_language_pair")) {
          throw new UnsupportedLanguageError(source, target);
        }
        throw new Error(`poly: translation ${source}->${target} failed (${res.status}): ${body}`);
      }
      const data = (await res.json()) as { texts?: Record<string, string> };
      return data.texts ?? {};
    },

    connect({ onDetection, onConnectionChange, onListeningChange, onSpeechStart, onError }, connectOptions = {}) {
      const manual = connectOptions.listening === "manual";
      let ws: WebSocket | null = null;
      let closed = false;
      let attempt = 0;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let mic: MicrophoneCapture | null = null;
      let micStarting = false;
      let listening = false;

      const send = (data: string | ArrayBuffer) => {
        if (ws?.readyState === WebSocket.OPEN) ws.send(data);
      };

      const setListeningState = (value: boolean) => {
        if (listening === value) return;
        listening = value;
        onListeningChange?.(value);
      };

      // --- Áudio do navegador ---------------------------------------------
      const openMic = () => {
        if (mic || micStarting) return;
        micStarting = true;
        captureMicrophone((chunk) => {
          // No modo manual, só envia enquanto estiver escutando.
          if (!manual || listening) send(chunk);
        }, options.microphone)
          .then((capture) => {
            micStarting = false;
            // Fechou ou parou de escutar enquanto pedia permissão.
            if (closed || (manual && !listening)) capture.stop();
            else mic = capture;
          })
          .catch((e: unknown) => {
            micStarting = false;
            setListeningState(false);
            onError?.(new Error(`poly: microphone unavailable: ${toError(e).message}`));
          });
      };

      const closeMic = () => {
        mic?.stop();
        mic = null;
      };

      // No modo contínuo o microfone fica aberto entre reconexões; os blocos
      // só são enviados enquanto o WebSocket estiver aberto.
      if (browserAudio && !manual) openMic();

      // --- WebSocket -------------------------------------------------------
      const open = () => {
        ws = new WebSocket(wsUrl);
        ws.binaryType = "arraybuffer";
        ws.onopen = () => {
          attempt = 0;
          if (manual && !browserAudio) send(JSON.stringify({ type: "config", listening: "manual" }));
          onConnectionChange(true);
        };
        ws.onclose = () => {
          onConnectionChange(false);
          setListeningState(false);
          if (browserAudio && manual) closeMic();
          if (closed) return;
          // Num quiosque o servidor pode reiniciar; reconecta com espera crescente.
          const delay = Math.min(maxDelay, 500 * 2 ** attempt++);
          timer = setTimeout(open, delay);
        };
        ws.onmessage = (msg) => {
          let data: Record<string, unknown>;
          try {
            data = JSON.parse(String(msg.data)) as Record<string, unknown>;
          } catch {
            return;
          }
          if (data.type === "listening") {
            setListeningState(Boolean(data.listening));
            return;
          }
          if (data.type === "speech_start") {
            onSpeechStart?.();
            return;
          }
          if (data.type === "utterance_end" || data.type === "asr") {
            if (browserAudio && manual) {
              // A fala terminou: fecha o microfone até o próximo clique. O
              // servidor avisa antes de reconhecer, para não capturar mais
              // áudio durante os segundos de reconhecimento.
              closeMic();
              setListeningState(false);
            }
          }
          if (data.type !== "asr") return;
          const language = normalizeLanguage(data.language as string | undefined);
          if (!language) return;
          onDetection({
            language,
            confidence: Number(data.confidence ?? 0) || 0,
            text: String(data.text ?? ""),
            latencySec: typeof data.latency_sec === "number" ? data.latency_sec : null,
          });
        };
      };

      open();

      return {
        close() {
          closed = true;
          clearTimeout(timer);
          closeMic();
          ws?.close();
        },

        setListening(value) {
          if (!manual) return;
          if (browserAudio) {
            if (value) {
              send(JSON.stringify({ type: "reset" }));
              setListeningState(true);
              openMic();
            } else if (listening) {
              // Reconhece o que já foi dito e fecha o microfone.
              send(JSON.stringify({ type: "flush" }));
              closeMic();
              setListeningState(false);
            }
          } else {
            send(JSON.stringify({ type: "listen", action: value ? "start" : "stop" }));
          }
        },
      };
    },
  };
}
