/**
 * DOM utility functions
 */

import { state } from '../state.js';
import { renderMarkdown } from './formatting.js';

export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export function scrollToBottom(container) {
    container.scrollTop = container.scrollHeight;
}

export function showError(message, containerId) {
    const container = document.getElementById(containerId);
    const errorDiv = document.createElement('div');
    errorDiv.className = 'message message-error';
    errorDiv.innerHTML = `<div class="message-role">Error</div>${escapeHtml(message)}`;
    container.appendChild(errorDiv);
    scrollToBottom(container);
}

export function createMessageElement(role, content, options = {}) {
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

export function addStreamingIndicator(container) {
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

export function updateDebugPanel(panelId, data, append = false) {
    const panel = document.getElementById(panelId);
    const formattedJson = JSON.stringify(data, null, 2);

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

// Message actions
export function editMessage(button) {
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

export function deleteMessage(button) {
    const messageDiv = button.closest('.message');
    messageDiv.remove();
}

// Make functions available globally
window.escapeHtml = escapeHtml;
window.scrollToBottom = scrollToBottom;
window.showError = showError;
window.createMessageElement = createMessageElement;
window.addStreamingIndicator = addStreamingIndicator;
window.updateDebugPanel = updateDebugPanel;
window.editMessage = editMessage;
window.deleteMessage = deleteMessage;
