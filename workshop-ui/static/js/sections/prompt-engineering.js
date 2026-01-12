/**
 * Prompt Engineering section
 */

import { state } from '../state.js';
import { getConfig } from '../utils/api.js';
import { streamChat } from '../core/streaming.js';

export function initPromptEngineering() {
    const sendBtn = document.getElementById('sendPromptChat');
    const input = document.getElementById('promptChatInput');
    const clearBtn = document.getElementById('clearPromptChat');
    const tempSlider = document.getElementById('temperature');
    const tempValue = document.getElementById('tempValue');

    tempSlider.addEventListener('input', () => {
        tempValue.textContent = tempSlider.value;
    });

    sendBtn.addEventListener('click', sendPromptChat);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendPromptChat();
        }
    });

    clearBtn.addEventListener('click', () => {
        state.promptMessages = [];
        document.getElementById('promptChatMessages').innerHTML = `
            <div class="text-muted text-center py-5">
                <i class="bi bi-sliders fs-1"></i>
                <p>Test your prompts here</p>
            </div>
        `;
        document.getElementById('promptDebug').querySelector('code').textContent = '// Request/Response will appear here';
    });
}

async function sendPromptChat() {
    if (state.isStreaming) return;

    const input = document.getElementById('promptChatInput');
    const message = input.value.trim();
    if (!message) return;

    const container = document.getElementById('promptChatMessages');
    if (state.promptMessages.length === 0) {
        container.innerHTML = '';
    }

    state.promptMessages.push({ role: 'user', content: message });
    input.value = '';

    const systemPrompt = document.getElementById('systemPrompt').value.trim();
    const temperature = parseFloat(document.getElementById('temperature').value);
    const maxTokens = parseInt(document.getElementById('maxTokens').value);

    await streamChat('/api/chat', {
        config: getConfig(),
        messages: state.promptMessages,
        system: systemPrompt || null,
        max_tokens: maxTokens,
        temperature: temperature
    }, {
        containerId: 'promptChatMessages',
        debugPanelId: 'promptDebug',
        messagesKey: 'promptMessages'
    });
}
