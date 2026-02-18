import collections
import queue
import sys
import time
import asyncio

import numpy as np
import sounddevice as sd
import webrtcvad
import whisper

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

# ===== Config =====
MODEL_NAME = "base"
SAMPLE_RATE = 16000
DEVICE = None  # coloque o índice do microfone se precisar

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

def audio_callback(indata, frames, time_info, status):
    if status:
        print(status, file=sys.stderr)
    audio_q.put(indata.copy())

def float32_to_int16_pcm(x: np.ndarray) -> bytes:
    x = np.clip(x, -1.0, 1.0)
    ints = (x * 32767.0).astype(np.int16)
    return ints.tobytes()

def mic_worker(out_queue: "queue.Queue[dict]"):
    frame_len = int(SAMPLE_RATE * FRAME_MS / 1000)
    start_trigger_frames = max(1, int(START_TRIGGER_MS / FRAME_MS))
    end_trigger_frames = max(1, int(END_TRIGGER_MS / FRAME_MS))
    pre_roll_frames = max(0, int(PRE_ROLL_MS / FRAME_MS))
    max_frames = int(MAX_UTTERANCE_SEC * 1000 / FRAME_MS)

    ring_buffer = collections.deque(maxlen=pre_roll_frames)
    voiced_frames = []
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

                    t0 = time.time()
                    result = model.transcribe(
                        utterance,
                        fp16=False,
                        language=None,
                        task="transcribe",
                        verbose=False,
                    )
                    dt = time.time() - t0

                    lang = result.get("language", "?")
                    text = (result.get("text") or "").strip()

                    out_queue.put({
                        "type": "asr",
                        "language": lang,
                        "text": text,
                        "latency_sec": round(dt, 3),
                    })

# ===== FastAPI =====
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

events_q: "queue.Queue[dict]" = queue.Queue()

@app.on_event("startup")
def start_mic_thread():
    import threading
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
            # pega evento do thread sem travar o loop do FastAPI
            event = await asyncio.to_thread(events_q.get)
            await ws.send_json(event)
    except WebSocketDisconnect:
        pass
