import numpy as np

from conftest import energy_vad, silence, tone
from poly_server.vad import Segmenter, float32_to_pcm16, pcm16_to_float32


def make(**kw):
    return Segmenter(is_speech=energy_vad, **kw)


def test_detecta_uma_fala_entre_silencios():
    seg = make()
    audio = np.concatenate([silence(0.5), tone(1.0), silence(1.0)])
    # entrega em blocos de tamanhos irregulares, como chega do microfone/rede
    out = []
    for i in range(0, len(audio), 1234):
        out += seg.feed(audio[i : i + 1234])
    assert len(out) == 1
    # fala (1 s) + pre-roll (0,2 s) + silêncio final (0,6 s), aproximadamente
    assert 1.5 < len(out[0]) / 16000 < 2.0


def test_ignora_ruido_curto():
    seg = make()
    assert seg.feed(np.concatenate([silence(0.3), tone(0.06), silence(1.0)])) == []


def test_corta_fala_longa_no_maximo():
    seg = make(max_utterance_sec=2.0)
    out = seg.feed(tone(5.0))
    assert len(out) == 2
    assert all(len(u) / 16000 <= 2.2 for u in out)


def test_flush_entrega_fala_em_andamento():
    seg = make()
    assert seg.feed(tone(1.0)) == []
    rest = seg.flush()
    assert rest is not None and len(rest) > 16000 * 0.8
    assert seg.flush() is None


def test_conversao_pcm16_ida_e_volta():
    x = tone(0.1)
    assert np.allclose(pcm16_to_float32(float32_to_pcm16(x)), x, atol=1e-4)
