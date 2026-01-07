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

    // Uploaded files
    uploadedFiles: [],

    // Sample tools (loaded from API)
    sampleTools: [],

    // View mode (rendered vs raw)
    rawViewMode: false,

    // Currently streaming
    isStreaming: false
};

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
                                updateDebugPanel(debugPanel, { request: data.data });
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
                                // Show tool call
                                const toolCallDiv = createMessageElement('tool_call',
                                    `Calling: ${data.data.name}\nInput: ${JSON.stringify(data.data.input, null, 2)}`,
                                    { toolName: data.data.name });
                                container.insertBefore(toolCallDiv, streamingDiv);
                                break;

                            case 'tool_result':
                                // Show tool result
                                const toolResultDiv = createMessageElement('tool_result',
                                    `Result from ${data.data.name}:\n${data.data.result}`,
                                    { toolName: data.data.name });
                                container.insertBefore(toolResultDiv, streamingDiv);
                                responseText = ''; // Reset for next assistant response
                                break;

                            case 'structured_data':
                                document.getElementById('structuredOutput').querySelector('code').textContent =
                                    formatJson(data.data);
                                hljs.highlightElement(document.getElementById('structuredOutput').querySelector('code'));
                                break;

                            case 'cache_stats':
                                updateCacheStats(data.data);
                                break;

                            case 'error':
                                showError(data.data, containerId);
                                streamingDiv.remove();
                                state.isStreaming = false;
                                return;

                            case 'done':
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
                                        state[messagesKey].push({ role: 'assistant', content: responseText });
                                    }
                                } else {
                                    streamingDiv.remove();
                                }

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
            <button class="remove-file" onclick="removeFile(${index})">&times;</button>
            ${file.file_type === 'image'
            ? `<img src="data:${file.content_type};base64,${file.base64}" alt="${file.filename}">`
            : `<i class="bi bi-file-earmark-pdf fs-1 text-danger"></i>`
        }
            <div class="file-name">${file.filename}</div>
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

    await streamChat('/api/chat/cached', {
        config: getConfig(),
        messages: state.cachingMessages,
        system: systemPrompt || null,
        cache_system: enableCaching,
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
// Initialize All Sections
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    initSidebar();
    initConfig();
    initBasicChat();
    initPromptEngineering();
    initToolUse();
    initFileUpload();
    initThinking();
    initCaching();
    initStructuredData();

    // Initialize syntax highlighting
    hljs.highlightAll();

    console.log('Workshop UI initialized');
});
