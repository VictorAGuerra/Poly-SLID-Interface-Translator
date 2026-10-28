import type { ReactNode } from "react";
import { usePoly, type UsePolyResult } from "./context.js";

export interface ListenButtonRenderProps extends UsePolyResult {
  toggle: () => void;
  /** Desabilitado: sem conexão com o servidor. */
  disabled: boolean;
}

export interface ListenButtonProps {
  className?: string;
  /** Renderização própria (headless). Recebe o estado e as ações. */
  children?: (props: ListenButtonRenderProps) => ReactNode;
}

/**
 * Botão de escuta para `listening="manual"`: escuta até a pessoa parar de
 * falar, ou até ser clicado de novo. No modo contínuo não renderiza nada.
 *
 * Os textos ficam no idioma atual da interface. O estilo padrão está em
 * `@swalay/poly-react/styles.css`.
 */
export function ListenButton({ className, children }: ListenButtonProps) {
  const poly = usePoly();
  if (poly.listenMode !== "manual") return null;

  const toggle = () => poly.poly.toggleListening();
  const disabled = !poly.connected;

  if (children) return <>{children({ ...poly, toggle, disabled })}</>;

  const { listening, uiTexts: t } = poly;
  return (
    <button
      type="button"
      className={["poly-listen", listening ? "poly-listen--active" : "", className ?? ""].join(" ").trim()}
      onClick={toggle}
      disabled={disabled}
      aria-pressed={listening}
    >
      <span className="poly-listen__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10a7 7 0 0 0 14 0" />
          <path d="M12 17v5" />
        </svg>
      </span>
      <span className="poly-listen__label">{listening ? t.stop : t.listen}</span>
      {listening && (
        <span className="poly-listen__status" role="status">
          {t.listening}
        </span>
      )}
    </button>
  );
}
