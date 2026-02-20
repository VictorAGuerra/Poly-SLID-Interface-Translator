# backend/main.py
import asyncio
import collections
import queue
import sys
import threading
import time

import numpy as np
import sounddevice as sd
import webrtcvad
import whisper
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

# ===== Config =====
MODEL_NAME = "base"
SAMPLE_RATE = 16000
DEVICE = None  # set device index if needed (sd.query_devices())

# VAD settings
VAD_MODE = 2
FRAME_MS = 30
PRE_ROLL_MS = 200
START_TRIGGER_MS = 150
END_TRIGGER_MS = 600
MAX_UTTERANCE_SEC = 12

# ===== Whisper + VAD =====
model = whisper.load_model(MODEL_NAME)
vad = webrtcvad.Vad(VAD_MODE)

audio_q: "queue.Queue[np.ndarray]" = queue.Queue()
events_q: "queue.Queue[dict]" = queue.Queue()


def audio_callback(indata, frames, time_info, status):
    if status:
        print(status, file=sys.stderr)
    audio_q.put(indata.copy())


def float32_to_int16_pcm(x: np.ndarray) -> bytes:
    x = np.clip(x, -1.0, 1.0)
    ints = (x * 32767.0).astype(np.int16)
    return ints.tobytes()


def detect_lang_with_confidence(audio_np: np.ndarray) -> tuple[str, float]:
    """
    Uses Whisper's language detector to get (lang, confidence) where confidence is [0..1].
    """
    audio = whisper.pad_or_trim(audio_np)
    mel = whisper.log_mel_spectrogram(audio).to(model.device)
    _, probs = model.detect_language(mel)

    lang = max(probs, key=probs.get)
    conf = float(probs[lang])
    return lang, conf


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

                    # ✅ language + confidence
                    lang, conf = detect_lang_with_confidence(utterance)

                    # transcription
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
                            "confidence": round(conf, 4),  # 0..1
                            "text": text,
                            "latency_sec": round(dt, 3),
                        }
                    )


# ===== FastAPI =====
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_mic_thread_started = False


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