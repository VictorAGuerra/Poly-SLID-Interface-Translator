import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const resources = {
  en: {
    translation: {
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

      "assistant.label": "Live assistant",
      "assistant.title": "Language Assistant",
      "assistant.subtitle": "Live transcription snapshot from the microphone.",
      "assistant.lastText": "Last recognized text",
      "assistant.waiting": "(waiting…)",
      "assistant.note": "Note: language changes only when confidence > 0.",

      "form.guestName": "Guest name",
      "form.guestNamePlaceholder": "e.g., John Doe",
      "form.email": "Email",
      "form.emailPlaceholder": "e.g., johndoe@email.com",
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

      "hint.speak": "Tip: speak near the mic — the assistant updates language & transcript live.",
      "footer.left": "Poly Hotel © 2026",

      "popup.title": "Confirm language change",
      "popup.detected": "Detected:",
      "popup.question": "Do you want to switch the interface language?",
      "popup.confirm": "Switch",
      "popup.keep": "Keep current",
      "popup.loading": "Loading language…",
      "popup.close": "Close",
    },
  },
};

i18n.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;