import React from "react";
import ReactDOM from "react-dom/client";
import { PolyProvider, createI18nextAdapter } from "@swalay/poly-react";
import "@swalay/poly-react/styles.css";

import App from "./App.jsx";
import i18n from "./i18n.js";

const adapter = createI18nextAdapter(i18n, { baseLanguage: "en" });

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <PolyProvider
      adapter={adapter}
      server={import.meta.env.VITE_POLY_SERVER ?? "http://localhost:8000"}
      // "server": microfone do próprio servidor (quiosque).
      // "browser": o navegador captura o microfone e envia o áudio.
      audio={import.meta.env.VITE_POLY_AUDIO ?? "server"}
      baseLanguage="en"
      minConfidence={0.5}
      // Quiosque: volta para o inglês após 2 minutos sem ninguém usando.
      idleTimeout={120_000}
      // Nomes próprios que nunca são traduzidos, em qualquer texto.
      noTranslate={["Poly Hotel"]}
      // Traduções revisadas por humanos têm prioridade sobre a automática.
      overrides={{ pt: { "brand.tag": "Autoatendimento" } }}
    >
      <App />
    </PolyProvider>
  </React.StrictMode>
);
