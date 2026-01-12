# Anthropic Academy

Learning repository containing examples and projects from [Anthropic Academy - Claude with the Anthropic API](https://anthropic.skilljar.com/claude-with-the-anthropic-api), demonstrating Claude API usage patterns, MCP (Model Context Protocol) implementations, and Claude Code integrations.

## Repository Structure

```
anthropic-academy/
├── workshop-ui/         # Interactive web UI for testing Claude API
├── api-claude/          # Jupyter notebooks for Claude API learning
├── claude-code/         # MCP server with document processing tools
└── mcp-claude/          # CLI chat applications using MCP
```

## Projects

### workshop-ui/

Interactive web UI for testing and learning Claude API features from the Anthropic Academy workshop.

```
workshop-ui/
├── main.py                 # FastAPI entry point (~70 lines)
├── app/                    # Backend modules (routes, models, tools, utils)
├── static/js/              # Frontend ES6 modules
├── templates/index.html    # Main HTML page
└── tests/                  # Pytest tests (50+ tests)
```

**Features (11 sections):**
- **Basic Chat** - Simple conversation with Claude
- **Prompt Engineering** - Test system prompts, temperature, max tokens
- **Tool Use** - Pre-defined sample tools (calculator, time, weather)
- **Text Editor Tool** - Claude's built-in file editing with sandbox
- **File Upload** - Images and PDFs with drag & drop
- **Code Execution** - Execute Python in Anthropic's sandbox (Beta)
- **Extended Thinking** - See Claude's reasoning process
- **Prompt Caching** - Test caching with statistics
- **Structured Data** - Extract JSON using schemas
- **Citations** - Document Q&A with source citations
- **Prompt Evaluation** - LLM-as-Judge evaluation system
- **Debug Panel** - View raw request/response JSON for each section

**Note:** Compatible with Heroku inference API (uses non-streaming mode).

### api-claude/

Jupyter notebooks demonstrating various Claude API capabilities and patterns.

| Directory | Description |
|-----------|-------------|
| `api-request/` | Basic API request patterns and output control |
| `prompt_engineering/` | Prompt engineering techniques and examples |
| `tools/` | Tool use, structured data extraction, and text editor tool |
| `thinking/` | Extended thinking (chain-of-thought) examples |
| `files/` | Vision API - image and PDF processing |
| `promp-eval/` | Prompt evaluation approaches and grading |
| `prompt-caching/` | Prompt caching for optimizing API costs |
| `code-file-api/` | Code execution and file API examples |

**Key notebooks:**
- `api-request/001-apirequest.ipynb` - Getting started with the Claude API
- `prompt_engineering/001_prompting.ipynb` - Prompt engineering fundamentals
- `tools/001_tools.ipynb` - Tool use basics
- `tools/002_structured_data.ipynb` - Structured data extraction
- `thinking/001_thinking.ipynb` - Extended thinking examples
- `files/002_images.ipynb` - Image processing with Claude
- `files/002_pdf.ipynb` - PDF document processing
- `prompt-caching/003_caching.ipynb` - Prompt caching for cost optimization
- `code-file-api/005_code_execution.ipynb` - Code execution examples

### claude-code/app_starter/

MCP server providing document processing tools for converting various file formats to markdown.

```
app_starter/
├── main.py              # MCP server entry point (FastMCP)
├── tools/
│   ├── document.py      # Document conversion tools (PDF, DOCX → markdown)
│   └── math.py          # Math calculation tools
├── tests/               # Test suite
└── pyproject.toml       # Project dependencies
```

**Features:**
- PDF to markdown conversion
- DOCX to markdown conversion
- Uses `markitdown` library for conversions
- Tools registered via `mcp.tool()` decorator

### mcp-claude/cli_project/

Interactive CLI chat application connecting to Claude via the Anthropic API with MCP integration for document retrieval and command execution.

```
cli_project/
├── main.py              # Entry point, initializes MCP clients
├── core/
│   ├── cli.py           # CLI application interface
│   ├── cli_chat.py      # Chat orchestration (@mentions, /commands)
│   ├── claude.py        # Claude API service wrapper
│   └── chat.py          # Base chat with tool handling
├── mcp_client.py        # MCP client for server connections
├── mcp_server.py        # MCP server (documents & prompts)
└── pyproject.toml       # Project dependencies
```

**Usage patterns:**
- `@doc_id` - Include document content in query (e.g., `@deposition.md`)
- `/command` - Execute MCP commands (e.g., `/summarize`)
- Tab completion available for commands

**Note:** `cli_project_COMPLETE/` contains the finished reference implementation.

## Setup

### Prerequisites
- Python 3.10+
- [uv](https://github.com/astral-sh/uv) (recommended) or pip

### Environment Variables

Create a `.env` file in the project root (or in each project directory):

```bash
ANTHROPIC_API_KEY="your-api-key-here"
CLAUDE_MODEL="claude-sonnet-4-20250514"  # Optional, for mcp-claude
```

### Quick Start

**For Workshop UI (workshop-ui):**
```bash
cd workshop-ui
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000  # Open http://localhost:8000
pytest tests/ -v                        # Run tests
```

**For Jupyter notebooks (api-claude):**
```bash
cd api-claude
pip install anthropic jupyter
# Open notebooks in VS Code or Jupyter
```

**For MCP server (claude-code/app_starter):**
```bash
cd claude-code/app_starter
uv venv && source .venv/bin/activate
uv pip install -e .
uv run main.py           # Run the server
uv run pytest            # Run tests
```

**For CLI chat (mcp-claude/cli_project):**
```bash
cd mcp-claude/cli_project
uv venv && source .venv/bin/activate
uv pip install -e .
uv run main.py           # Start the CLI chat
```

## License

This repository is for educational purposes, containing examples from Anthropic Academy.
