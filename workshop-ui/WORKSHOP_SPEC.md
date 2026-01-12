# Workshop UI - Specification & Context

## Overview

This is an interactive Workshop UI (FastAPI + Bootstrap) for experimenting with Claude API features. It provides a web-based interface to test various Anthropic API capabilities without writing code.

**Repository**: https://github.com/ozgurkarahan/anthropic-academy
**Directory**: `/workshop-ui/`

## Architecture

```
workshop-ui/
├── main.py                     # FastAPI entry point (~70 lines)
├── app/                        # Backend modules
│   ├── routes/                 # API endpoints
│   │   ├── chat.py             # /api/chat, /api/chat/tools, /api/chat/thinking
│   │   ├── caching.py          # /api/chat/cached
│   │   ├── structured.py       # /api/structured
│   │   ├── upload.py           # /api/upload
│   │   ├── eval.py             # /api/eval/*
│   │   ├── texteditor.py       # /api/texteditor/*
│   │   ├── codeexec.py         # /api/codeexec/*
│   │   └── citations.py        # /api/citations/*
│   ├── models/                 # Pydantic models
│   │   ├── chat.py             # ConfigModel, MessageModel, ChatRequest
│   │   ├── tools.py            # ToolDefinition, ToolChatRequest
│   │   ├── eval.py             # TestCase, EvalRunRequest
│   │   └── features.py         # TextEditorChatRequest, CodeExecChatRequest, etc.
│   ├── tools/                  # Tool implementations
│   │   ├── text_editor.py      # TextEditorTool class
│   │   └── sample_tools.py     # SAMPLE_TOOLS, execute_tool()
│   └── utils/                  # Utilities
│       ├── client.py           # get_client(), get_code_exec_client()
│       └── helpers.py          # truncate_base64(), format_request_for_debug()
├── templates/
│   └── index.html              # Single-page Bootstrap frontend
├── static/
│   ├── css/
│   │   └── style.css           # Custom styles
│   └── js/                     # Frontend modules (ES6)
│       ├── app.js              # Entry point (~80 lines)
│       ├── state.js            # Global state management
│       ├── utils/              # Utilities (api, dom, formatting)
│       ├── core/               # Core modules (streaming, sidebar)
│       └── sections/           # Feature modules (11 sections)
├── tests/                      # Pytest tests
│   ├── conftest.py             # Fixtures
│   ├── test_endpoints.py       # API endpoint tests
│   └── test_text_editor_tool.py # TextEditorTool tests
└── WORKSHOP_SPEC.md            # This specification file
```

## Technology Stack

- **Backend**: FastAPI with SSE streaming, modular router architecture
- **Frontend**: Bootstrap 5, ES6 modules
- **Testing**: pytest with FastAPI TestClient
- **Libraries**:
  - marked.js (Markdown rendering)
  - highlight.js (syntax highlighting)
  - CodeMirror 6 (code editors, lazy loaded)
  - Bootstrap Icons

## Implemented Sections

### 1. Basic Chat (`chatSection`)
Simple chat interface with Claude.
- Streaming responses via SSE
- Message history management
- Raw/rendered view toggle

### 2. Prompt Engineering (`promptSection`)
Test prompts with configurable parameters.
- Custom system prompts
- Temperature slider (0-1)
- Max tokens configuration

### 3. Tool Use (`toolsSection`)
Define and test tool calling.
- Pre-built sample tools: calculator, get_current_time, get_weather
- Custom tool JSON editor
- Tool execution loop with results display
- **Endpoint**: `/api/chat/tools`

### 4. Text Editor Tool (`textEditorSection`) - NEW
Claude's built-in file editing capabilities.
- **Tool Schema**: `{"type": "text_editor_20250728", "name": "str_replace_based_edit_tool"}`
- **Commands**: view, create, str_replace, insert, undo_edit
- Server-side sandbox in `/tmp/workshop-sandbox/{session_id}/`
- Backup system for undo functionality
- CodeMirror 6 editor with syntax highlighting
- Timeline view with diff preview
- **Endpoints**:
  - `POST /api/texteditor/session` - Create session
  - `GET /api/texteditor/files/{session_id}` - List files
  - `GET /api/texteditor/file/{session_id}/{path}` - Get file content
  - `GET /api/texteditor/history/{session_id}` - Get edit history
  - `DELETE /api/texteditor/session/{session_id}` - Delete session
  - `POST /api/texteditor/chat` - Chat with text editor tool

### 5. File Upload (`filesSection`)
Upload and analyze images/PDFs.
- Drag & drop or click to upload
- Image preview thumbnails
- PDF support with base64 encoding
- Multi-file conversations
- **Endpoint**: `/api/upload`

### 6. Code Execution (`codeExecSection`) - NEW
Execute Python code in Anthropic's sandbox.
- **Beta Headers**: `code-execution-2025-08-25, files-api-2025-04-14`
- **Tool Schema**: `{"type": "code_execution_20250825", "name": "code_execution"}`
- Files API integration for data upload
- CodeMirror display for generated code
- Output display (stdout/stderr)
- Image/visualization rendering
- File download support
- **Endpoints**:
  - `POST /api/codeexec/upload` - Upload file via Files API
  - `POST /api/codeexec/chat` - Chat with code execution
  - `GET /api/codeexec/download/{file_id}` - Download generated file

### 7. Extended Thinking (`thinkingSection`)
See Claude's reasoning process.
- Budget tokens configuration (1024-32768)
- Thinking content display with toggle
- **Endpoint**: `/api/chat/thinking`

### 8. Prompt Caching (`cachingSection`)
Test prompt caching with cache statistics.
- System prompt caching toggle
- Tools caching toggle
- Cache hit/miss display
- Sample prompts and tools
- **Endpoint**: `/api/chat/cached`

### 9. Structured Data (`structuredSection`)
Extract structured data with JSON schemas.
- JSON schema editor
- Sample schema loading
- Structured output display
- **Endpoint**: `/api/structured`

### 10. Citations (`citationsSection`) - NEW
Document Q&A with source citations.
- **Document Config**: `{"citations": {"enabled": True}}`
- PDF upload (base64 encoded)
- Text document support (txt, md, html)
- Paste text option
- Inline citation markers [1], [2]... with tooltips
- Modal popup for citation details (cited text, page, char range)
- **Endpoint**: `/api/citations/chat`

### 11. Prompt Evaluation (`evaluationSection`)
LLM-as-Judge evaluation system.
- Dataset management (create, import, export)
- Test case editor
- AI-generated test cases
- Configurable evaluation criteria
- Results with scores, pass rate, distribution
- History tracking
- **Endpoints**:
  - `POST /api/eval/generate-dataset` - Generate test cases
  - `POST /api/eval/run` - Run evaluation

## Frontend State Management

State is centralized in `static/js/state.js` and exported as ES6 module:

```javascript
// static/js/state.js
export const state = {
    // Conversation histories
    chatMessages: [],
    promptMessages: [],
    toolsMessages: [],
    filesMessages: [],
    thinkingMessages: [],
    cachingMessages: [],
    textEditorMessages: [],
    codeExecMessages: [],
    citationsMessages: [],

    // File uploads
    uploadedFiles: [],

    // Text Editor Tool
    textEditorSessionId: null,
    textEditorFiles: [],
    textEditorHistory: [],
    textEditorCurrentFile: null,
    textEditorCodeMirror: null,

    // Code Execution
    codeExecUploadedFiles: [],
    codeExecFileIds: [],
    codeExecCodeMirror: null,

    // Citations
    citationsDocument: null,
    citationsDocumentBase64: null,
    citationsDocumentText: null,
    citationsDocumentType: 'application/pdf',
    citationsDocumentTitle: 'Document',

    // Evaluation
    evalDatasets: {},
    evalActiveDataset: null,
    evalResults: [],
    evalHistory: [],

    // UI state
    rawViewMode: false,
    isStreaming: false,
    sampleTools: []
};
```

### Frontend Module Structure

| Module | Location | Responsibility |
|--------|----------|----------------|
| `state.js` | `/js/` | Global state, localStorage persistence |
| `api.js` | `/js/utils/` | API configuration helpers |
| `dom.js` | `/js/utils/` | DOM manipulation, message rendering |
| `formatting.js` | `/js/utils/` | JSON formatting, Markdown rendering |
| `streaming.js` | `/js/core/` | SSE stream handling |
| `sidebar.js` | `/js/core/` | Navigation sidebar |
| `*.js` | `/js/sections/` | Feature-specific modules (11 files) |

## SSE Event Types

Standard events handled by `streamChat()`:
- `debug_request` - API request for debug panel
- `debug_response` - API response for debug panel
- `text` - Text delta for streaming
- `thinking_start` / `thinking` / `thinking_delta` - Extended thinking
- `tool_call` - Tool invocation
- `tool_result` - Tool execution result
- `cache_stats` - Prompt caching statistics
- `structured_data` - Structured output
- `files_updated` - Text editor files changed
- `history_updated` - Text editor history changed
- `text_with_citations` - Text with citation data
- `code_execution_result` - Code execution output
- `error` - Error message
- `done` - Stream complete

## Backend Key Classes

### TextEditorTool (`app/tools/text_editor.py`)
Manages file operations in sandboxed environment:
```python
class TextEditorTool:
    def __init__(self, session_id: str)
    def view(self, file_path, view_range=None) -> str
    def create(self, file_path, file_text) -> str
    def str_replace(self, file_path, old_str, new_str) -> str
    def insert(self, file_path, insert_line, new_str) -> str
    def undo_edit(self, file_path) -> str
    def list_files(self) -> List[Dict]
    def get_file_content(self, file_path) -> str
    def get_history(self) -> List[Dict]
```

### Router Organization (`app/routes/`)
Each router module follows this pattern:
```python
from fastapi import APIRouter
router = APIRouter()

@router.post("/endpoint")
async def endpoint_handler(request: RequestModel):
    # Implementation
```

### Pydantic Models (`app/models/`)
| Module | Models |
|--------|--------|
| `chat.py` | ConfigModel, MessageModel, ChatRequest |
| `tools.py` | ToolDefinition, ToolChatRequest, ThinkingRequest |
| `eval.py` | TestCase, GenerateDatasetRequest, EvalRunRequest |
| `features.py` | CachingRequest, StructuredRequest, TextEditorChatRequest, CodeExecChatRequest, CitationsChatRequest |

## Patterns & Conventions

1. **Section IDs**: Each section has unique ID (e.g., `textEditorSection`)
2. **Sidebar Navigation**: Data attribute `data-section` links to section
3. **Debug Panels**: Every section has a debug panel showing raw API JSON
4. **Streaming**: All chat endpoints use SSE for real-time responses
5. **State Persistence**: localStorage for evaluation datasets and history
6. **Lazy Loading**: CodeMirror loaded on-demand when sections are used
7. **Error Handling**: Beta feature errors include helpful messages about required headers

## API Configuration

All endpoints accept a `config` object:
```json
{
    "api_key": "sk-ant-...",
    "base_url": "https://api.anthropic.com",
    "model": "claude-sonnet-4-20250514"
}
```

## Beta Features

| Feature | Beta Header |
|---------|-------------|
| Prompt Caching | `prompt-caching-2024-07-31` |
| Code Execution | `code-execution-2025-08-25` |
| Files API | `files-api-2025-04-14` |

## Running the Application

```bash
cd workshop-ui

# Install dependencies
pip install -r requirements.txt  # or: uv pip install -e .

# Run the server
uvicorn main:app --reload --port 8000
# Open http://localhost:8000
```

## Running Tests

```bash
cd workshop-ui

# Run all tests
pytest tests/ -v

# Run specific test file
pytest tests/test_text_editor_tool.py -v

# Run with coverage
pytest tests/ --cov=app --cov-report=html
```

**Test Coverage:**
- `test_endpoints.py` - API endpoint validation, streaming responses
- `test_text_editor_tool.py` - TextEditorTool operations (view, create, str_replace, insert, undo)

## Future Enhancements (Ideas)

- [ ] Computer Use tool integration
- [ ] Batch API testing
- [ ] Multi-turn conversation export
- [ ] API key management (secure storage)
- [ ] Response comparison (A/B testing)
- [ ] Token usage tracking and cost estimation
