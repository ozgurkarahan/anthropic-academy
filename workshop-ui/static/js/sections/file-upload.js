/**
 * File Upload section
 */

import { state } from '../state.js';
import { getConfig } from '../utils/api.js';
import { showError, escapeHtml } from '../utils/dom.js';
import { streamChat } from '../core/streaming.js';

export function initFileUpload() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const sendBtn = document.getElementById('sendFilesChat');
    const input = document.getElementById('filesChatInput');
    const clearBtn = document.getElementById('clearFilesChat');

    dropZone.addEventListener('click', () => fileInput.click());

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
        if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
            showError(`Unsupported file type: ${file.type}`, 'filesChatMessages');
            continue;
        }

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
                ? `<img src="data:${file.content_type};base64,${file.base64}" alt="${escapeHtml(file.filename)}">`
                : `<i class="bi bi-file-earmark-pdf text-danger"></i>`
            }
            <span class="file-name" title="${escapeHtml(file.filename)}">${escapeHtml(file.filename)}</span>
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

    const content = [];

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

    if (message) {
        content.push({ type: 'text', text: message });
    }

    state.filesMessages.push({ role: 'user', content: content });
    input.value = '';

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

// Make functions available globally
window.removeFile = removeFile;
