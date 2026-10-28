"""Captura do microfone local (modo quiosque)."""

from __future__ import annotations

import logging
import queue
import threading
from typing import Callable

import numpy as np

from .vad import SAMPLE_RATE

log = logging.getLogger("poly_server")


def _sounddevice():
    try:
        import sounddevice
    except (ImportError, OSError) as e:  # OSError: PortAudio ausente no sistema
        raise RuntimeError(
            "Local microphone capture needs sounddevice + PortAudio: "
            "pip install 'poly-server[mic]' (and libportaudio2 on Linux)."
        ) from e
    return sounddevice


def list_input_devices() -> list[dict]:
    sd = _sounddevice()
    return [
        {"index": i, "name": d["name"], "channels": d["max_input_channels"]}
        for i, d in enumerate(sd.query_devices())
        if d["max_input_channels"] > 0
    ]


class MicSource:
    """Lê o microfone numa thread e entrega blocos float32 mono 16 kHz."""

    def __init__(self, on_audio: Callable[[np.ndarray], None], device: int | str | None = None) -> None:
        self._on_audio = on_audio
        self._device = device
        self._queue: queue.Queue[np.ndarray] = queue.Queue()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        sd = _sounddevice()

        def callback(indata, frames, time_info, status):
            if status:
                log.warning("mic: %s", status)
            self._queue.put(indata[:, 0].copy())

        def run():
            try:
                with sd.InputStream(
                    samplerate=SAMPLE_RATE,
                    channels=1,
                    dtype="float32",
                    callback=callback,
                    device=self._device,
                ):
                    log.info("mic: capturing from %s", self._device if self._device is not None else "default device")
                    while not self._stop.is_set():
                        try:
                            block = self._queue.get(timeout=0.5)
                        except queue.Empty:
                            continue
                        self._on_audio(block)
            except Exception:
                log.exception("mic: capture stopped")

        self._thread = threading.Thread(target=run, name="poly-mic", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
