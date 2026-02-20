// frontend/src/App.jsx
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

function normalizeLang(lang) {
  if (!lang) return "en";
  return String(lang).toLowerCase();
}

export default function App() {
  const { t, i18n } = useTranslation();

  const [connected, setConnected] = useState(false);
  const [lang, setLang] = useState(i18n.language || "en");
  const [confidence, setConfidence] = useState(0);
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
        const conf = Number(data.confidence ?? 0);
        setConfidence(conf);

        const newLang = normalizeLang(data.language);
        setLastText(data.text || "");
        setLatency(data.latency_sec ?? null);

        if (conf > 0) {
          setLang(newLang);
          i18n.changeLanguage(newLang);
        }
      }
    };

    return () => ws.close();
  }, [wsUrl, i18n]);

  return (
    <div style={{ fontFamily: "system-ui", padding: 24, maxWidth: 720 }}>
      <h1 style={{ marginBottom: 8 }}>{t("title")}</h1>

      <p style={{ marginTop: 0, opacity: 0.9 }}>
        WebSocket: <b>{connected ? "connected" : "disconnected"}</b>
      </p>

      <p>
        {t("status")}: <b>{lang}</b>{" "}
        <span style={{ opacity: 0.8 }}>
          (conf: {(confidence * 100).toFixed(1)}%)
          {latency !== null ? ` | lat: ${latency}s` : ""}
        </span>
      </p>

      <p style={{ marginBottom: 6 }}>{t("last")}:</p>

      <code
        style={{
          display: "block",
          whiteSpace: "pre-wrap",
          padding: 12,
          border: "1px solid #ddd",
          borderRadius: 8,
          minHeight: 64,
        }}
      >
        {lastText || "(...)"}
      </code>
    </div>
  );
}