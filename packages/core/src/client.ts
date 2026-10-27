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

export interface TranslateRequest {
  source: string;
  target: string;
  texts: Record<string, string>;
}

export interface DetectionHandlers {
  onDetection(event: DetectionEvent): void;
  onConnectionChange(connected: boolean): void;
}

/**
 * Tudo o que a biblioteca precisa de um backend. A implementação padrão fala
 * com o `poly-server`, mas dá para trocar por outra (testes, outro serviço de
 * tradução, reconhecimento de voz no próprio navegador...).
 */
export interface PolyTransport {
  translate(request: TranslateRequest): Promise<Record<string, string>>;
  /** Começa a receber detecções. Retorna uma função que encerra a conexão. */
  connect(handlers: DetectionHandlers): () => void;
}

export interface ServerTransportOptions {
  /** URL base do servidor, ex.: "http://localhost:8000". */
  url: string;
  /** URL do WebSocket. Padrão: deriva de `url` + "/ws". */
  wsUrl?: string;
  /** Espera máxima entre tentativas de reconexão, em ms. */
  maxReconnectDelay?: number;
}

export function createServerTransport(options: ServerTransportOptions): PolyTransport {
  const base = options.url.replace(/\/+$/, "");
  const wsUrl = options.wsUrl ?? `${base.replace(/^http/, "ws")}/ws`;
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
        throw new Error(`poly-interface: tradução ${source}->${target} falhou (${res.status}): ${body}`);
      }
      const data = (await res.json()) as { texts?: Record<string, string> };
      return data.texts ?? {};
    },

    connect({ onDetection, onConnectionChange }) {
      let ws: WebSocket | null = null;
      let closed = false;
      let attempt = 0;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const open = () => {
        ws = new WebSocket(wsUrl);
        ws.onopen = () => {
          attempt = 0;
          onConnectionChange(true);
        };
        ws.onclose = () => {
          onConnectionChange(false);
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

      return () => {
        closed = true;
        clearTimeout(timer);
        ws?.close();
      };
    },
  };
}
