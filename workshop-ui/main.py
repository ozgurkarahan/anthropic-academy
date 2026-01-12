"""
Workshop UI - FastAPI Backend for Claude API Testing
"""

import os
import json
import base64
import shutil
import uuid
import tempfile
from datetime import datetime
from typing import Optional, List, Any, Dict

from fastapi import FastAPI, Request, UploadFile, File, HTTPException
from fastapi.responses import HTMLResponse, StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from dotenv import load_dotenv
import anthropic

load_dotenv()

# ============================================================================
# Text Editor Tool - Sandbox Management
# ============================================================================

# Store active sandbox sessions
SANDBOX_SESSIONS: Dict[str, "TextEditorTool"] = {}
SANDBOX_BASE_DIR = os.path.join(tempfile.gettempdir(), "workshop-sandbox")
os.makedirs(SANDBOX_BASE_DIR, exist_ok=True)


class TextEditorTool:
    """Text editor tool for file manipulation in a sandboxed environment."""

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.base_dir = os.path.join(SANDBOX_BASE_DIR, session_id)
        self.backup_dir = os.path.join(self.base_dir, ".backups")
        self.history: List[Dict] = []  # Track all operations for timeline
        os.makedirs(self.base_dir, exist_ok=True)
        os.makedirs(self.backup_dir, exist_ok=True)

    def _validate_path(self, file_path: str) -> str:
        """Validate and resolve file path within sandbox."""
        # Remove leading slash if present
        if file_path.startswith("/"):
            file_path = file_path[1:]
        abs_path = os.path.normpath(os.path.join(self.base_dir, file_path))
        if not abs_path.startswith(self.base_dir):
            raise ValueError(f"Access denied: Path '{file_path}' is outside the sandbox")
        return abs_path

    def _backup_file(self, file_path: str) -> str:
        """Create a backup of a file before modification."""
        if not os.path.exists(file_path):
            return ""
        file_name = os.path.basename(file_path)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        backup_path = os.path.join(self.backup_dir, f"{file_name}.{timestamp}")
        shutil.copy2(file_path, backup_path)
        return backup_path

    def _get_relative_path(self, abs_path: str) -> str:
        """Get relative path from absolute path."""
        return os.path.relpath(abs_path, self.base_dir)

    def _add_history(self, command: str, path: str, details: dict, old_content: str = None, new_content: str = None):
        """Add an operation to the history timeline."""
        self.history.append({
            "timestamp": datetime.now().isoformat(),
            "command": command,
            "path": path,
            "details": details,
            "old_content": old_content,
            "new_content": new_content
        })

    def view(self, file_path: str, view_range: Optional[List[int]] = None) -> str:
        """View file contents or directory listing."""
        abs_path = self._validate_path(file_path)

        if os.path.isdir(abs_path):
            entries = os.listdir(abs_path)
            return "\n".join(entries) if entries else "(empty directory)"

        if not os.path.exists(abs_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        with open(abs_path, "r", encoding="utf-8") as f:
            content = f.read()

        lines = content.split("\n")

        if view_range:
            start, end = view_range
            if end == -1:
                end = len(lines)
            selected_lines = lines[start - 1:end]
            result = [f"{i}: {line}" for i, line in enumerate(selected_lines, start)]
        else:
            result = [f"{i}: {line}" for i, line in enumerate(lines, 1)]

        return "\n".join(result)

    def str_replace(self, file_path: str, old_str: str, new_str: str) -> str:
        """Replace a unique string in a file."""
        abs_path = self._validate_path(file_path)

        if not os.path.exists(abs_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        with open(abs_path, "r", encoding="utf-8") as f:
            content = f.read()

        match_count = content.count(old_str)

        if match_count == 0:
            raise ValueError("No match found for replacement text")
        elif match_count > 1:
            raise ValueError(f"Found {match_count} matches. Please provide more context for a unique match.")

        old_content = content
        self._backup_file(abs_path)
        new_content = content.replace(old_str, new_str)

        with open(abs_path, "w", encoding="utf-8") as f:
            f.write(new_content)

        self._add_history("str_replace", file_path,
                         {"old_str": old_str, "new_str": new_str},
                         old_content, new_content)

        return "Successfully replaced text"

    def create(self, file_path: str, file_text: str) -> str:
        """Create a new file."""
        abs_path = self._validate_path(file_path)

        if os.path.exists(abs_path):
            raise FileExistsError(f"File already exists: {file_path}")

        # Create parent directories if needed
        os.makedirs(os.path.dirname(abs_path), exist_ok=True)

        with open(abs_path, "w", encoding="utf-8") as f:
            f.write(file_text)

        self._add_history("create", file_path, {"size": len(file_text)}, None, file_text)

        return f"Successfully created {file_path}"

    def insert(self, file_path: str, insert_line: int, new_str: str) -> str:
        """Insert text at a specific line."""
        abs_path = self._validate_path(file_path)

        if not os.path.exists(abs_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        with open(abs_path, "r", encoding="utf-8") as f:
            lines = f.readlines()

        old_content = "".join(lines)
        self._backup_file(abs_path)

        # Handle line endings
        if lines and not lines[-1].endswith("\n"):
            new_str = "\n" + new_str

        if insert_line == 0:
            lines.insert(0, new_str + "\n")
        elif 0 < insert_line <= len(lines):
            lines.insert(insert_line, new_str + "\n")
        else:
            raise IndexError(f"Line {insert_line} out of range (file has {len(lines)} lines)")

        with open(abs_path, "w", encoding="utf-8") as f:
            f.writelines(lines)

        new_content = "".join(lines)
        self._add_history("insert", file_path,
                         {"line": insert_line, "text": new_str},
                         old_content, new_content)

        return f"Successfully inserted text after line {insert_line}"

    def undo_edit(self, file_path: str) -> str:
        """Undo the last edit to a file."""
        abs_path = self._validate_path(file_path)
        file_name = os.path.basename(abs_path)

        # Find backups for this file
        backups = [f for f in os.listdir(self.backup_dir) if f.startswith(file_name + ".")]

        if not backups:
            raise FileNotFoundError(f"No backups found for {file_path}")

        # Get the latest backup
        latest_backup = sorted(backups, reverse=True)[0]
        backup_path = os.path.join(self.backup_dir, latest_backup)

        # Restore from backup
        shutil.copy2(backup_path, abs_path)

        # Remove used backup
        os.remove(backup_path)

        # Read restored content
        with open(abs_path, "r", encoding="utf-8") as f:
            restored_content = f.read()

        self._add_history("undo_edit", file_path, {"restored_from": latest_backup}, None, restored_content)

        return f"Successfully restored {file_path} from backup"

    def list_files(self) -> List[Dict]:
        """List all files in the sandbox."""
        files = []
        for root, dirs, filenames in os.walk(self.base_dir):
            # Skip backup directory
            if ".backups" in root:
                continue
            for filename in filenames:
                abs_path = os.path.join(root, filename)
                rel_path = self._get_relative_path(abs_path)
                stat = os.stat(abs_path)
                files.append({
                    "path": rel_path,
                    "size": stat.st_size,
                    "modified": datetime.fromtimestamp(stat.st_mtime).isoformat()
                })
        return files

    def get_file_content(self, file_path: str) -> str:
        """Get raw file content (no line numbers)."""
        abs_path = self._validate_path(file_path)
        if not os.path.exists(abs_path):
            raise FileNotFoundError(f"File not found: {file_path}")
        with open(abs_path, "r", encoding="utf-8") as f:
            return f.read()

    def get_history(self) -> List[Dict]:
        """Get the operation history."""
        return self.history

    def cleanup(self):
        """Clean up the sandbox directory."""
        if os.path.exists(self.base_dir):
            shutil.rmtree(self.base_dir)


def get_or_create_sandbox(session_id: str) -> TextEditorTool:
    """Get or create a sandbox session."""
    if session_id not in SANDBOX_SESSIONS:
        SANDBOX_SESSIONS[session_id] = TextEditorTool(session_id)
    return SANDBOX_SESSIONS[session_id]


def run_text_editor_tool(sandbox: TextEditorTool, tool_input: dict) -> str:
    """Execute a text editor tool command."""
    command = tool_input.get("command")
    path = tool_input.get("path", "")

    if command == "view":
        return sandbox.view(path, tool_input.get("view_range"))
    elif command == "str_replace":
        return sandbox.str_replace(path, tool_input["old_str"], tool_input["new_str"])
    elif command == "create":
        return sandbox.create(path, tool_input["file_text"])
    elif command == "insert":
        return sandbox.insert(path, tool_input["insert_line"], tool_input["new_str"])
    elif command == "undo_edit":
        return sandbox.undo_edit(path)
    else:
        raise ValueError(f"Unknown command: {command}")

app = FastAPI(title="Workshop UI", description="Claude API Testing Interface")

# Mount static files and templates
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# ============================================================================
# Pydantic Models
# ============================================================================

class ConfigModel(BaseModel):
    api_key: str
    base_url: str = "https://api.anthropic.com"
    model: str = "claude-4-5-sonnet"


class MessageModel(BaseModel):
    role: str
    content: Any  # Can be string or list of content blocks


class ChatRequest(BaseModel):
    config: ConfigModel
    messages: List[MessageModel]
    system: Optional[str] = None
    max_tokens: int = 4096
    temperature: float = 1.0


class ToolDefinition(BaseModel):
    name: str
    description: str
    input_schema: dict


class ToolChatRequest(BaseModel):
    config: ConfigModel
    messages: List[MessageModel]
    system: Optional[str] = None
    max_tokens: int = 4096
    temperature: float = 1.0
    tools: List[ToolDefinition]


class ThinkingRequest(BaseModel):
    config: ConfigModel
    messages: List[MessageModel]
    system: Optional[str] = None
    max_tokens: int = 16000
    budget_tokens: int = 10000


class CachingRequest(BaseModel):
    config: ConfigModel
    messages: List[MessageModel]
    system: Optional[str] = None
    max_tokens: int = 4096
    temperature: float = 1.0
    cache_system: bool = False
    tools: Optional[List[ToolDefinition]] = None
    cache_tools: bool = False


class StructuredRequest(BaseModel):
    config: ConfigModel
    messages: List[MessageModel]
    system: Optional[str] = None
    max_tokens: int = 4096
    output_schema: dict


class TestCase(BaseModel):
    input: str
    expected_output: str


class GenerateDatasetRequest(BaseModel):
    config: ConfigModel
    context: str
    count: int = 5


class EvalRunRequest(BaseModel):
    config: ConfigModel
    system_prompt: Optional[str] = None
    dataset: List[TestCase]
    criteria: List[str]


# Text Editor Tool Models
class TextEditorChatRequest(BaseModel):
    config: ConfigModel
    messages: List[MessageModel]
    session_id: str
    system: Optional[str] = None
    max_tokens: int = 4096


class TextEditorFilesRequest(BaseModel):
    session_id: str


class TextEditorFileContentRequest(BaseModel):
    session_id: str
    file_path: str


# Code Execution Models
class CodeExecChatRequest(BaseModel):
    config: ConfigModel
    messages: List[MessageModel]
    file_ids: Optional[List[str]] = None
    system: Optional[str] = None
    max_tokens: int = 16000


# Citations Models
class CitationsChatRequest(BaseModel):
    config: ConfigModel
    messages: List[MessageModel]
    document_base64: Optional[str] = None
    document_type: str = "application/pdf"  # or "text/plain", "text/html"
    document_title: str = "Document"
    document_text: Optional[str] = None  # For plain text documents
    system: Optional[str] = None
    max_tokens: int = 4096


# ============================================================================
# Helper Functions
# ============================================================================

def get_client(config: ConfigModel, beta_features: Optional[List[str]] = None) -> anthropic.Anthropic:
    """Create Anthropic client with provided config and optional beta features."""
    headers = {}

    # Default beta features
    default_betas = ["prompt-caching-2024-07-31"]

    # Add additional beta features if specified
    all_betas = default_betas + (beta_features or [])
    headers["anthropic-beta"] = ", ".join(all_betas)

    return anthropic.Anthropic(
        api_key=config.api_key,
        base_url=config.base_url if config.base_url else None,
        default_headers=headers
    )


def get_code_exec_client(config: ConfigModel) -> anthropic.Anthropic:
    """Create Anthropic client with code execution beta headers."""
    return anthropic.Anthropic(
        api_key=config.api_key,
        base_url=config.base_url if config.base_url else None,
        default_headers={
            "anthropic-beta": "code-execution-2025-08-25, files-api-2025-04-14"
        }
    )


def truncate_base64(obj, max_length=100):
    """Recursively truncate base64 data in nested structures for debug display."""
    if isinstance(obj, dict):
        result = {}
        for key, value in obj.items():
            if key in ('data', 'base64') and isinstance(value, str) and len(value) > max_length:
                result[key] = f"{value[:max_length]}... [truncated, {len(value)} chars total]"
            else:
                result[key] = truncate_base64(value, max_length)
        return result
    elif isinstance(obj, list):
        return [truncate_base64(item, max_length) for item in obj]
    else:
        return obj

def format_request_for_debug(endpoint: str, params: dict) -> dict:
    """Format the request parameters for debug display."""
    debug_params = params.copy()
    # Mask API key for security
    if "api_key" in debug_params.get("config", {}):
        debug_params["config"] = debug_params["config"].copy()
        debug_params["config"]["api_key"] = "sk-...hidden..."
    # Truncate base64 data for readability
    debug_params = truncate_base64(debug_params)
    return {
        "endpoint": endpoint,
        "timestamp": datetime.now().isoformat(),
        "parameters": debug_params
    }


# Sample tools for demonstration
SAMPLE_TOOLS = [
    {
        "name": "calculator",
        "description": "Perform basic math calculations. Supports +, -, *, /, and parentheses.",
        "input_schema": {
            "type": "object",
            "properties": {
                "expression": {
                    "type": "string",
                    "description": "The mathematical expression to evaluate (e.g., '2 + 2', '(10 * 5) / 2')"
                }
            },
            "required": ["expression"]
        }
    },
    {
        "name": "get_current_time",
        "description": "Get the current date and time.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "name": "get_weather",
        "description": "Get the current weather for a location (mock data for demonstration).",
        "input_schema": {
            "type": "object",
            "properties": {
                "location": {
                    "type": "string",
                    "description": "The city name (e.g., 'London', 'New York')"
                }
            },
            "required": ["location"]
        }
    }
]


def execute_tool(tool_name: str, tool_input: dict) -> str:
    """Execute a sample tool and return the result."""
    if tool_name == "calculator":
        try:
            # Safe evaluation of math expressions
            expression = tool_input.get("expression", "")
            # Only allow safe characters
            allowed = set("0123456789+-*/(). ")
            if not all(c in allowed for c in expression):
                return "Error: Invalid characters in expression"
            result = eval(expression)
            return f"Result: {result}"
        except Exception as e:
            return f"Error: {str(e)}"

    elif tool_name == "get_current_time":
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    elif tool_name == "get_weather":
        location = tool_input.get("location", "Unknown")
        # Mock weather data
        return f"Weather in {location}: Sunny, 22°C (72°F), Humidity: 45%"

    else:
        return f"Unknown tool: {tool_name}"


# ============================================================================
# Routes
# ============================================================================

@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    """Serve the main HTML page."""
    return templates.TemplateResponse("index.html", {
        "request": request,
        "default_api_key": os.getenv("ANTHROPIC_API_KEY", ""),
        "default_base_url": os.getenv("ANTHROPIC_BASE_URL", "https://api.anthropic.com"),
        "default_model": os.getenv("CLAUDE_MODEL", "claude-4-5-sonnet")
    })


@app.get("/api/sample-tools")
async def get_sample_tools():
    """Return the list of sample tools."""
    return {"tools": SAMPLE_TOOLS}


@app.post("/api/chat")
async def chat(request: ChatRequest):
    """Basic chat endpoint with streaming."""
    client = get_client(request.config)

    # Build request parameters
    params = {
        "model": request.config.model,
        "max_tokens": request.max_tokens,
        "temperature": request.temperature,
        "messages": [msg.model_dump() for msg in request.messages]
    }
    if request.system:
        params["system"] = request.system

    # Debug info
    debug_request = format_request_for_debug("/v1/messages", params)

    async def generate():
        # Send debug request info first
        yield f"data: {json.dumps({'type': 'debug_request', 'data': debug_request})}\n\n"

        try:
            with client.messages.stream(**params) as stream:
                full_response = {"content": [], "model": "", "usage": {}}

                for event in stream:
                    if hasattr(event, 'type'):
                        if event.type == 'message_start':
                            full_response["model"] = event.message.model
                            full_response["id"] = event.message.id
                        elif event.type == 'content_block_delta':
                            if hasattr(event.delta, 'text'):
                                yield f"data: {json.dumps({'type': 'text', 'data': event.delta.text})}\n\n"

                # Get final message for debug
                final_message = stream.get_final_message()
                full_response["content"] = [
                    {"type": block.type, "text": block.text if hasattr(block, 'text') else str(block)}
                    for block in final_message.content
                ]
                full_response["usage"] = {
                    "input_tokens": final_message.usage.input_tokens,
                    "output_tokens": final_message.usage.output_tokens
                }
                full_response["stop_reason"] = final_message.stop_reason

                # Send debug response
                yield f"data: {json.dumps({'type': 'debug_response', 'data': full_response})}\n\n"
                yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except anthropic.APIError as e:
            yield f"data: {json.dumps({'type': 'error', 'data': str(e)})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'data': f'Error: {type(e).__name__}: {str(e)}'})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.post("/api/chat/tools")
async def chat_with_tools(request: ToolChatRequest):
    """Chat endpoint with tool use support."""
    client = get_client(request.config)

    # Build request parameters
    tools = [tool.model_dump() for tool in request.tools]
    messages = [msg.model_dump() for msg in request.messages]

    params = {
        "model": request.config.model,
        "max_tokens": request.max_tokens,
        "temperature": request.temperature,
        "messages": messages,
        "tools": tools
    }
    if request.system:
        params["system"] = request.system

    async def generate():
        try:
            current_messages = messages.copy()
            iteration = 0
            max_iterations = 10  # Prevent infinite loops

            while iteration < max_iterations:
                iteration += 1

                # Build current params for debug logging
                current_params = {
                    "model": request.config.model,
                    "max_tokens": request.max_tokens,
                    "temperature": request.temperature,
                    "messages": current_messages,
                    "tools": tools
                }
                if request.system:
                    current_params["system"] = request.system

                # Log the request being sent to the API
                iter_debug_request = format_request_for_debug(f"/v1/messages (tools) - iteration {iteration}", current_params)
                yield f"data: {json.dumps({'type': 'debug_request', 'data': iter_debug_request})}\n\n"

                # Make API call
                response = client.messages.create(
                    model=request.config.model,
                    max_tokens=request.max_tokens,
                    temperature=request.temperature,
                    messages=current_messages,
                    tools=tools,
                    system=request.system if request.system else anthropic.NOT_GIVEN
                )

                # Send response info
                response_data = {
                    "id": response.id,
                    "model": response.model,
                    "content": [],
                    "stop_reason": response.stop_reason,
                    "usage": {
                        "input_tokens": response.usage.input_tokens,
                        "output_tokens": response.usage.output_tokens
                    }
                }

                # Process content blocks
                assistant_content = []
                for block in response.content:
                    if block.type == "text":
                        response_data["content"].append({"type": "text", "text": block.text})
                        assistant_content.append({"type": "text", "text": block.text})
                        yield f"data: {json.dumps({'type': 'text', 'data': block.text})}\n\n"
                    elif block.type == "tool_use":
                        tool_info = {
                            "type": "tool_use",
                            "id": block.id,
                            "name": block.name,
                            "input": block.input
                        }
                        response_data["content"].append(tool_info)
                        assistant_content.append(tool_info)
                        yield f"data: {json.dumps({'type': 'tool_call', 'data': tool_info})}\n\n"

                yield f"data: {json.dumps({'type': 'debug_response', 'data': response_data})}\n\n"

                # Check if we need to handle tool calls
                if response.stop_reason == "tool_use":
                    # Add assistant message
                    current_messages.append({"role": "assistant", "content": assistant_content})

                    # Execute tools and add results
                    tool_results = []
                    for block in response.content:
                        if block.type == "tool_use":
                            result = execute_tool(block.name, block.input)
                            # Use string content format for tool results
                            tool_result = {
                                "type": "tool_result",
                                "tool_use_id": block.id,
                                "content": str(result)
                            }
                            tool_results.append(tool_result)
                            yield f"data: {json.dumps({'type': 'tool_result', 'data': {'tool_use_id': block.id, 'name': block.name, 'result': result}})}\n\n"

                    current_messages.append({"role": "user", "content": tool_results})
                else:
                    # No more tool calls, we're done
                    break

            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except anthropic.APIError as e:
            yield f"data: {json.dumps({'type': 'error', 'data': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.post("/api/chat/thinking")
async def chat_with_thinking(request: ThinkingRequest):
    """Chat endpoint with extended thinking and streaming."""
    client = get_client(request.config)

    params = {
        "model": request.config.model,
        "max_tokens": request.max_tokens,
        "thinking": {
            "type": "enabled",
            "budget_tokens": request.budget_tokens
        },
        "messages": [msg.model_dump() for msg in request.messages]
    }
    if request.system:
        params["system"] = request.system

    debug_request = format_request_for_debug("/v1/messages (thinking)", params)

    async def generate():
        yield f"data: {json.dumps({'type': 'debug_request', 'data': debug_request})}\n\n"

        try:
            with client.messages.stream(**params) as stream:
                full_response = {"content": [], "model": "", "usage": {}}
                current_thinking = ""
                current_text = ""

                for event in stream:
                    if hasattr(event, 'type'):
                        if event.type == 'message_start':
                            full_response["model"] = event.message.model
                            full_response["id"] = event.message.id
                        elif event.type == 'content_block_delta':
                            if hasattr(event.delta, 'thinking'):
                                current_thinking += event.delta.thinking
                                yield f"data: {json.dumps({'type': 'thinking_delta', 'data': event.delta.thinking})}\n\n"
                            elif hasattr(event.delta, 'text'):
                                current_text += event.delta.text
                                yield f"data: {json.dumps({'type': 'text', 'data': event.delta.text})}\n\n"

                # Get final message for debug
                final_message = stream.get_final_message()
                for block in final_message.content:
                    if block.type == "thinking":
                        full_response["content"].append({
                            "type": "thinking",
                            "thinking": block.thinking
                        })
                    elif block.type == "text":
                        full_response["content"].append({
                            "type": "text",
                            "text": block.text
                        })

                full_response["usage"] = {
                    "input_tokens": final_message.usage.input_tokens,
                    "output_tokens": final_message.usage.output_tokens
                }
                full_response["stop_reason"] = final_message.stop_reason

                yield f"data: {json.dumps({'type': 'debug_response', 'data': full_response})}\n\n"
                yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except anthropic.APIError as e:
            yield f"data: {json.dumps({'type': 'error', 'data': str(e)})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'data': f'Error: {type(e).__name__}: {str(e)}'})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.post("/api/chat/cached")
async def chat_with_caching(request: CachingRequest):
    """Chat endpoint with prompt caching for system prompt and tools, with full tool execution support."""
    client = get_client(request.config)

    # Build system with cache control if requested
    system_content = None
    if request.system:
        if request.cache_system:
            system_content = [
                {
                    "type": "text",
                    "text": request.system,
                    "cache_control": {"type": "ephemeral"}
                }
            ]
        else:
            system_content = request.system

    # Build tools with cache control on last tool if requested
    tools_content = None
    if request.tools:
        tools_content = [tool.model_dump() for tool in request.tools]
        if request.cache_tools and tools_content:
            # Add cache_control to the last tool (matching notebook pattern)
            tools_content[-1]["cache_control"] = {"type": "ephemeral"}

    messages = [msg.model_dump() for msg in request.messages]

    async def generate():
        try:
            current_messages = messages.copy()
            iteration = 0
            max_iterations = 10  # Prevent infinite loops

            while iteration < max_iterations:
                iteration += 1

                # Build current params for debug logging
                current_params = {
                    "model": request.config.model,
                    "max_tokens": request.max_tokens,
                    "temperature": request.temperature,
                    "messages": current_messages,
                }
                if system_content:
                    current_params["system"] = system_content
                if tools_content:
                    current_params["tools"] = tools_content

                # Log the request being sent to the API
                iter_debug_request = format_request_for_debug(f"/v1/messages (caching) - iteration {iteration}", current_params)
                yield f"data: {json.dumps({'type': 'debug_request', 'data': iter_debug_request})}\n\n"

                # Make API call (non-streaming to support tool loops)
                api_params = {
                    "model": request.config.model,
                    "max_tokens": request.max_tokens,
                    "temperature": request.temperature,
                    "messages": current_messages,
                }
                if system_content:
                    api_params["system"] = system_content
                if tools_content:
                    api_params["tools"] = tools_content

                response = client.messages.create(**api_params)

                # Build response data with cache stats
                response_data = {
                    "id": response.id,
                    "model": response.model,
                    "content": [],
                    "stop_reason": response.stop_reason,
                    "usage": {
                        "input_tokens": response.usage.input_tokens,
                        "output_tokens": response.usage.output_tokens,
                        "cache_creation_input_tokens": getattr(response.usage, 'cache_creation_input_tokens', 0),
                        "cache_read_input_tokens": getattr(response.usage, 'cache_read_input_tokens', 0)
                    }
                }

                # Process content blocks
                assistant_content = []
                for block in response.content:
                    if block.type == "text":
                        response_data["content"].append({"type": "text", "text": block.text})
                        assistant_content.append({"type": "text", "text": block.text})
                        yield f"data: {json.dumps({'type': 'text', 'data': block.text})}\n\n"
                    elif block.type == "tool_use":
                        # Ensure input is a plain dict for JSON serialization
                        tool_input = dict(block.input) if hasattr(block.input, 'items') else block.input
                        tool_info = {
                            "type": "tool_use",
                            "id": block.id,
                            "name": block.name,
                            "input": tool_input
                        }
                        response_data["content"].append(tool_info)
                        assistant_content.append(tool_info)
                        yield f"data: {json.dumps({'type': 'tool_call', 'data': tool_info})}\n\n"

                yield f"data: {json.dumps({'type': 'debug_response', 'data': response_data})}\n\n"
                yield f"data: {json.dumps({'type': 'cache_stats', 'data': response_data['usage']})}\n\n"

                # Check if we need to handle tool calls
                if response.stop_reason == "tool_use":
                    # Add assistant message
                    current_messages.append({"role": "assistant", "content": assistant_content})

                    # Execute tools and add results
                    tool_results = []
                    for block in response.content:
                        if block.type == "tool_use":
                            result = execute_tool(block.name, block.input)
                            # Use string content format for tool results
                            tool_result = {
                                "type": "tool_result",
                                "tool_use_id": block.id,
                                "content": str(result)
                            }
                            tool_results.append(tool_result)
                            yield f"data: {json.dumps({'type': 'tool_result', 'data': {'tool_use_id': block.id, 'name': block.name, 'result': result}})}\n\n"

                    current_messages.append({"role": "user", "content": tool_results})
                else:
                    # No more tool calls, we're done
                    break

            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except anthropic.APIError as e:
            yield f"data: {json.dumps({'type': 'error', 'data': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.post("/api/structured")
async def structured_output(request: StructuredRequest):
    """Chat endpoint for structured data output using tool use."""
    client = get_client(request.config)

    # Create a tool from the schema
    extract_tool = {
        "name": "extract_structured_data",
        "description": "Extract structured data according to the provided schema",
        "input_schema": request.output_schema
    }

    params = {
        "model": request.config.model,
        "max_tokens": request.max_tokens,
        "messages": [msg.model_dump() for msg in request.messages],
        "tools": [extract_tool],
        "tool_choice": {"type": "tool", "name": "extract_structured_data"}
    }
    if request.system:
        params["system"] = request.system

    debug_request = format_request_for_debug("/v1/messages (structured)", params)

    async def generate():
        yield f"data: {json.dumps({'type': 'debug_request', 'data': debug_request})}\n\n"

        try:
            response = client.messages.create(**params)

            # Find the tool use block
            structured_data = None
            for block in response.content:
                if block.type == "tool_use" and block.name == "extract_structured_data":
                    structured_data = block.input
                    break

            response_data = {
                "id": response.id,
                "model": response.model,
                "structured_data": structured_data,
                "usage": {
                    "input_tokens": response.usage.input_tokens,
                    "output_tokens": response.usage.output_tokens
                },
                "stop_reason": response.stop_reason
            }

            yield f"data: {json.dumps({'type': 'structured_data', 'data': structured_data})}\n\n"
            yield f"data: {json.dumps({'type': 'debug_response', 'data': response_data})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except anthropic.APIError as e:
            yield f"data: {json.dumps({'type': 'error', 'data': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """Handle file uploads and return base64 encoded content."""
    try:
        content = await file.read()
        base64_content = base64.b64encode(content).decode('utf-8')

        # Determine media type
        content_type = file.content_type or "application/octet-stream"

        # Check if it's an image or PDF
        if content_type.startswith("image/"):
            file_type = "image"
        elif content_type == "application/pdf":
            file_type = "pdf"
        else:
            file_type = "unknown"

        return {
            "success": True,
            "filename": file.filename,
            "content_type": content_type,
            "file_type": file_type,
            "base64": base64_content,
            "size": len(content)
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


# ============================================================================
# Prompt Evaluation Endpoints
# ============================================================================

@app.post("/api/eval/generate-dataset")
async def generate_dataset(request: GenerateDatasetRequest):
    """Generate test cases using Claude."""
    client = get_client(request.config)

    prompt = f"""Generate an evaluation dataset with {request.count} test cases for the following context/domain:

<context>
{request.context}
</context>

Generate exactly {request.count} test cases. Each test case should have:
- "input": A realistic user question or input for this context
- "expected_output": The ideal expected response

Return a JSON array of objects with "input" and "expected_output" fields.
Example format:
```json
[
    {{"input": "Question 1", "expected_output": "Expected answer 1"}},
    {{"input": "Question 2", "expected_output": "Expected answer 2"}}
]
```

Generate diverse and realistic test cases that cover different aspects of the context.
Respond with ONLY the JSON array, no other text."""

    try:
        response = client.messages.create(
            model=request.config.model,
            max_tokens=4096,
            messages=[
                {"role": "user", "content": prompt},
                {"role": "assistant", "content": "```json\n["}
            ],
            stop_sequences=["```"]
        )

        # Parse the response - it should start with the array content
        response_text = "[" + response.content[0].text
        cases = json.loads(response_text)

        # Validate structure
        validated_cases = []
        for case in cases:
            if isinstance(case, dict) and "input" in case and "expected_output" in case:
                validated_cases.append({
                    "input": str(case["input"]),
                    "expected_output": str(case["expected_output"])
                })

        return {
            "success": True,
            "cases": validated_cases,
            "debug": {
                "model": request.config.model,
                "context": request.context,
                "requested_count": request.count,
                "generated_count": len(validated_cases)
            }
        }

    except json.JSONDecodeError as e:
        return {"success": False, "error": f"Failed to parse generated JSON: {str(e)}"}
    except anthropic.APIError as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        return {"success": False, "error": f"Error: {type(e).__name__}: {str(e)}"}


@app.post("/api/eval/run")
async def run_evaluation(request: EvalRunRequest):
    """Run prompt evaluation on a dataset using LLM-as-Judge."""
    client = get_client(request.config)

    # Build criteria description
    criteria_descriptions = {
        "accuracy": "Accuracy: The response is factually correct and matches the expected output",
        "relevance": "Relevance: The response directly addresses the input question",
        "tone": "Tone: The response uses an appropriate tone for the context",
        "completeness": "Completeness: The response covers all aspects of the question",
        "conciseness": "Conciseness: The response is clear and not unnecessarily verbose"
    }

    criteria_text = []
    for c in request.criteria:
        if c.startswith("custom:"):
            criteria_text.append(f"- {c[7:]}")
        elif c in criteria_descriptions:
            criteria_text.append(f"- {criteria_descriptions[c]}")
    criteria_str = "\n".join(criteria_text)

    results = []
    errors = []

    # Process all test cases in parallel using asyncio
    import asyncio

    async def evaluate_single_case(test_case: TestCase, idx: int):
        """Evaluate a single test case."""
        try:
            # Step 1: Generate response using the system prompt
            gen_messages = [{"role": "user", "content": test_case.input}]
            gen_params = {
                "model": request.config.model,
                "max_tokens": 2048,
                "messages": gen_messages
            }
            if request.system_prompt:
                gen_params["system"] = request.system_prompt

            gen_response = client.messages.create(**gen_params)
            actual_output = gen_response.content[0].text

            # Step 2: Use LLM as judge to evaluate
            judge_prompt = f"""You are an expert evaluator. Evaluate the AI response against the expected output.

INPUT:
<input>
{test_case.input}
</input>

EXPECTED OUTPUT:
<expected>
{test_case.expected_output}
</expected>

ACTUAL OUTPUT:
<actual>
{actual_output}
</actual>

EVALUATION CRITERIA:
{criteria_str}

Evaluate the actual output and provide:
1. A score from 1 to 5 (1=very poor, 2=poor, 3=acceptable, 4=good, 5=excellent)
2. A brief justification
3. 1-3 strengths
4. 1-3 weaknesses

Respond with a JSON object in this exact format:
{{
    "score": <number 1-5>,
    "justification": "<brief explanation>",
    "strengths": ["<strength1>", "<strength2>"],
    "weaknesses": ["<weakness1>", "<weakness2>"]
}}"""

            judge_response = client.messages.create(
                model=request.config.model,
                max_tokens=1024,
                messages=[
                    {"role": "user", "content": judge_prompt},
                    {"role": "assistant", "content": "```json\n{"}
                ],
                stop_sequences=["```"]
            )

            # Parse judge response
            judge_text = "{" + judge_response.content[0].text
            judge_result = json.loads(judge_text)

            return {
                "index": idx,
                "input": test_case.input,
                "expected_output": test_case.expected_output,
                "actual_output": actual_output,
                "score": int(judge_result.get("score", 3)),
                "justification": judge_result.get("justification", ""),
                "strengths": judge_result.get("strengths", []),
                "weaknesses": judge_result.get("weaknesses", [])
            }

        except json.JSONDecodeError:
            return {
                "index": idx,
                "input": test_case.input,
                "expected_output": test_case.expected_output,
                "actual_output": actual_output if 'actual_output' in dir() else "Error generating response",
                "score": 1,
                "justification": "Failed to parse judge response",
                "strengths": [],
                "weaknesses": ["Evaluation error"]
            }
        except Exception as e:
            return {
                "index": idx,
                "input": test_case.input,
                "expected_output": test_case.expected_output,
                "actual_output": f"Error: {str(e)}",
                "score": 1,
                "justification": f"Error during evaluation: {str(e)}",
                "strengths": [],
                "weaknesses": ["Error during evaluation"]
            }

    # Run all evaluations in parallel
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    # Create tasks for all test cases
    tasks = [evaluate_single_case(tc, idx) for idx, tc in enumerate(request.dataset)]

    # Run concurrently (using asyncio.gather won't work directly with sync client)
    # So we use ThreadPoolExecutor for parallel execution
    from concurrent.futures import ThreadPoolExecutor, as_completed

    def run_eval(args):
        tc, idx = args
        # Create a new event loop for this thread
        return asyncio.run(evaluate_single_case(tc, idx))

    with ThreadPoolExecutor(max_workers=min(10, len(request.dataset))) as executor:
        futures = {executor.submit(run_eval, (tc, idx)): idx for idx, tc in enumerate(request.dataset)}
        for future in as_completed(futures):
            try:
                result = future.result()
                results.append(result)
            except Exception as e:
                idx = futures[future]
                results.append({
                    "index": idx,
                    "input": request.dataset[idx].input,
                    "expected_output": request.dataset[idx].expected_output,
                    "actual_output": "Error",
                    "score": 1,
                    "justification": f"Error: {str(e)}",
                    "strengths": [],
                    "weaknesses": ["Execution error"]
                })

    # Sort by original index
    results.sort(key=lambda x: x["index"])

    # Calculate stats
    scores = [r["score"] for r in results]
    avg_score = sum(scores) / len(scores) if scores else 0
    pass_count = sum(1 for s in scores if s >= 4)
    pass_rate = (pass_count / len(scores) * 100) if scores else 0

    return {
        "success": True,
        "results": results,
        "stats": {
            "avg_score": avg_score,
            "pass_rate": pass_rate,
            "total": len(results),
            "passed": pass_count
        },
        "debug": {
            "model": request.config.model,
            "criteria": request.criteria,
            "system_prompt_length": len(request.system_prompt) if request.system_prompt else 0
        }
    }


# ============================================================================
# Text Editor Tool Endpoints
# ============================================================================

@app.post("/api/texteditor/session")
async def create_texteditor_session():
    """Create a new text editor sandbox session."""
    session_id = str(uuid.uuid4())
    get_or_create_sandbox(session_id)
    return {"session_id": session_id}


@app.get("/api/texteditor/files/{session_id}")
async def list_texteditor_files(session_id: str):
    """List all files in a sandbox session."""
    try:
        sandbox = get_or_create_sandbox(session_id)
        files = sandbox.list_files()
        return {"success": True, "files": files}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/api/texteditor/file/{session_id}/{file_path:path}")
async def get_texteditor_file(session_id: str, file_path: str):
    """Get content of a specific file."""
    try:
        sandbox = get_or_create_sandbox(session_id)
        content = sandbox.get_file_content(file_path)
        return {"success": True, "content": content, "path": file_path}
    except FileNotFoundError as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/api/texteditor/history/{session_id}")
async def get_texteditor_history(session_id: str):
    """Get operation history for a sandbox session."""
    try:
        sandbox = get_or_create_sandbox(session_id)
        history = sandbox.get_history()
        return {"success": True, "history": history}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.delete("/api/texteditor/session/{session_id}")
async def delete_texteditor_session(session_id: str):
    """Delete a sandbox session and clean up files."""
    try:
        if session_id in SANDBOX_SESSIONS:
            SANDBOX_SESSIONS[session_id].cleanup()
            del SANDBOX_SESSIONS[session_id]
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.post("/api/texteditor/chat")
async def texteditor_chat(request: TextEditorChatRequest):
    """Chat with Claude using the text editor tool."""
    client = get_client(request.config)
    sandbox = get_or_create_sandbox(request.session_id)

    # Text editor tool schema
    text_editor_tool = {
        "type": "text_editor_20250728",
        "name": "str_replace_based_edit_tool"
    }

    messages = [msg.model_dump() for msg in request.messages]

    params = {
        "model": request.config.model,
        "max_tokens": request.max_tokens,
        "messages": messages,
        "tools": [text_editor_tool]
    }
    if request.system:
        params["system"] = request.system

    async def generate():
        try:
            current_messages = messages.copy()
            iteration = 0
            max_iterations = 20

            while iteration < max_iterations:
                iteration += 1

                # Log request
                debug_request = format_request_for_debug(f"/v1/messages (text_editor) - iteration {iteration}", params)
                yield f"data: {json.dumps({'type': 'debug_request', 'data': debug_request})}\n\n"

                # Make API call
                response = client.messages.create(
                    model=request.config.model,
                    max_tokens=request.max_tokens,
                    messages=current_messages,
                    tools=[text_editor_tool],
                    system=request.system if request.system else anthropic.NOT_GIVEN
                )

                # Build response data
                response_data = {
                    "id": response.id,
                    "model": response.model,
                    "content": [],
                    "stop_reason": response.stop_reason,
                    "usage": {
                        "input_tokens": response.usage.input_tokens,
                        "output_tokens": response.usage.output_tokens
                    }
                }

                # Process content blocks
                assistant_content = []
                for block in response.content:
                    if block.type == "text":
                        response_data["content"].append({"type": "text", "text": block.text})
                        assistant_content.append({"type": "text", "text": block.text})
                        yield f"data: {json.dumps({'type': 'text', 'data': block.text})}\n\n"
                    elif block.type == "tool_use":
                        tool_input = dict(block.input) if hasattr(block.input, 'items') else block.input
                        tool_info = {
                            "type": "tool_use",
                            "id": block.id,
                            "name": block.name,
                            "input": tool_input
                        }
                        response_data["content"].append(tool_info)
                        assistant_content.append(tool_info)
                        yield f"data: {json.dumps({'type': 'tool_call', 'data': tool_info})}\n\n"

                yield f"data: {json.dumps({'type': 'debug_response', 'data': response_data})}\n\n"

                # Handle tool calls
                if response.stop_reason == "tool_use":
                    current_messages.append({"role": "assistant", "content": assistant_content})

                    tool_results = []
                    for block in response.content:
                        if block.type == "tool_use":
                            try:
                                result = run_text_editor_tool(sandbox, block.input)
                                tool_result = {
                                    "type": "tool_result",
                                    "tool_use_id": block.id,
                                    "content": str(result),
                                    "is_error": False
                                }
                            except Exception as e:
                                tool_result = {
                                    "type": "tool_result",
                                    "tool_use_id": block.id,
                                    "content": f"Error: {str(e)}",
                                    "is_error": True
                                }
                            tool_results.append(tool_result)
                            yield f"data: {json.dumps({'type': 'tool_result', 'data': {'tool_use_id': block.id, 'name': block.name, 'result': tool_result['content'], 'is_error': tool_result.get('is_error', False)}})}\n\n"

                    current_messages.append({"role": "user", "content": tool_results})

                    # Send updated file list
                    files = sandbox.list_files()
                    yield f"data: {json.dumps({'type': 'files_updated', 'data': files})}\n\n"

                    # Send updated history
                    history = sandbox.get_history()
                    yield f"data: {json.dumps({'type': 'history_updated', 'data': history})}\n\n"
                else:
                    break

            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except anthropic.APIError as e:
            error_msg = str(e)
            if "text_editor" in error_msg.lower() or "beta" in error_msg.lower():
                error_msg = f"Text Editor Tool API Error: {error_msg}\n\nNote: This feature requires the text_editor_20250728 beta. Make sure your API key has access to this feature."
            yield f"data: {json.dumps({'type': 'error', 'data': error_msg})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'data': f'Error: {type(e).__name__}: {str(e)}'})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


# ============================================================================
# Code Execution Endpoints
# ============================================================================

@app.post("/api/codeexec/upload")
async def upload_code_exec_file(file: UploadFile = File(...), api_key: str = ""):
    """Upload a file for code execution using the Files API."""
    try:
        if not api_key:
            return {"success": False, "error": "API key required"}

        # Create client with beta headers
        config = ConfigModel(api_key=api_key)
        client = get_code_exec_client(config)

        # Read file content
        content = await file.read()

        # Determine MIME type
        extension = os.path.splitext(file.filename)[1].lower()
        mime_type_map = {
            ".pdf": "application/pdf",
            ".txt": "text/plain",
            ".md": "text/plain",
            ".py": "text/plain",
            ".js": "text/plain",
            ".html": "text/plain",
            ".css": "text/plain",
            ".csv": "text/csv",
            ".json": "application/json",
            ".xml": "application/xml",
            ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ".xls": "application/vnd.ms-excel",
            ".jpeg": "image/jpeg",
            ".jpg": "image/jpeg",
            ".png": "image/png",
            ".gif": "image/gif",
            ".webp": "image/webp",
        }
        mime_type = mime_type_map.get(extension, "application/octet-stream")

        # Upload using Files API beta
        import io
        file_obj = io.BytesIO(content)
        uploaded_file = client.beta.files.upload(
            file=(file.filename, file_obj, mime_type)
        )

        return {
            "success": True,
            "file_id": uploaded_file.id,
            "filename": file.filename,
            "mime_type": mime_type,
            "size": len(content)
        }

    except anthropic.APIError as e:
        error_msg = str(e)
        if "files" in error_msg.lower() or "beta" in error_msg.lower():
            error_msg = f"Files API Error: {error_msg}\n\nNote: This feature requires the files-api-2025-04-14 beta."
        return {"success": False, "error": error_msg}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.post("/api/codeexec/chat")
async def code_execution_chat(request: CodeExecChatRequest):
    """Chat with Claude using code execution."""
    client = get_code_exec_client(request.config)

    # Code execution tool schema
    code_exec_tool = {
        "type": "code_execution_20250825",
        "name": "code_execution"
    }

    messages = [msg.model_dump() for msg in request.messages]

    # If file_ids provided, add container_upload to the first user message
    if request.file_ids and len(messages) > 0:
        for msg in messages:
            if msg["role"] == "user":
                if isinstance(msg["content"], str):
                    msg["content"] = [{"type": "text", "text": msg["content"]}]
                for file_id in request.file_ids:
                    msg["content"].insert(0, {"type": "container_upload", "file_id": file_id})
                break

    params = {
        "model": request.config.model,
        "max_tokens": request.max_tokens,
        "messages": messages,
        "tools": [code_exec_tool]
    }
    if request.system:
        params["system"] = request.system

    async def generate():
        try:
            current_messages = messages.copy()
            iteration = 0
            max_iterations = 10

            while iteration < max_iterations:
                iteration += 1

                debug_request = format_request_for_debug(f"/v1/messages (code_exec) - iteration {iteration}", params)
                yield f"data: {json.dumps({'type': 'debug_request', 'data': debug_request})}\n\n"

                response = client.messages.create(
                    model=request.config.model,
                    max_tokens=request.max_tokens,
                    messages=current_messages,
                    tools=[code_exec_tool],
                    system=request.system if request.system else anthropic.NOT_GIVEN
                )

                response_data = {
                    "id": response.id,
                    "model": response.model,
                    "content": [],
                    "stop_reason": response.stop_reason,
                    "usage": {
                        "input_tokens": response.usage.input_tokens,
                        "output_tokens": response.usage.output_tokens
                    }
                }

                assistant_content = []
                for block in response.content:
                    if block.type == "text":
                        response_data["content"].append({"type": "text", "text": block.text})
                        assistant_content.append({"type": "text", "text": block.text})
                        yield f"data: {json.dumps({'type': 'text', 'data': block.text})}\n\n"

                    elif block.type == "tool_use":
                        tool_input = dict(block.input) if hasattr(block.input, 'items') else block.input
                        tool_info = {
                            "type": "tool_use",
                            "id": block.id,
                            "name": block.name,
                            "input": tool_input
                        }
                        response_data["content"].append(tool_info)
                        assistant_content.append({"type": "tool_use", "id": block.id, "name": block.name, "input": tool_input})
                        yield f"data: {json.dumps({'type': 'tool_call', 'data': tool_info})}\n\n"

                    elif block.type == "code_execution_tool_result":
                        # Handle code execution results
                        result_data = {
                            "type": "code_execution_result",
                            "stdout": getattr(block, 'stdout', ''),
                            "stderr": getattr(block, 'stderr', ''),
                            "return_code": getattr(block, 'return_code', 0),
                        }

                        # Handle generated files/images
                        if hasattr(block, 'content') and block.content:
                            result_data["content"] = []
                            for content_block in block.content:
                                if content_block.type == "image":
                                    result_data["content"].append({
                                        "type": "image",
                                        "source": content_block.source.model_dump() if hasattr(content_block.source, 'model_dump') else content_block.source
                                    })
                                elif content_block.type == "file":
                                    result_data["content"].append({
                                        "type": "file",
                                        "file_id": content_block.file_id if hasattr(content_block, 'file_id') else None
                                    })

                        response_data["content"].append(result_data)
                        assistant_content.append(block.model_dump() if hasattr(block, 'model_dump') else {"type": block.type})
                        yield f"data: {json.dumps({'type': 'code_execution_result', 'data': result_data})}\n\n"

                yield f"data: {json.dumps({'type': 'debug_response', 'data': response_data})}\n\n"

                # The code execution tool is executed by Anthropic's sandbox
                # We just need to pass through the results
                if response.stop_reason == "tool_use":
                    current_messages.append({"role": "assistant", "content": assistant_content})
                    # No manual tool execution needed - Anthropic handles code execution
                    # The next response will contain the results
                elif response.stop_reason == "end_turn":
                    break
                else:
                    break

            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except anthropic.APIError as e:
            error_msg = str(e)
            if "code_execution" in error_msg.lower() or "beta" in error_msg.lower():
                error_msg = f"Code Execution API Error: {error_msg}\n\nNote: This feature requires the code-execution-2025-08-25 and files-api-2025-04-14 beta headers."
            yield f"data: {json.dumps({'type': 'error', 'data': error_msg})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'data': f'Error: {type(e).__name__}: {str(e)}'})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.get("/api/codeexec/download/{file_id}")
async def download_code_exec_file(file_id: str, api_key: str = ""):
    """Download a file generated by code execution."""
    try:
        if not api_key:
            raise HTTPException(status_code=400, detail="API key required")

        config = ConfigModel(api_key=api_key)
        client = get_code_exec_client(config)

        # Get file metadata
        metadata = client.beta.files.retrieve_metadata(file_id)

        # Download file content
        file_content = client.beta.files.download(file_id)

        # Create temp file and return
        temp_path = os.path.join(tempfile.gettempdir(), metadata.filename)
        file_content.write_to_file(temp_path)

        return FileResponse(
            temp_path,
            filename=metadata.filename,
            media_type="application/octet-stream"
        )

    except anthropic.APIError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Citations Endpoints
# ============================================================================

@app.post("/api/citations/chat")
async def citations_chat(request: CitationsChatRequest):
    """Chat with Claude using citations on documents."""
    client = get_client(request.config)

    messages = []

    # Build the first user message with document
    user_content = []

    # Add document with citations enabled
    if request.document_base64:
        user_content.append({
            "type": "document",
            "source": {
                "type": "base64",
                "media_type": request.document_type,
                "data": request.document_base64
            },
            "title": request.document_title,
            "citations": {"enabled": True}
        })
    elif request.document_text:
        user_content.append({
            "type": "document",
            "source": {
                "type": "text",
                "media_type": "text/plain",
                "data": request.document_text
            },
            "title": request.document_title,
            "citations": {"enabled": True}
        })

    # Add previous messages
    for msg in request.messages:
        msg_dict = msg.model_dump()
        if msg_dict["role"] == "user":
            # For subsequent user messages, just add the text
            if isinstance(msg_dict["content"], str):
                if not messages:  # First message - include document
                    user_content.append({"type": "text", "text": msg_dict["content"]})
                    messages.append({"role": "user", "content": user_content})
                else:
                    messages.append({"role": "user", "content": msg_dict["content"]})
            else:
                if not messages:
                    user_content.extend(msg_dict["content"] if isinstance(msg_dict["content"], list) else [msg_dict["content"]])
                    messages.append({"role": "user", "content": user_content})
                else:
                    messages.append(msg_dict)
        else:
            messages.append(msg_dict)

    # If no messages were added yet (empty conversation), add just the document
    if not messages and user_content:
        messages.append({"role": "user", "content": user_content})

    params = {
        "model": request.config.model,
        "max_tokens": request.max_tokens,
        "messages": messages
    }
    if request.system:
        params["system"] = request.system

    debug_request = format_request_for_debug("/v1/messages (citations)", params)

    async def generate():
        yield f"data: {json.dumps({'type': 'debug_request', 'data': debug_request})}\n\n"

        try:
            response = client.messages.create(**params)

            response_data = {
                "id": response.id,
                "model": response.model,
                "content": [],
                "stop_reason": response.stop_reason,
                "usage": {
                    "input_tokens": response.usage.input_tokens,
                    "output_tokens": response.usage.output_tokens
                }
            }

            # Process content with citations
            for block in response.content:
                if block.type == "text":
                    text_block = {
                        "type": "text",
                        "text": block.text,
                        "citations": []
                    }

                    # Extract citations if present
                    if hasattr(block, 'citations') and block.citations:
                        for citation in block.citations:
                            citation_data = {
                                "type": citation.type if hasattr(citation, 'type') else "unknown",
                                "cited_text": citation.cited_text if hasattr(citation, 'cited_text') else "",
                                "document_title": citation.document_title if hasattr(citation, 'document_title') else "",
                                "document_index": citation.document_index if hasattr(citation, 'document_index') else 0,
                            }
                            # Add location info if available
                            if hasattr(citation, 'start_char_index'):
                                citation_data["start_char_index"] = citation.start_char_index
                            if hasattr(citation, 'end_char_index'):
                                citation_data["end_char_index"] = citation.end_char_index
                            if hasattr(citation, 'page_number'):
                                citation_data["page_number"] = citation.page_number

                            text_block["citations"].append(citation_data)

                    response_data["content"].append(text_block)

                    # Send text with citation markers
                    yield f"data: {json.dumps({'type': 'text_with_citations', 'data': text_block})}\n\n"

            yield f"data: {json.dumps({'type': 'debug_response', 'data': response_data})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except anthropic.APIError as e:
            error_msg = str(e)
            if "citation" in error_msg.lower() or "document" in error_msg.lower():
                error_msg = f"Citations API Error: {error_msg}\n\nNote: Make sure your document format is supported and citations are properly configured."
            yield f"data: {json.dumps({'type': 'error', 'data': error_msg})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'data': f'Error: {type(e).__name__}: {str(e)}'})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


# ============================================================================
# Main Entry Point
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
