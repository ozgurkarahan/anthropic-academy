# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a learning repository containing examples and projects from Anthropic Academy. It includes four main project areas:

1. **api-claude/** - Jupyter notebooks demonstrating Claude API usage patterns
2. **claude-code/app_starter/** - MCP server with document processing tools
3. **mcp-claude/** - CLI chat applications using MCP (Model Control Protocol)
4. **workshop-ui/** - Interactive web UI for testing Claude API features

## Environment Setup

All projects require a `.env` file with your Anthropic API key:
```
ANTHROPIC_API_KEY="your-api-key-here"
```

**CRITICAL**: `.env` files are gitignored and must NEVER be committed to the repository.

## Project-Specific Commands

### workshop-ui (Claude API Workshop)

Interactive web UI for testing Claude API features. **See `workshop-ui/WORKSHOP_SPEC.md` for full specification.**

**Setup:**
```bash
cd workshop-ui
pip install fastapi uvicorn anthropic python-dotenv python-multipart
# or: uv pip install -r requirements.txt
```

**Run the application:**
```bash
python main.py
# Open http://localhost:8000
```

**Architecture:**
- `main.py` - FastAPI backend with all API endpoints
- `templates/index.html` - Single-page Bootstrap frontend
- `static/js/app.js` - Frontend state management and handlers
- `static/css/style.css` - Custom styles

**Implemented Sections (11 total):**
1. Basic Chat - Simple streaming chat
2. Prompt Engineering - Custom system prompts, temperature
3. Tool Use - Define and test tool calling
4. **Text Editor Tool** - Claude's built-in file editing (sandbox)
5. File Upload - Image and PDF analysis
6. **Code Execution** - Python sandbox with Files API
7. Extended Thinking - See Claude's reasoning
8. Prompt Caching - Cache statistics display
9. Structured Data - JSON schema extraction
10. **Citations** - Document Q&A with source citations
11. Prompt Evaluation - LLM-as-Judge testing

**Key patterns:**
- SSE streaming for all chat endpoints
- Debug panels showing raw API requests/responses
- CodeMirror 6 for code editing (lazy loaded)
- Beta headers for experimental features

### claude-code/app_starter (MCP Document Tools Server)

This is an MCP server that provides document processing tools (PDF, DOCX conversion to markdown).

**Setup:**
```bash
cd claude-code/app_starter
uv venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
uv pip install -e .
```

**Run the MCP server:**
```bash
uv run main.py
```

**Run tests:**
```bash
uv run pytest
```

**Architecture:**
- `main.py` - MCP server entry point using FastMCP
- `tools/` - Tool implementations (document.py for conversions, math.py for calculations)
- Tools are registered via `mcp.tool()` decorator
- Uses `markitdown` library for document conversions

### mcp-claude/cli_project (CLI Chat Application)

Interactive CLI chat application that connects to Claude via the Anthropic API and uses MCP for document retrieval and command execution.

**Additional .env variables needed:**
```
CLAUDE_MODEL="claude-sonnet-4-20250514"  # or your preferred model
```

**Setup:**
```bash
cd mcp-claude/cli_project
uv venv
source .venv/bin/activate
uv pip install -e .
```

**Run the application:**
```bash
uv run main.py
```

**Usage patterns:**
- `@doc_id` - Include document content in query (e.g., "Tell me about @deposition.md")
- `/command` - Execute MCP commands (e.g., "/summarize deposition.md")
- Tab completion available for commands

**Architecture:**
- `main.py` - Entry point, initializes MCP clients and CLI
- `core/cli_chat.py` - Chat orchestration, handles @mentions and /commands
- `core/claude.py` - Claude API service wrapper
- `core/cli.py` - CLI application interface
- `core/chat.py` - Base chat functionality with tool handling
- `mcp_client.py` - MCP client for connecting to MCP servers
- `mcp_server.py` - MCP server providing document resources and prompts

**Key flow:**
1. User input processed by `CliApp` (cli.py)
2. `CliChat` extracts @mentions and processes /commands via MCP
3. `Claude` service handles API communication with tool support
4. Tool calls routed through multiple MCP clients (doc_client + optional server scripts)

**mcp-claude/cli_project_COMPLETE** is the completed reference implementation.

### api-claude (Jupyter Notebooks)

Learning notebooks for Claude API patterns. These are organized by topic:

**Setup:**
```bash
cd api-claude
# Create .env with ANTHROPIC_API_KEY
pip install anthropic jupyter  # or use uv
```

**Topics:**
- `api-request/` - Basic API request patterns
- `prompt_engineering/` - Prompt engineering techniques
- `tools/` - Tool use and structured data examples
- `promp-eval/` - Prompt evaluation approaches

## Development Guidelines

### MCP Tool Development

When adding tools to the MCP server (`claude-code/app_starter`):

1. Create tool function in `tools/` directory
2. Use Pydantic `Field` for parameter descriptions:
```python
from pydantic import Field

def my_tool(
    param: str = Field(description="What this parameter does")
) -> str:
    """
    One-line summary.

    Detailed explanation of functionality.
    When to use this tool.
    Usage examples.
    """
    # Implementation
```

3. Register in `main.py`:
```python
from tools.my_module import my_tool
mcp.tool()(my_tool)
```

### MCP Client-Server Pattern

The MCP projects use a client-server architecture:
- **Server** (`mcp_server.py`) - Provides resources (documents) and prompts (commands)
- **Client** (`mcp_client.py`) - Connects to servers, makes requests
- Multiple clients can be connected simultaneously via `main.py` arguments

To add new documents, edit `mcp_server.py` and update the `docs` dictionary.

### Python Version

All projects require Python 3.10+. Use `uv` (recommended) or standard pip for package management.

## Testing

Only the `claude-code/app_starter` project has tests:
```bash
cd claude-code/app_starter
uv run pytest
```

Test fixtures are in `tests/fixtures/` (sample PDF and DOCX files).
