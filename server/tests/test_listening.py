import numpy as np

from conftest import FakeRecognizer, energy_vad, silence, tone
from poly_server.listening import ListeningController
from poly_server.vad import Segmenter


def make():
    events: list[dict] = []
    rec = FakeRecognizer()
    c = ListeningController(Segmenter(is_speech=energy_vad), rec.recognize, events.append)
    return c, events, rec


def feed(c, audio, block=1600):
    for i in range(0, len(audio), block):
        c.feed(audio[i : i + block])


def speech():
    return np.concatenate([silence(0.3), tone(1.0), silence(1.0)])


def kinds(events):
    return [(e["type"], e.get("listening")) for e in events]


def test_modo_continuo_reconhece_toda_fala():
    c, events, _ = make()
    feed(c, speech())
    feed(c, speech())
    assert kinds(events) == [("speech_start", None), ("asr", None)] * 2


def test_modo_manual_ignora_fala_sem_clique():
    c, events, rec = make()
    c.add_manual_client()
    feed(c, speech())
    assert events == [] and rec.calls == []


def test_modo_manual_escuta_ate_o_silencio_e_para_sozinho():
    c, events, _ = make()
    c.add_manual_client()
    c.start()
    feed(c, speech())
    feed(c, speech())  # depois do silêncio, voltou a ignorar
    assert kinds(events) == [("listening", True), ("speech_start", None), ("asr", None), ("listening", False)]
    assert not c.listening


def test_parar_no_meio_reconhece_o_que_foi_dito():
    c, events, rec = make()
    c.add_manual_client()
    c.start()
    feed(c, np.concatenate([silence(0.2), tone(0.8)]))  # ainda falando
    c.stop()
    assert kinds(events) == [("listening", True), ("speech_start", None), ("asr", None), ("listening", False)]
    assert len(rec.calls[0]) > 16000 * 0.6


def test_parar_sem_ter_falado_so_encerra():
    c, events, rec = make()
    c.add_manual_client()
    c.start()
    feed(c, silence(1.0))
    c.stop()
    assert kinds(events) == [("listening", True), ("listening", False)]
    assert rec.calls == []


def test_ultimo_cliente_manual_saindo_volta_ao_continuo():
    c, events, _ = make()
    c.add_manual_client()
    c.remove_manual_client()
    feed(c, speech())
    assert kinds(events) == [("speech_start", None), ("asr", None)]
