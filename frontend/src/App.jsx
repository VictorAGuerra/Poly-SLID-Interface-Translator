import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import "./App.css";

function normalizeLang(lang) {
  if (!lang) return "en";
  return String(lang).toLowerCase();
}

function clamp01(x) {
  const n = Number(x ?? 0);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

async function ensureI18nBundle(i18n, targetLang) {
  const ns = "translation";
  const baseLang = "en";

  if (targetLang === baseLang) return;
  if (i18n.hasResourceBundle(targetLang, ns)) return;

  const baseTexts = i18n.getResourceBundle(baseLang, ns);
  if (!baseTexts) return;

  const res = await fetch("http://localhost:8000/i18n/auto-translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_lang: baseLang,
      target_lang: targetLang,
      namespace: ns,
      texts: baseTexts,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`auto-translate failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  const translated = data?.texts;

  if (translated && typeof translated === "object") {
    i18n.addResourceBundle(targetLang, ns, translated, true, true);
  }
}

export default function App() {
  const { t, i18n } = useTranslation();

  const [connected, setConnected] = useState(false);

  const [lang, setLang] = useState(i18n.language || "en");
  const [confidence, setConfidence] = useState(0);

  const [lastText, setLastText] = useState("");
  const [latency, setLatency] = useState(null);

  const [guestName, setGuestName] = useState("");
  const [email, setEmail] = useState("");
  const [roomType, setRoomType] = useState("deluxe");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [requests, setRequests] = useState("");

  const wsUrl = useMemo(() => "ws://localhost:8000/ws", []);

  useEffect(() => {
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    ws.onmessage = async (msg) => {
      const data = JSON.parse(msg.data);

      if (data.type === "asr") {
        const conf = clamp01(data.confidence);
        const newLang = normalizeLang(data.language);

        setConfidence(conf);
        setLastText(data.text || "");
        setLatency(data.latency_sec ?? null);

        // sua regra: confidence 0 => não troca idioma
        if (conf <= 0) return;

        try {
          await ensureI18nBundle(i18n, newLang);
          setLang(newLang);
          i18n.changeLanguage(newLang);
        } catch (e) {
          console.warn("Auto-translate error:", e);
          // se falhar, mantém o idioma atual
        }
      }
    };

    return () => ws.close();
  }, [wsUrl, i18n]);

  const confPct = (clamp01(confidence) * 100).toFixed(1);

  return (
    <div className="kiosk">
      <header className="kioskTop">
        <div className="brand">
          <div className="brandMark" aria-hidden="true">
            PH
          </div>
          <div className="brandText">
            <div className="brandName">{t("brand.name")}</div>
            <div className="brandTag">{t("brand.tag")}</div>
          </div>
        </div>

        <div className="statusRow">
          <span className={`statusBadge ${connected ? "ok" : "warn"}`}>
            <span className="statusDot" aria-hidden="true" />
            {connected ? t("ws.connected") : t("ws.disconnected")}
          </span>

          <div className="telemetry">
            <div className="telemetryItem">
              <div className="telemetryLabel">{t("telemetry.language")}</div>
              <div className="telemetryValue">{lang}</div>
            </div>
            <div className="telemetryItem">
              <div className="telemetryLabel">{t("telemetry.confidence")}</div>
              <div className="telemetryValue">{confPct}%</div>
            </div>
            <div className="telemetryItem">
              <div className="telemetryLabel">{t("telemetry.latency")}</div>
              <div className="telemetryValue">
                {latency == null ? "—" : `${latency}s`}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="kioskBody">
        <section className="card cardMain">
          <div className="cardHeader">
            <div>
              <h1 className="title">{t("checkin.title")}</h1>
              <p className="subtitle">{t("checkin.subtitle")}</p>
            </div>
          </div>

          <div className="formGrid">
            <div className="field">
              <label className="label">{t("form.guestName")}</label>
              <input
                className="input"
                placeholder={t("form.guestNamePlaceholder")}
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
              />
            </div>

            <div className="field">
              <label className="label">{t("form.email")}</label>
              <input
                className="input"
                placeholder={t("form.emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="field">
              <label className="label">{t("form.roomType")}</label>
              <select
                className="input"
                value={roomType}
                onChange={(e) => setRoomType(e.target.value)}
              >
                <option value="standard">{t("room.standard")}</option>
                <option value="deluxe">{t("room.deluxe")}</option>
                <option value="executive">{t("room.executive")}</option>
                <option value="presidential">{t("room.presidential")}</option>
              </select>
            </div>

            <div className="field">
              <label className="label">{t("form.checkIn")}</label>
              <input
                className="input"
                type="date"
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
              />
            </div>

            <div className="field">
              <label className="label">{t("form.checkOut")}</label>
              <input
                className="input"
                type="date"
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
              />
            </div>

            <div className="field span2">
              <label className="label">{t("form.requests")}</label>
              <textarea
                className="input textarea"
                placeholder={t("form.requestsPlaceholder")}
                value={requests}
                onChange={(e) => setRequests(e.target.value)}
                rows={4}
              />
            </div>
          </div>

          <div className="actions">
            <button
              className="btn primary"
              type="button"
              onClick={() => alert(t("actions.submitted"))}
            >
              {t("actions.complete")}
            </button>

            <button
              className="btn"
              type="button"
              onClick={() => {
                setGuestName("");
                setEmail("");
                setRoomType("deluxe");
                setCheckIn("");
                setCheckOut("");
                setRequests("");
              }}
            >
              {t("actions.clear")}
            </button>

            <div className="hint">{t("hint.speak")}</div>
          </div>
        </section>

        <aside className="card cardSide">
          <div className="sideHeader">
            <div>
              <h2 className="sideTitle">{t("assistant.title")}</h2>
              <p className="sideSubtitle">{t("assistant.subtitle")}</p>
            </div>
          </div>

          <div className="sideGrid">
            <div className="kv">
              <div className="kvK">{t("telemetry.language")}</div>
              <div className="kvV">{lang}</div>
            </div>
            <div className="kv">
              <div className="kvK">{t("telemetry.confidence")}</div>
              <div className="kvV">{confPct}%</div>
            </div>
            <div className="kv">
              <div className="kvK">{t("ws.label")}</div>
              <div className="kvV">
                {connected ? t("ws.connected") : t("ws.disconnected")}
              </div>
            </div>
            <div className="kv">
              <div className="kvK">{t("telemetry.latency")}</div>
              <div className="kvV">{latency == null ? "—" : `${latency}s`}</div>
            </div>
          </div>

          <div className="transcript">
            <div className="transcriptTitle">{t("assistant.lastText")}</div>
            <div className="transcriptBody">
              {lastText ? lastText : <span className="muted">{t("assistant.waiting")}</span>}
            </div>
          </div>

          <div className="sideNote muted">{t("assistant.note")}</div>
        </aside>
      </main>

      <footer className="kioskFooter">
        <span className="muted">{t("footer.left", { year: new Date().getFullYear() })}</span>
        <span className="muted">{t("footer.right")}</span>
      </footer>
    </div>
  );
}