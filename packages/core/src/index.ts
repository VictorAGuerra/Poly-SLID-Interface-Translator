export { createPoly, DEFAULT_PROMPT_TEXTS, DEFAULT_UI_TEXTS } from "./poly.js";
export type { Poly, PolyOptions, PolyState, PolyStatus, PromptTexts, UiTexts } from "./poly.js";

export { createI18nextAdapter, stripMarkup } from "./adapter.js";
export type { I18nAdapter, I18nextAdapterOptions } from "./adapter.js";

export { createServerTransport, UnsupportedLanguageError } from "./client.js";
export type {
  DetectionEvent,
  DetectionHandlers,
  ListeningMode,
  PolyTransport,
  TransportConnection,
  ServerTransportOptions,
  TranslateRequest,
} from "./client.js";

export { translateBundle } from "./translator.js";
export type { TranslateBundleOptions } from "./translator.js";

export { TranslationCache } from "./cache.js";
export type { StorageLike } from "./cache.js";

export { protect, restore } from "./protect.js";
export type { ProtectOptions, ProtectedText } from "./protect.js";

export { isRtl, languageName, normalizeLanguage, textDirection } from "./languages.js";

export { captureMicrophone, createDownsampler } from "./audio.js";
export type { MicrophoneCapture } from "./audio.js";
