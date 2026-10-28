"""Tradução de textos: Argos Translate (offline) + cache em disco."""

from __future__ import annotations

import logging
import sqlite3
import threading
from pathlib import Path
from typing import Protocol

log = logging.getLogger("poly_server")


class UnsupportedLanguagePair(Exception):
    def __init__(self, source: str, target: str) -> None:
        super().__init__(f"no translation available for {source} -> {target}")
        self.source = source
        self.target = target


class Translator(Protocol):
    def translate_many(self, texts: list[str], source: str, target: str) -> list[str]: ...


def normalize_lang(code: str | None) -> str:
    if not code:
        return "en"
    return str(code).strip().lower().replace("_", "-").split("-")[0]


class ArgosTranslator:
    """
    Usa os pacotes do Argos instalados e, se `auto_download`, baixa os que
    faltarem. Quando não existe pacote direto (ex.: pt -> ja), traduz passando
    pelo idioma `pivot` (inglês), que é como a maioria dos pacotes do Argos é
    publicada.
    """

    def __init__(self, *, auto_download: bool = True, pivot: str = "en") -> None:
        self.auto_download = auto_download
        self.pivot = pivot
        self._ready: set[tuple[str, str]] = set()
        self._lock = threading.Lock()
        self._index_updated = False

    def _installed_pairs(self) -> set[tuple[str, str]]:
        from argostranslate import package

        return {(p.from_code, p.to_code) for p in package.get_installed_packages()}

    def _install(self, source: str, target: str) -> bool:
        from argostranslate import package

        if not self.auto_download:
            return False
        if not self._index_updated:
            package.update_package_index()
            self._index_updated = True
        pkg = next(
            (p for p in package.get_available_packages() if p.from_code == source and p.to_code == target),
            None,
        )
        if pkg is None:
            return False
        log.info("Argos: installing %s -> %s", source, target)
        package.install_from_path(pkg.download())
        return True

    def _ensure_direct(self, source: str, target: str) -> bool:
        if (source, target) in self._installed_pairs():
            return True
        return self._install(source, target)

    def ensure_pair(self, source: str, target: str) -> None:
        if source == target or (source, target) in self._ready:
            return
        with self._lock:
            if (source, target) in self._ready:
                return
            ok = self._ensure_direct(source, target)
            if not ok and self.pivot not in (source, target):
                ok = self._ensure_direct(source, self.pivot) and self._ensure_direct(self.pivot, target)
            if not ok:
                raise UnsupportedLanguagePair(source, target)
            self._ready.add((source, target))

    def _translate_one(self, text: str, source: str, target: str) -> str:
        from argostranslate import translate

        if (source, target) in self._installed_pairs():
            return translate.translate(text, source, target)
        middle = translate.translate(text, source, self.pivot)
        return translate.translate(middle, self.pivot, target)

    def translate_many(self, texts: list[str], source: str, target: str) -> list[str]:
        source, target = normalize_lang(source), normalize_lang(target)
        if source == target:
            return list(texts)
        self.ensure_pair(source, target)
        memo: dict[str, str] = {}
        out = []
        for t in texts:
            if t not in memo:
                memo[t] = self._translate_one(t, source, target) if t.strip() else t
            out.append(memo[t])
        return out


class CachedTranslator:
    """Guarda as traduções em SQLite: o mesmo texto não é traduzido duas vezes."""

    def __init__(self, inner: Translator, path: Path) -> None:
        self.inner = inner
        path.parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(path, check_same_thread=False)
        self._db.execute(
            "CREATE TABLE IF NOT EXISTS translations ("
            " source TEXT, target TEXT, text TEXT, translation TEXT,"
            " PRIMARY KEY (source, target, text))"
        )
        self._db.commit()
        self._lock = threading.Lock()

    def translate_many(self, texts: list[str], source: str, target: str) -> list[str]:
        source, target = normalize_lang(source), normalize_lang(target)
        found: dict[str, str] = {}
        unique = list(dict.fromkeys(texts))

        with self._lock:
            for i in range(0, len(unique), 500):
                chunk = unique[i : i + 500]
                rows = self._db.execute(
                    "SELECT text, translation FROM translations WHERE source = ? AND target = ?"
                    f" AND text IN ({','.join('?' * len(chunk))})",
                    [source, target, *chunk],
                ).fetchall()
                found.update(rows)

        missing = [t for t in unique if t not in found]
        if missing:
            translated = self.inner.translate_many(missing, source, target)
            new = dict(zip(missing, translated))
            found.update(new)
            with self._lock:
                self._db.executemany(
                    "INSERT OR REPLACE INTO translations VALUES (?, ?, ?, ?)",
                    [(source, target, k, v) for k, v in new.items()],
                )
                self._db.commit()

        return [found[t] for t in texts]
