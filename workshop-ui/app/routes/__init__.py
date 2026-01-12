"""Route modules for Workshop UI API."""

from .chat import router as chat_router
from .caching import router as caching_router
from .structured import router as structured_router
from .upload import router as upload_router
from .eval import router as eval_router
from .texteditor import router as texteditor_router
from .codeexec import router as codeexec_router
from .citations import router as citations_router

__all__ = [
    "chat_router",
    "caching_router",
    "structured_router",
    "upload_router",
    "eval_router",
    "texteditor_router",
    "codeexec_router",
    "citations_router",
]
