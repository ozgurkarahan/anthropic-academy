"""File upload and sample tools endpoints."""

import base64
from fastapi import APIRouter, UploadFile, File

from ..tools.sample_tools import SAMPLE_TOOLS

router = APIRouter()


@router.get("/sample-tools")
async def get_sample_tools():
    """Return the list of sample tools."""
    return {"tools": SAMPLE_TOOLS}


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """Handle file uploads and return base64 encoded content."""
    try:
        content = await file.read()
        base64_content = base64.b64encode(content).decode('utf-8')

        content_type = file.content_type or "application/octet-stream"

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
