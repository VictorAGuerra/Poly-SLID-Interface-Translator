"""Aplicação FastAPI do poly-server."""

from __future__ import annotations

import asyncio
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

    def recognize_and_publish(audio: np.ndarray) -> None:
        try:
            hub.publish(recognizer.recognize(audio).to_event())
        except Exception:
            log.exception("recognition failed")

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        hub.bind(asyncio.get_running_loop())
        mic = None
        if settings.mic:
            from .mic import MicSource

            segmenter = make_segmenter()

            def on_audio(block: np.ndarray) -> None:
                for utterance in segmenter.feed(block):
                    recognize_and_publish(utterance)

            try:
                mic = MicSource(on_audio, device=settings.mic_device)
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
        """Eventos de reconhecimento do microfone local."""
        await ws.accept()
        q = hub.subscribe()
        try:
            while True:
                await ws.send_json(await q.get())
        except WebSocketDisconnect:
            pass
        finally:
            hub.unsubscribe(q)

    @app.websocket("/ws/audio")
    async def audio(ws: WebSocket):
        """
        Áudio vindo do navegador: mensagens binárias com PCM 16-bit little
        endian, mono, 16 kHz. Os eventos de reconhecimento voltam só para
        este cliente.
        """
        await ws.accept()
        segmenter = make_segmenter()
        try:
            while True:
                data = await ws.receive_bytes()
                for utterance in segmenter.feed(pcm16_to_float32(data)):
                    result = await run_in_threadpool(recognizer.recognize, utterance)
                    await ws.send_json(result.to_event())
        except WebSocketDisconnect:
            pass

    return app
