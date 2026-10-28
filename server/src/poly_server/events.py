"""Distribui eventos de reconhecimento para todos os clientes conectados."""

from __future__ import annotations

import asyncio


class EventHub:
    """
    Cada cliente do WebSocket /ws recebe todos os eventos. (Na versão anterior
    havia uma fila única, e com duas abas abertas cada evento ia só para uma.)
    """

    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[dict]] = set()
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def subscribe(self) -> asyncio.Queue[dict]:
        q: asyncio.Queue[dict] = asyncio.Queue(maxsize=100)
        self._subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue[dict]) -> None:
        self._subscribers.discard(q)

    def _deliver(self, event: dict) -> None:
        for q in list(self._subscribers):
            if q.full():
                q.get_nowait()  # cliente lento: descarta o evento mais antigo
            q.put_nowait(event)

    def publish(self, event: dict) -> None:
        """Pode ser chamado de qualquer thread."""
        if self._loop is None:
            return
        self._loop.call_soon_threadsafe(self._deliver, event)
