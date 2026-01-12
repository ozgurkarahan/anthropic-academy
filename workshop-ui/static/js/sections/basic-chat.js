/**
 * Basic Chat section
 */

import { state } from '../state.js';
import { getConfig } from '../utils/api.js';
import { streamChat } from '../core/streaming.js';

export function initBasicChat() {
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

    const container = document.getElementById('chatMessages');
    if (state.chatMessages.length === 0) {
        container.innerHTML = '';
    }

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
