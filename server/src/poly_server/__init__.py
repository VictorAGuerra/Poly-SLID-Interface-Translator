"""poly-server: detecção do idioma falado e tradução de interfaces para o Poly."""

__version__ = "0.1.1"

from .app import create_app
from .config import Settings

__all__ = ["create_app", "Settings", "__version__"]
