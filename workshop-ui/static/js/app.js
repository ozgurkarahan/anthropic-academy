/**
 * Workshop UI - Frontend JavaScript (ES6 Modular Entry Point)
 * Claude API Testing Interface
 */

// Import state (must be first)
import { state } from './state.js';

// Import utilities
import { getConfig } from './utils/api.js';
import { 
    escapeHtml, 
    scrollToBottom, 
    showError, 
    createMessageElement, 
    addStreamingIndicator, 
    updateDebugPanel,
    editMessage,
    deleteMessage 
} from './utils/dom.js';
import { formatJson, renderMarkdown, formatFileSize } from './utils/formatting.js';

// Import core modules
import { streamChat } from './core/streaming.js';
import { initSidebar, initConfig } from './core/sidebar.js';

// Import section modules
import { initBasicChat } from './sections/basic-chat.js';
import { initPromptEngineering } from './sections/prompt-engineering.js';
import { initToolUse } from './sections/tool-use.js';
import { initFileUpload } from './sections/file-upload.js';
import { initThinking } from './sections/extended-thinking.js';
import { initCaching, updateCacheStats } from './sections/prompt-caching.js';
import { initStructuredData } from './sections/structured-data.js';
import { initEvaluation } from './sections/evaluation.js';
import { initTextEditor, renderTextEditorFileList, renderTextEditorHistory, selectTextEditorFile } from './sections/text-editor.js';
import { initCodeExec } from './sections/code-execution.js';
import { initCitations } from './sections/citations.js';

// Initialize all sections when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Core initialization
    initSidebar();
    initConfig();
    
    // Section initialization
    initBasicChat();
    initPromptEngineering();
    initToolUse();
    initFileUpload();
    initThinking();
    initCaching();
    initStructuredData();
    initEvaluation();
    initTextEditor();
    initCodeExec();
    initCitations();

    // Initialize syntax highlighting
    if (typeof hljs !== 'undefined') {
        hljs.highlightAll();
    }

    console.log('Workshop UI initialized (ES6 modules)');
});

// Re-export globals for backward compatibility with inline event handlers
window.state = state;
window.getConfig = getConfig;
window.escapeHtml = escapeHtml;
window.scrollToBottom = scrollToBottom;
window.showError = showError;
window.createMessageElement = createMessageElement;
window.addStreamingIndicator = addStreamingIndicator;
window.updateDebugPanel = updateDebugPanel;
window.editMessage = editMessage;
window.deleteMessage = deleteMessage;
window.formatJson = formatJson;
window.renderMarkdown = renderMarkdown;
window.formatFileSize = formatFileSize;
window.streamChat = streamChat;
window.updateCacheStats = updateCacheStats;
window.renderTextEditorFileList = renderTextEditorFileList;
window.renderTextEditorHistory = renderTextEditorHistory;
window.selectTextEditorFile = selectTextEditorFile;
