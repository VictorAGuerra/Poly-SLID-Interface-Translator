import collections
import queue
import sys
import time

import numpy as np
import sounddevice as sd
import whisper
import webrtcvad

MODEL_NAME = "base"
SAMPLE_RATE = 16000
DEVICE = None

# VAD settings
VAD_MODE = 2              # 0=menos agressivo, 3=mais agressivo
FRAME_MS = 30             # 10/20/30 (webrtcvad aceita só esses)
PRE_ROLL_MS = 200         # guarda um pouco antes da fala começar
START_TRIGGER_MS = 150    # quanto tempo de "fala" pra iniciar gravação
END_TRIGGER_MS = 600      # quanto tempo de "silêncio" pra encerrar

MAX_UTTERANCE_SEC = 12    # segurança: evita chunks infinitos

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

def main():
    print("Listening with VAD... (Ctrl+C to stop)")
    print(f"{SAMPLE_RATE=}Hz | {FRAME_MS=}ms | VAD_MODE={VAD_MODE}")

    frame_len = int(SAMPLE_RATE * FRAME_MS / 1000)
    start_trigger_frames = max(1, int(START_TRIGGER_MS / FRAME_MS))
    end_trigger_frames = max(1, int(END_TRIGGER_MS / FRAME_MS))
    pre_roll_frames = max(0, int(PRE_ROLL_MS / FRAME_MS))

    ring_buffer = collections.deque(maxlen=pre_roll_frames)
    voiced_frames = []
    in_speech = False

    speech_run = 0
    silence_run = 0

    max_frames = int(MAX_UTTERANCE_SEC * 1000 / FRAME_MS)

    buffer = np.zeros((0,), dtype=np.float32)

    with sd.InputStream(
        samplerate=SAMPLE_RATE,
        channels=1,
        dtype="float32",
        callback=audio_callback,
        device=DEVICE,
        blocksize=0,
    ):
        try:
            while True:
                # acumula áudio do callback até ter pelo menos 1 frame VAD
                while len(buffer) < frame_len:
                    data = audio_q.get()
                    buffer = np.concatenate([buffer, data[:, 0]])

                frame = buffer[:frame_len]
                buffer = buffer[frame_len:]

                pcm16 = float32_to_int16_pcm(frame)
                is_speech = vad.is_speech(pcm16, SAMPLE_RATE)

                if not in_speech:
                    ring_buffer.append(frame)

                    if is_speech:
                        speech_run += 1
                    else:
                        speech_run = 0

                    if speech_run >= start_trigger_frames:
                        in_speech = True
                        # começa com pre-roll pra não cortar o início
                        voiced_frames = list(ring_buffer)
                        ring_buffer.clear()
                        silence_run = 0
                        speech_run = 0
                        # já adiciona frame atual
                        voiced_frames.append(frame)
                else:
                    voiced_frames.append(frame)

                    if is_speech:
                        silence_run = 0
                    else:
                        silence_run += 1

                    # encerra se ficou silêncio por tempo suficiente
                    # ou se passou do limite máximo
                    if silence_run >= end_trigger_frames or len(voiced_frames) >= max_frames:
                        utterance = np.concatenate(voiced_frames).astype(np.float32)
                        voiced_frames = []
                        in_speech = False
                        silence_run = 0

                        # manda pro whisper
                        t0 = time.time()
                        result = model.transcribe(
                            utterance,
                            fp16=False,
                            language=None,
                            task="transcribe",
                            verbose=False
                        )
                        dt = time.time() - t0

                        lang = result.get("language", "?")
                        text = (result.get("text") or "").strip()
                        if text:
                            print(f"[{lang}] ({dt:.2f}s) {text}")

        except KeyboardInterrupt:
            print("\nStopped.")

if __name__ == "__main__":
    main()
