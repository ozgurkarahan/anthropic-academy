/**
 * Formatting utility functions
 */

import { state } from '../state.js';

export function formatJson(obj) {
    return JSON.stringify(obj, null, 2);
}

export function renderMarkdown(text) {
    if (state.rawViewMode) {
        const div = document.createElement('div');
        div.textContent = text;
        return `<div class="raw-view">${div.innerHTML}</div>`;
    }
    return marked.parse(text);
}

export function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Make functions available globally
window.formatJson = formatJson;
window.renderMarkdown = renderMarkdown;
window.formatFileSize = formatFileSize;
