import type { I18nAdapter } from "./adapter.js";
import { TranslationCache, type StorageLike } from "./cache.js";
import {
  createServerTransport,
  UnsupportedLanguageError,
  type DetectionEvent,
  type ListeningMode,
  type PolyTransport,
  type TransportConnection,
} from "./client.js";
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

/** Textos do botão de escuta manual; ficam no idioma atual da interface. */
export interface UiTexts {
  listen: string;
  stop: string;
  listening: string;
}

export const DEFAULT_UI_TEXTS: UiTexts = {
  listen: "Tap to speak",
  stop: "Stop",
  listening: "Listening…",
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
  /** "continuous" escuta o tempo todo; "manual" só depois de `startListening()`. */
  listenMode: ListeningMode;
  /** Escutando agora (no modo contínuo, sempre true enquanto conectado). */
  listening: boolean;
  /** Textos do botão de escuta, no idioma atual. */
  uiTexts: UiTexts;
  error: Error | null;
}

export interface PolyOptions {
  adapter: I18nAdapter;
  /** URL do poly-server. Atalho para `transport: createServerTransport({ url })`. */
  server?: string;
  /** De onde vem o áudio quando `server` é usado. Veja `ServerTransportOptions.audio`. */
  audio?: "server" | "browser";
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
  /**
   * Traduções geradas com `poly cache`: { idioma: { texto de origem: tradução } }.
   * Entram no cache na inicialização, então esses idiomas trocam na hora, sem
   * esperar o servidor. Textos base alterados depois são traduzidos ao vivo.
   */
  cache?: Record<string, Record<string, string>>;
  /** Textos do popup, no idioma base. Os que faltarem usam os padrões em inglês. */
  promptTexts?: Partial<PromptTexts>;
  /** Onde persistir o cache de traduções. Padrão: localStorage. `null` mantém só em memória. */
  storage?: StorageLike | null;
  /** Atualiza `lang` e `dir` (rtl/ltr) do <html> ao trocar de idioma. Padrão: true. */
  manageDocument?: boolean;
  /**
   * "continuous" (padrão): escuta o tempo todo.
   * "manual": só escuta após `startListening()` (ex.: `<ListenButton>`), até a
   * pessoa parar de falar ou chamar `stopListening()`.
   */
  listening?: ListeningMode;
  /**
   * No modo manual, para de escutar se ninguém começar a falar dentro deste
   * tempo, em ms. Depois que a fala começa, a escuta termina pelo silêncio.
   * Padrão: 15000.
   */
  listenTimeout?: number;
  /** Textos do botão de escuta, no idioma base. Os que faltarem usam os padrões em inglês. */
  uiTexts?: Partial<UiTexts>;
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
  /** Modo manual: começa a escutar até o fim da fala. */
  startListening(): void;
  /** Modo manual: para de escutar e processa o que já foi dito. */
  stopListening(): void;
  toggleListening(): void;
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
    options.transport ?? (options.server ? createServerTransport({ url: options.server, audio: options.audio }) : null);
  if (!transport) throw new Error("poly: provide either `server` or `transport`.");

  const baseLanguage = normalizeLanguage(options.baseLanguage) ?? "en";
  const supported = options.supportedLanguages?.map((l) => normalizeLanguage(l));
  const cache = new TranslationCache(
    options.storage === undefined ? defaultStorage() : options.storage,
  );
  for (const [language, entries] of Object.entries(options.cache ?? {})) {
    const target = normalizeLanguage(language);
    if (!target) continue;
    const pairs = Object.entries(entries);
    cache.setMany(baseLanguage, target, pairs);
    // Os textos padrão do popup e do botão estão em inglês.
    if (baseLanguage !== "en") cache.setMany("en", target, pairs);
  }

  // Textos padrão estão em inglês; se o dev passou os próprios, estão no idioma base.
  const promptBase: PromptTexts = { ...DEFAULT_PROMPT_TEXTS, ...options.promptTexts };
  const promptSource = options.promptTexts ? baseLanguage : "en";
  const uiBase: UiTexts = { ...DEFAULT_UI_TEXTS, ...options.uiTexts };
  const uiSource = options.uiTexts ? baseLanguage : "en";
  const listenMode: ListeningMode = options.listening ?? "continuous";
  const listenTimeout = options.listenTimeout ?? 15_000;

  let state: PolyState = {
    connected: false,
    language: normalizeLanguage(adapter.getLanguage()) ?? baseLanguage,
    status: "idle",
    pending: null,
    promptTexts: promptBase,
    promptReady: false,
    lastDetection: null,
    listenMode,
    listening: false,
    uiTexts: uiBase,
    error: null,
  };

  const listeners = new Set<() => void>();
  const declined = new Map<string, number>();
  // Idiomas para os quais o servidor não tem tradução: não adianta oferecer.
  const unsupported = new Set<string>();
  let connection: TransportConnection | null = null;
  let listenTimer: ReturnType<typeof setTimeout> | undefined;
  let uiRequest = 0;
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
      // O prazo para fechar sozinho só começa quando a pessoa consegue ler e
      // responder. Na primeira vez que um idioma aparece, o servidor pode
      // levar vários segundos baixando o pacote de tradução.
      armPromptTimer();
    } catch (e) {
      if (id !== promptRequest) return;
      report(e);
      if (e instanceof UnsupportedLanguageError) {
        unsupported.add(language);
        closePrompt();
      } else {
        // Falha temporária: pergunta no idioma base, mas deixa escolher.
        setState({ promptReady: true });
        armPromptTimer();
      }
    }
  }

  async function loadUiTexts(language: string) {
    const id = ++uiRequest;
    try {
      const texts = await translateBundle(
        uiBase as unknown as Record<string, string>,
        uiSource,
        language,
        { ...translateOptions(language), overrides: undefined, noTranslateKeys: undefined },
      );
      if (id === uiRequest) setState({ uiTexts: texts as unknown as UiTexts });
    } catch {
      // Sem tradução: o botão continua no idioma de origem dos textos.
    }
  }

  function setListening(listening: boolean) {
    clearTimeout(listenTimer);
    if (listening && listenMode === "manual" && listenTimeout > 0) {
      listenTimer = setTimeout(() => poly.stopListening(), listenTimeout);
    }
    if (state.listening !== listening) setState({ listening });
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
      if (connection) return;
      applyDocument(state.language);
      armIdleTimer();
      if (listenMode === "manual" && state.language !== uiSource) void loadUiTexts(state.language);
      const result = transport.connect(
        {
          onDetection: (e) => poly.handleDetection(e),
          onConnectionChange: (connected) => {
            const patch: Partial<PolyState> = { connected };
            if (listenMode === "continuous") patch.listening = connected;
            setState(patch);
          },
          onListeningChange: setListening,
          // Começou a falar: quem termina a escuta agora é o silêncio.
          onSpeechStart: () => clearTimeout(listenTimer),
          onError: report,
        },
        { listening: listenMode },
      );
      connection = typeof result === "function" ? { close: result } : result;
    },

    stop() {
      connection?.close();
      connection = null;
      clearTimeout(promptTimer);
      clearTimeout(idleTimer);
      clearTimeout(listenTimer);
      setState({ connected: false, listening: false });
    },

    startListening() {
      if (listenMode !== "manual" || !connection || state.listening) return;
      armIdleTimer();
      setListening(true);
      connection.setListening?.(true);
    },

    stopListening() {
      if (listenMode !== "manual" || !state.listening) return;
      setListening(false);
      connection?.setListening?.(false);
    },

    toggleListening() {
      if (state.listening) poly.stopListening();
      else poly.startListening();
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
      if (unsupported.has(language)) return;

      const until = declined.get(language);
      if (until !== undefined && Date.now() < until) return;

      if (autoSwitch) {
        void poly.setLanguage(language);
        return;
      }

      if (state.status === "prompting" && state.pending?.language === language) {
        setState({ pending: { language, confidence: event.confidence } });
        if (state.promptReady) armPromptTimer();
        return;
      }

      setState({
        status: "prompting",
        pending: { language, confidence: event.confidence },
        promptTexts: promptBase,
        promptReady: false,
        error: null,
      });
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
        if (listenMode === "manual") {
          if (target === uiSource) {
            uiRequest++;
            setState({ uiTexts: uiBase });
          } else void loadUiTexts(target);
        }
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
        if (e instanceof UnsupportedLanguageError) unsupported.add(target);
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
