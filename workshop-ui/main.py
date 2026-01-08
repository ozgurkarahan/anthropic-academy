"""
Workshop UI - FastAPI Backend for Claude API Testing
"""

import os
import json
import base64
from datetime import datetime
from typing import Optional, List, Any

from fastapi import FastAPI, Request, UploadFile, File
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from dotenv import load_dotenv
import anthropic

load_dotenv()

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


# ============================================================================
# Helper Functions
# ============================================================================

def get_client(config: ConfigModel) -> anthropic.Anthropic:
    """Create Anthropic client with provided config."""
    return anthropic.Anthropic(
        api_key=config.api_key,
        base_url=config.base_url if config.base_url else None,
        default_headers={"anthropic-beta": "prompt-caching-2024-07-31"}
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
# Main Entry Point
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
