"""
Workshop UI - FastAPI Backend for Claude API Testing
Simplified entry point using modular routes.
"""

import os
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from dotenv import load_dotenv

# Import routers
from app.routes import (
    chat_router,
    caching_router,
    structured_router,
    upload_router,
    eval_router,
    texteditor_router,
    codeexec_router,
    citations_router,
)

# Re-exports for backward compatibility with existing tests
from app.tools.text_editor import (
    TextEditorTool,
    SANDBOX_SESSIONS,
    get_or_create_sandbox,
    run_text_editor_tool,
)
from app.tools.sample_tools import execute_tool, SAMPLE_TOOLS

load_dotenv()

# Create FastAPI app
app = FastAPI(title="Workshop UI", description="Claude API Testing Interface")

# Mount static files and templates
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# Include all routers
app.include_router(chat_router, prefix="/api")
app.include_router(caching_router, prefix="/api")
app.include_router(structured_router, prefix="/api")
app.include_router(upload_router, prefix="/api")
app.include_router(eval_router, prefix="/api")
app.include_router(texteditor_router, prefix="/api")
app.include_router(codeexec_router, prefix="/api")
app.include_router(citations_router, prefix="/api")


@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    """Serve the main HTML page."""
    return templates.TemplateResponse("index.html", {
        "request": request,
        "default_api_key": os.getenv("ANTHROPIC_API_KEY", ""),
        "default_base_url": os.getenv("ANTHROPIC_BASE_URL", "https://api.anthropic.com"),
        "default_model": os.getenv("CLAUDE_MODEL", "claude-4-5-sonnet")
    })


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
