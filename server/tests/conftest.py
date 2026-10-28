from pathlib import Path

import numpy as np
import pytest

from poly_server.asr import Recognition

SAMPLES = Path(__file__).parent / "samples"


class FakeRecognizer:
    def __init__(self, language="pt", confidence=0.93, text="olá"):
        self.calls: list[np.ndarray] = []
        self.result = Recognition(language, confidence, text, 0.01)

    def recognize(self, audio):
        self.calls.append(audio)
        return self.result


class FakeTranslator:
    """Traduz para "[alvo] texto"; não conhece o par en -> xx."""

    def __init__(self):
        self.calls = 0

    def translate_many(self, texts, source, target):
        from poly_server.translate import UnsupportedLanguagePair

        self.calls += 1
        if target == "xx":
            raise UnsupportedLanguagePair(source, target)
        return [f"[{target}] {t}" for t in texts]


def energy_vad(pcm: bytes, sample_rate: int) -> bool:
    return float(np.abs(np.frombuffer(pcm, dtype=np.int16)).mean()) > 1000


def tone(seconds: float, amplitude: float = 0.5) -> np.ndarray:
    t = np.arange(int(16000 * seconds)) / 16000
    return (amplitude * np.sin(2 * np.pi * 220 * t)).astype(np.float32)


def silence(seconds: float) -> np.ndarray:
    return np.zeros(int(16000 * seconds), dtype=np.float32)


@pytest.fixture
def sample_audio():
    from faster_whisper import decode_audio

    return lambda name: decode_audio(str(SAMPLES / name), sampling_rate=16000)
