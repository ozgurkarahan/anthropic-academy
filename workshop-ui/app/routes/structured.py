"""Structured data output endpoint."""

import json
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
import anthropic

from ..models.features import StructuredRequest
from ..utils.client import get_client
from ..utils.helpers import format_request_for_debug

router = APIRouter()


@router.post("/structured")
async def structured_output(request: StructuredRequest):
    """Chat endpoint for structured data output using tool use."""
    client = get_client(request.config)

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
