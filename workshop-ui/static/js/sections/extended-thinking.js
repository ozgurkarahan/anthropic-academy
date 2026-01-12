/**
 * Extended Thinking section
 */

import { state } from '../state.js';
import { getConfig } from '../utils/api.js';
import { streamChat } from '../core/streaming.js';

export function initThinking() {
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
