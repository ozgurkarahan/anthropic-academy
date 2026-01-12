"""Tool-related models."""

from typing import List, Optional
from pydantic import BaseModel
from .chat import ConfigModel, MessageModel


class ToolDefinition(BaseModel):
    """Tool definition."""
    name: str
    description: str
    input_schema: dict


class ToolChatRequest(BaseModel):
    """Chat request with tools."""
    config: ConfigModel
    messages: List[MessageModel]
    system: Optional[str] = None
    max_tokens: int = 4096
    temperature: float = 1.0
    tools: List[ToolDefinition]
