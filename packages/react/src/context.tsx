import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPoly, type Poly, type PolyOptions, type PolyState } from "@swalay/poly-core";

const PolyContext = createContext<Poly | null>(null);

export type PolyProviderProps =
  | ({ poly: Poly; children?: ReactNode } & { [K in keyof PolyOptions]?: never })
  | (PolyOptions & { poly?: never; children?: ReactNode });

/**
 * Disponibiliza o Poly para a árvore React e conecta ao servidor de detecção.
 * As opções são lidas uma vez, na montagem; para trocá-las, recrie o provider
 * (mudando a `key`) ou passe uma instância própria em `poly`.
 */
export function PolyProvider(props: PolyProviderProps) {
  const { children } = props;
  const [poly] = useState<Poly>(() => {
    if (props.poly) return props.poly;
    const { children: _children, poly: _poly, ...options } = props;
    return createPoly(options as PolyOptions);
  });

  useEffect(() => {
    poly.start();
    // Toques e teclas contam como atividade para o `idleTimeout`.
    const onActivity = () => poly.notifyActivity();
    window.addEventListener("pointerdown", onActivity, { passive: true });
    window.addEventListener("keydown", onActivity);
    return () => {
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
      poly.stop();
    };
  }, [poly]);

  return <PolyContext.Provider value={poly}>{children}</PolyContext.Provider>;
}

export interface UsePolyResult extends PolyState {
  poly: Poly;
  accept: Poly["accept"];
  dismiss: Poly["dismiss"];
  setLanguage: Poly["setLanguage"];
  reset: Poly["reset"];
  startListening: Poly["startListening"];
  stopListening: Poly["stopListening"];
  toggleListening: Poly["toggleListening"];
}

export function usePoly(): UsePolyResult {
  const poly = useContext(PolyContext);
  if (!poly) throw new Error("poly: usePoly() must be used inside <PolyProvider>.");
  const state = useSyncExternalStore(poly.subscribe, poly.getState, poly.getState);
  return {
    ...state,
    poly,
    accept: poly.accept,
    dismiss: poly.dismiss,
    setLanguage: poly.setLanguage,
    reset: poly.reset,
    startListening: poly.startListening,
    stopListening: poly.stopListening,
    toggleListening: poly.toggleListening,
  };
}
