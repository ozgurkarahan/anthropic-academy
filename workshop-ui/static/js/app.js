/**
 * Workshop UI - Frontend JavaScript
 * Claude API Testing Interface
 */

// ============================================================================
// Global State
// ============================================================================

const state = {
    // Conversation histories for each section
    chatMessages: [],
    promptMessages: [],
    toolsMessages: [],
    filesMessages: [],
    thinkingMessages: [],
    cachingMessages: [],
    textEditorMessages: [],
    codeExecMessages: [],
    citationsMessages: [],

    // Uploaded files
    uploadedFiles: [],

    // Sample tools (loaded from API)
    sampleTools: [],

    // View mode (rendered vs raw)
    rawViewMode: false,

    // Currently streaming
    isStreaming: false,

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
    codeExecLastCode: '',

    // Citations
    citationsDocument: null,
    citationsDocumentBase64: null,
    citationsDocumentText: null,
    citationsDocumentType: 'application/pdf',
    citationsDocumentTitle: 'Document'
};

// ============================================================================
// Sample Caching Data (from api-claude/prompt-caching/003_caching.ipynb)
// ============================================================================

const SAMPLE_CACHING_SYSTEM_PROMPT = `# Javascript Code Generator for Document Analysis Flow

You are an expert Javascript code generator. Your specialty is creating code for a document analysis flow builder application. The code you generate will run in a sandboxed Javascript environment (QuickJS) and will use a predefined set of UI components to construct user interfaces.

Your Goal: Generate functional Typescript code that defines both the logic and user interface for a document analysis workflow, based on the user's prompt. The generated code must be ready to execute directly within the sandbox environment.

## Constraints and Environment Details:

1. Sandboxed Javascript (QuickJS) Environment:
Your code operates within a QuickJS sandbox. This means you have a restricted set of pre-defined global functions available. You cannot import any libraries or use standard browser APIs.

Available global functions:
- setState(state): Updates the application state with a partial state object. This triggers a re-render of the UI.
- getState(): Retrieves the current application state as an object containing all state variables.
- callLLM(props): Calls a LLM with messages and schema. Returns structured data based on the schema provided.
- navigateTo(path): Navigates to a different path/screen within the application.
- getPath(): Returns the current application path as a string.
- Schema helpers: str, num, bool, obj, arr - Used to define structured response schemas for LLM calls.

2. Component-Based UI:
Build user interfaces using pre-defined components. Each component has specific props and behaviors:
- Route: Defines a screen/page at a specific path. Props: path (string)
- Header: Application header with title. Props: title (string), subtitle (optional string)
- Link: Navigation link to another route. Props: to (string), children (content)
- H2: Section heading. Props: children (text content)
- Panel: Container with optional title and styling. Props: title (string), variant (string)
- Chat: Interactive chat interface. Props: messages (array), onSend (function)
- DocumentPicker: File selection component. Props: onSelect (function), accept (string)
- UL/LI: Unordered list and list items for structured content
- Button: Interactive button. Props: onClick (function), variant (string), disabled (boolean)
- Input: Text input field. Props: value (string), onChange (function), placeholder (string)
- TextArea: Multi-line text input. Props: value (string), onChange (function), rows (number)
- Select: Dropdown selection. Props: options (array), value (string), onChange (function)
- Checkbox: Boolean toggle. Props: checked (boolean), onChange (function), label (string)
- Table: Data table display. Props: columns (array), data (array), onRowClick (function)
- Modal: Overlay dialog. Props: isOpen (boolean), onClose (function), title (string)
- Tabs: Tabbed interface. Props: tabs (array), activeTab (string), onTabChange (function)
- Progress: Progress indicator. Props: value (number), max (number), label (string)
- Alert: Notification message. Props: type (string: info/warning/error/success), message (string)

3. Code Structure - Key Functions:
- getInitialState(): Returns initial application state object. Called once when app loads.
- render(): Defines the UI based on current state (can be async). Called on every state change.

4. State Management:
- Use await getState() to retrieve current state object
- Use await setState(partialState) to update state and trigger re-render
- State is persisted across renders but not across page reloads
- Always initialize all state variables in getInitialState()

5. LLM Interaction:
- Use callLLM({ messages, systemPrompt, schema, onProgress }) for AI communication
- Always define schemas for structured responses using the schema helpers
- The onProgress callback receives streaming updates for long-running requests
- Messages should follow the standard format: { role: 'user' | 'assistant', content: string }

## Key Guidelines:
- Multi-Screen Flows: Design as multiple screens with Route components for complex workflows
- Document Editing: Apply changes automatically in track-changes mode when modifying documents
- Schema Flexibility: Use optional fields for varying response types to handle edge cases
- Context in System Prompt: Include document content in systemPrompt, not user messages
- Error Handling: Always handle potential errors from LLM calls and user inputs gracefully
- Loading States: Show appropriate loading indicators during async operations
- Validation: Validate user inputs before processing to prevent errors

## Example Scenario:
For a deposition preparation flow:
1. DocumentPicker to select documents - Allow users to upload legal documents for analysis
2. Extract key topics using LLM with schema - Parse documents and identify main themes
3. Chat interface for cross-examination questions - Interactive Q&A for preparation
4. Navigation between screens using Link components - Smooth flow between steps
5. Summary generation - Create comprehensive summaries of key findings
6. Export functionality - Allow users to download results in various formats

## Best Practices:
- Keep components small and focused on single responsibilities
- Use meaningful variable names that describe the data they hold
- Comment complex logic to explain the reasoning
- Test edge cases like empty inputs and long documents
- Optimize for readability over cleverness
- Follow consistent naming conventions throughout the codebase`;

// Sample tools for caching - same as Tool Use section (these are implemented in the backend)
const SAMPLE_CACHING_TOOLS = [
    {
        name: "calculator",
        description: "Perform basic math calculations. Supports +, -, *, /, and parentheses.",
        input_schema: {
            type: "object",
            properties: {
                expression: {
                    type: "string",
                    description: "The mathematical expression to evaluate (e.g., '2 + 2', '(10 * 5) / 2')"
                }
            },
            required: ["expression"]
        }
    },
    {
        name: "get_current_time",
        description: "Get the current date and time.",
        input_schema: {
            type: "object",
            properties: {},
            required: []
        }
    },
    {
        name: "get_weather",
        description: "Get the current weather for a location (mock data for demonstration).",
        input_schema: {
            type: "object",
            properties: {
                location: {
                    type: "string",
                    description: "The city name (e.g., 'London', 'New York')"
                }
            },
            required: ["location"]
        }
    }
];

// ============================================================================
// Utility Functions
// ============================================================================

function getConfig() {
    const customModel = document.getElementById('customModel').value.trim();
    return {
        api_key: document.getElementById('apiKey').value,
        base_url: document.getElementById('baseUrl').value,
        model: customModel || document.getElementById('modelSelect').value
    };
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatJson(obj) {
    return JSON.stringify(obj, null, 2);
}

function renderMarkdown(text) {
    if (state.rawViewMode) {
        return `<div class="raw-view">${escapeHtml(text)}</div>`;
    }
    return marked.parse(text);
}

function scrollToBottom(container) {
    container.scrollTop = container.scrollHeight;
}

function updateDebugPanel(panelId, data, append = false) {
    const panel = document.getElementById(panelId);
    const formattedJson = formatJson(data);

    if (append) {
        const existing = panel.querySelector('code').textContent;
        const newContent = existing === '// Request/Response will appear here'
            ? formattedJson
            : existing + '\n\n---\n\n' + formattedJson;
        panel.querySelector('code').textContent = newContent;
    } else {
        panel.querySelector('code').textContent = formattedJson;
    }

    hljs.highlightElement(panel.querySelector('code'));
    scrollToBottom(panel);
}

function showError(message, containerId) {
    const container = document.getElementById(containerId);
    const errorDiv = document.createElement('div');
    errorDiv.className = 'message message-error';
    errorDiv.innerHTML = `<div class="message-role">Error</div>${escapeHtml(message)}`;
    container.appendChild(errorDiv);
    scrollToBottom(container);
}

function createMessageElement(role, content, options = {}) {
    const div = document.createElement('div');
    let className = 'message';

    if (role === 'user') {
        className += ' message-user';
    } else if (role === 'assistant') {
        className += ' message-assistant';
    } else if (role === 'thinking') {
        className += ' message-thinking';
    } else if (role === 'tool_call') {
        className += ' message-tool';
    } else if (role === 'tool_result') {
        className += ' message-tool-result';
    }

    div.className = className;

    let roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
    if (options.toolName) {
        roleLabel = `Tool: ${options.toolName}`;
    }

    let contentHtml;
    if (role === 'user' || role === 'tool_call' || role === 'tool_result') {
        contentHtml = escapeHtml(content);
    } else if (role === 'thinking') {
        contentHtml = `
            <div class="thinking-toggle" onclick="this.nextElementSibling.classList.toggle('d-none')">
                <i class="bi bi-lightbulb"></i> Thinking (click to toggle)
            </div>
            <div class="thinking-content">${escapeHtml(content)}</div>
        `;
    } else {
        contentHtml = renderMarkdown(content);
    }

    div.innerHTML = `
        <div class="message-role">${roleLabel}</div>
        <div class="message-content">${contentHtml}</div>
        ${options.showActions ? `
        <div class="message-actions mt-2">
            <button class="btn btn-sm btn-outline-secondary" onclick="editMessage(this)">
                <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteMessage(this)">
                <i class="bi bi-trash"></i>
            </button>
        </div>
        ` : ''}
    `;

    return div;
}

function addStreamingIndicator(container) {
    const indicator = document.createElement('div');
    indicator.className = 'message message-assistant streaming';
    indicator.innerHTML = `
        <div class="message-role">Assistant</div>
        <div class="message-content"><span class="streaming-indicator"></span></div>
    `;
    container.appendChild(indicator);
    scrollToBottom(container);
    return indicator;
}

// ============================================================================
// SSE Streaming Handler
// ============================================================================

async function streamChat(endpoint, body, options) {
    const { containerId, debugPanelId, messagesKey, onComplete } = options;
    const container = document.getElementById(containerId);
    const debugPanel = debugPanelId;

    state.isStreaming = true;

    // Add user message to UI
    if (body.messages && body.messages.length > 0) {
        const lastUserMsg = body.messages[body.messages.length - 1];
        if (lastUserMsg.role === 'user') {
            // Check if it's a content array (with files) or simple string
            let displayContent = lastUserMsg.content;
            if (Array.isArray(lastUserMsg.content)) {
                displayContent = lastUserMsg.content
                    .filter(c => c.type === 'text')
                    .map(c => c.text)
                    .join('\n');
                // Add file indicators
                const files = lastUserMsg.content.filter(c => c.type === 'image' || c.type === 'document');
                if (files.length > 0) {
                    displayContent += `\n[${files.length} file(s) attached]`;
                }
            }
            container.appendChild(createMessageElement('user', displayContent, { showActions: true }));
        }
    }

    // Add streaming indicator
    const streamingDiv = addStreamingIndicator(container);
    let responseText = '';
    let thinkingText = '';
    let inThinking = false;
    let isFirstDebugRequest = true;
    
    // Track tool calls and results for building conversation history
    let currentToolCalls = [];
    let currentToolResults = [];
    let currentAssistantContent = []; // Track full assistant content (text + tool_use blocks)

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));

                        switch (data.type) {
                            case 'debug_request':
                                // Append debug requests to show all iterations (including tool use messages)
                                updateDebugPanel(debugPanel, { request: data.data }, !isFirstDebugRequest);
                                isFirstDebugRequest = false;
                                break;

                            case 'debug_response':
                                updateDebugPanel(debugPanel, { response: data.data }, true);
                                break;

                            case 'thinking_start':
                                inThinking = true;
                                break;

                            case 'text_start':
                                inThinking = false;
                                break;

                            case 'thinking':
                            case 'thinking_delta':
                                thinkingText += data.data;
                                streamingDiv.querySelector('.message-content').innerHTML =
                                    `<em>Thinking...</em><br><small class="text-muted">${escapeHtml(thinkingText.slice(-200))}...</small>`;
                                scrollToBottom(container);
                                break;

                            case 'text':
                                responseText += data.data;
                                streamingDiv.querySelector('.message-content').innerHTML = renderMarkdown(responseText);
                                scrollToBottom(container);
                                break;

                            case 'tool_call':
                                console.log('[TOOL_CALL] Received:', JSON.stringify(data.data));
                                console.log('[TOOL_CALL] Current responseText:', responseText);
                                console.log('[TOOL_CALL] currentAssistantContent before:', JSON.stringify(currentAssistantContent));
                                
                                // Show tool call in UI
                                const toolCallDiv = createMessageElement('tool_call',
                                    `Calling: ${data.data.name}\nInput: ${JSON.stringify(data.data.input, null, 2)}`,
                                    { toolName: data.data.name });
                                container.insertBefore(toolCallDiv, streamingDiv);
                                
                                // If there's text before this tool call (first tool in turn), add it to assistant content
                                if (responseText && currentAssistantContent.length === 0) {
                                    currentAssistantContent.push({
                                        type: 'text',
                                        text: responseText
                                    });
                                    console.log('[TOOL_CALL] Added text to assistant content');
                                }
                                
                                // Add tool_use to assistant content
                                currentAssistantContent.push({
                                    type: 'tool_use',
                                    id: data.data.id,
                                    name: data.data.name,
                                    input: data.data.input
                                });
                                
                                // Track tool call count for matching with results
                                currentToolCalls.push({
                                    type: 'tool_use',
                                    id: data.data.id,
                                    name: data.data.name,
                                    input: data.data.input
                                });
                                
                                console.log('[TOOL_CALL] currentAssistantContent after:', JSON.stringify(currentAssistantContent));
                                console.log('[TOOL_CALL] currentToolCalls count:', currentToolCalls.length);
                                break;

                            case 'tool_result':
                                console.log('[TOOL_RESULT] Received:', JSON.stringify(data.data));
                                console.log('[TOOL_RESULT] currentToolCalls.length:', currentToolCalls.length);
                                console.log('[TOOL_RESULT] currentToolResults.length before:', currentToolResults.length);
                                
                                // Show tool result in UI
                                const toolResultDiv = createMessageElement('tool_result',
                                    `Result from ${data.data.name}:\n${data.data.result}`,
                                    { toolName: data.data.name });
                                container.insertBefore(toolResultDiv, streamingDiv);
                                
                                // Accumulate tool results
                                currentToolResults.push({
                                    type: 'tool_result',
                                    tool_use_id: data.data.tool_use_id,
                                    content: String(data.data.result)
                                });
                                
                                console.log('[TOOL_RESULT] currentToolResults.length after:', currentToolResults.length);
                                console.log('[TOOL_RESULT] messagesKey:', messagesKey);
                                console.log('[TOOL_RESULT] Condition check - currentToolCalls.length > 0:', currentToolCalls.length > 0);
                                console.log('[TOOL_RESULT] Condition check - currentToolResults.length >= currentToolCalls.length:', currentToolResults.length >= currentToolCalls.length);
                                
                                // Immediately add tool messages to state after receiving all results for this turn
                                // We do this here because tool_result is the last event before the next API call
                                if (messagesKey && state[messagesKey] && currentToolCalls.length > 0) {
                                    // Check if we have matching results for all calls
                                    if (currentToolResults.length >= currentToolCalls.length) {
                                        console.log('[TOOL_RESULT] Adding tool messages to state!');
                                        console.log('[TOOL_RESULT] currentAssistantContent:', JSON.stringify(currentAssistantContent));
                                        
                                        // Add assistant message with full content (text + tool_use blocks)
                                        state[messagesKey].push({
                                            role: 'assistant',
                                            content: currentAssistantContent.slice()
                                        });
                                        
                                        // Add user message with tool results
                                        state[messagesKey].push({
                                            role: 'user',
                                            content: currentToolResults.slice()
                                        });
                                        
                                        console.log('[TOOL_RESULT] State after adding:', JSON.stringify(state[messagesKey]));
                                        
                                        // Reset for next iteration
                                        currentToolCalls = [];
                                        currentToolResults = [];
                                        currentAssistantContent = [];
                                        responseText = ''; // Reset text after adding to state
                                    }
                                } else {
                                    console.log('[TOOL_RESULT] Condition NOT met, not adding to state');
                                }
                                break;

                            case 'structured_data':
                                document.getElementById('structuredOutput').querySelector('code').textContent =
                                    formatJson(data.data);
                                hljs.highlightElement(document.getElementById('structuredOutput').querySelector('code'));
                                break;

                            case 'cache_stats':
                                updateCacheStats(data.data);
                                break;

                            case 'files_updated':
                                // Update text editor files list
                                if (state.textEditorSessionId) {
                                    state.textEditorFiles = data.data;
                                    renderTextEditorFileList();
                                    // Auto-select the first file if none selected
                                    if (!state.textEditorCurrentFile && data.data.length > 0) {
                                        selectTextEditorFile(data.data[0].path);
                                    } else if (state.textEditorCurrentFile) {
                                        // Refresh current file content
                                        selectTextEditorFile(state.textEditorCurrentFile);
                                    }
                                }
                                break;

                            case 'history_updated':
                                // Update text editor history
                                if (state.textEditorSessionId) {
                                    state.textEditorHistory = data.data;
                                    renderTextEditorHistory();
                                }
                                break;

                            case 'error':
                                showError(data.data, containerId);
                                streamingDiv.remove();
                                state.isStreaming = false;
                                return;

                            case 'done':
                                console.log('[DONE] Event received');
                                console.log('[DONE] responseText:', responseText);
                                console.log('[DONE] currentToolCalls.length:', currentToolCalls.length);
                                console.log('[DONE] currentAssistantContent:', JSON.stringify(currentAssistantContent));
                                console.log('[DONE] Current state:', JSON.stringify(state[messagesKey]));
                                
                                // Finalize the message
                                streamingDiv.classList.remove('streaming');

                                // If we have thinking, show it first
                                if (thinkingText) {
                                    const thinkingDiv = createMessageElement('thinking', thinkingText);
                                    container.insertBefore(thinkingDiv, streamingDiv);
                                }

                                // Update the final response
                                if (responseText) {
                                    streamingDiv.querySelector('.message-content').innerHTML = renderMarkdown(responseText);

                                    // Store in messages
                                    if (messagesKey && state[messagesKey]) {
                                        console.log('[DONE] Adding final assistant response to state');
                                        state[messagesKey].push({ role: 'assistant', content: responseText });
                                    }
                                } else {
                                    streamingDiv.remove();
                                }

                                console.log('[DONE] Final state:', JSON.stringify(state[messagesKey]));
                                if (onComplete) onComplete(responseText);
                                break;
                        }
                    } catch (e) {
                        console.error('Error parsing SSE data:', e, line);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Stream error:', error);
        showError(error.message, containerId);
        streamingDiv.remove();
    }

    state.isStreaming = false;
    scrollToBottom(container);
}

// ============================================================================
// Section: Basic Chat
// ============================================================================

function initBasicChat() {
    const sendBtn = document.getElementById('sendChat');
    const input = document.getElementById('chatInput');
    const clearBtn = document.getElementById('clearChat');
    const toggleViewBtn = document.getElementById('toggleChatView');

    sendBtn.addEventListener('click', sendBasicChat);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendBasicChat();
        }
    });

    clearBtn.addEventListener('click', () => {
        state.chatMessages = [];
        document.getElementById('chatMessages').innerHTML = `
            <div class="text-muted text-center py-5">
                <i class="bi bi-chat-dots fs-1"></i>
                <p>Start a conversation with Claude</p>
            </div>
        `;
        document.getElementById('chatDebug').querySelector('code').textContent = '// Request/Response will appear here';
    });

    toggleViewBtn.addEventListener('click', () => {
        state.rawViewMode = !state.rawViewMode;
        toggleViewBtn.innerHTML = state.rawViewMode
            ? '<i class="bi bi-file-text"></i> Rendered'
            : '<i class="bi bi-code-slash"></i> Raw';
    });
}

async function sendBasicChat() {
    if (state.isStreaming) return;

    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    if (!message) return;

    // Clear placeholder if first message
    const container = document.getElementById('chatMessages');
    if (state.chatMessages.length === 0) {
        container.innerHTML = '';
    }

    // Add to state
    state.chatMessages.push({ role: 'user', content: message });
    input.value = '';

    await streamChat('/api/chat', {
        config: getConfig(),
        messages: state.chatMessages,
        max_tokens: 4096,
        temperature: 1.0
    }, {
        containerId: 'chatMessages',
        debugPanelId: 'chatDebug',
        messagesKey: 'chatMessages'
    });
}

// ============================================================================
// Section: Prompt Engineering
// ============================================================================

function initPromptEngineering() {
    const sendBtn = document.getElementById('sendPromptChat');
    const input = document.getElementById('promptChatInput');
    const clearBtn = document.getElementById('clearPromptChat');
    const tempSlider = document.getElementById('temperature');
    const tempValue = document.getElementById('tempValue');

    tempSlider.addEventListener('input', () => {
        tempValue.textContent = tempSlider.value;
    });

    sendBtn.addEventListener('click', sendPromptChat);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendPromptChat();
        }
    });

    clearBtn.addEventListener('click', () => {
        state.promptMessages = [];
        document.getElementById('promptChatMessages').innerHTML = `
            <div class="text-muted text-center py-5">
                <i class="bi bi-sliders fs-1"></i>
                <p>Test your prompts here</p>
            </div>
        `;
        document.getElementById('promptDebug').querySelector('code').textContent = '// Request/Response will appear here';
    });
}

async function sendPromptChat() {
    if (state.isStreaming) return;

    const input = document.getElementById('promptChatInput');
    const message = input.value.trim();
    if (!message) return;

    const container = document.getElementById('promptChatMessages');
    if (state.promptMessages.length === 0) {
        container.innerHTML = '';
    }

    state.promptMessages.push({ role: 'user', content: message });
    input.value = '';

    const systemPrompt = document.getElementById('systemPrompt').value.trim();
    const temperature = parseFloat(document.getElementById('temperature').value);
    const maxTokens = parseInt(document.getElementById('maxTokens').value);

    await streamChat('/api/chat', {
        config: getConfig(),
        messages: state.promptMessages,
        system: systemPrompt || null,
        max_tokens: maxTokens,
        temperature: temperature
    }, {
        containerId: 'promptChatMessages',
        debugPanelId: 'promptDebug',
        messagesKey: 'promptMessages'
    });
}

// ============================================================================
// Section: Tool Use
// ============================================================================

function initToolUse() {
    const sendBtn = document.getElementById('sendToolsChat');
    const input = document.getElementById('toolsChatInput');
    const clearBtn = document.getElementById('clearToolsChat');
    const loadSampleBtn = document.getElementById('loadSampleTool');

    // Load sample tools from API
    loadSampleTools();

    sendBtn.addEventListener('click', sendToolsChat);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendToolsChat();
        }
    });

    clearBtn.addEventListener('click', () => {
        state.toolsMessages = [];
        document.getElementById('toolsChatMessages').innerHTML = `
            <div class="text-muted text-center py-5">
                <i class="bi bi-tools fs-1"></i>
                <p>Test tool use with Claude</p>
            </div>
        `;
        document.getElementById('toolsDebug').querySelector('code').textContent = '// Request/Response will appear here';
    });

    loadSampleBtn.addEventListener('click', () => {
        const sampleCustomTool = [{
            name: "search_database",
            description: "Search a database for records matching a query",
            input_schema: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "The search query"
                    },
                    limit: {
                        type: "integer",
                        description: "Maximum number of results",
                        default: 10
                    }
                },
                required: ["query"]
            }
        }];
        document.getElementById('customToolsEditor').value = JSON.stringify(sampleCustomTool, null, 2);
    });
}

async function loadSampleTools() {
    try {
        const response = await fetch('/api/sample-tools');
        const data = await response.json();
        state.sampleTools = data.tools;

        const container = document.getElementById('sampleToolsContainer');
        container.innerHTML = state.sampleTools.map((tool, index) => `
            <div class="form-check form-check-inline tool-checkbox">
                <input class="form-check-input sample-tool-check" type="checkbox"
                       id="tool_${index}" value="${index}" checked>
                <label class="form-check-label" for="tool_${index}">
                    ${tool.name}
                    <small class="text-muted d-block">${tool.description}</small>
                </label>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading sample tools:', error);
    }
}

function getSelectedTools() {
    const tools = [];

    // Get selected sample tools
    document.querySelectorAll('.sample-tool-check:checked').forEach(checkbox => {
        const index = parseInt(checkbox.value);
        tools.push(state.sampleTools[index]);
    });

    // Get custom tools
    const customToolsText = document.getElementById('customToolsEditor').value.trim();
    if (customToolsText) {
        try {
            const customTools = JSON.parse(customToolsText);
            if (Array.isArray(customTools)) {
                tools.push(...customTools);
            } else {
                tools.push(customTools);
            }
        } catch (e) {
            console.error('Invalid custom tools JSON:', e);
        }
    }

    return tools;
}

async function sendToolsChat() {
    if (state.isStreaming) return;

    const input = document.getElementById('toolsChatInput');
    const message = input.value.trim();
    if (!message) return;

    const tools = getSelectedTools();
    if (tools.length === 0) {
        showError('Please select at least one tool', 'toolsChatMessages');
        return;
    }

    const container = document.getElementById('toolsChatMessages');
    if (state.toolsMessages.length === 0) {
        container.innerHTML = '';
    }

    state.toolsMessages.push({ role: 'user', content: message });
    input.value = '';

    await streamChat('/api/chat/tools', {
        config: getConfig(),
        messages: state.toolsMessages,
        tools: tools,
        max_tokens: 4096,
        temperature: 1.0
    }, {
        containerId: 'toolsChatMessages',
        debugPanelId: 'toolsDebug',
        messagesKey: 'toolsMessages'
    });
}

// ============================================================================
// Section: File Upload
// ============================================================================

function initFileUpload() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const sendBtn = document.getElementById('sendFilesChat');
    const input = document.getElementById('filesChatInput');
    const clearBtn = document.getElementById('clearFilesChat');

    // Click to browse
    dropZone.addEventListener('click', () => fileInput.click());

    // Drag and drop handlers
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        handleFiles(e.dataTransfer.files);
    });

    // File input change
    fileInput.addEventListener('change', () => {
        handleFiles(fileInput.files);
        fileInput.value = '';
    });

    sendBtn.addEventListener('click', sendFilesChat);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendFilesChat();
        }
    });

    clearBtn.addEventListener('click', () => {
        state.filesMessages = [];
        state.uploadedFiles = [];
        document.getElementById('uploadedFiles').innerHTML = '';
        document.getElementById('filesChatMessages').innerHTML = `
            <div class="text-muted text-center py-5">
                <i class="bi bi-file-earmark-image fs-1"></i>
                <p>Upload files and ask Claude about them</p>
            </div>
        `;
        document.getElementById('filesDebug').querySelector('code').textContent = '// Request/Response will appear here';
    });
}

async function handleFiles(files) {
    for (const file of files) {
        // Check file type
        if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
            showError(`Unsupported file type: ${file.type}`, 'filesChatMessages');
            continue;
        }

        // Upload file
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();

            if (data.success) {
                state.uploadedFiles.push(data);
                renderUploadedFiles();
            } else {
                showError(data.error, 'filesChatMessages');
            }
        } catch (error) {
            showError(error.message, 'filesChatMessages');
        }
    }
}

function renderUploadedFiles() {
    const container = document.getElementById('uploadedFiles');
    container.innerHTML = state.uploadedFiles.map((file, index) => `
        <div class="uploaded-file">
            ${file.file_type === 'image'
                ? `<img src="data:${file.content_type};base64,${file.base64}" alt="${file.filename}">`
                : `<i class="bi bi-file-earmark-pdf text-danger"></i>`
            }
            <span class="file-name" title="${file.filename}">${file.filename}</span>
            <button class="remove-file" onclick="removeFile(${index})">&times;</button>
        </div>
    `).join('');
}

function removeFile(index) {
    state.uploadedFiles.splice(index, 1);
    renderUploadedFiles();
}

async function sendFilesChat() {
    if (state.isStreaming) return;

    const input = document.getElementById('filesChatInput');
    const message = input.value.trim();
    if (!message && state.uploadedFiles.length === 0) return;

    const container = document.getElementById('filesChatMessages');
    if (state.filesMessages.length === 0) {
        container.innerHTML = '';
    }

    // Build content array with files and text
    const content = [];

    // Add files
    for (const file of state.uploadedFiles) {
        if (file.file_type === 'image') {
            content.push({
                type: 'image',
                source: {
                    type: 'base64',
                    media_type: file.content_type,
                    data: file.base64
                }
            });
        } else if (file.file_type === 'pdf') {
            content.push({
                type: 'document',
                source: {
                    type: 'base64',
                    media_type: 'application/pdf',
                    data: file.base64
                }
            });
        }
    }

    // Add text
    if (message) {
        content.push({ type: 'text', text: message });
    }

    state.filesMessages.push({ role: 'user', content: content });
    input.value = '';

    // Clear uploaded files after sending
    state.uploadedFiles = [];
    document.getElementById('uploadedFiles').innerHTML = '';

    await streamChat('/api/chat', {
        config: getConfig(),
        messages: state.filesMessages,
        max_tokens: 4096,
        temperature: 1.0
    }, {
        containerId: 'filesChatMessages',
        debugPanelId: 'filesDebug',
        messagesKey: 'filesMessages'
    });
}

// ============================================================================
// Section: Extended Thinking
// ============================================================================

function initThinking() {
    const sendBtn = document.getElementById('sendThinkingChat');
    const input = document.getElementById('thinkingChatInput');
    const clearBtn = document.getElementById('clearThinkingChat');

    sendBtn.addEventListener('click', sendThinkingChat);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendThinkingChat();
        }
    });

    clearBtn.addEventListener('click', () => {
        state.thinkingMessages = [];
        document.getElementById('thinkingChatMessages').innerHTML = `
            <div class="text-muted text-center py-5">
                <i class="bi bi-lightbulb fs-1"></i>
                <p>Ask complex questions to see Claude's thinking</p>
            </div>
        `;
        document.getElementById('thinkingDebug').querySelector('code').textContent = '// Request/Response will appear here';
    });
}

async function sendThinkingChat() {
    if (state.isStreaming) return;

    const input = document.getElementById('thinkingChatInput');
    const message = input.value.trim();
    if (!message) return;

    const container = document.getElementById('thinkingChatMessages');
    if (state.thinkingMessages.length === 0) {
        container.innerHTML = '';
    }

    state.thinkingMessages.push({ role: 'user', content: message });
    input.value = '';

    const budgetTokens = parseInt(document.getElementById('budgetTokens').value);
    const maxTokens = parseInt(document.getElementById('thinkingMaxTokens').value);

    await streamChat('/api/chat/thinking', {
        config: getConfig(),
        messages: state.thinkingMessages,
        budget_tokens: budgetTokens,
        max_tokens: maxTokens
    }, {
        containerId: 'thinkingChatMessages',
        debugPanelId: 'thinkingDebug',
        messagesKey: 'thinkingMessages'
    });
}

// ============================================================================
// Section: Prompt Caching
// ============================================================================

function initCaching() {
    const sendBtn = document.getElementById('sendCachingChat');
    const input = document.getElementById('cachingChatInput');
    const clearBtn = document.getElementById('clearCachingChat');
    const loadSamplesBtn = document.getElementById('loadCachingSamples');

    sendBtn.addEventListener('click', sendCachingChat);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendCachingChat();
        }
    });

    clearBtn.addEventListener('click', () => {
        state.cachingMessages = [];
        document.getElementById('cachingChatMessages').innerHTML = `
            <div class="text-muted text-center py-5">
                <i class="bi bi-database fs-1"></i>
                <p>Test prompt caching - watch cache stats</p>
            </div>
        `;
        document.getElementById('cachingDebug').querySelector('code').textContent = '// Request/Response will appear here';
        document.getElementById('cacheStats').innerHTML = '';
    });

    loadSamplesBtn.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('Loading caching samples...');
        document.getElementById('cacheSystemPrompt').value = SAMPLE_CACHING_SYSTEM_PROMPT;
        document.getElementById('cacheTools').value = JSON.stringify(SAMPLE_CACHING_TOOLS, null, 2);
        console.log('Samples loaded');
    });
}

async function sendCachingChat() {
    if (state.isStreaming) return;

    const input = document.getElementById('cachingChatInput');
    const message = input.value.trim();
    if (!message) return;

    const container = document.getElementById('cachingChatMessages');
    if (state.cachingMessages.length === 0) {
        container.innerHTML = '';
    }

    state.cachingMessages.push({ role: 'user', content: message });
    input.value = '';

    const systemPrompt = document.getElementById('cacheSystemPrompt').value.trim();
    const enableCaching = document.getElementById('enableCaching').checked;
    const toolsJson = document.getElementById('cacheTools').value.trim();
    const enableToolsCaching = document.getElementById('enableToolsCaching').checked;

    // Parse tools JSON if provided
    let tools = null;
    if (toolsJson) {
        try {
            tools = JSON.parse(toolsJson);
        } catch (e) {
            showError('Invalid tools JSON: ' + e.message, 'cachingChatMessages');
            return;
        }
    }

    await streamChat('/api/chat/cached', {
        config: getConfig(),
        messages: state.cachingMessages,
        system: systemPrompt || null,
        cache_system: enableCaching,
        tools: tools,
        cache_tools: enableToolsCaching,
        max_tokens: 4096,
        temperature: 1.0
    }, {
        containerId: 'cachingChatMessages',
        debugPanelId: 'cachingDebug',
        messagesKey: 'cachingMessages'
    });
}

function updateCacheStats(usage) {
    const container = document.getElementById('cacheStats');
    const cacheCreated = usage.cache_creation_input_tokens || 0;
    const cacheRead = usage.cache_read_input_tokens || 0;

    container.innerHTML = `
        <div class="cache-stat ${cacheRead > 0 ? 'cache-hit' : ''}">
            <i class="bi bi-database"></i> Cache Read: ${cacheRead} tokens
        </div>
        <div class="cache-stat ${cacheCreated > 0 ? 'cache-miss' : ''}">
            <i class="bi bi-database-add"></i> Cache Created: ${cacheCreated} tokens
        </div>
        <div class="cache-stat">
            <i class="bi bi-arrow-down"></i> Input: ${usage.input_tokens} tokens
        </div>
        <div class="cache-stat">
            <i class="bi bi-arrow-up"></i> Output: ${usage.output_tokens} tokens
        </div>
    `;
}

// ============================================================================
// Section: Structured Data
// ============================================================================

function initStructuredData() {
    const extractBtn = document.getElementById('extractStructured');
    const loadSampleBtn = document.getElementById('loadSampleSchema');

    extractBtn.addEventListener('click', extractStructuredData);

    loadSampleBtn.addEventListener('click', () => {
        const sampleSchema = {
            type: "object",
            properties: {
                name: {
                    type: "string",
                    description: "The person's full name"
                },
                age: {
                    type: "integer",
                    description: "The person's age in years"
                },
                email: {
                    type: "string",
                    description: "The person's email address"
                },
                skills: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of skills"
                }
            },
            required: ["name"]
        };
        document.getElementById('outputSchema').value = JSON.stringify(sampleSchema, null, 2);
        document.getElementById('structuredInput').value =
            "John Smith is a 32-year-old software engineer. You can reach him at john.smith@email.com. " +
            "He's proficient in Python, JavaScript, and machine learning.";
    });
}

async function extractStructuredData() {
    if (state.isStreaming) return;

    const schemaText = document.getElementById('outputSchema').value.trim();
    const inputText = document.getElementById('structuredInput').value.trim();

    if (!schemaText || !inputText) {
        showError('Please provide both a schema and input text', 'structuredOutput');
        return;
    }

    let schema;
    try {
        schema = JSON.parse(schemaText);
    } catch (e) {
        showError('Invalid JSON schema: ' + e.message, 'structuredOutput');
        return;
    }

    state.isStreaming = true;
    document.getElementById('structuredOutput').querySelector('code').textContent = 'Extracting...';

    await streamChat('/api/structured', {
        config: getConfig(),
        messages: [{ role: 'user', content: inputText }],
        output_schema: schema,
        system: "Extract the requested information from the user's input according to the provided schema."
    }, {
        containerId: 'structuredOutput',
        debugPanelId: 'structuredDebug'
    });
}

// ============================================================================
// Configuration UI
// ============================================================================

function initConfig() {
    const toggleBtn = document.getElementById('toggleApiKey');
    const apiKeyInput = document.getElementById('apiKey');

    toggleBtn.addEventListener('click', () => {
        const isPassword = apiKeyInput.type === 'password';
        apiKeyInput.type = isPassword ? 'text' : 'password';
        toggleBtn.innerHTML = isPassword
            ? '<i class="bi bi-eye-slash"></i>'
            : '<i class="bi bi-eye"></i>';
    });
}

// ============================================================================
// Message Actions
// ============================================================================

function editMessage(button) {
    const messageDiv = button.closest('.message');
    const contentDiv = messageDiv.querySelector('.message-content');
    const currentText = contentDiv.textContent;

    const textarea = document.createElement('textarea');
    textarea.className = 'form-control';
    textarea.value = currentText;
    textarea.rows = 3;

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-sm btn-primary mt-2';
    saveBtn.textContent = 'Save';
    saveBtn.onclick = () => {
        contentDiv.innerHTML = renderMarkdown(textarea.value);
    };

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-sm btn-secondary mt-2 ms-2';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => {
        contentDiv.innerHTML = renderMarkdown(currentText);
    };

    contentDiv.innerHTML = '';
    contentDiv.appendChild(textarea);
    contentDiv.appendChild(saveBtn);
    contentDiv.appendChild(cancelBtn);
    textarea.focus();
}

function deleteMessage(button) {
    const messageDiv = button.closest('.message');
    messageDiv.remove();
}

// ============================================================================
// Sidebar Navigation
// ============================================================================

function initSidebar() {
    const navLinks = document.querySelectorAll('.sidebar-nav .nav-link');
    const sections = document.querySelectorAll('.content-section');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();

            // Get target section
            const targetId = link.getAttribute('data-section');
            const targetSection = document.getElementById(targetId);

            if (!targetSection) return;

            // Update active states
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            sections.forEach(s => s.classList.remove('active'));
            targetSection.classList.add('active');

            // Store in localStorage for persistence
            localStorage.setItem('activeSection', targetId);
        });
    });

    // Restore last active section from localStorage
    const savedSection = localStorage.getItem('activeSection');
    if (savedSection) {
        const savedLink = document.querySelector(`[data-section="${savedSection}"]`);
        if (savedLink) {
            savedLink.click();
        }
    }
}

// ============================================================================
// Section: Prompt Evaluation
// ============================================================================

// Evaluation state (extends global state)
state.evalDatasets = {};          // All datasets: { name: [{input, expected_output}, ...] }
state.evalActiveDataset = null;   // Currently selected dataset name
state.evalResults = [];           // Results of last evaluation
state.evalHistory = [];           // History of evaluations

function initEvaluation() {
    // Load from localStorage
    loadEvalState();

    // Dataset management
    document.getElementById('newDatasetBtn').addEventListener('click', createNewDataset);
    document.getElementById('deleteDatasetBtn').addEventListener('click', deleteDataset);
    document.getElementById('datasetSelect').addEventListener('change', selectDataset);
    document.getElementById('importDatasetBtn').addEventListener('click', () => {
        document.getElementById('importDatasetFile').click();
    });
    document.getElementById('importDatasetFile').addEventListener('change', importDataset);
    document.getElementById('exportDatasetBtn').addEventListener('click', exportDataset);

    // Test case management
    document.getElementById('addTestCaseBtn').addEventListener('click', addTestCase);

    // Dataset generation
    document.getElementById('generateDatasetBtn').addEventListener('click', generateDataset);

    // Evaluation
    document.getElementById('runEvaluationBtn').addEventListener('click', runEvaluation);

    // Results
    document.getElementById('resultsFilter').addEventListener('change', filterResults);
    document.getElementById('exportResultsBtn').addEventListener('click', exportResults);

    // Update UI
    refreshDatasetSelect();
    updateEvalTabInfo();
}

function loadEvalState() {
    try {
        const savedDatasets = localStorage.getItem('eval_datasets');
        if (savedDatasets) {
            state.evalDatasets = JSON.parse(savedDatasets);
        }
        const savedHistory = localStorage.getItem('eval_history');
        if (savedHistory) {
            state.evalHistory = JSON.parse(savedHistory);
            renderEvalHistory();
        }
    } catch (e) {
        console.error('Error loading eval state:', e);
    }
}

function saveEvalState() {
    try {
        localStorage.setItem('eval_datasets', JSON.stringify(state.evalDatasets));
        localStorage.setItem('eval_history', JSON.stringify(state.evalHistory));
    } catch (e) {
        console.error('Error saving eval state:', e);
    }
}

function refreshDatasetSelect() {
    const select = document.getElementById('datasetSelect');
    const names = Object.keys(state.evalDatasets);

    select.innerHTML = '<option value="">-- Sélectionner un dataset --</option>';
    names.forEach(name => {
        const count = state.evalDatasets[name].length;
        select.innerHTML += `<option value="${escapeHtml(name)}">${escapeHtml(name)} (${count} cas)</option>`;
    });

    if (state.evalActiveDataset && state.evalDatasets[state.evalActiveDataset]) {
        select.value = state.evalActiveDataset;
    }
}

function createNewDataset() {
    const name = prompt('Nom du nouveau dataset:');
    if (!name || name.trim() === '') return;

    if (state.evalDatasets[name]) {
        alert('Un dataset avec ce nom existe déjà');
        return;
    }

    state.evalDatasets[name] = [];
    state.evalActiveDataset = name;
    saveEvalState();
    refreshDatasetSelect();
    renderTestCases();
    updateEvalTabInfo();
}

function deleteDataset() {
    if (!state.evalActiveDataset) {
        alert('Sélectionnez un dataset à supprimer');
        return;
    }

    if (!confirm(`Supprimer le dataset "${state.evalActiveDataset}" ?`)) return;

    delete state.evalDatasets[state.evalActiveDataset];
    state.evalActiveDataset = null;
    saveEvalState();
    refreshDatasetSelect();
    renderTestCases();
    updateEvalTabInfo();
}

function selectDataset(e) {
    state.evalActiveDataset = e.target.value || null;
    renderTestCases();
    updateEvalTabInfo();
}

function renderTestCases() {
    const tbody = document.getElementById('testCasesBody');
    const countBadge = document.getElementById('testCaseCount');

    if (!state.evalActiveDataset || !state.evalDatasets[state.evalActiveDataset]) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Aucun cas de test</td></tr>';
        countBadge.textContent = '0';
        return;
    }

    const cases = state.evalDatasets[state.evalActiveDataset];
    countBadge.textContent = cases.length;

    if (cases.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Aucun cas de test</td></tr>';
        return;
    }

    tbody.innerHTML = cases.map((tc, idx) => `
        <tr>
            <td>${idx + 1}</td>
            <td title="${escapeHtml(tc.input)}">${escapeHtml(tc.input.substring(0, 50))}${tc.input.length > 50 ? '...' : ''}</td>
            <td title="${escapeHtml(tc.expected_output)}">${escapeHtml(tc.expected_output.substring(0, 50))}${tc.expected_output.length > 50 ? '...' : ''}</td>
            <td>
                <button class="btn btn-outline-primary btn-action" onclick="editTestCase(${idx})" title="Modifier">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-outline-danger btn-action" onclick="deleteTestCase(${idx})" title="Supprimer">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function addTestCase() {
    if (!state.evalActiveDataset) {
        alert('Créez ou sélectionnez un dataset d\'abord');
        return;
    }

    const input = document.getElementById('newTestInput').value.trim();
    const expected = document.getElementById('newTestExpected').value.trim();

    if (!input || !expected) {
        alert('Remplissez les deux champs');
        return;
    }

    state.evalDatasets[state.evalActiveDataset].push({
        input: input,
        expected_output: expected
    });

    document.getElementById('newTestInput').value = '';
    document.getElementById('newTestExpected').value = '';

    saveEvalState();
    refreshDatasetSelect();
    renderTestCases();
    updateEvalTabInfo();
}

function editTestCase(idx) {
    if (!state.evalActiveDataset) return;

    const tc = state.evalDatasets[state.evalActiveDataset][idx];
    const newInput = prompt('Input:', tc.input);
    if (newInput === null) return;

    const newExpected = prompt('Expected Output:', tc.expected_output);
    if (newExpected === null) return;

    state.evalDatasets[state.evalActiveDataset][idx] = {
        input: newInput,
        expected_output: newExpected
    };

    saveEvalState();
    renderTestCases();
}

function deleteTestCase(idx) {
    if (!state.evalActiveDataset) return;
    if (!confirm('Supprimer ce cas de test ?')) return;

    state.evalDatasets[state.evalActiveDataset].splice(idx, 1);
    saveEvalState();
    refreshDatasetSelect();
    renderTestCases();
    updateEvalTabInfo();
}

function importDataset(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = JSON.parse(event.target.result);

            // Validate structure
            if (!Array.isArray(data)) {
                throw new Error('Le fichier doit contenir un tableau JSON');
            }

            for (const item of data) {
                if (!item.input || !item.expected_output) {
                    throw new Error('Chaque élément doit avoir "input" et "expected_output"');
                }
            }

            const name = prompt('Nom du dataset importé:', file.name.replace('.json', ''));
            if (!name) return;

            state.evalDatasets[name] = data;
            state.evalActiveDataset = name;
            saveEvalState();
            refreshDatasetSelect();
            renderTestCases();
            updateEvalTabInfo();

            alert(`Dataset "${name}" importé avec ${data.length} cas`);
        } catch (err) {
            alert('Erreur: ' + err.message);
        }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset file input
}

function exportDataset() {
    if (!state.evalActiveDataset || !state.evalDatasets[state.evalActiveDataset]) {
        alert('Sélectionnez un dataset à exporter');
        return;
    }

    const data = state.evalDatasets[state.evalActiveDataset];
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.evalActiveDataset}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

async function generateDataset() {
    const context = document.getElementById('generateContext').value.trim();
    const count = parseInt(document.getElementById('generateCount').value) || 5;
    const statusEl = document.getElementById('generateStatus');

    if (!context) {
        alert('Entrez un contexte/domaine pour la génération');
        return;
    }

    if (!state.evalActiveDataset) {
        alert('Créez ou sélectionnez un dataset d\'abord');
        return;
    }

    statusEl.textContent = 'Génération en cours...';
    document.getElementById('generateDatasetBtn').disabled = true;

    try {
        const response = await fetch('/api/eval/generate-dataset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                config: getConfig(),
                context: context,
                count: count
            })
        });

        const result = await response.json();

        if (result.success) {
            // Add generated cases to current dataset
            state.evalDatasets[state.evalActiveDataset].push(...result.cases);
            saveEvalState();
            refreshDatasetSelect();
            renderTestCases();
            updateEvalTabInfo();

            statusEl.textContent = `${result.cases.length} cas générés !`;

            // Update debug panel
            updateDebugPanel('evalDebug', result.debug || result);
        } else {
            throw new Error(result.error || 'Erreur de génération');
        }
    } catch (err) {
        statusEl.textContent = 'Erreur: ' + err.message;
        console.error('Generate error:', err);
    } finally {
        document.getElementById('generateDatasetBtn').disabled = false;
    }
}

function updateEvalTabInfo() {
    const nameEl = document.getElementById('evalDatasetName');
    const countEl = document.getElementById('evalTestCount');
    const runBtn = document.getElementById('runEvaluationBtn');

    if (state.evalActiveDataset && state.evalDatasets[state.evalActiveDataset]) {
        const count = state.evalDatasets[state.evalActiveDataset].length;
        nameEl.textContent = state.evalActiveDataset;
        nameEl.className = '';
        countEl.textContent = count;
        runBtn.disabled = count === 0;
    } else {
        nameEl.textContent = 'Aucun sélectionné';
        nameEl.className = 'text-muted';
        countEl.textContent = '0';
        runBtn.disabled = true;
    }
}

function getSelectedCriteria() {
    const criteria = [];

    // Predefined criteria
    document.querySelectorAll('.eval-criteria:checked').forEach(cb => {
        criteria.push(cb.value);
    });

    // Custom criteria
    const customText = document.getElementById('customCriteria').value.trim();
    if (customText) {
        customText.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (trimmed) {
                criteria.push('custom:' + trimmed);
            }
        });
    }

    return criteria;
}

async function runEvaluation() {
    if (!state.evalActiveDataset || !state.evalDatasets[state.evalActiveDataset]) {
        alert('Sélectionnez un dataset');
        return;
    }

    const dataset = state.evalDatasets[state.evalActiveDataset];
    if (dataset.length === 0) {
        alert('Le dataset est vide');
        return;
    }

    const systemPrompt = document.getElementById('evalSystemPrompt').value.trim();
    const criteria = getSelectedCriteria();

    if (criteria.length === 0) {
        alert('Sélectionnez au moins un critère d\'évaluation');
        return;
    }

    // Show progress
    const progressContainer = document.getElementById('evalProgressContainer');
    const progressBar = document.getElementById('evalProgressBar');
    const progressText = document.getElementById('evalProgressText');
    const runBtn = document.getElementById('runEvaluationBtn');

    progressContainer.style.display = 'block';
    runBtn.disabled = true;
    progressBar.style.width = '0%';
    progressBar.textContent = '0%';
    progressText.textContent = 'Lancement de l\'évaluation...';

    const startTime = Date.now();

    try {
        const response = await fetch('/api/eval/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                config: getConfig(),
                system_prompt: systemPrompt,
                dataset: dataset,
                criteria: criteria
            })
        });

        const result = await response.json();

        if (result.success) {
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);

            state.evalResults = result.results;

            // Save to history
            const historyEntry = {
                timestamp: new Date().toISOString(),
                datasetName: state.evalActiveDataset,
                casesCount: dataset.length,
                avgScore: result.stats.avg_score,
                passRate: result.stats.pass_rate,
                duration: duration,
                results: result.results
            };
            state.evalHistory.unshift(historyEntry);
            if (state.evalHistory.length > 10) {
                state.evalHistory.pop();
            }
            saveEvalState();

            // Update debug panel
            updateDebugPanel('evalRunDebug', result.debug || result);

            // Display results
            displayResults(result.results, result.stats, duration);
            renderEvalHistory();

            // Switch to results tab using Bootstrap's Tab API
            const resultsTab = new bootstrap.Tab(document.getElementById('results-tab'));
            resultsTab.show();

            progressText.textContent = 'Évaluation terminée !';
        } else {
            throw new Error(result.error || 'Erreur d\'évaluation');
        }
    } catch (err) {
        progressText.textContent = 'Erreur: ' + err.message;
        console.error('Evaluation error:', err);
    } finally {
        runBtn.disabled = false;
        setTimeout(() => {
            progressContainer.style.display = 'none';
        }, 2000);
    }
}

function displayResults(results, stats, duration) {
    // Update stat cards
    document.getElementById('statAvgScore').textContent = stats.avg_score.toFixed(2) + '/5';
    document.getElementById('statPassRate').textContent = stats.pass_rate.toFixed(0) + '%';
    document.getElementById('statTotalCases').textContent = results.length;
    document.getElementById('statDuration').textContent = duration + 's';

    // Score distribution
    const distribution = document.getElementById('scoreDistribution');
    const scoreCounts = [0, 0, 0, 0, 0]; // scores 1-5
    results.forEach(r => {
        if (r.score >= 1 && r.score <= 5) {
            scoreCounts[r.score - 1]++;
        }
    });

    const maxCount = Math.max(...scoreCounts, 1);
    distribution.innerHTML = scoreCounts.map((count, idx) => {
        const height = (count / maxCount) * 50;
        const score = idx + 1;
        return `
            <div class="score-bar">
                <div class="score-bar-fill score-${score}" style="height: ${height}px;"></div>
                <div class="score-bar-label">★${score}</div>
                <div class="score-bar-count">${count}</div>
            </div>
        `;
    }).join('');

    // Results table
    renderResultsTable(results);
}

function renderResultsTable(results, filter = 'all') {
    const tbody = document.getElementById('resultsBody');

    let filtered = results;
    if (filter === 'pass') {
        filtered = results.filter(r => r.score >= 4);
    } else if (filter === 'fail') {
        filtered = results.filter(r => r.score < 4);
    }

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Aucun résultat</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map((r, idx) => `
        <tr>
            <td>${idx + 1}</td>
            <td title="${escapeHtml(r.input)}">${escapeHtml(r.input.substring(0, 40))}...</td>
            <td title="${escapeHtml(r.expected_output)}">${escapeHtml(r.expected_output.substring(0, 40))}...</td>
            <td title="${escapeHtml(r.actual_output)}">${escapeHtml(r.actual_output.substring(0, 40))}...</td>
            <td><span class="score-badge score-${r.score}">${r.score}/5</span></td>
            <td>
                <button class="btn btn-outline-secondary btn-view" onclick="showResultDetail(${idx})">
                    <i class="bi bi-eye"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function filterResults() {
    const filter = document.getElementById('resultsFilter').value;
    renderResultsTable(state.evalResults, filter);
}

function showResultDetail(idx) {
    const r = state.evalResults[idx];
    if (!r) return;

    document.getElementById('modalInput').textContent = r.input;
    document.getElementById('modalExpected').textContent = r.expected_output;
    document.getElementById('modalActual').textContent = r.actual_output;

    const scoreEl = document.getElementById('modalScore');
    scoreEl.textContent = r.score + '/5';
    scoreEl.className = `badge score-badge score-${r.score}`;

    document.getElementById('modalJustification').textContent = r.justification || 'N/A';

    const strengthsEl = document.getElementById('modalStrengths');
    strengthsEl.innerHTML = (r.strengths || []).map(s => `<li>${escapeHtml(s)}</li>`).join('');

    const weaknessesEl = document.getElementById('modalWeaknesses');
    weaknessesEl.innerHTML = (r.weaknesses || []).map(w => `<li>${escapeHtml(w)}</li>`).join('');

    const modal = new bootstrap.Modal(document.getElementById('resultDetailModal'));
    modal.show();
}

function exportResults() {
    if (state.evalResults.length === 0) {
        alert('Aucun résultat à exporter');
        return;
    }

    const exportData = {
        timestamp: new Date().toISOString(),
        dataset: state.evalActiveDataset,
        results: state.evalResults
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `eval-results-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function renderEvalHistory() {
    const container = document.getElementById('evalHistory');

    if (state.evalHistory.length === 0) {
        container.innerHTML = '<div class="text-muted">Aucune évaluation précédente</div>';
        return;
    }

    container.innerHTML = state.evalHistory.map((h, idx) => {
        const date = new Date(h.timestamp);
        const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
        return `
            <div class="eval-history-item" onclick="loadHistoryEntry(${idx})">
                <div>
                    <strong>${escapeHtml(h.datasetName)}</strong>
                    <span class="timestamp">${dateStr}</span>
                </div>
                <div class="stats">
                    <span class="badge bg-secondary">${h.casesCount} cas</span>
                    <span class="badge ${h.passRate >= 70 ? 'bg-success' : 'bg-warning'}">${h.passRate.toFixed(0)}%</span>
                    <span class="badge bg-info">${h.avgScore.toFixed(1)}/5</span>
                </div>
            </div>
        `;
    }).join('');
}

function loadHistoryEntry(idx) {
    const entry = state.evalHistory[idx];
    if (!entry || !entry.results) return;

    state.evalResults = entry.results;

    const stats = {
        avg_score: entry.avgScore,
        pass_rate: entry.passRate
    };

    displayResults(entry.results, stats, entry.duration);
}

// ============================================================================
// Text Editor Tool Section
// ============================================================================

async function initTextEditorSession() {
    try {
        const response = await fetch('/api/texteditor/session', { method: 'POST' });
        const data = await response.json();
        state.textEditorSessionId = data.session_id;
        console.log('Text Editor session created:', state.textEditorSessionId);
    } catch (error) {
        console.error('Failed to create text editor session:', error);
    }
}

function refreshTextEditorFiles() {
    if (!state.textEditorSessionId) return;

    fetch(`/api/texteditor/files/${state.textEditorSessionId}`)
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                state.textEditorFiles = data.files;
                renderTextEditorFileList();
            }
        });
}

function renderTextEditorFileList() {
    const container = document.getElementById('textEditorFileList');

    if (state.textEditorFiles.length === 0) {
        container.innerHTML = `
            <div class="text-muted text-center py-3">
                <i class="bi bi-folder2-open"></i>
                <small>No files yet</small>
            </div>
        `;
        return;
    }

    container.innerHTML = state.textEditorFiles.map(file => {
        const icon = getFileIcon(file.path);
        const isActive = state.textEditorCurrentFile === file.path ? 'active' : '';
        return `
            <div class="file-item ${isActive}" onclick="selectTextEditorFile('${escapeHtml(file.path)}')">
                <i class="bi ${icon}"></i>
                <span class="file-name">${escapeHtml(file.path)}</span>
                <span class="file-size">${formatFileSize(file.size)}</span>
            </div>
        `;
    }).join('');
}

function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const iconMap = {
        'py': 'bi-filetype-py',
        'js': 'bi-filetype-js',
        'ts': 'bi-filetype-tsx',
        'html': 'bi-filetype-html',
        'css': 'bi-filetype-css',
        'json': 'bi-filetype-json',
        'md': 'bi-filetype-md',
        'txt': 'bi-file-text',
        'xml': 'bi-filetype-xml',
        'yml': 'bi-filetype-yml',
        'yaml': 'bi-filetype-yml'
    };
    return iconMap[ext] || 'bi-file-earmark';
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function selectTextEditorFile(filePath) {
    if (!state.textEditorSessionId) return;

    state.textEditorCurrentFile = filePath;
    document.getElementById('currentEditorFile').textContent = filePath;

    // Refresh file list to update selection
    renderTextEditorFileList();

    // Fetch file content
    try {
        const response = await fetch(`/api/texteditor/file/${state.textEditorSessionId}/${filePath}`);
        const data = await response.json();

        if (data.success) {
            await updateTextEditorContent(data.content, filePath);
        }
    } catch (error) {
        console.error('Failed to load file:', error);
    }
}

async function updateTextEditorContent(content, filePath) {
    const container = document.getElementById('textEditorCodeMirror');

    // Load CodeMirror if not already loaded
    if (typeof window.loadCodeMirror === 'function') {
        try {
            const CM = await window.loadCodeMirror();

            // Clear existing editor
            container.innerHTML = '';

            // Determine language from file extension
            const ext = filePath.split('.').pop().toLowerCase();
            const langMap = {
                'py': CM.languages.python(),
                'js': CM.languages.javascript(),
                'ts': CM.languages.javascript(),
                'json': CM.languages.json(),
                'md': CM.languages.markdown(),
                'html': CM.languages.html(),
                'css': CM.languages.css()
            };

            const extensions = [CM.basicSetup];
            if (langMap[ext]) {
                extensions.push(langMap[ext]);
            }

            state.textEditorCodeMirror = new CM.EditorView({
                state: CM.EditorState.create({
                    doc: content,
                    extensions: extensions
                }),
                parent: container
            });
        } catch (error) {
            console.error('Failed to load CodeMirror:', error);
            // Fallback to textarea
            container.innerHTML = `<textarea class="form-control font-monospace" style="height: 280px;" readonly>${escapeHtml(content)}</textarea>`;
        }
    } else {
        // Fallback to simple textarea
        container.innerHTML = `<textarea class="form-control font-monospace" style="height: 280px;" readonly>${escapeHtml(content)}</textarea>`;
    }
}

function renderTextEditorHistory() {
    const container = document.getElementById('textEditorHistory');

    if (state.textEditorHistory.length === 0) {
        container.innerHTML = '<div class="text-muted text-center py-2"><small>No edits yet</small></div>';
        return;
    }

    container.innerHTML = state.textEditorHistory.map((item, idx) => {
        const time = new Date(item.timestamp).toLocaleTimeString();
        const hasOld = item.old_content !== null;
        const hasNew = item.new_content !== null;
        const showDiff = hasOld && hasNew && item.command === 'str_replace';

        return `
            <div class="history-item ${item.command}">
                <span class="history-time">${time}</span>
                <div class="history-details">
                    <div class="history-command">${item.command}</div>
                    <div class="history-path">${escapeHtml(item.path)}</div>
                    ${showDiff ? `<span class="history-diff" onclick="toggleHistoryDiff(${idx})">Show diff</span>` : ''}
                    <div class="diff-preview d-none" id="historyDiff${idx}">
                        ${item.details.old_str ? `<div class="diff-old">${escapeHtml(item.details.old_str)}</div>` : ''}
                        ${item.details.new_str ? `<div class="diff-new">${escapeHtml(item.details.new_str)}</div>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function toggleHistoryDiff(idx) {
    const diffEl = document.getElementById(`historyDiff${idx}`);
    if (diffEl) {
        diffEl.classList.toggle('d-none');
    }
}

async function sendTextEditorChat() {
    if (state.isStreaming) return;

    const input = document.getElementById('textEditorChatInput');
    const message = input.value.trim();
    if (!message) return;

    if (!state.textEditorSessionId) {
        await initTextEditorSession();
    }

    input.value = '';

    state.textEditorMessages.push({ role: 'user', content: message });

    const container = document.getElementById('textEditorChatMessages');
    if (container.querySelector('.text-muted.text-center')) {
        container.innerHTML = '';
    }

    const systemPrompt = `You are a helpful coding assistant with access to a text editor tool. You can create, view, edit, and undo changes to files in the sandbox.

Available commands:
- view: View file contents or directory listing
- create: Create a new file with content
- str_replace: Replace a unique string in a file
- insert: Insert text at a specific line number
- undo_edit: Undo the last edit to a file

Always use the text editor tool to perform file operations when asked. After making changes, briefly explain what you did.`;

    await streamChat('/api/texteditor/chat', {
        config: getConfig(),
        messages: state.textEditorMessages,
        session_id: state.textEditorSessionId,
        system: systemPrompt
    }, {
        containerId: 'textEditorChatMessages',
        debugPanelId: 'textEditorDebug',
        messagesKey: 'textEditorMessages',
        onComplete: (response) => {
            if (response) {
                state.textEditorMessages.push({ role: 'assistant', content: response });
            }
        }
    });
}

function initTextEditor() {
    // Initialize session
    initTextEditorSession();

    // Refresh files button
    document.getElementById('refreshTextEditorFiles').addEventListener('click', refreshTextEditorFiles);

    // Reset session button
    document.getElementById('resetTextEditorSession').addEventListener('click', async () => {
        if (state.textEditorSessionId) {
            await fetch(`/api/texteditor/session/${state.textEditorSessionId}`, { method: 'DELETE' });
        }
        state.textEditorMessages = [];
        state.textEditorFiles = [];
        state.textEditorHistory = [];
        state.textEditorCurrentFile = null;
        await initTextEditorSession();

        document.getElementById('textEditorChatMessages').innerHTML = `
            <div class="text-muted text-center py-5">
                <i class="bi bi-pencil-square fs-1"></i>
                <p>Ask Claude to create or edit files</p>
                <small>Try: "Create a Python file called hello.py with a function that prints Hello World"</small>
            </div>
        `;
        document.getElementById('currentEditorFile').textContent = 'No file selected';
        document.getElementById('textEditorCodeMirror').innerHTML = '';
        renderTextEditorFileList();
        renderTextEditorHistory();
    });

    // Clear chat button
    document.getElementById('clearTextEditorChat').addEventListener('click', () => {
        state.textEditorMessages = [];
        document.getElementById('textEditorChatMessages').innerHTML = `
            <div class="text-muted text-center py-5">
                <i class="bi bi-pencil-square fs-1"></i>
                <p>Ask Claude to create or edit files</p>
                <small>Try: "Create a Python file called hello.py with a function that prints Hello World"</small>
            </div>
        `;
    });

    // Send button
    document.getElementById('sendTextEditorChat').addEventListener('click', sendTextEditorChat);

    // Enter key handler
    document.getElementById('textEditorChatInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendTextEditorChat();
        }
    });
}

// ============================================================================
// Code Execution Section
// ============================================================================

function initCodeExecDropZone() {
    const dropZone = document.getElementById('codeExecDropZone');
    const fileInput = document.getElementById('codeExecFileInput');

    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const files = Array.from(e.dataTransfer.files);
        for (const file of files) {
            await uploadCodeExecFile(file);
        }
    });

    fileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        for (const file of files) {
            await uploadCodeExecFile(file);
        }
        fileInput.value = '';
    });
}

async function uploadCodeExecFile(file) {
    const config = getConfig();
    if (!config.api_key) {
        alert('Please configure your API key first');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('api_key', config.api_key);

    try {
        const response = await fetch('/api/codeexec/upload', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            state.codeExecUploadedFiles.push({
                name: data.filename,
                file_id: data.file_id,
                size: data.size,
                mime_type: data.mime_type
            });
            state.codeExecFileIds.push(data.file_id);
            renderCodeExecUploadedFiles();
        } else {
            alert('Upload failed: ' + data.error);
        }
    } catch (error) {
        console.error('Upload error:', error);
        alert('Upload failed: ' + error.message);
    }
}

function renderCodeExecUploadedFiles() {
    const container = document.getElementById('codeExecUploadedFiles');

    if (state.codeExecUploadedFiles.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = state.codeExecUploadedFiles.map((file, idx) => `
        <div class="uploaded-file">
            <i class="bi bi-file-earmark"></i>
            <span class="file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
            <button class="remove-file" onclick="removeCodeExecFile(${idx})">
                <i class="bi bi-x"></i>
            </button>
        </div>
    `).join('');
}

function removeCodeExecFile(idx) {
    state.codeExecUploadedFiles.splice(idx, 1);
    state.codeExecFileIds.splice(idx, 1);
    renderCodeExecUploadedFiles();
}

async function sendCodeExecChat() {
    if (state.isStreaming) return;

    const input = document.getElementById('codeExecChatInput');
    const message = input.value.trim();
    if (!message) return;

    input.value = '';

    state.codeExecMessages.push({ role: 'user', content: message });

    const container = document.getElementById('codeExecChatMessages');
    if (container.querySelector('.text-muted.text-center')) {
        container.innerHTML = '';
    }

    const systemPrompt = `You are a data analysis assistant. You can execute Python code to analyze data and create visualizations.

Important notes:
- Each code execution starts fresh - reimport all libraries and reload data each time
- Use matplotlib or seaborn for visualizations
- Save plots using plt.savefig() to return them
- Print results to stdout for the user to see
- Be concise but thorough in your analysis`;

    await streamCodeExecChat('/api/codeexec/chat', {
        config: getConfig(),
        messages: state.codeExecMessages,
        file_ids: state.codeExecFileIds.length > 0 ? state.codeExecFileIds : null,
        system: systemPrompt
    }, {
        containerId: 'codeExecChatMessages',
        debugPanelId: 'codeExecDebug',
        messagesKey: 'codeExecMessages'
    });
}

async function streamCodeExecChat(endpoint, body, options) {
    const { containerId, debugPanelId } = options;
    const container = document.getElementById(containerId);
    const outputContainer = document.getElementById('codeExecOutput');
    const imagesContainer = document.getElementById('codeExecImages');
    const downloadsContainer = document.getElementById('codeExecDownloads');
    const codeContainer = document.getElementById('codeExecCodeMirror');

    state.isStreaming = true;

    // Add user message to UI
    if (body.messages && body.messages.length > 0) {
        const lastUserMsg = body.messages[body.messages.length - 1];
        if (lastUserMsg.role === 'user') {
            container.appendChild(createMessageElement('user', lastUserMsg.content));
        }
    }

    const streamingDiv = addStreamingIndicator(container);
    let responseText = '';

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));

                        switch (data.type) {
                            case 'debug_request':
                                updateDebugPanel(debugPanelId, { request: data.data }, false);
                                break;

                            case 'debug_response':
                                updateDebugPanel(debugPanelId, { response: data.data }, true);
                                break;

                            case 'text':
                                responseText += data.data;
                                streamingDiv.querySelector('.message-content').innerHTML = renderMarkdown(responseText);
                                scrollToBottom(container);
                                break;

                            case 'tool_call':
                                if (data.data.name === 'code_execution' && data.data.input) {
                                    const code = data.data.input.code || '';
                                    state.codeExecLastCode = code;
                                    await displayCodeInEditor(code, codeContainer);
                                }
                                break;

                            case 'code_execution_result':
                                // Display output
                                let outputHtml = '';
                                if (data.data.stdout) {
                                    outputHtml += `<div class="stdout">${escapeHtml(data.data.stdout)}</div>`;
                                }
                                if (data.data.stderr) {
                                    outputHtml += `<div class="stderr">${escapeHtml(data.data.stderr)}</div>`;
                                }
                                if (!outputHtml) {
                                    outputHtml = '<div class="text-muted">No output</div>';
                                }
                                outputContainer.innerHTML = outputHtml;

                                // Display images
                                if (data.data.content) {
                                    imagesContainer.innerHTML = '';
                                    downloadsContainer.innerHTML = '';

                                    for (const item of data.data.content) {
                                        if (item.type === 'image' && item.source) {
                                            const imgSrc = `data:${item.source.media_type};base64,${item.source.data}`;
                                            imagesContainer.innerHTML += `<img src="${imgSrc}" alt="Generated visualization">`;
                                        } else if (item.type === 'file' && item.file_id) {
                                            const config = getConfig();
                                            downloadsContainer.innerHTML += `
                                                <div class="download-item" onclick="downloadCodeExecFile('${item.file_id}')">
                                                    <i class="bi bi-download"></i>
                                                    <span>Download file</span>
                                                </div>
                                            `;
                                        }
                                    }
                                }
                                break;

                            case 'error':
                                showError(data.data, containerId);
                                break;

                            case 'done':
                                break;
                        }
                    } catch (e) {
                        console.error('Failed to parse SSE data:', e);
                    }
                }
            }
        }

        // Finalize
        streamingDiv.remove();
        if (responseText) {
            state.codeExecMessages.push({ role: 'assistant', content: responseText });
            container.appendChild(createMessageElement('assistant', responseText));
        }

    } catch (error) {
        streamingDiv.remove();
        showError(error.message, containerId);
    } finally {
        state.isStreaming = false;
    }
}

async function displayCodeInEditor(code, container) {
    if (typeof window.loadCodeMirror === 'function') {
        try {
            const CM = await window.loadCodeMirror();
            container.innerHTML = '';

            state.codeExecCodeMirror = new CM.EditorView({
                state: CM.EditorState.create({
                    doc: code,
                    extensions: [CM.basicSetup, CM.languages.python()]
                }),
                parent: container
            });
        } catch (error) {
            container.innerHTML = `<pre class="bg-dark text-light p-3 rounded"><code>${escapeHtml(code)}</code></pre>`;
        }
    } else {
        container.innerHTML = `<pre class="bg-dark text-light p-3 rounded"><code>${escapeHtml(code)}</code></pre>`;
    }
}

function downloadCodeExecFile(fileId) {
    const config = getConfig();
    window.open(`/api/codeexec/download/${fileId}?api_key=${encodeURIComponent(config.api_key)}`, '_blank');
}

function initCodeExec() {
    initCodeExecDropZone();

    // Clear chat button
    document.getElementById('clearCodeExecChat').addEventListener('click', () => {
        state.codeExecMessages = [];
        document.getElementById('codeExecChatMessages').innerHTML = `
            <div class="text-muted text-center py-5">
                <i class="bi bi-terminal fs-1"></i>
                <p>Ask Claude to analyze data or generate visualizations</p>
                <small>Try: "Analyze this CSV and create a chart showing the main trends"</small>
            </div>
        `;
        document.getElementById('codeExecOutput').innerHTML = '<div class="text-muted text-center py-3"><small>Output will appear here after code execution</small></div>';
        document.getElementById('codeExecImages').innerHTML = '';
        document.getElementById('codeExecDownloads').innerHTML = '';
        document.getElementById('codeExecCodeMirror').innerHTML = '';
    });

    // Send button
    document.getElementById('sendCodeExecChat').addEventListener('click', sendCodeExecChat);

    // Enter key handler
    document.getElementById('codeExecChatInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendCodeExecChat();
        }
    });
}

// ============================================================================
// Citations Section
// ============================================================================

function initCitationsDropZone() {
    const dropZone = document.getElementById('citationsDropZone');
    const fileInput = document.getElementById('citationsFileInput');

    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) {
            await processCitationsFile(file);
        }
    });

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            await processCitationsFile(file);
        }
        fileInput.value = '';
    });
}

async function processCitationsFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();

    let mediaType;
    let isText = false;

    switch (ext) {
        case 'pdf':
            mediaType = 'application/pdf';
            break;
        case 'txt':
        case 'md':
            mediaType = 'text/plain';
            isText = true;
            break;
        case 'html':
            mediaType = 'text/html';
            isText = true;
            break;
        default:
            alert('Unsupported file type. Please use PDF, TXT, MD, or HTML.');
            return;
    }

    try {
        if (isText) {
            const text = await file.text();
            state.citationsDocumentText = text;
            state.citationsDocumentBase64 = null;
        } else {
            const arrayBuffer = await file.arrayBuffer();
            const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
            state.citationsDocumentBase64 = base64;
            state.citationsDocumentText = null;
        }

        state.citationsDocumentType = mediaType;
        state.citationsDocumentTitle = file.name;
        state.citationsDocument = file;

        renderCitationsUploadedDoc();
        document.getElementById('sendCitationsChat').disabled = false;

    } catch (error) {
        console.error('Error processing file:', error);
        alert('Failed to process file: ' + error.message);
    }
}

function renderCitationsUploadedDoc() {
    const container = document.getElementById('citationsUploadedDoc');

    if (!state.citationsDocument && !state.citationsDocumentText) {
        container.innerHTML = '';
        return;
    }

    const isPdf = state.citationsDocumentType === 'application/pdf';
    const icon = isPdf ? 'bi-file-pdf' : 'bi-file-text';
    const typeClass = isPdf ? 'pdf' : 'text';

    const name = state.citationsDocumentTitle || 'Document';
    const size = state.citationsDocument ? formatFileSize(state.citationsDocument.size) : '';

    container.innerHTML = `
        <div class="uploaded-doc ${typeClass}">
            <i class="bi ${icon}"></i>
            <div class="doc-info">
                <div class="doc-name">${escapeHtml(name)}</div>
                <div class="doc-size">${size}</div>
            </div>
            <span class="remove-doc" onclick="removeCitationsDoc()">
                <i class="bi bi-x-lg"></i>
            </span>
        </div>
    `;
}

function removeCitationsDoc() {
    state.citationsDocument = null;
    state.citationsDocumentBase64 = null;
    state.citationsDocumentText = null;
    state.citationsDocumentTitle = 'Document';
    renderCitationsUploadedDoc();
    document.getElementById('sendCitationsChat').disabled = true;
}

async function sendCitationsChat() {
    if (state.isStreaming) return;

    const input = document.getElementById('citationsChatInput');
    const message = input.value.trim();
    if (!message) return;

    // Check for text input tab content
    const textInput = document.getElementById('citationsTextInput');
    const textTitle = document.getElementById('citationsTextTitle');

    if (!state.citationsDocumentBase64 && !state.citationsDocumentText) {
        // Check if user pasted text
        if (textInput.value.trim()) {
            state.citationsDocumentText = textInput.value.trim();
            state.citationsDocumentTitle = textTitle.value.trim() || 'Pasted Text';
            state.citationsDocumentType = 'text/plain';
            document.getElementById('sendCitationsChat').disabled = false;
        } else {
            alert('Please upload a document or paste text first');
            return;
        }
    }

    input.value = '';

    state.citationsMessages.push({ role: 'user', content: message });

    const container = document.getElementById('citationsChatMessages');
    if (container.querySelector('.text-muted.text-center')) {
        container.innerHTML = '';
    }

    await streamCitationsChat('/api/citations/chat', {
        config: getConfig(),
        messages: state.citationsMessages,
        document_base64: state.citationsDocumentBase64,
        document_text: state.citationsDocumentText,
        document_type: state.citationsDocumentType,
        document_title: state.citationsDocumentTitle
    }, {
        containerId: 'citationsChatMessages',
        debugPanelId: 'citationsDebug',
        messagesKey: 'citationsMessages'
    });
}

async function streamCitationsChat(endpoint, body, options) {
    const { containerId, debugPanelId } = options;
    const container = document.getElementById(containerId);

    state.isStreaming = true;

    // Add user message to UI
    if (body.messages && body.messages.length > 0) {
        const lastUserMsg = body.messages[body.messages.length - 1];
        if (lastUserMsg.role === 'user') {
            container.appendChild(createMessageElement('user', lastUserMsg.content));
        }
    }

    const streamingDiv = addStreamingIndicator(container);
    let responseText = '';
    let citations = [];

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));

                        switch (data.type) {
                            case 'debug_request':
                                updateDebugPanel(debugPanelId, { request: data.data }, false);
                                break;

                            case 'debug_response':
                                updateDebugPanel(debugPanelId, { response: data.data }, true);
                                break;

                            case 'text_with_citations':
                                responseText = data.data.text;
                                citations = data.data.citations || [];

                                // Render text with citation markers
                                const renderedContent = renderTextWithCitations(responseText, citations);
                                streamingDiv.querySelector('.message-content').innerHTML = renderedContent;
                                scrollToBottom(container);
                                break;

                            case 'error':
                                showError(data.data, containerId);
                                break;

                            case 'done':
                                break;
                        }
                    } catch (e) {
                        console.error('Failed to parse SSE data:', e);
                    }
                }
            }
        }

        // Finalize
        streamingDiv.remove();
        if (responseText) {
            state.citationsMessages.push({ role: 'assistant', content: responseText });

            const msgDiv = document.createElement('div');
            msgDiv.className = 'message message-assistant message-with-citations';
            msgDiv.innerHTML = `
                <div class="message-role">Assistant</div>
                <div class="message-content">${renderTextWithCitations(responseText, citations)}</div>
            `;
            container.appendChild(msgDiv);

            // Store citations for modal display
            msgDiv.setAttribute('data-citations', JSON.stringify(citations));
        }

    } catch (error) {
        streamingDiv.remove();
        showError(error.message, containerId);
    } finally {
        state.isStreaming = false;
    }
}

function renderTextWithCitations(text, citations) {
    if (!citations || citations.length === 0) {
        return renderMarkdown(text);
    }

    // Create citation markers [1], [2], etc.
    let html = renderMarkdown(text);

    // Add citation references at the end
    const citationRefs = citations.map((c, idx) => {
        const preview = c.cited_text ? c.cited_text.substring(0, 100) + (c.cited_text.length > 100 ? '...' : '') : '';
        return `
            <span class="citation-marker"
                  onclick="showCitationDetail(${idx})"
                  data-citation-index="${idx}"
                  title="${escapeHtml(preview)}">
                [${idx + 1}]
            </span>
        `;
    }).join(' ');

    // Store citations globally for modal access
    window.currentCitations = citations;

    return html + `<div class="mt-2"><small class="text-muted">Citations: </small>${citationRefs}</div>`;
}

function showCitationDetail(idx) {
    const citations = window.currentCitations || [];
    const citation = citations[idx];
    if (!citation) return;

    document.getElementById('citationModalDocTitle').textContent = citation.document_title || 'Unknown';
    document.getElementById('citationModalText').textContent = citation.cited_text || 'No text available';

    const pageContainer = document.getElementById('citationModalPageContainer');
    const charContainer = document.getElementById('citationModalCharContainer');

    if (citation.page_number !== undefined) {
        document.getElementById('citationModalPage').textContent = citation.page_number;
        pageContainer.style.display = 'block';
    } else {
        pageContainer.style.display = 'none';
    }

    if (citation.start_char_index !== undefined && citation.end_char_index !== undefined) {
        document.getElementById('citationModalCharRange').textContent = `${citation.start_char_index} - ${citation.end_char_index}`;
        charContainer.style.display = 'block';
    } else {
        charContainer.style.display = 'none';
    }

    const modal = new bootstrap.Modal(document.getElementById('citationDetailModal'));
    modal.show();
}

function initCitations() {
    initCitationsDropZone();

    // Text input change handler to enable send button
    document.getElementById('citationsTextInput').addEventListener('input', (e) => {
        const hasText = e.target.value.trim().length > 0;
        const hasFile = state.citationsDocumentBase64 || state.citationsDocumentText;
        document.getElementById('sendCitationsChat').disabled = !hasText && !hasFile;
    });

    // Clear chat button
    document.getElementById('clearCitationsChat').addEventListener('click', () => {
        state.citationsMessages = [];
        document.getElementById('citationsChatMessages').innerHTML = `
            <div class="text-muted text-center py-5">
                <i class="bi bi-quote fs-1"></i>
                <p>Upload a document and ask questions</p>
                <small>Claude will cite specific passages from the document</small>
            </div>
        `;
    });

    // Send button
    document.getElementById('sendCitationsChat').addEventListener('click', sendCitationsChat);

    // Enter key handler
    document.getElementById('citationsChatInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendCitationsChat();
        }
    });
}

// ============================================================================
// Initialize All Sections
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    initSidebar();
    initConfig();
    initBasicChat();
    initPromptEngineering();
    initToolUse();
    initTextEditor();
    initFileUpload();
    initCodeExec();
    initThinking();
    initCaching();
    initStructuredData();
    initCitations();
    initEvaluation();

    // Initialize syntax highlighting
    hljs.highlightAll();

    console.log('Workshop UI initialized');
});
