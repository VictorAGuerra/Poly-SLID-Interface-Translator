"""Aplicação FastAPI do poly-server."""

from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from typing import Callable

import numpy as np
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from . import __version__
from .asr import Recognizer, WhisperRecognizer
from .config import Settings
from .events import EventHub
from .listening import ListeningController
from .translate import ArgosTranslator, CachedTranslator, Translator, UnsupportedLanguagePair
from .vad import Segmenter, pcm16_to_float32

log = logging.getLogger("poly_server")


class TranslateRequest(BaseModel):
    source_lang: str = "en"
    target_lang: str
    texts: dict[str, str] = Field(default_factory=dict)


class TranslateResponse(BaseModel):
    target_lang: str
    texts: dict[str, str]


def create_app(
    settings: Settings | None = None,
    *,
    recognizer: Recognizer | None = None,
    translator: Translator | None = None,
    segmenter_factory: Callable[[], Segmenter] | None = None,
) -> FastAPI:
    """
    Cria o app. `recognizer`, `translator` e `segmenter_factory` podem ser
    trocados (testes, outro motor de tradução, outro modelo de voz).
    """
    settings = settings or Settings.from_env()
    recognizer = recognizer or WhisperRecognizer(
        settings.whisper_model,
        device=settings.whisper_device,
        compute_type=settings.whisper_compute_type,
        download_root=settings.cache_dir / "whisper",
    )
    translator = translator or CachedTranslator(
        ArgosTranslator(auto_download=settings.auto_download),
        settings.cache_dir / "translations.sqlite",
    )

    def make_segmenter() -> Segmenter:
        if segmenter_factory:
            return segmenter_factory()
        return Segmenter(
            vad_mode=settings.vad_mode,
            frame_ms=settings.frame_ms,
            pre_roll_ms=settings.pre_roll_ms,
            start_trigger_ms=settings.start_trigger_ms,
            end_trigger_ms=settings.end_trigger_ms,
            max_utterance_sec=settings.max_utterance_sec,
        )

    hub = EventHub()
    state = {"mic": False}

    controller = ListeningController(make_segmenter(), recognizer.recognize, hub.publish)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        hub.bind(asyncio.get_running_loop())
        mic = None
        if settings.mic:
            from .mic import MicSource

            try:
                mic = MicSource(controller.feed, device=settings.mic_device)
                mic.start()
                state["mic"] = True
            except RuntimeError as e:
                log.warning("%s Continuing without local microphone.", e)
        yield
        if mic:
            mic.stop()

    app = FastAPI(title="poly-server", version=__version__, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health():
        return {"ok": True, "version": __version__, "mic": state["mic"]}

    @app.post("/i18n/auto-translate", response_model=TranslateResponse)
    def auto_translate(req: TranslateRequest):
        keys = list(req.texts.keys())
        try:
            values = translator.translate_many([req.texts[k] for k in keys], req.source_lang, req.target_lang)
        except UnsupportedLanguagePair as e:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "unsupported_language_pair",
                    "source": e.source,
                    "target": e.target,
                    "message": str(e),
                },
            ) from e
        return TranslateResponse(target_lang=req.target_lang, texts=dict(zip(keys, values)))

    @app.websocket("/ws")
    async def events(ws: WebSocket):
        """
        Eventos do microfone local, para todos os clientes. Comandos aceitos:
        {"type": "config", "listening": "manual"} e
        {"type": "listen", "action": "start" | "stop"}.
        """
        await ws.accept()
        q = hub.subscribe()
        manual = False

        async def send_events():
            while True:
                await ws.send_json(await q.get())

        async def receive_commands():
            nonlocal manual
            while True:
                msg = await ws.receive_json()
                kind = msg.get("type")
                if kind == "config" and msg.get("listening") == "manual" and not manual:
                    manual = True
                    controller.add_manual_client()
                    await ws.send_json({"type": "listening", "listening": controller.listening})
                elif kind == "listen" and msg.get("action") == "start":
                    await run_in_threadpool(controller.start)
                elif kind == "listen" and msg.get("action") == "stop":
                    await run_in_threadpool(controller.stop)

        tasks = [asyncio.create_task(send_events()), asyncio.create_task(receive_commands())]
        try:
            done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for t in done:
                if t.exception() and not isinstance(t.exception(), WebSocketDisconnect):
                    log.warning("ws: %s", t.exception())
        finally:
            for t in tasks:
                t.cancel()
            hub.unsubscribe(q)
            if manual:
                controller.remove_manual_client()

    @app.websocket("/ws/audio")
    async def audio(ws: WebSocket):
        """
        Áudio vindo do navegador: mensagens binárias com PCM 16-bit little
        endian, mono, 16 kHz. Os eventos de reconhecimento voltam só para
        este cliente, precedidos de {"type": "utterance_end"} quando a fala
        termina. Mensagens de texto: {"type": "flush"} reconhece a fala em
        andamento (botão "parar"); {"type": "reset"} descarta o áudio.
        """
        await ws.accept()
        segmenter = make_segmenter()

        async def recognize_and_send(utterance: np.ndarray) -> None:
            result = await run_in_threadpool(recognizer.recognize, utterance)
            await ws.send_json(result.to_event())

        try:
            while True:
                msg = await ws.receive()
                if msg["type"] == "websocket.disconnect":
                    break
                if msg.get("bytes") is not None:
                    for utterance in segmenter.feed(pcm16_to_float32(msg["bytes"])):
                        # Avisa já, antes de reconhecer (leva segundos): no
                        # modo manual o navegador fecha o microfone aqui.
                        await ws.send_json({"type": "utterance_end"})
                        await recognize_and_send(utterance)
                elif msg.get("text"):
                    kind = json.loads(msg["text"]).get("type")
                    if kind == "flush":
                        pending = segmenter.flush()
                        segmenter.reset()
                        if pending is not None:
                            await recognize_and_send(pending)
                    elif kind == "reset":
                        segmenter.reset()
        except WebSocketDisconnect:
            pass

    return app
