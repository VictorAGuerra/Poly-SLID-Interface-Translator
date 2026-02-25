import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "./App.css";

import polyLogo from "./assets/poly-logo.png";

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

async function translatePopupMini(targetLang, popupBaseTexts) {
  const res = await fetch("http://localhost:8000/i18n/auto-translate-mini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_lang: "en",
      target_lang: targetLang,
      texts: popupBaseTexts,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`auto-translate-mini failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return data?.texts || {};
}

export default function App() {
  const { t, i18n } = useTranslation();

  const [connected, setConnected] = useState(false);

  const [lang, setLang] = useState(i18n.language || "en");
  const [confidence, setConfidence] = useState(0);

  const [lastText, setLastText] = useState("");
  const [latency, setLatency] = useState(null);

  // demo form
  const [guestName, setGuestName] = useState("");
  const [email, setEmail] = useState("");
  const [roomType, setRoomType] = useState("deluxe");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [requests, setRequests] = useState("");

  // popup confirmation
  const [showLangPrompt, setShowLangPrompt] = useState(false);
  const [pendingLang, setPendingLang] = useState(null);
  const [pendingConf, setPendingConf] = useState(0);

  // loading global (troca da UI toda)
  const [isLangLoading, setIsLangLoading] = useState(false);

  // mini i18n só do popup (antes de trocar a UI toda)
  const [popupTexts, setPopupTexts] = useState(null);
  const [popupLoading, setPopupLoading] = useState(false);

  const promptTimerRef = useRef(null);
  const wsUrl = useMemo(() => "ws://localhost:8000/ws", []);

  // Strings base (EN) do popup: isso é o que o Argos traduz antes
  const popupBaseTexts = useMemo(
    () => ({
      "popup.title": "Confirm language change",
      "popup.detected": "Detected:",
      "popup.question": "Do you want to switch the interface language?",
      "popup.confirm": "Switch",
      "popup.keep": "Keep current",
      "popup.loading": "Loading language…",
      "popup.close": "Close",
    }),
    []
  );

  // helper: traduz só o popup (prioridade: mini; fallback: i18n atual)
  const tp = (key) => {
    if (popupTexts && popupTexts[key]) return popupTexts[key];
    return t(key);
  };

  useEffect(() => {
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);

      if (data.type === "asr") {
        const conf = clamp01(data.confidence);
        const detected = normalizeLang(data.language);

        setConfidence(conf);
        setLastText(data.text || "");
        setLatency(data.latency_sec ?? null);

        // regra: confidence 0 => não troca e nem abre prompt
        if (conf <= 0) return;

        // se for o mesmo idioma atual, não precisa prompt
        if (detected === lang) return;

        // se já está trocando UI inteira, evita spam
        if (isLangLoading) return;

        // abre prompt
        setPendingLang(detected);
        setPendingConf(conf);
        setShowLangPrompt(true);

        // pré-traduz SÓ o popup pro idioma detectado
        setPopupLoading(true);
        translatePopupMini(detected, popupBaseTexts)
          .then((texts) => setPopupTexts(texts))
          .catch((e) => {
            console.warn("Popup mini-translate failed:", e);
            setPopupTexts(null);
          })
          .finally(() => setPopupLoading(false));
      }
    };

    return () => ws.close();
  }, [wsUrl, lang, isLangLoading, popupBaseTexts]);

  // auto-fecha o popup após alguns segundos (se não estiver carregando algo)
  useEffect(() => {
    if (!showLangPrompt) return;

    if (promptTimerRef.current) clearTimeout(promptTimerRef.current);
    promptTimerRef.current = setTimeout(() => {
      if (!isLangLoading) {
        setShowLangPrompt(false);
        setPopupTexts(null);
      }
    }, 9000);

    return () => {
      if (promptTimerRef.current) clearTimeout(promptTimerRef.current);
    };
  }, [showLangPrompt, isLangLoading]);

  async function applyLanguage(target) {
    if (!target) return;

    try {
      setIsLangLoading(true);

      await ensureI18nBundle(i18n, target);
      i18n.changeLanguage(target);
      setLang(target);

      setShowLangPrompt(false);
      setPopupTexts(null);
    } catch (e) {
      console.warn("Language switch failed:", e);
      setShowLangPrompt(false);
      setPopupTexts(null);
    } finally {
      setIsLangLoading(false);
    }
  }

  const confPct = (clamp01(confidence) * 100).toFixed(1);
  const pendingPct = (clamp01(pendingConf) * 100).toFixed(1);

  const popupButtonBusy = popupLoading || isLangLoading;

  return (
    <div className="kiosk">
      {/* Popup no canto superior direito */}
      <div className={`toastArea ${showLangPrompt ? "show" : ""}`}>
        <div className="toast">
          <div className="toastHeader">
            <div className="toastTitle">{tp("popup.title")}</div>
            <button
              className="iconBtn"
              onClick={() => {
                if (popupButtonBusy) return;
                setShowLangPrompt(false);
                setPopupTexts(null);
              }}
              aria-label={tp("popup.close")}
              disabled={popupButtonBusy}
              title={tp("popup.close")}
            >
              ✕
            </button>
          </div>

          <div className="toastBody">
            <div className="toastLine">
              {tp("popup.detected")}{" "}
              <span className="pillMini">{pendingLang ?? "—"}</span>{" "}
              <span className="muted">({pendingPct}%)</span>
            </div>

            <div className="toastLine muted">{tp("popup.question")}</div>

            <div className="toastActions">
              <button
                className="btn primary"
                type="button"
                onClick={() => applyLanguage(pendingLang)}
                disabled={popupButtonBusy || !pendingLang}
              >
                {popupButtonBusy ? (
                  <span className="btnInline">
                    <span className="spinner" aria-hidden="true" />
                    {tp("popup.loading")}
                  </span>
                ) : (
                  tp("popup.confirm")
                )}
              </button>

              <button
                className="btn"
                type="button"
                onClick={() => {
                  if (popupButtonBusy) return;
                  setShowLangPrompt(false);
                  setPopupTexts(null);
                }}
                disabled={popupButtonBusy}
              >
                {tp("popup.keep")}
              </button>
            </div>
          </div>
        </div>
      </div>

      <header className="kioskTop">
        <div className="brand">
          <div className="brandMark" aria-hidden="true">
            <img
                src={polyLogo}
                alt=""
                className="brandLogoImg"
                draggable="false"
              />
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

          {isLangLoading && (
            <div className="loadingChip" title={tp("popup.loading")}>
              <span className="spinner" aria-hidden="true" />
              <span>{tp("popup.loading")}</span>
            </div>
          )}
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
              <div className="kvV">
                {latency == null ? "—" : `${latency}s`}
              </div>
            </div>
          </div>

          <div className="transcript">
            <div className="transcriptTitle">{t("assistant.lastText")}</div>
            <div className="transcriptBody">
              {lastText ? (
                lastText
              ) : (
                <span className="muted">{t("assistant.waiting")}</span>
              )}
            </div>
          </div>

          <div className="sideNote muted">{t("assistant.note")}</div>
        </aside>
      </main>

      <footer className="kioskFooter">
        <span className="muted">
          {t("footer.left", { year: new Date().getFullYear() })}
        </span>
      </footer>
    </div>
  );
}