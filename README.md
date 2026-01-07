# Anthropic Academy

Learning repository containing examples and projects from Anthropic Academy, demonstrating Claude API usage patterns, MCP (Model Context Protocol) implementations, and Claude Code integrations.

## Repository Structure

```
anthropic-academy/
├── api-claude/          # Jupyter notebooks for Claude API learning
├── claude-code/         # MCP server with document processing tools
└── mcp-claude/          # CLI chat applications using MCP
```

## Projects

### api-claude/

Jupyter notebooks demonstrating various Claude API capabilities and patterns.

| Directory | Description |
|-----------|-------------|
| `api-request/` | Basic API request patterns and output control |
| `prompt_engineering/` | Prompt engineering techniques and examples |
| `tools/` | Tool use, structured data extraction, and text editor tool |
| `thinking/` | Extended thinking (chain-of-thought) examples |
| `images/` | Vision API - image and PDF processing |
| `promp-eval/` | Prompt evaluation approaches and grading |

**Key notebooks:**
- `api-request/001-apirequest.ipynb` - Getting started with the Claude API
- `prompt_engineering/001_prompting.ipynb` - Prompt engineering fundamentals
- `tools/001_tools.ipynb` - Tool use basics
- `tools/002_structured_data.ipynb` - Structured data extraction
- `thinking/001_thinking.ipynb` - Extended thinking examples
- `images/002_images.ipynb` - Image processing with Claude
- `images/002_pdf.ipynb` - PDF document processing

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
