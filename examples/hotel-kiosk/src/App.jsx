import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LanguagePrompt, languageName, usePoly } from "@poly-i18n/react";
import "./App.css";

import polyLogo from "./assets/poly-logo.png";

const EMPTY_FORM = {
  guestName: "",
  email: "",
  roomType: "deluxe",
  checkIn: "",
  checkOut: "",
  requests: "",
};

export default function App() {
  const { t } = useTranslation();
  const { connected, language, status, lastDetection, reset } = usePoly();
  const [form, setForm] = useState(EMPTY_FORM);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const confPct = ((lastDetection?.confidence ?? 0) * 100).toFixed(1);
  const latency = lastDetection?.latencySec;
  const detected = lastDetection ? languageName(lastDetection.language) : "—";

  return (
    <div className="kiosk">
      <LanguagePrompt />

      <header className="kioskTop">
        <div className="brand">
          <div className="brandMark" aria-hidden="true">
            <img src={polyLogo} alt="" className="brandLogoImg" draggable="false" />
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
              <div className="telemetryValue">{detected}</div>
            </div>
            <div className="telemetryItem">
              <div className="telemetryLabel">{t("telemetry.confidence")}</div>
              <div className="telemetryValue">{confPct}%</div>
            </div>
            <div className="telemetryItem">
              <div className="telemetryLabel">{t("telemetry.latency")}</div>
              <div className="telemetryValue">{latency == null ? "—" : `${latency}s`}</div>
            </div>
          </div>

          {status === "switching" && (
            <div className="loadingChip">
              <span className="spinner" aria-hidden="true" />
              <span>{t("actions.translating")}</span>
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
                value={form.guestName}
                onChange={set("guestName")}
              />
            </div>

            <div className="field">
              <label className="label">{t("form.email")}</label>
              <input
                className="input"
                placeholder={t("form.emailPlaceholder")}
                value={form.email}
                onChange={set("email")}
              />
            </div>

            <div className="field">
              <label className="label">{t("form.roomType")}</label>
              <select className="input" value={form.roomType} onChange={set("roomType")}>
                <option value="standard">{t("room.standard")}</option>
                <option value="deluxe">{t("room.deluxe")}</option>
                <option value="executive">{t("room.executive")}</option>
                <option value="presidential">{t("room.presidential")}</option>
              </select>
            </div>

            <div className="field">
              <label className="label">{t("form.checkIn")}</label>
              <input className="input" type="date" value={form.checkIn} onChange={set("checkIn")} />
            </div>

            <div className="field">
              <label className="label">{t("form.checkOut")}</label>
              <input className="input" type="date" value={form.checkOut} onChange={set("checkOut")} />
            </div>

            <div className="field span2">
              <label className="label">{t("form.requests")}</label>
              <textarea
                className="input textarea"
                placeholder={t("form.requestsPlaceholder")}
                value={form.requests}
                onChange={set("requests")}
                rows={4}
              />
            </div>
          </div>

          <div className="actions">
            <button className="btn primary" type="button" onClick={() => alert(t("actions.submitted"))}>
              {t("actions.complete")}
            </button>
            <button className="btn" type="button" onClick={() => setForm(EMPTY_FORM)}>
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
              <div className="kvV">{detected}</div>
            </div>
            <div className="kv">
              <div className="kvK">{t("telemetry.confidence")}</div>
              <div className="kvV">{confPct}%</div>
            </div>
            <div className="kv">
              <div className="kvK">{t("ws.label")}</div>
              <div className="kvV">{connected ? t("ws.connected") : t("ws.disconnected")}</div>
            </div>
            <div className="kv">
              <div className="kvK">{t("telemetry.latency")}</div>
              <div className="kvV">{latency == null ? "—" : `${latency}s`}</div>
            </div>
          </div>

          <div className="transcript">
            <div className="transcriptTitle">{t("assistant.lastText")}</div>
            <div className="transcriptBody">
              {lastDetection?.text ? lastDetection.text : <span className="muted">{t("assistant.waiting")}</span>}
            </div>
          </div>

          <div className="sideNote muted">{t("assistant.note")}</div>

          {language !== "en" && (
            <button className="btn" type="button" onClick={() => void reset()}>
              {t("assistant.reset")}
            </button>
          )}
        </aside>
      </main>

      <footer className="kioskFooter">
        <span className="muted">{t("footer.left", { year: new Date().getFullYear() })}</span>
      </footer>
    </div>
  );
}
