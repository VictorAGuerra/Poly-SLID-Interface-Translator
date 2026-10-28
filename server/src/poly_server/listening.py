"""Controle de escuta do microfone local: contínua ou sob demanda (botão)."""

from __future__ import annotations

import logging
import threading
from typing import Callable

import numpy as np

from .asr import Recognition
from .vad import Segmenter

log = logging.getLogger("poly_server")


class ListeningController:
    """
    Recebe o áudio do microfone local e decide o que vai para o
    reconhecimento.

    - Modo contínuo (padrão): toda fala detectada é reconhecida.
    - Modo manual: enquanto algum cliente pedir `listening: "manual"`, o áudio
      só é processado entre `start()` e o fim da fala (silêncio) ou `stop()`.
    """

    def __init__(
        self,
        segmenter: Segmenter,
        recognize: Callable[[np.ndarray], Recognition],
        publish: Callable[[dict], None],
    ) -> None:
        self._segmenter = segmenter
        self._recognize = recognize
        self._publish = publish
        self._lock = threading.Lock()
        self._manual_clients = 0
        self._listening = False

    @property
    def manual(self) -> bool:
        return self._manual_clients > 0

    @property
    def listening(self) -> bool:
        return self._listening

    def add_manual_client(self) -> None:
        with self._lock:
            self._manual_clients += 1
            self._reset()

    def remove_manual_client(self) -> None:
        with self._lock:
            self._manual_clients = max(0, self._manual_clients - 1)
            if self._manual_clients == 0:
                self._listening = False

    def start(self) -> None:
        with self._lock:
            self._reset()
            self._listening = True
        self._publish({"type": "listening", "listening": True})

    def stop(self) -> None:
        """Para de escutar e reconhece o que já foi dito, se houver."""
        with self._lock:
            was_listening = self._listening
            self._listening = False
            pending = self._segmenter.flush()
            self._reset()
        if pending is not None:
            self._emit(pending)
        if was_listening:
            self._publish({"type": "listening", "listening": False})

    def feed(self, block: np.ndarray) -> None:
        """Chamado pela thread do microfone."""
        with self._lock:
            if self.manual and not self._listening:
                return
            utterances = self._segmenter.feed(block)
            ended = bool(utterances) and self.manual
            if ended:
                # Fim da fala (silêncio): a escuta manual termina aqui.
                self._listening = False
                self._reset()
        for u in utterances:
            self._emit(u)
        if ended:
            self._publish({"type": "listening", "listening": False})

    def _emit(self, audio: np.ndarray) -> None:
        try:
            self._publish(self._recognize(audio).to_event())
        except Exception:
            log.exception("recognition failed")

    def _reset(self) -> None:
        self._segmenter.reset()
