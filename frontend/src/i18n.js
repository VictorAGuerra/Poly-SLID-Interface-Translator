import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const resources = {
  pt: { translation: { title: "Interface ao vivo", status: "Idioma detectado", last: "Último texto" } },
  en: { translation: { title: "Live UI", status: "Detected language", last: "Last text" } },
  ja: { translation: { title: "ライブUI", status: "検出された言語", last: "最後のテキスト" } },
  fr: { translation: { title: "Interface en direct", status: "Langue détectée", last: "Dernier texte" } },
};

i18n.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
