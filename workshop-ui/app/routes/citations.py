"""Citations endpoint."""

import json
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
import anthropic

from ..models.features import CitationsChatRequest
from ..utils.client import get_client
from ..utils.helpers import format_request_for_debug

router = APIRouter()


@router.post("/citations/chat")
async def citations_chat(request: CitationsChatRequest):
    """Chat with Claude using citations on documents."""
    client = get_client(request.config)

    messages = []
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

    # If no messages were added yet, add just the document
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

            for block in response.content:
                if block.type == "text":
                    text_block = {
                        "type": "text",
                        "text": block.text,
                        "citations": []
                    }

                    if hasattr(block, 'citations') and block.citations:
                        for citation in block.citations:
                            citation_data = {
                                "type": citation.type if hasattr(citation, 'type') else "unknown",
                                "cited_text": citation.cited_text if hasattr(citation, 'cited_text') else "",
                                "document_title": citation.document_title if hasattr(citation, 'document_title') else "",
                                "document_index": citation.document_index if hasattr(citation, 'document_index') else 0,
                            }
                            if hasattr(citation, 'start_char_index'):
                                citation_data["start_char_index"] = citation.start_char_index
                            if hasattr(citation, 'end_char_index'):
                                citation_data["end_char_index"] = citation.end_char_index
                            if hasattr(citation, 'page_number'):
                                citation_data["page_number"] = citation.page_number

                            text_block["citations"].append(citation_data)

                    response_data["content"].append(text_block)
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
