"""Configuração do servidor, lida de variáveis de ambiente POLY_*."""

from __future__ import annotations

import os
from dataclasses import dataclass, field, fields
from pathlib import Path
from typing import Any


def _default_cache_dir() -> Path:
    base = os.environ.get("XDG_CACHE_HOME") or Path.home() / ".cache"
    return Path(base) / "poly-server"


@dataclass
class Settings:
    host: str = "127.0.0.1"
    port: int = 8000
    # Origens liberadas no CORS. "*" libera qualquer uma.
    cors_origins: list[str] = field(default_factory=lambda: ["*"])

    # Captura o microfone do próprio computador (modo quiosque). Com False,
    # o áudio só chega pelo navegador, via WebSocket /ws/audio.
    mic: bool = True
    # Índice ou nome do dispositivo de entrada (veja `poly-server devices`).
    mic_device: int | str | None = None

    # Modelo do faster-whisper: tiny, base, small, medium, large-v3...
    whisper_model: str = "base"
    whisper_device: str = "auto"  # auto, cpu, cuda
    whisper_compute_type: str = "int8"

    # Segmentação da fala
    vad_mode: int = 2  # 0 = menos agressivo, 3 = mais agressivo
    frame_ms: int = 30  # webrtcvad aceita 10, 20 ou 30
    pre_roll_ms: int = 200
    start_trigger_ms: int = 150
    end_trigger_ms: int = 600
    max_utterance_sec: float = 12.0

    cache_dir: Path = field(default_factory=_default_cache_dir)
    # Baixa pacotes de tradução sob demanda. Em quiosque offline, deixe False
    # e use `poly-server download` na instalação.
    auto_download: bool = True

    @classmethod
    def from_env(cls, **overrides: Any) -> "Settings":
        values: dict[str, Any] = {}
        for f in fields(cls):
            raw = os.environ.get(f"POLY_{f.name.upper()}")
            if raw is not None:
                values[f.name] = _parse(f.name, raw)
        values.update({k: v for k, v in overrides.items() if v is not None})
        return cls(**values)


def _parse(name: str, raw: str) -> Any:
    if name in {"port", "vad_mode", "frame_ms", "pre_roll_ms", "start_trigger_ms", "end_trigger_ms"}:
        return int(raw)
    if name == "max_utterance_sec":
        return float(raw)
    if name in {"mic", "auto_download"}:
        return raw.strip().lower() in {"1", "true", "yes", "on"}
    if name == "cors_origins":
        return [o.strip() for o in raw.split(",") if o.strip()]
    if name == "cache_dir":
        return Path(raw).expanduser()
    if name == "mic_device":
        return int(raw) if raw.isdigit() else raw
    return raw
