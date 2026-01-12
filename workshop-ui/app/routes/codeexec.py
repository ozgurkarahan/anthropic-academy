"""Code execution endpoints."""

import os
import io
import json
import tempfile
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse, FileResponse
import anthropic

from ..models.chat import ConfigModel
from ..models.features import CodeExecChatRequest
from ..utils.client import get_code_exec_client
from ..utils.helpers import format_request_for_debug

router = APIRouter()


@router.post("/codeexec/upload")
async def upload_code_exec_file(file: UploadFile = File(...), api_key: str = ""):
    """Upload a file for code execution using the Files API."""
    try:
        if not api_key:
            return {"success": False, "error": "API key required"}

        config = ConfigModel(api_key=api_key)
        client = get_code_exec_client(config)

        content = await file.read()

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


@router.post("/codeexec/chat")
async def code_execution_chat(request: CodeExecChatRequest):
    """Chat with Claude using code execution."""
    client = get_code_exec_client(request.config)

    code_exec_tool = {
        "type": "code_execution_20250825",
        "name": "code_execution"
    }

    messages = [msg.model_dump() for msg in request.messages]

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

                debug_request = format_request_for_debug(
                    f"/v1/messages (code_exec) - iteration {iteration}", params
                )
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
                        assistant_content.append({
                            "type": "tool_use",
                            "id": block.id,
                            "name": block.name,
                            "input": tool_input
                        })
                        yield f"data: {json.dumps({'type': 'tool_call', 'data': tool_info})}\n\n"

                    elif block.type == "code_execution_tool_result":
                        result_data = {
                            "type": "code_execution_result",
                            "stdout": getattr(block, 'stdout', ''),
                            "stderr": getattr(block, 'stderr', ''),
                            "return_code": getattr(block, 'return_code', 0),
                        }

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

                if response.stop_reason == "tool_use":
                    current_messages.append({"role": "assistant", "content": assistant_content})
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


@router.get("/codeexec/download/{file_id}")
async def download_code_exec_file(file_id: str, api_key: str = ""):
    """Download a file generated by code execution."""
    try:
        if not api_key:
            raise HTTPException(status_code=400, detail="API key required")

        config = ConfigModel(api_key=api_key)
        client = get_code_exec_client(config)

        metadata = client.beta.files.retrieve_metadata(file_id)
        file_content = client.beta.files.download(file_id)

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
