# backend/main.py
import asyncio
import collections
import queue
import sys
import threading
import time
from typing import Dict, Tuple

import numpy as np
import sounddevice as sd
import webrtcvad
import whisper
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

# Argos Translate (offline)
from argostranslate import package as argos_package
from argostranslate import translate as argos_translate

# ===== Config =====
MODEL_NAME = "base"
SAMPLE_RATE = 16000
DEVICE = None  # set device index if needed

VAD_MODE = 2              # 0=less aggressive, 3=more aggressive
FRAME_MS = 30             # must be 10/20/30 for webrtcvad
PRE_ROLL_MS = 200
START_TRIGGER_MS = 150
END_TRIGGER_MS = 600
MAX_UTTERANCE_SEC = 12

# ===== Models =====
model = whisper.load_model(MODEL_NAME)
vad = webrtcvad.Vad(VAD_MODE)

audio_q: "queue.Queue[np.ndarray]" = queue.Queue()
events_q: "queue.Queue[dict]" = queue.Queue()

# ===== FastAPI =====
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_mic_thread_started = False

# ===== Audio helpers =====
def audio_callback(indata, frames, time_info, status):
    if status:
        print(status, file=sys.stderr)
    audio_q.put(indata.copy())


def float32_to_int16_pcm(x: np.ndarray) -> bytes:
    x = np.clip(x, -1.0, 1.0)
    ints = (x * 32767.0).astype(np.int16)
    return ints.tobytes()


def normalize_lang_code(lang: str | None) -> str:
    if not lang:
        return "en"
    return lang


def detect_lang_with_confidence(audio_np: np.ndarray) -> Tuple[str, float]:
    audio = whisper.pad_or_trim(audio_np)
    mel = whisper.log_mel_spectrogram(audio).to(model.device)
    _, probs = model.detect_language(mel)
    lang = max(probs, key=probs.get)
    conf = float(probs[lang])
    return normalize_lang_code(lang), conf


# ===== Argos helpers =====
_argos_ready_pairs: set[tuple[str, str]] = set()
_argos_lock = threading.Lock()


def _has_translation_pair(from_lang, tgt_code: str) -> bool:
    """
    Compatível com variações da API do Argos.
    """
    if hasattr(from_lang, "translations_to"):
        # translations_to: list of Translation objects with .to_code
        return any(getattr(t, "to_code", None) == tgt_code for t in from_lang.translations_to)

    if hasattr(from_lang, "translations"):
        # older: translations: list of Translation objects
        return any(
            getattr(t, "to_code", None) == tgt_code or getattr(t, "code", None) == tgt_code
            for t in from_lang.translations
        )

    return False


def ensure_argos_pair(src: str, tgt: str) -> None:
    src = normalize_lang_code(src)
    tgt = normalize_lang_code(tgt)

    if src == tgt:
        return
    if (src, tgt) in _argos_ready_pairs:
        return

    with _argos_lock:
        if (src, tgt) in _argos_ready_pairs:
            return

        installed = argos_translate.get_installed_languages()
        from_lang = next((l for l in installed if l.code == src), None)

        if from_lang and _has_translation_pair(from_lang, tgt):
            _argos_ready_pairs.add((src, tgt))
            return

        argos_package.update_package_index()
        available = argos_package.get_available_packages()

        pkg = next((p for p in available if p.from_code == src and p.to_code == tgt), None)
        if pkg is None:
            raise RuntimeError(f"Argos: no package for {src}->{tgt}")

        pkg_path = pkg.download()
        argos_package.install_from_path(pkg_path)

        _argos_ready_pairs.add((src, tgt))


def argos_translate_text(text: str, src: str, tgt: str) -> str:
    src = normalize_lang_code(src)
    tgt = normalize_lang_code(tgt)
    if not text or src == tgt:
        return text
    ensure_argos_pair(src, tgt)
    return argos_translate.translate(text, src, tgt)


# ===== Mic worker (MUST be defined before startup handler) =====
def mic_worker(out_queue: "queue.Queue[dict]"):
    frame_len = int(SAMPLE_RATE * FRAME_MS / 1000)
    start_trigger_frames = max(1, int(START_TRIGGER_MS / FRAME_MS))
    end_trigger_frames = max(1, int(END_TRIGGER_MS / FRAME_MS))
    pre_roll_frames = max(0, int(PRE_ROLL_MS / FRAME_MS))
    max_frames = int(MAX_UTTERANCE_SEC * 1000 / FRAME_MS)

    ring_buffer = collections.deque(maxlen=pre_roll_frames)
    voiced_frames: list[np.ndarray] = []
    in_speech = False
    speech_run = 0
    silence_run = 0
    buffer = np.zeros((0,), dtype=np.float32)

    with sd.InputStream(
        samplerate=SAMPLE_RATE,
        channels=1,
        dtype="float32",
        callback=audio_callback,
        device=DEVICE,
        blocksize=0,
    ):
        while True:
            while len(buffer) < frame_len:
                data = audio_q.get()
                buffer = np.concatenate([buffer, data[:, 0]])

            frame = buffer[:frame_len]
            buffer = buffer[frame_len:]

            pcm16 = float32_to_int16_pcm(frame)
            is_speech = vad.is_speech(pcm16, SAMPLE_RATE)

            if not in_speech:
                ring_buffer.append(frame)
                speech_run = speech_run + 1 if is_speech else 0

                if speech_run >= start_trigger_frames:
                    in_speech = True
                    voiced_frames = list(ring_buffer)
                    ring_buffer.clear()
                    silence_run = 0
                    speech_run = 0
                    voiced_frames.append(frame)
            else:
                voiced_frames.append(frame)
                silence_run = 0 if is_speech else (silence_run + 1)

                if silence_run >= end_trigger_frames or len(voiced_frames) >= max_frames:
                    utterance = np.concatenate(voiced_frames).astype(np.float32)
                    voiced_frames = []
                    in_speech = False
                    silence_run = 0

                    lang, conf = detect_lang_with_confidence(utterance)

                    t0 = time.time()
                    result = model.transcribe(
                        utterance,
                        fp16=False,
                        language=None,
                        task="transcribe",
                        verbose=False,
                    )
                    dt = time.time() - t0

                    text = (result.get("text") or "").strip()

                    out_queue.put(
                        {
                            "type": "asr",
                            "language": lang,
                            "confidence": round(conf, 4),
                            "text": text,
                            "latency_sec": round(dt, 3),
                        }
                    )


# ===== FastAPI lifecycle / endpoints =====
@app.on_event("startup")
def start_mic_thread():
    global _mic_thread_started
    if _mic_thread_started:
        return
    _mic_thread_started = True
    t = threading.Thread(target=mic_worker, args=(events_q,), daemon=True)
    t.start()


@app.get("/health")
def health():
    return {"ok": True}


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            event = await asyncio.to_thread(events_q.get)
            await ws.send_json(event)
    except WebSocketDisconnect:
        pass


@app.post("/i18n/auto-translate")
async def i18n_auto_translate(payload: Dict):
    """
    Request:
    {
      "source_lang": "en",
      "target_lang": "pt",
      "namespace": "translation",
      "texts": { "key": "English text", ... }
    }
    """
    src = normalize_lang_code(payload.get("source_lang"))
    tgt = normalize_lang_code(payload.get("target_lang"))
    texts: Dict = payload.get("texts") or {}

    out: Dict[str, str] = {}
    memo: Dict[str, str] = {}

    for k, v in texts.items():
        s = str(v)
        if s in memo:
            out[str(k)] = memo[s]
            continue
        translated = argos_translate_text(s, src, tgt)
        memo[s] = translated
        out[str(k)] = translated

    return {"target_lang": tgt, "texts": out}