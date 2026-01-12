/**
 * Citations section
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
import { formatFileSize, renderMarkdown } from '../utils/formatting.js';

export function initCitations() {
    initCitationsDropZone();

    document.getElementById('citationsTextInput').addEventListener('input', (e) => {
        const hasText = e.target.value.trim().length > 0;
        const hasFile = state.citationsDocumentBase64 || state.citationsDocumentText;
        document.getElementById('sendCitationsChat').disabled = !hasText && !hasFile;
    });

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

    document.getElementById('sendCitationsChat').addEventListener('click', sendCitationsChat);

    document.getElementById('citationsChatInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendCitationsChat();
        }
    });
}

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

    const textInput = document.getElementById('citationsTextInput');
    const textTitle = document.getElementById('citationsTextTitle');

    if (!state.citationsDocumentBase64 && !state.citationsDocumentText) {
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

    let html = renderMarkdown(text);

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

// Make functions available globally
window.removeCitationsDoc = removeCitationsDoc;
window.showCitationDetail = showCitationDetail;
