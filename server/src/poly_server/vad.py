"""Separa o áudio contínuo em falas (utterances) usando detecção de voz."""

from __future__ import annotations

import collections
from typing import Callable

import numpy as np

SAMPLE_RATE = 16000

IsSpeech = Callable[[bytes, int], bool]


def float32_to_pcm16(x: np.ndarray) -> bytes:
    return (np.clip(x, -1.0, 1.0) * 32767.0).astype(np.int16).tobytes()


def pcm16_to_float32(data: bytes) -> np.ndarray:
    return np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0


class Segmenter:
    """
    Recebe áudio mono 16 kHz em blocos de qualquer tamanho e devolve as falas
    completas: começa quando há voz por `start_trigger_ms`, termina após
    `end_trigger_ms` de silêncio ou ao atingir `max_utterance_sec`.
    """

    def __init__(
        self,
        *,
        vad_mode: int = 2,
        frame_ms: int = 30,
        pre_roll_ms: int = 200,
        start_trigger_ms: int = 150,
        end_trigger_ms: int = 600,
        max_utterance_sec: float = 12.0,
        is_speech: IsSpeech | None = None,
    ) -> None:
        if is_speech is None:
            import webrtcvad

            is_speech = webrtcvad.Vad(vad_mode).is_speech
        self._is_speech = is_speech

        self.frame_len = int(SAMPLE_RATE * frame_ms / 1000)
        self._start_frames = max(1, start_trigger_ms // frame_ms)
        self._end_frames = max(1, end_trigger_ms // frame_ms)
        self._max_frames = int(max_utterance_sec * 1000 / frame_ms)

        self._ring: collections.deque[np.ndarray] = collections.deque(
            maxlen=max(0, pre_roll_ms // frame_ms)
        )
        self._voiced: list[np.ndarray] = []
        self._in_speech = False
        self._speech_run = 0
        self._silence_run = 0
        self._buffer = np.zeros((0,), dtype=np.float32)

    def feed(self, samples: np.ndarray) -> list[np.ndarray]:
        self._buffer = np.concatenate([self._buffer, samples.astype(np.float32, copy=False)])
        done: list[np.ndarray] = []

        while len(self._buffer) >= self.frame_len:
            frame = self._buffer[: self.frame_len]
            self._buffer = self._buffer[self.frame_len :]
            speech = self._is_speech(float32_to_pcm16(frame), SAMPLE_RATE)

            if not self._in_speech:
                self._ring.append(frame)
                self._speech_run = self._speech_run + 1 if speech else 0
                if self._speech_run >= self._start_frames:
                    self._in_speech = True
                    self._voiced = list(self._ring)
                    self._ring.clear()
                    self._speech_run = 0
                    self._silence_run = 0
            else:
                self._voiced.append(frame)
                self._silence_run = 0 if speech else self._silence_run + 1
                if self._silence_run >= self._end_frames or len(self._voiced) >= self._max_frames:
                    done.append(np.concatenate(self._voiced))
                    self._voiced = []
                    self._in_speech = False
                    self._silence_run = 0

        return done

    @property
    def in_speech(self) -> bool:
        return self._in_speech

    def reset(self) -> None:
        """Descarta tudo o que estava em andamento."""
        self._ring.clear()
        self._voiced = []
        self._in_speech = False
        self._speech_run = 0
        self._silence_run = 0
        self._buffer = np.zeros((0,), dtype=np.float32)

    def flush(self) -> np.ndarray | None:
        """Entrega a fala em andamento, se houver (ex.: ao fechar a conexão)."""
        if not self._in_speech or not self._voiced:
            return None
        out = np.concatenate(self._voiced)
        self._voiced = []
        self._in_speech = False
        return out
