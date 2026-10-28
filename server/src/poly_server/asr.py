"""Reconhecimento de fala: idioma + transcrição."""

from __future__ import annotations

import threading
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Protocol

import numpy as np


@dataclass
class Recognition:
    language: str
    confidence: float
    text: str
    latency_sec: float

    def to_event(self) -> dict:
        return {"type": "asr", **asdict(self)}


class Recognizer(Protocol):
    def recognize(self, audio: np.ndarray) -> Recognition: ...


class WhisperRecognizer:
    """faster-whisper. O modelo é carregado na primeira fala (ou em `load()`)."""

    def __init__(
        self,
        model: str = "base",
        *,
        device: str = "auto",
        compute_type: str = "int8",
        download_root: Path | None = None,
    ) -> None:
        self._model_name = model
        self._device = device
        self._compute_type = compute_type
        self._download_root = download_root
        self._model = None
        self._lock = threading.Lock()

    def load(self):
        with self._lock:
            if self._model is None:
                from faster_whisper import WhisperModel

                self._model = WhisperModel(
                    self._model_name,
                    device=self._device,
                    compute_type=self._compute_type,
                    download_root=str(self._download_root) if self._download_root else None,
                )
        return self._model

    def recognize(self, audio: np.ndarray) -> Recognition:
        model = self.load()
        t0 = time.time()
        # Um modelo por vez: em CPU, rodar duas falas em paralelo só deixa as duas lentas.
        with self._lock:
            segments, info = model.transcribe(
                audio,
                beam_size=1,
                condition_on_previous_text=False,
            )
            text = "".join(s.text for s in segments).strip()
        return Recognition(
            language=info.language,
            confidence=round(float(info.language_probability), 4),
            text=text,
            latency_sec=round(time.time() - t0, 3),
        )
