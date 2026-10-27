import type { I18nAdapter } from "./adapter.js";
import { TranslationCache, type StorageLike } from "./cache.js";
import { createServerTransport, type DetectionEvent, type PolyTransport } from "./client.js";
import { normalizeLanguage, textDirection } from "./languages.js";
import { translateBundle } from "./translator.js";

export interface PromptTexts {
  title: string;
  detected: string;
  question: string;
  confirm: string;
  keep: string;
  loading: string;
  close: string;
}

export const DEFAULT_PROMPT_TEXTS: PromptTexts = {
  title: "Confirm language change",
  detected: "Detected:",
  question: "Do you want to switch the interface language?",
  confirm: "Switch",
  keep: "Keep current",
  loading: "Loading language…",
  close: "Close",
};

export type PolyStatus = "idle" | "prompting" | "switching";

export interface PolyState {
  /** Conexão com o servidor de detecção. */
  connected: boolean;
  /** Idioma atual da interface. */
  language: string;
  status: PolyStatus;
  /** Idioma detectado aguardando confirmação (ou sendo aplicado). */
  pending: { language: string; confidence: number } | null;
  /** Textos do popup. Ficam no idioma detectado assim que `promptReady` for true. */
  promptTexts: PromptTexts;
  promptReady: boolean;
  lastDetection: DetectionEvent | null;
  error: Error | null;
}

export interface PolyOptions {
  adapter: I18nAdapter;
  /** URL do poly-server. Atalho para `transport: createServerTransport({ url })`. */
  server?: string;
  transport?: PolyTransport;
  /** Idioma em que a interface foi escrita. Padrão: "en". */
  baseLanguage?: string;
  /** Confiança mínima (0 a 1) para considerar uma detecção. Padrão: 0.5. */
  minConfidence?: number;
  /**
   * Tamanho mínimo da transcrição, em caracteres. Filtra ruídos que o Whisper
   * às vezes "transcreve" como palavras soltas. Padrão: 3.
   */
  minTextLength?: number;
  /** Se definido, detecções fora desta lista são ignoradas. */
  supportedLanguages?: readonly string[];
  /** Troca direto, sem perguntar. Padrão: false. */
  autoSwitch?: boolean;
  /** Fecha o popup sozinho após este tempo, em ms. 0 desativa. Padrão: 9000. */
  promptTimeout?: number;
  /** Depois de recusado, o mesmo idioma não é sugerido por este tempo, em ms. Padrão: 60000. */
  declineCooldown?: number;
  /**
   * Volta ao idioma base após este tempo sem atividade, em ms. Pensado para
   * quiosques: o próximo usuário não encontra a tela no idioma do anterior.
   * Padrão: desativado.
   */
  idleTimeout?: number | false;
  /** Termos nunca traduzidos (nomes próprios, marcas...). */
  noTranslate?: readonly string[];
  /** Chaves cujo texto nunca é traduzido. */
  noTranslateKeys?: readonly string[];
  /** Traduções revisadas por humanos: { idioma: { chave: texto } }. Têm prioridade. */
  overrides?: Record<string, Record<string, string>>;
  /** Textos do popup, no idioma base. Os que faltarem usam os padrões em inglês. */
  promptTexts?: Partial<PromptTexts>;
  /** Onde persistir o cache de traduções. Padrão: localStorage. `null` mantém só em memória. */
  storage?: StorageLike | null;
  /** Atualiza `lang` e `dir` (rtl/ltr) do <html> ao trocar de idioma. Padrão: true. */
  manageDocument?: boolean;
  onError?: (error: Error) => void;
}

export interface Poly {
  getState(): PolyState;
  subscribe(listener: () => void): () => void;
  /** Conecta ao servidor de detecção. Idempotente. */
  start(): void;
  stop(): void;
  /** Aceita o idioma sugerido no popup. */
  accept(): Promise<void>;
  /** Recusa o idioma sugerido. */
  dismiss(): void;
  setLanguage(language: string): Promise<void>;
  /** Volta ao idioma base e esquece as recusas (novo usuário). */
  reset(): Promise<void>;
  /** Informa atividade do usuário (toque, tecla) para o `idleTimeout`. */
  notifyActivity(): void;
  /** Injeta uma detecção. Útil para fontes de áudio próprias e testes. */
  handleDetection(event: DetectionEvent): void;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function createPoly(options: PolyOptions): Poly {
  const {
    adapter,
    minConfidence = 0.5,
    minTextLength = 3,
    autoSwitch = false,
    promptTimeout = 9000,
    declineCooldown = 60_000,
    idleTimeout = false,
    overrides = {},
    manageDocument = true,
  } = options;

  const transport =
    options.transport ?? (options.server ? createServerTransport({ url: options.server }) : null);
  if (!transport) throw new Error("poly-interface: informe `server` ou `transport`.");

  const baseLanguage = normalizeLanguage(options.baseLanguage) ?? "en";
  const supported = options.supportedLanguages?.map((l) => normalizeLanguage(l));
  const cache = new TranslationCache(
    options.storage === undefined ? defaultStorage() : options.storage,
  );

  // Textos padrão estão em inglês; se o dev passou os próprios, estão no idioma base.
  const promptBase: PromptTexts = { ...DEFAULT_PROMPT_TEXTS, ...options.promptTexts };
  const promptSource = options.promptTexts ? baseLanguage : "en";

  let state: PolyState = {
    connected: false,
    language: normalizeLanguage(adapter.getLanguage()) ?? baseLanguage,
    status: "idle",
    pending: null,
    promptTexts: promptBase,
    promptReady: false,
    lastDetection: null,
    error: null,
  };

  const listeners = new Set<() => void>();
  const declined = new Map<string, number>();
  let disconnect: (() => void) | null = null;
  let promptTimer: ReturnType<typeof setTimeout> | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let promptRequest = 0;
  let switchRequest = 0;

  function setState(patch: Partial<PolyState>) {
    state = { ...state, ...patch };
    for (const l of listeners) l();
  }

  function report(error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    setState({ error: err });
    if (options.onError) options.onError(err);
    else console.warn(err);
  }

  function applyDocument(language: string) {
    if (!manageDocument || typeof document === "undefined") return;
    document.documentElement.lang = language;
    document.documentElement.dir = textDirection(language);
  }

  function translateOptions(target: string) {
    return {
      transport: transport!,
      cache,
      noTranslate: options.noTranslate,
      noTranslateKeys: options.noTranslateKeys,
      overrides: overrides[target],
    };
  }

  function closePrompt() {
    clearTimeout(promptTimer);
    promptRequest++;
    setState({ status: "idle", pending: null, promptTexts: promptBase, promptReady: false });
  }

  function armPromptTimer() {
    clearTimeout(promptTimer);
    if (promptTimeout > 0) {
      promptTimer = setTimeout(() => {
        if (state.status === "prompting") closePrompt();
      }, promptTimeout);
    }
  }

  async function loadPromptTexts(language: string) {
    const id = ++promptRequest;
    try {
      const texts = await translateBundle(
        promptBase as unknown as Record<string, string>,
        promptSource,
        language,
        { ...translateOptions(language), overrides: undefined, noTranslateKeys: undefined },
      );
      if (id !== promptRequest) return; // popup já fechou ou mudou de idioma
      setState({ promptTexts: texts as unknown as PromptTexts, promptReady: true });
    } catch (e) {
      if (id === promptRequest) report(e);
    }
  }

  function armIdleTimer() {
    clearTimeout(idleTimer);
    if (idleTimeout === false || idleTimeout <= 0) return;
    idleTimer = setTimeout(() => {
      void poly.reset();
    }, idleTimeout);
  }

  const poly: Poly = {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    start() {
      if (disconnect) return;
      applyDocument(state.language);
      armIdleTimer();
      disconnect = transport.connect({
        onDetection: (e) => poly.handleDetection(e),
        onConnectionChange: (connected) => setState({ connected }),
      });
    },

    stop() {
      disconnect?.();
      disconnect = null;
      clearTimeout(promptTimer);
      clearTimeout(idleTimer);
      setState({ connected: false });
    },

    handleDetection(event) {
      const language = normalizeLanguage(event.language);
      setState({ lastDetection: event });
      // Alguém falando perto do quiosque conta como atividade.
      armIdleTimer();

      if (!language || state.status === "switching") return;
      if (event.confidence < minConfidence) return;
      if (event.text.trim().length < minTextLength) return;
      if (supported && !supported.includes(language)) return;
      if (language === state.language) return;

      const until = declined.get(language);
      if (until !== undefined && Date.now() < until) return;

      if (autoSwitch) {
        void poly.setLanguage(language);
        return;
      }

      if (state.status === "prompting" && state.pending?.language === language) {
        setState({ pending: { language, confidence: event.confidence } });
        armPromptTimer();
        return;
      }

      setState({
        status: "prompting",
        pending: { language, confidence: event.confidence },
        promptTexts: promptBase,
        promptReady: false,
        error: null,
      });
      armPromptTimer();
      void loadPromptTexts(language);
    },

    async accept() {
      const target = state.pending?.language;
      if (target) await poly.setLanguage(target);
    },

    dismiss() {
      const target = state.pending?.language;
      if (!target || state.status !== "prompting") return;
      declined.set(target, Date.now() + declineCooldown);
      closePrompt();
    },

    async setLanguage(language) {
      const target = normalizeLanguage(language);
      if (!target) return;
      const id = ++switchRequest;
      clearTimeout(promptTimer);
      setState({ status: "switching", error: null });

      try {
        if (!adapter.hasLanguage(target)) {
          const texts = await translateBundle(
            adapter.getBaseTexts(),
            baseLanguage,
            target,
            translateOptions(target),
          );
          if (id !== switchRequest) return;
          adapter.addLanguage(target, texts);
        }
        await adapter.changeLanguage(target);
        if (id !== switchRequest) return;
        applyDocument(target);
        promptRequest++;
        setState({
          language: target,
          status: "idle",
          pending: null,
          promptTexts: promptBase,
          promptReady: false,
        });
      } catch (e) {
        if (id !== switchRequest) return;
        setState({ status: "idle", pending: null, promptReady: false });
        report(e);
      }
    },

    async reset() {
      declined.clear();
      if (state.status === "prompting") closePrompt();
      if (state.language !== baseLanguage) await poly.setLanguage(baseLanguage);
    },

    notifyActivity() {
      armIdleTimer();
    },
  };

  return poly;
}
