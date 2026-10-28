import asyncio

import numpy as np
import pytest
from fastapi.testclient import TestClient

from conftest import FakeRecognizer, FakeTranslator, energy_vad, silence, tone
from poly_server import Settings, create_app
from poly_server.events import EventHub
from poly_server.vad import Segmenter, float32_to_pcm16


@pytest.fixture
def make_client(tmp_path):
    def make(**kw):
        settings = Settings(mic=False, cache_dir=tmp_path)
        app = create_app(
            settings,
            recognizer=kw.get("recognizer", FakeRecognizer()),
            translator=kw.get("translator", FakeTranslator()),
            segmenter_factory=kw.get("segmenter_factory"),
        )
        return TestClient(app)

    return make


def test_health(make_client):
    with make_client() as c:
        assert c.get("/health").json() == {"ok": True, "version": "0.1.0", "mic": False}


def test_traduz_mantendo_as_chaves(make_client):
    with make_client() as c:
        r = c.post("/i18n/auto-translate", json={"source_lang": "en", "target_lang": "pt", "texts": {"a": "Hi", "b": "Bye"}})
        assert r.status_code == 200
        assert r.json() == {"target_lang": "pt", "texts": {"a": "[pt] Hi", "b": "[pt] Bye"}}


def test_par_sem_traducao_retorna_422_explicativo(make_client):
    with make_client() as c:
        r = c.post("/i18n/auto-translate", json={"source_lang": "en", "target_lang": "xx", "texts": {"a": "Hi"}})
        assert r.status_code == 422
        assert r.json()["detail"]["code"] == "unsupported_language_pair"


def test_audio_do_navegador_vira_evento(make_client):
    rec = FakeRecognizer(language="ja", text="こんにちは")
    with make_client(recognizer=rec, segmenter_factory=lambda: Segmenter(is_speech=energy_vad)) as c:
        with c.websocket_connect("/ws/audio") as ws:
            audio = np.concatenate([silence(0.3), tone(1.0), silence(1.0)])
            for i in range(0, len(audio), 4096):  # ~256 ms por mensagem
                ws.send_bytes(float32_to_pcm16(audio[i : i + 4096]))
            event = ws.receive_json()
    assert event == {"type": "asr", "language": "ja", "confidence": 0.93, "text": "こんにちは", "latency_sec": 0.01}
    assert len(rec.calls) == 1


def test_audio_real_com_vad_real(make_client, sample_audio):
    rec = FakeRecognizer()
    with make_client(recognizer=rec) as c:
        with c.websocket_connect("/ws/audio") as ws:
            audio = np.concatenate([sample_audio("pt-BR.mp3"), silence(1.0)])
            for i in range(0, len(audio), 4096):
                ws.send_bytes(float32_to_pcm16(audio[i : i + 4096]))
            assert ws.receive_json()["type"] == "asr"


def test_hub_entrega_para_todos_os_clientes():
    async def scenario():
        hub = EventHub()
        hub.bind(asyncio.get_running_loop())
        a, b = hub.subscribe(), hub.subscribe()
        hub.publish({"n": 1})
        await asyncio.sleep(0)
        return a.get_nowait(), b.get_nowait()

    assert asyncio.run(scenario()) == ({"n": 1}, {"n": 1})
