import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPoly, type DetectionHandlers, type I18nAdapter, type PolyTransport } from "@swalay/poly-core";
import { ListenButton, PolyProvider } from "../src/index.js";

afterEach(cleanup);

function makePoly(listening: "manual" | "continuous") {
  const adapter: I18nAdapter = {
    getBaseTexts: () => ({}),
    hasLanguage: () => true,
    addLanguage: () => {},
    changeLanguage: () => {},
    getLanguage: () => "en",
  };
  let handlers!: DetectionHandlers;
  const setListening = vi.fn();
  const transport: PolyTransport = {
    translate: async ({ texts }) => texts,
    connect: (h) => {
      handlers = h;
      return { close: () => {}, setListening };
    },
  };
  const poly = createPoly({ adapter, transport, storage: null, listening });
  return { poly, setListening, handlers: () => handlers };
}

describe("<ListenButton>", () => {
  it("escuta ao clicar e para sozinho no fim da fala", () => {
    const { poly, setListening, handlers } = makePoly("manual");
    render(
      <PolyProvider poly={poly}>
        <ListenButton />
      </PolyProvider>,
    );
    const button = screen.getByRole("button", { name: /Tap to speak/ });
    expect((button as HTMLButtonElement).disabled).toBe(true); // ainda sem conexão

    act(() => handlers().onConnectionChange(true));
    fireEvent.click(button);
    expect(setListening).toHaveBeenCalledWith(true);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.textContent).toBe(""); // só o ícone
    expect(button.getAttribute("aria-label")).toBe("Listening… Stop");

    act(() => handlers().onListeningChange?.(false));
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it("não aparece no modo contínuo", () => {
    const { poly } = makePoly("continuous");
    const { container } = render(
      <PolyProvider poly={poly}>
        <ListenButton />
      </PolyProvider>,
    );
    expect(container.innerHTML).toBe("");
  });
});
