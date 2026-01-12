/**
 * SSE Streaming Handler
 */

import { state } from '../state.js';
import { 
    escapeHtml, 
    scrollToBottom, 
    showError, 
    createMessageElement, 
    addStreamingIndicator, 
    updateDebugPanel 
} from '../utils/dom.js';
import { renderMarkdown } from '../utils/formatting.js';

export async function streamChat(endpoint, body, options) {
    const { containerId, debugPanelId, messagesKey, onComplete } = options;
    const container = document.getElementById(containerId);
    const debugPanel = debugPanelId;

    state.isStreaming = true;

    // Add user message to UI
    if (body.messages && body.messages.length > 0) {
        const lastUserMsg = body.messages[body.messages.length - 1];
        if (lastUserMsg.role === 'user') {
            let displayContent = lastUserMsg.content;
            if (Array.isArray(lastUserMsg.content)) {
                displayContent = lastUserMsg.content
                    .filter(c => c.type === 'text')
                    .map(c => c.text)
                    .join('\n');
                const files = lastUserMsg.content.filter(c => c.type === 'image' || c.type === 'document');
                if (files.length > 0) {
                    displayContent += `\n[${files.length} file(s) attached]`;
                }
            }
            container.appendChild(createMessageElement('user', displayContent, { showActions: true }));
        }
    }

    const streamingDiv = addStreamingIndicator(container);
    let responseText = '';
    let thinkingText = '';
    let isFirstDebugRequest = true;
    let currentToolCalls = [];
    let currentToolResults = [];
    let currentAssistantContent = [];

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
                                updateDebugPanel(debugPanel, { request: data.data }, !isFirstDebugRequest);
                                isFirstDebugRequest = false;
                                break;

                            case 'debug_response':
                                updateDebugPanel(debugPanel, { response: data.data }, true);
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
                                const toolCallDiv = createMessageElement('tool_call',
                                    `Calling: ${data.data.name}\nInput: ${JSON.stringify(data.data.input, null, 2)}`,
                                    { toolName: data.data.name });
                                container.insertBefore(toolCallDiv, streamingDiv);
                                
                                if (responseText && currentAssistantContent.length === 0) {
                                    currentAssistantContent.push({ type: 'text', text: responseText });
                                }
                                
                                currentAssistantContent.push({
                                    type: 'tool_use',
                                    id: data.data.id,
                                    name: data.data.name,
                                    input: data.data.input
                                });
                                
                                currentToolCalls.push({
                                    type: 'tool_use',
                                    id: data.data.id,
                                    name: data.data.name,
                                    input: data.data.input
                                });
                                break;

                            case 'tool_result':
                                const toolResultDiv = createMessageElement('tool_result',
                                    `Result from ${data.data.name}:\n${data.data.result}`,
                                    { toolName: data.data.name });
                                container.insertBefore(toolResultDiv, streamingDiv);
                                
                                currentToolResults.push({
                                    type: 'tool_result',
                                    tool_use_id: data.data.tool_use_id,
                                    content: String(data.data.result)
                                });
                                
                                if (messagesKey && state[messagesKey] && currentToolCalls.length > 0) {
                                    if (currentToolResults.length >= currentToolCalls.length) {
                                        state[messagesKey].push({
                                            role: 'assistant',
                                            content: currentAssistantContent.slice()
                                        });
                                        state[messagesKey].push({
                                            role: 'user',
                                            content: currentToolResults.slice()
                                        });
                                        currentToolCalls = [];
                                        currentToolResults = [];
                                        currentAssistantContent = [];
                                        responseText = '';
                                    }
                                }
                                break;

                            case 'structured_data':
                                document.getElementById('structuredOutput').querySelector('code').textContent =
                                    JSON.stringify(data.data, null, 2);
                                hljs.highlightElement(document.getElementById('structuredOutput').querySelector('code'));
                                break;

                            case 'cache_stats':
                                if (window.updateCacheStats) {
                                    window.updateCacheStats(data.data);
                                }
                                break;

                            case 'files_updated':
                                if (state.textEditorSessionId && window.renderTextEditorFileList) {
                                    state.textEditorFiles = data.data;
                                    window.renderTextEditorFileList();
                                    if (!state.textEditorCurrentFile && data.data.length > 0) {
                                        window.selectTextEditorFile(data.data[0].path);
                                    } else if (state.textEditorCurrentFile) {
                                        window.selectTextEditorFile(state.textEditorCurrentFile);
                                    }
                                }
                                break;

                            case 'history_updated':
                                if (state.textEditorSessionId && window.renderTextEditorHistory) {
                                    state.textEditorHistory = data.data;
                                    window.renderTextEditorHistory();
                                }
                                break;

                            case 'text_with_citations':
                                if (window.handleCitationsResponse) {
                                    window.handleCitationsResponse(data.data);
                                }
                                responseText = data.data.text || '';
                                streamingDiv.querySelector('.message-content').innerHTML = renderMarkdown(responseText);
                                scrollToBottom(container);
                                break;

                            case 'code_execution_result':
                                if (window.handleCodeExecResult) {
                                    window.handleCodeExecResult(data.data, container, streamingDiv);
                                }
                                break;

                            case 'error':
                                showError(data.data, containerId);
                                streamingDiv.remove();
                                state.isStreaming = false;
                                return;

                            case 'done':
                                streamingDiv.classList.remove('streaming');

                                if (thinkingText) {
                                    const thinkingDiv = createMessageElement('thinking', thinkingText);
                                    container.insertBefore(thinkingDiv, streamingDiv);
                                }

                                if (responseText) {
                                    streamingDiv.querySelector('.message-content').innerHTML = renderMarkdown(responseText);
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

// Make available globally
window.streamChat = streamChat;
