import type { ReactNode } from "react";
import { languageName, textDirection } from "@poly-i18n/core";
import { usePoly, type UsePolyResult } from "./context.js";

export interface LanguagePromptRenderProps extends UsePolyResult {
  open: boolean;
  /** Botões desabilitados: popup ainda traduzindo ou idioma sendo aplicado. */
  busy: boolean;
  /** Nome do idioma detectado escrito nele mesmo (ex.: "日本語"). */
  pendingName: string | null;
}

export interface LanguagePromptProps {
  className?: string;
  /** Renderização própria (headless). Recebe o estado e as ações. */
  children?: (props: LanguagePromptRenderProps) => ReactNode;
}

/**
 * Popup que sugere trocar para o idioma detectado. Os textos aparecem no
 * idioma detectado assim que a tradução fica pronta, para que a pessoa
 * entenda a pergunta antes de a interface inteira mudar.
 *
 * O estilo padrão está em `@poly-i18n/react/styles.css`.
 */
export function LanguagePrompt({ className, children }: LanguagePromptProps) {
  const poly = usePoly();
  const { status, pending, promptTexts: t, promptReady } = poly;

  const open = status !== "idle" && pending !== null;
  const busy = status === "switching" || !promptReady;
  const pendingName = pending ? languageName(pending.language) : null;

  if (children) return <>{children({ ...poly, open, busy, pendingName })}</>;

  // Enquanto a tradução não chega, os textos estão no idioma base.
  const textLang = promptReady && pending ? pending.language : undefined;

  return (
    <div
      className={["poly-prompt", open ? "poly-prompt--open" : "", className ?? ""].join(" ").trim()}
      aria-hidden={!open}
    >
      <div
        className="poly-prompt__card"
        role="dialog"
        aria-live="polite"
        aria-label={t.title}
        lang={textLang}
        dir={textLang ? textDirection(textLang) : undefined}
      >
        <div className="poly-prompt__header">
          <div className="poly-prompt__title">{t.title}</div>
          <button
            type="button"
            className="poly-prompt__close"
            onClick={poly.dismiss}
            disabled={busy}
            aria-label={t.close}
            title={t.close}
          >
            ✕
          </button>
        </div>

        <div className="poly-prompt__body">
          <div className="poly-prompt__line">
            {t.detected} <span className="poly-prompt__pill">{pendingName ?? "—"}</span>{" "}
            <span className="poly-prompt__muted">
              ({((pending?.confidence ?? 0) * 100).toFixed(1)}%)
            </span>
          </div>

          <div className="poly-prompt__line poly-prompt__muted">{t.question}</div>

          <div className="poly-prompt__actions">
            <button
              type="button"
              className="poly-prompt__button poly-prompt__button--primary"
              onClick={() => void poly.accept()}
              disabled={busy || !pending}
            >
              {busy ? (
                <span className="poly-prompt__inline">
                  <span className="poly-prompt__spinner" aria-hidden="true" />
                  {t.loading}
                </span>
              ) : (
                t.confirm
              )}
            </button>
            <button
              type="button"
              className="poly-prompt__button"
              onClick={poly.dismiss}
              disabled={busy}
            >
              {t.keep}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
