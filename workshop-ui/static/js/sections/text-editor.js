/**
 * Text Editor section
 */

import { state } from '../state.js';
import { getConfig } from '../utils/api.js';
import { escapeHtml } from '../utils/dom.js';
import { formatFileSize } from '../utils/formatting.js';
import { streamChat } from '../core/streaming.js';

export function initTextEditor() {
    initTextEditorSession();

    document.getElementById('refreshTextEditorFiles').addEventListener('click', refreshTextEditorFiles);

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

    document.getElementById('sendTextEditorChat').addEventListener('click', sendTextEditorChat);

    document.getElementById('textEditorChatInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendTextEditorChat();
        }
    });
}

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

export function renderTextEditorFileList() {
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

export async function selectTextEditorFile(filePath) {
    if (!state.textEditorSessionId) return;

    state.textEditorCurrentFile = filePath;
    document.getElementById('currentEditorFile').textContent = filePath;

    renderTextEditorFileList();

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

    if (typeof window.loadCodeMirror === 'function') {
        try {
            const CM = await window.loadCodeMirror();

            container.innerHTML = '';

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
            container.innerHTML = `<textarea class="form-control font-monospace" style="height: 280px;" readonly>${escapeHtml(content)}</textarea>`;
        }
    } else {
        container.innerHTML = `<textarea class="form-control font-monospace" style="height: 280px;" readonly>${escapeHtml(content)}</textarea>`;
    }
}

export function renderTextEditorHistory() {
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

// Make functions available globally
window.selectTextEditorFile = selectTextEditorFile;
window.toggleHistoryDiff = toggleHistoryDiff;
window.renderTextEditorFileList = renderTextEditorFileList;
window.renderTextEditorHistory = renderTextEditorHistory;
