from conftest import FakeTranslator
from poly_server.translate import ArgosTranslator, CachedTranslator, UnsupportedLanguagePair, normalize_lang

import pytest


def test_normaliza_codigos():
    assert normalize_lang("pt-BR") == "pt"
    assert normalize_lang(" EN_us ") == "en"
    assert normalize_lang(None) == "en"


def test_cache_persiste_em_disco(tmp_path):
    inner = FakeTranslator()
    db = tmp_path / "t.sqlite"

    first = CachedTranslator(inner, db)
    assert first.translate_many(["hi", "bye", "hi"], "en", "pt") == ["[pt] hi", "[pt] bye", "[pt] hi"]
    assert inner.calls == 1

    # nova instância (ex.: servidor reiniciado) reaproveita o cache
    second = CachedTranslator(inner, db)
    assert second.translate_many(["bye", "new"], "en-US", "pt-BR") == ["[pt] bye", "[pt] new"]
    assert inner.calls == 2


def test_argos_usa_idioma_intermediario(monkeypatch):
    t = ArgosTranslator(auto_download=False)
    installed = {("pt", "en"), ("en", "ja")}
    monkeypatch.setattr(t, "_installed_pairs", lambda: installed)
    t.ensure_pair("pt", "ja")  # não levanta: pt -> en -> ja

    with pytest.raises(UnsupportedLanguagePair):
        t.ensure_pair("pt", "fr")  # falta en -> fr e não pode baixar
