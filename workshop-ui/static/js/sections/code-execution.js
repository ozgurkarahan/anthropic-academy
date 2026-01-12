/**
 * Code Execution section
 */

import { state } from '../state.js';
import { getConfig } from '../utils/api.js';
import { 
    escapeHtml, 
    showError, 
    createMessageElement, 
    addStreamingIndicator, 
    scrollToBottom, 
    updateDebugPanel 
} from '../utils/dom.js';
import { renderMarkdown } from '../utils/formatting.js';

export function initCodeExec() {
    initCodeExecDropZone();

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

    document.getElementById('sendCodeExecChat').addEventListener('click', sendCodeExecChat);

    document.getElementById('codeExecChatInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendCodeExecChat();
        }
    });
}

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

                                if (data.data.content) {
                                    imagesContainer.innerHTML = '';
                                    downloadsContainer.innerHTML = '';

                                    for (const item of data.data.content) {
                                        if (item.type === 'image' && item.source) {
                                            const imgSrc = `data:${item.source.media_type};base64,${item.source.data}`;
                                            imagesContainer.innerHTML += `<img src="${imgSrc}" alt="Generated visualization">`;
                                        } else if (item.type === 'file' && item.file_id) {
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

// Make functions available globally
window.removeCodeExecFile = removeCodeExecFile;
window.downloadCodeExecFile = downloadCodeExecFile;
