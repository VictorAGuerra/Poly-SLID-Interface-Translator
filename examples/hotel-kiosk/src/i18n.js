import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// A interface é escrita só em inglês (idioma base). Os outros idiomas são
// gerados automaticamente quando o idioma falado é detectado.
//
// <nt>...</nt> marca trechos que não devem ser traduzidos; {{variáveis}}
// também são protegidas automaticamente.
const en = {
  "brand.name": "Poly Hotel",
  "brand.tag": "Self Check-In",
  "ws.label": "WebSocket",
  "ws.connected": "Connected",
  "ws.disconnected": "Disconnected",

  "telemetry.language": "Detected language",
  "telemetry.confidence": "Confidence",
  "telemetry.latency": "Latency",

  "checkin.title": "Welcome to Poly Hotel",
  "checkin.subtitle": "Please fill out your details to complete your check-in.",

  "assistant.title": "Language Assistant",
  "assistant.subtitle": "Live transcription snapshot from the microphone.",
  "assistant.lastText": "Last recognized text",
  "assistant.waiting": "(waiting…)",
  "assistant.note": "The interface offers to switch when it recognizes another language with enough confidence.",
  "assistant.reset": "Back to English",

  "form.guestName": "Guest name",
  "form.guestNamePlaceholder": "e.g., <nt>John Doe</nt>",
  "form.email": "Email",
  "form.emailPlaceholder": "e.g., <nt>johndoe@email.com</nt>",
  "form.roomType": "Room type",
  "form.checkIn": "Check-in",
  "form.checkOut": "Check-out",
  "form.requests": "Special requests",
  "form.requestsPlaceholder": "e.g., Late check-in, feather-free pillows, etc.",

  "room.standard": "Standard Room",
  "room.deluxe": "Deluxe Suite",
  "room.executive": "Executive Suite",
  "room.presidential": "Presidential Suite",

  "actions.complete": "Complete check-in",
  "actions.clear": "Clear form",
  "actions.submitted": "✅ Check-in submitted (demo UI).",
  "actions.translating": "Loading language…",

  "footer.left": "Poly Hotel © {{year}}",
};

i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
