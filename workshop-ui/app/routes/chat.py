"""Chat endpoints: basic chat, tool use, and extended thinking."""

import json
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
import anthropic

from ..models.chat import ChatRequest
from ..models.tools import ToolChatRequest
from ..models.features import ThinkingRequest
from ..tools.sample_tools import execute_tool
from ..utils.client import get_client
from ..utils.helpers import format_request_for_debug

router = APIRouter()


@router.post("/chat")
async def chat(request: ChatRequest):
    """Basic chat endpoint with streaming."""
    client = get_client(request.config)

    params = {
        "model": request.config.model,
        "max_tokens": request.max_tokens,
        "temperature": request.temperature,
        "messages": [msg.model_dump() for msg in request.messages]
    }
    if request.system:
        params["system"] = request.system

    debug_request = format_request_for_debug("/v1/messages", params)

    async def generate():
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

                yield f"data: {json.dumps({'type': 'debug_response', 'data': full_response})}\n\n"
                yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except anthropic.APIError as e:
            yield f"data: {json.dumps({'type': 'error', 'data': str(e)})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'data': f'Error: {type(e).__name__}: {str(e)}'})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.post("/chat/tools")
async def chat_with_tools(request: ToolChatRequest):
    """Chat endpoint with tool use support."""
    client = get_client(request.config)

    tools = [tool.model_dump() for tool in request.tools]
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
                    "tools": tools
                }
                if request.system:
                    current_params["system"] = request.system

                iter_debug_request = format_request_for_debug(
                    f"/v1/messages (tools) - iteration {iteration}", current_params
                )
                yield f"data: {json.dumps({'type': 'debug_request', 'data': iter_debug_request})}\n\n"

                response = client.messages.create(
                    model=request.config.model,
                    max_tokens=request.max_tokens,
                    temperature=request.temperature,
                    messages=current_messages,
                    tools=tools,
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


@router.post("/chat/thinking")
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

                for event in stream:
                    if hasattr(event, 'type'):
                        if event.type == 'message_start':
                            full_response["model"] = event.message.model
                            full_response["id"] = event.message.id
                        elif event.type == 'content_block_delta':
                            if hasattr(event.delta, 'thinking'):
                                yield f"data: {json.dumps({'type': 'thinking_delta', 'data': event.delta.thinking})}\n\n"
                            elif hasattr(event.delta, 'text'):
                                yield f"data: {json.dumps({'type': 'text', 'data': event.delta.text})}\n\n"

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
