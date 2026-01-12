/**
 * Tool Use section
 */

import { state } from '../state.js';
import { getConfig } from '../utils/api.js';
import { showError } from '../utils/dom.js';
import { streamChat } from '../core/streaming.js';

export function initToolUse() {
    const sendBtn = document.getElementById('sendToolsChat');
    const input = document.getElementById('toolsChatInput');
    const clearBtn = document.getElementById('clearToolsChat');
    const loadSampleBtn = document.getElementById('loadSampleTool');

    loadSampleTools();

    sendBtn.addEventListener('click', sendToolsChat);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendToolsChat();
        }
    });

    clearBtn.addEventListener('click', () => {
        state.toolsMessages = [];
        document.getElementById('toolsChatMessages').innerHTML = `
            <div class="text-muted text-center py-5">
                <i class="bi bi-tools fs-1"></i>
                <p>Test tool use with Claude</p>
            </div>
        `;
        document.getElementById('toolsDebug').querySelector('code').textContent = '// Request/Response will appear here';
    });

    loadSampleBtn.addEventListener('click', () => {
        const sampleCustomTool = [{
            name: "search_database",
            description: "Search a database for records matching a query",
            input_schema: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "The search query"
                    },
                    limit: {
                        type: "integer",
                        description: "Maximum number of results",
                        default: 10
                    }
                },
                required: ["query"]
            }
        }];
        document.getElementById('customToolsEditor').value = JSON.stringify(sampleCustomTool, null, 2);
    });
}

async function loadSampleTools() {
    try {
        const response = await fetch('/api/sample-tools');
        const data = await response.json();
        state.sampleTools = data.tools;

        const container = document.getElementById('sampleToolsContainer');
        container.innerHTML = state.sampleTools.map((tool, index) => `
            <div class="form-check form-check-inline tool-checkbox">
                <input class="form-check-input sample-tool-check" type="checkbox"
                       id="tool_${index}" value="${index}" checked>
                <label class="form-check-label" for="tool_${index}">
                    ${tool.name}
                    <small class="text-muted d-block">${tool.description}</small>
                </label>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading sample tools:', error);
    }
}

function getSelectedTools() {
    const tools = [];

    document.querySelectorAll('.sample-tool-check:checked').forEach(checkbox => {
        const index = parseInt(checkbox.value);
        tools.push(state.sampleTools[index]);
    });

    const customToolsText = document.getElementById('customToolsEditor').value.trim();
    if (customToolsText) {
        try {
            const customTools = JSON.parse(customToolsText);
            if (Array.isArray(customTools)) {
                tools.push(...customTools);
            } else {
                tools.push(customTools);
            }
        } catch (e) {
            console.error('Invalid custom tools JSON:', e);
        }
    }

    return tools;
}

async function sendToolsChat() {
    if (state.isStreaming) return;

    const input = document.getElementById('toolsChatInput');
    const message = input.value.trim();
    if (!message) return;

    const tools = getSelectedTools();
    if (tools.length === 0) {
        showError('Please select at least one tool', 'toolsChatMessages');
        return;
    }

    const container = document.getElementById('toolsChatMessages');
    if (state.toolsMessages.length === 0) {
        container.innerHTML = '';
    }

    state.toolsMessages.push({ role: 'user', content: message });
    input.value = '';

    await streamChat('/api/chat/tools', {
        config: getConfig(),
        messages: state.toolsMessages,
        tools: tools,
        max_tokens: 4096,
        temperature: 1.0
    }, {
        containerId: 'toolsChatMessages',
        debugPanelId: 'toolsDebug',
        messagesKey: 'toolsMessages'
    });
}
