"""Linha de comando: poly-server serve | download | devices."""

from __future__ import annotations

import argparse
import logging
import sys

from . import __version__
from .config import Settings


def _serve(args: argparse.Namespace) -> None:
    import uvicorn

    from .app import create_app

    settings = Settings.from_env(
        host=args.host,
        port=args.port,
        whisper_model=args.model,
        mic_device=args.mic_device,
        cors_origins=args.cors.split(",") if args.cors else None,
        mic=False if args.no_mic else None,
        auto_download=False if args.offline else None,
    )
    uvicorn.run(create_app(settings), host=settings.host, port=settings.port)


def _download(args: argparse.Namespace) -> None:
    """Prepara uma instalação offline: modelo de voz + pacotes de tradução."""
    from .asr import WhisperRecognizer
    from .translate import ArgosTranslator, UnsupportedLanguagePair

    settings = Settings.from_env(whisper_model=args.model)

    print(f"Downloading speech model '{settings.whisper_model}'...")
    WhisperRecognizer(settings.whisper_model, download_root=settings.cache_dir / "whisper").load()

    translator = ArgosTranslator(auto_download=True)
    targets = [t.strip() for t in args.languages.split(",") if t.strip()]
    failed = []
    for target in targets:
        print(f"Translation {args.base} -> {target}...")
        try:
            translator.ensure_pair(args.base, target)
        except UnsupportedLanguagePair:
            failed.append(target)
    if failed:
        print(f"No translation package available for: {', '.join(failed)}", file=sys.stderr)
        sys.exit(1)
    print("Done.")


def _devices(_: argparse.Namespace) -> None:
    from .mic import list_input_devices

    for d in list_input_devices():
        print(f"{d['index']:>3}  {d['name']}  ({d['channels']} ch)")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="poly-server", description="Speech language detection + UI translation server for Poly.")
    parser.add_argument("--version", action="version", version=__version__)
    sub = parser.add_subparsers(dest="command", required=True)

    serve = sub.add_parser("serve", help="start the server")
    serve.add_argument("--host")
    serve.add_argument("--port", type=int)
    serve.add_argument("--model", help="whisper model: tiny, base, small, medium, large-v3")
    serve.add_argument("--mic-device", help="input device index or name (see `poly-server devices`)")
    serve.add_argument("--no-mic", action="store_true", help="don't capture the local microphone (browser audio only)")
    serve.add_argument("--cors", help="comma-separated allowed origins (default: *)")
    serve.add_argument("--offline", action="store_true", help="never download translation packages")
    serve.set_defaults(func=_serve)

    download = sub.add_parser("download", help="download models for offline use")
    download.add_argument("--base", default="en", help="language your UI is written in (default: en)")
    download.add_argument("--languages", required=True, help="comma-separated target languages, e.g. pt,es,fr,ar")
    download.add_argument("--model", help="whisper model to download")
    download.set_defaults(func=_download)

    devices = sub.add_parser("devices", help="list microphones")
    devices.set_defaults(func=_devices)

    args = parser.parse_args(argv)
    if getattr(args, "mic_device", None) and str(args.mic_device).isdigit():
        args.mic_device = int(args.mic_device)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    args.func(args)


if __name__ == "__main__":
    main()
