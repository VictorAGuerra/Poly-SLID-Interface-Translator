import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPoly, type I18nAdapter, type PolyTransport } from "@poly-i18n/core";
import { LanguagePrompt, PolyProvider, usePoly } from "../src/index.js";

afterEach(cleanup);

function makePoly() {
  const bundles = new Map<string, Record<string, string>>([["en", { hi: "hello" }]]);
  let current = "en";
  const adapter: I18nAdapter = {
    getBaseTexts: () => bundles.get("en")!,
    hasLanguage: (l) => bundles.has(l),
    addLanguage: (l, t) => bundles.set(l, t),
    changeLanguage: (l) => {
      current = l;
    },
    getLanguage: () => current,
  };
  const transport: PolyTransport = {
    translate: async ({ target, texts }) =>
      Object.fromEntries(Object.entries(texts).map(([k, v]) => [k, `[${target}] ${v}`])),
    connect: vi.fn(() => () => {}),
  };
  return { poly: createPoly({ adapter, transport, storage: null }), transport };
}

function CurrentLanguage() {
  return <span data-testid="lang">{usePoly().language}</span>;
}

describe("<LanguagePrompt>", () => {
  it("mostra o popup traduzido e troca o idioma ao confirmar", async () => {
    const { poly, transport } = makePoly();
    render(
      <PolyProvider poly={poly}>
        <CurrentLanguage />
        <LanguagePrompt />
      </PolyProvider>,
    );
    expect(transport.connect).toHaveBeenCalled();

    act(() => poly.handleDetection({ language: "ja", confidence: 0.9, text: "こんにちは", latencySec: 0.4 }));

    const confirm = await screen.findByRole("button", { name: "[ja] Switch" });
    expect(screen.getByText("日本語")).toBeTruthy();
    expect(screen.getByRole("dialog").getAttribute("lang")).toBe("ja");

    fireEvent.click(confirm);
    await waitFor(() => expect(screen.getByTestId("lang").textContent).toBe("ja"));
    expect(document.documentElement.lang).toBe("ja");
  });

  it("aceita renderização própria (headless)", () => {
    const { poly } = makePoly();
    render(
      <PolyProvider poly={poly}>
        <LanguagePrompt>{({ open }) => <span>{open ? "aberto" : "fechado"}</span>}</LanguagePrompt>
      </PolyProvider>,
    );
    expect(screen.getByText("fechado")).toBeTruthy();
    act(() => poly.handleDetection({ language: "pt", confidence: 0.9, text: "olá tudo bem", latencySec: null }));
    expect(screen.getByText("aberto")).toBeTruthy();
  });

  it("exige o provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<LanguagePrompt />)).toThrow(/PolyProvider/);
  });
});
