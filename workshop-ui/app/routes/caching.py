"""Prompt caching endpoint."""

import json
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
import anthropic

from ..models.features import CachingRequest
from ..tools.sample_tools import execute_tool
from ..utils.client import get_client
from ..utils.helpers import format_request_for_debug

router = APIRouter()


@router.post("/chat/cached")
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
            tools_content[-1]["cache_control"] = {"type": "ephemeral"}

    messages = [msg.model_dump() for msg in request.messages]

    async def generate():
        try:
            current_messages = messages.copy()
            iteration = 0
            max_iterations = 10

            while iteration < max_iterations:
                iteration += 1

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

                iter_debug_request = format_request_for_debug(
                    f"/v1/messages (caching) - iteration {iteration}", current_params
                )
                yield f"data: {json.dumps({'type': 'debug_request', 'data': iter_debug_request})}\n\n"

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
                yield f"data: {json.dumps({'type': 'cache_stats', 'data': response_data['usage']})}\n\n"

                if response.stop_reason == "tool_use":
                    current_messages.append({"role": "assistant", "content": assistant_content})

                    tool_results = []
                    for block in response.content:
                        if block.type == "tool_use":
                            result = execute_tool(block.name, block.input)
                            tool_result = {
                                "type": "tool_result",
                                "tool_use_id": block.id,
                                "content": str(result)
                            }
                            tool_results.append(tool_result)
                            yield f"data: {json.dumps({'type': 'tool_result', 'data': {'tool_use_id': block.id, 'name': block.name, 'result': result}})}\n\n"

                    current_messages.append({"role": "user", "content": tool_results})
                else:
                    break

            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except anthropic.APIError as e:
            yield f"data: {json.dumps({'type': 'error', 'data': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
