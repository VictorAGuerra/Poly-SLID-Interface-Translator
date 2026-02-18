import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

function normalizeLang(lang) {
  // Whisper costuma retornar: "pt", "en", "ja", "fr", etc.
  // Se vier algo fora, cai no fallback.
  if (!lang) return "en";
  return lang.toLowerCase();
}

export default function App() {
  const { t, i18n } = useTranslation();
  const [connected, setConnected] = useState(false);
  const [lang, setLang] = useState(i18n.language);
  const [lastText, setLastText] = useState("");
  const [latency, setLatency] = useState(null);

  const wsUrl = useMemo(() => "ws://localhost:8000/ws", []);

  useEffect(() => {
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);

      if (data.type === "asr") {
        const newLang = normalizeLang(data.language);

        setLang(newLang);
        setLastText(data.text || "");
        setLatency(data.latency_sec ?? null);

        // troca idioma do i18n ao vivo
        i18n.changeLanguage(newLang);
      }
    };

    return () => ws.close();
  }, [wsUrl, i18n]);

  return (
    <div style={{ fontFamily: "system-ui", padding: 24, maxWidth: 720 }}>
      <h1>{t("title")}</h1>

      <p>
        WebSocket: <b>{connected ? "connected" : "disconnected"}</b>
      </p>

      <p>
        {t("status")}: <b>{lang}</b> {latency !== null ? `(lat: ${latency}s)` : ""}
      </p>

      <p>
        {t("last")}: <br />
        <code style={{ display: "block", whiteSpace: "pre-wrap", padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
          {lastText || "(...)"} 
        </code>
      </p>
    </div>
  );
}
