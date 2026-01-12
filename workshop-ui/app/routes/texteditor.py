"""Text editor tool endpoints."""

import json
import uuid
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
import anthropic

from ..models.features import TextEditorChatRequest
from ..tools.text_editor import (
    TextEditorTool,
    SANDBOX_SESSIONS,
    get_or_create_sandbox,
    run_text_editor_tool
)
from ..utils.client import get_client
from ..utils.helpers import format_request_for_debug

router = APIRouter()


@router.post("/texteditor/session")
async def create_texteditor_session():
    """Create a new text editor sandbox session."""
    session_id = str(uuid.uuid4())
    get_or_create_sandbox(session_id)
    return {"session_id": session_id}


@router.get("/texteditor/files/{session_id}")
async def list_texteditor_files(session_id: str):
    """List all files in a sandbox session."""
    try:
        sandbox = get_or_create_sandbox(session_id)
        files = sandbox.list_files()
        return {"success": True, "files": files}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/texteditor/file/{session_id}/{file_path:path}")
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


@router.get("/texteditor/history/{session_id}")
async def get_texteditor_history(session_id: str):
    """Get operation history for a sandbox session."""
    try:
        sandbox = get_or_create_sandbox(session_id)
        history = sandbox.get_history()
        return {"success": True, "history": history}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.delete("/texteditor/session/{session_id}")
async def delete_texteditor_session(session_id: str):
    """Delete a sandbox session and clean up files."""
    try:
        if session_id in SANDBOX_SESSIONS:
            SANDBOX_SESSIONS[session_id].cleanup()
            del SANDBOX_SESSIONS[session_id]
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/texteditor/chat")
async def texteditor_chat(request: TextEditorChatRequest):
    """Chat with Claude using the text editor tool."""
    client = get_client(request.config)
    sandbox = get_or_create_sandbox(request.session_id)

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

                debug_request = format_request_for_debug(
                    f"/v1/messages (text_editor) - iteration {iteration}", params
                )
                yield f"data: {json.dumps({'type': 'debug_request', 'data': debug_request})}\n\n"

                response = client.messages.create(
                    model=request.config.model,
                    max_tokens=request.max_tokens,
                    messages=current_messages,
                    tools=[text_editor_tool],
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
                        assistant_content.append(tool_info)
                        yield f"data: {json.dumps({'type': 'tool_call', 'data': tool_info})}\n\n"

                yield f"data: {json.dumps({'type': 'debug_response', 'data': response_data})}\n\n"

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

                    files = sandbox.list_files()
                    yield f"data: {json.dumps({'type': 'files_updated', 'data': files})}\n\n"

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
