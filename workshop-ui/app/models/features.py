"""Feature-specific models."""

from typing import List, Optional
from pydantic import BaseModel
from .chat import ConfigModel, MessageModel
from .tools import ToolDefinition


class ThinkingRequest(BaseModel):
    """Extended thinking request."""
    config: ConfigModel
    messages: List[MessageModel]
    system: Optional[str] = None
    max_tokens: int = 16000
    budget_tokens: int = 10000


class CachingRequest(BaseModel):
    """Prompt caching request."""
    config: ConfigModel
    messages: List[MessageModel]
    system: Optional[str] = None
    max_tokens: int = 4096
    temperature: float = 1.0
    cache_system: bool = False
    tools: Optional[List[ToolDefinition]] = None
    cache_tools: bool = False


class StructuredRequest(BaseModel):
    """Structured output request."""
    config: ConfigModel
    messages: List[MessageModel]
    system: Optional[str] = None
    max_tokens: int = 4096
    output_schema: dict


class TextEditorChatRequest(BaseModel):
    """Text editor chat request."""
    config: ConfigModel
    messages: List[MessageModel]
    session_id: str
    system: Optional[str] = None
    max_tokens: int = 4096


class CodeExecChatRequest(BaseModel):
    """Code execution chat request."""
    config: ConfigModel
    messages: List[MessageModel]
    file_ids: Optional[List[str]] = None
    system: Optional[str] = None
    max_tokens: int = 16000


class CitationsChatRequest(BaseModel):
    """Citations chat request."""
    config: ConfigModel
    messages: List[MessageModel]
    document_base64: Optional[str] = None
    document_type: str = "application/pdf"
    document_title: str = "Document"
    document_text: Optional[str] = None
    system: Optional[str] = None
    max_tokens: int = 4096
