"""Core chat models."""

from typing import Any, List, Optional
from pydantic import BaseModel


class ConfigModel(BaseModel):
    """API configuration."""
    api_key: str
    base_url: str = "https://api.anthropic.com"
    model: str = "claude-4-5-sonnet"


class MessageModel(BaseModel):
    """Chat message."""
    role: str
    content: Any  # Can be string or list of content blocks


class ChatRequest(BaseModel):
    """Basic chat request."""
    config: ConfigModel
    messages: List[MessageModel]
    system: Optional[str] = None
    max_tokens: int = 4096
    temperature: float = 1.0
