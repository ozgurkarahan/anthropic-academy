# Claude API Workshop UI

An interactive web interface for testing and learning Claude API features from the Anthropic Academy workshop.

## Features

- **Basic Chat** - Simple conversation with Claude, streaming responses
- **Prompt Engineering** - Test system prompts, temperature, and max tokens
- **Tool Use** - Pre-defined sample tools + custom tool JSON editor
- **Text Editor Tool** - Claude's built-in file editing capabilities with sandbox
- **File Upload** - Images and PDFs with drag & drop support
- **Code Execution** - Execute Python code in Anthropic's sandbox (Beta)
- **Extended Thinking** - See Claude's reasoning process
- **Prompt Caching** - Test caching with cache statistics display
- **Structured Data** - Extract structured JSON output using schemas
- **Citations** - Document Q&A with source citations
- **Prompt Evaluation** - LLM-as-Judge evaluation system

### Debug Panel

Every section includes a debug panel showing:
- Raw request JSON sent to the API
- Raw response JSON received from Claude
- Token usage statistics

## Setup

### Prerequisites

- Python 3.10+
- Anthropic API key

### Installation

1. Navigate to the project directory:
   ```bash
   cd workshop-ui
   ```

2. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. (Optional) Create a `.env` file with default values:
   ```bash
   cp .env.example .env
   # Edit .env with your API key
   ```

### Running the Application

```bash
python main.py
```

Or with uvicorn directly:
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Open your browser to: **http://localhost:8000**

## Usage

### Configuration

At the top of the page, configure:
- **API Key** - Your Anthropic API key (required)
- **Base URL** - API endpoint (default: https://api.anthropic.com)
- **Model** - Select from dropdown or enter custom model ID

### 1. Basic Chat

Simple back-and-forth conversation with Claude.
- Type your message and press Enter or click Send
- View conversation history
- Toggle between rendered markdown and raw text view
- Clear conversation to start fresh

### 2. Prompt Engineering

Test different prompting strategies:
- **System Prompt** - Set Claude's persona and instructions
- **Temperature** (0-1) - Control randomness (0 = deterministic, 1 = creative)
- **Max Tokens** - Limit response length

### 3. Tool Use

Test Claude's tool calling capabilities:
- **Sample Tools** - Calculator, current time, weather (mock)
- **Custom Tools** - Define your own tools in JSON format
- Watch the tool call → result → response loop

### 4. File Upload

Send images and PDFs to Claude:
- Drag & drop files or click to browse
- Supports: PNG, JPG, GIF, WebP, PDF
- Ask questions about uploaded files

### 5. Extended Thinking

For complex reasoning tasks:
- **Budget Tokens** - Allocate tokens for thinking process
- See Claude's internal reasoning (collapsible)
- Best for: math, logic, planning, analysis

### 6. Prompt Caching

Test caching for efficiency:
- Enter a long system prompt to cache
- Enable/disable caching
- Watch cache statistics:
  - Cache Read = tokens served from cache (faster, cheaper)
  - Cache Created = tokens stored in cache

### 7. Structured Data

Extract structured JSON from text:
- Define an output schema (JSON Schema format)
- Provide input text
- Receive structured data matching your schema

### 8. Text Editor Tool

Claude's built-in file editing capabilities:
- **Commands**: view, create, str_replace, insert, undo_edit
- Server-side sandbox environment
- CodeMirror editor with syntax highlighting
- Timeline view with diff preview

### 9. Code Execution (Beta)

Execute Python code in Anthropic's sandbox:
- Files API integration for data upload
- CodeMirror display for generated code
- Output display (stdout/stderr)
- Image/visualization rendering
- File download support

### 10. Citations

Document Q&A with source citations:
- PDF upload (base64 encoded)
- Text document support (txt, md, html)
- Inline citation markers with tooltips
- Modal popup for citation details

### 11. Prompt Evaluation

LLM-as-Judge evaluation system:
- Dataset management (create, import, export)
- Test case editor with AI generation
- Configurable evaluation criteria
- Results with scores and pass rate
- History tracking

## Sample Tools

Three pre-defined tools are included:

1. **calculator** - Evaluate math expressions
   ```
   "What's 25 * 17?"
   ```

2. **get_current_time** - Get current date/time
   ```
   "What time is it?"
   ```

3. **get_weather** - Mock weather data
   ```
   "What's the weather in Paris?"
   ```

## Project Structure

```
workshop-ui/
├── main.py                     # FastAPI entry point (~70 lines)
├── app/                        # Backend modules
│   ├── routes/                 # API endpoints (chat, eval, texteditor, etc.)
│   ├── models/                 # Pydantic models
│   ├── tools/                  # Tool implementations (TextEditorTool)
│   └── utils/                  # Utilities (client, helpers)
├── static/
│   ├── css/style.css           # Custom styles
│   └── js/                     # Frontend modules (ES6)
│       ├── app.js              # Entry point
│       ├── state.js            # Global state
│       ├── utils/              # Utilities (api, dom, formatting)
│       ├── core/               # Core modules (streaming, sidebar)
│       └── sections/           # Feature modules (11 sections)
├── templates/index.html        # Main HTML page
├── tests/                      # Pytest tests
├── requirements.txt            # Python dependencies
├── .env.example                # Environment template
├── WORKSHOP_SPEC.md            # Detailed specification
└── README.md                   # This file
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Main HTML page |
| `/api/chat` | POST | Basic chat with streaming |
| `/api/chat/tools` | POST | Chat with tool use |
| `/api/chat/thinking` | POST | Extended thinking |
| `/api/chat/cached` | POST | Prompt caching |
| `/api/structured` | POST | Structured data extraction |
| `/api/upload` | POST | File upload |
| `/api/sample-tools` | GET | Get sample tool definitions |
| `/api/texteditor/session` | POST | Create text editor session |
| `/api/texteditor/files/{session_id}` | GET | List files in session |
| `/api/texteditor/file/{session_id}/{path}` | GET | Get file content |
| `/api/texteditor/history/{session_id}` | GET | Get edit history |
| `/api/texteditor/chat` | POST | Chat with text editor tool |
| `/api/codeexec/upload` | POST | Upload file via Files API |
| `/api/codeexec/chat` | POST | Chat with code execution |
| `/api/codeexec/download/{file_id}` | GET | Download generated file |
| `/api/citations/chat` | POST | Chat with document citations |
| `/api/eval/generate-dataset` | POST | Generate test cases |
| `/api/eval/run` | POST | Run evaluation |

## Running Tests

```bash
# Run all tests
pytest tests/ -v

# Run specific test file
pytest tests/test_text_editor_tool.py -v

# Run with coverage
pytest tests/ --cov=app --cov-report=html
```

## Tips

1. **Use the Debug Panel** - Understanding the raw request/response helps learn the API structure

2. **Start Simple** - Begin with Basic Chat before exploring advanced features

3. **Experiment with Temperature** - Try the same prompt with different temperatures to see the effect

4. **Test Caching** - Send the same system prompt multiple times to see cache hits

5. **Try Custom Tools** - Modify the sample tool JSON to create your own tools

## Troubleshooting

**"API Error" messages**
- Check your API key is correct
- Verify the model name is valid
- Check your API quota

**Streaming not working**
- Ensure you're using a modern browser
- Check browser console for errors

**Files not uploading**
- Max file size depends on API limits
- Ensure file type is supported (image/*, PDF)

## Related Resources

- [Anthropic API Documentation](https://docs.anthropic.com/)
- [Claude API Reference](https://docs.anthropic.com/en/api)
- [Anthropic Academy](https://anthropic.skilljar.com/)
