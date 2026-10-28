"""Testes com os modelos reais. Rode com: pytest -m integration"""

import pytest

from poly_server.asr import WhisperRecognizer
from poly_server.translate import ArgosTranslator

pytestmark = pytest.mark.integration


@pytest.mark.parametrize("sample, language", [("en-US.mp3", "en"), ("pt-BR.mp3", "pt"), ("fr-FR.mp3", "fr"), ("ja-JP.mp3", "ja")])
def test_detecta_idioma_das_amostras(sample_audio, sample, language):
    result = WhisperRecognizer("base").recognize(sample_audio(sample))
    assert result.language == language
    assert result.confidence > 0.5
    assert result.text


def test_traducao_com_idioma_intermediario():
    t = ArgosTranslator()
    [out] = t.translate_many(["Bem-vindo ao hotel"], "pt", "es")
    assert out and out != "Bem-vindo ao hotel"
