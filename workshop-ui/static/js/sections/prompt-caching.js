/**
 * Prompt Caching section
 */

import { state } from '../state.js';
import { getConfig } from '../utils/api.js';
import { showError } from '../utils/dom.js';
import { streamChat } from '../core/streaming.js';

// Sample data for caching demonstration
const SAMPLE_CACHING_SYSTEM_PROMPT = `# Javascript Code Generator for Document Analysis Flow

You are an expert Javascript code generator. Your specialty is creating code for a document analysis flow builder application. The code you generate will run in a sandboxed Javascript environment (QuickJS) and will use a predefined set of UI components to construct user interfaces.

Your Goal: Generate functional Typescript code that defines both the logic and user interface for a document analysis workflow, based on the user's prompt. The generated code must be ready to execute directly within the sandbox environment.

## Constraints and Environment Details:

1. Sandboxed Javascript (QuickJS) Environment:
Your code operates within a QuickJS sandbox. This means you have a restricted set of pre-defined global functions available. You cannot import any libraries or use standard browser APIs.

Available global functions:
- setState(state): Updates the application state with a partial state object. This triggers a re-render of the UI.
- getState(): Retrieves the current application state as an object containing all state variables.
- callLLM(props): Calls a LLM with messages and schema. Returns structured data based on the schema provided.
- navigateTo(path): Navigates to a different path/screen within the application.
- getPath(): Returns the current application path as a string.
- Schema helpers: str, num, bool, obj, arr - Used to define structured response schemas for LLM calls.

2. Component-Based UI:
Build user interfaces using pre-defined components. Each component has specific props and behaviors.`;

const SAMPLE_CACHING_TOOLS = [
    {
        name: "calculator",
        description: "Perform basic math calculations. Supports +, -, *, /, and parentheses.",
        input_schema: {
            type: "object",
            properties: {
                expression: {
                    type: "string",
                    description: "The mathematical expression to evaluate"
                }
            },
            required: ["expression"]
        }
    },
    {
        name: "get_current_time",
        description: "Get the current date and time.",
        input_schema: {
            type: "object",
            properties: {},
            required: []
        }
    },
    {
        name: "get_weather",
        description: "Get the current weather for a location (mock data for demonstration).",
        input_schema: {
            type: "object",
            properties: {
                location: {
                    type: "string",
                    description: "The city name"
                }
            },
            required: ["location"]
        }
    }
];

export function initCaching() {
    const sendBtn = document.getElementById('sendCachingChat');
    const input = document.getElementById('cachingChatInput');
    const clearBtn = document.getElementById('clearCachingChat');
    const loadSamplesBtn = document.getElementById('loadCachingSamples');

    sendBtn.addEventListener('click', sendCachingChat);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendCachingChat();
        }
    });

    clearBtn.addEventListener('click', () => {
        state.cachingMessages = [];
        document.getElementById('cachingChatMessages').innerHTML = `
            <div class="text-muted text-center py-5">
                <i class="bi bi-database fs-1"></i>
                <p>Test prompt caching - watch cache stats</p>
            </div>
        `;
        document.getElementById('cachingDebug').querySelector('code').textContent = '// Request/Response will appear here';
        document.getElementById('cacheStats').innerHTML = '';
    });

    loadSamplesBtn.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('cacheSystemPrompt').value = SAMPLE_CACHING_SYSTEM_PROMPT;
        document.getElementById('cacheTools').value = JSON.stringify(SAMPLE_CACHING_TOOLS, null, 2);
    });
}

async function sendCachingChat() {
    if (state.isStreaming) return;

    const input = document.getElementById('cachingChatInput');
    const message = input.value.trim();
    if (!message) return;

    const container = document.getElementById('cachingChatMessages');
    if (state.cachingMessages.length === 0) {
        container.innerHTML = '';
    }

    state.cachingMessages.push({ role: 'user', content: message });
    input.value = '';

    const systemPrompt = document.getElementById('cacheSystemPrompt').value.trim();
    const enableCaching = document.getElementById('enableCaching').checked;
    const toolsJson = document.getElementById('cacheTools').value.trim();
    const enableToolsCaching = document.getElementById('enableToolsCaching').checked;

    let tools = null;
    if (toolsJson) {
        try {
            tools = JSON.parse(toolsJson);
        } catch (e) {
            showError('Invalid tools JSON: ' + e.message, 'cachingChatMessages');
            return;
        }
    }

    await streamChat('/api/chat/cached', {
        config: getConfig(),
        messages: state.cachingMessages,
        system: systemPrompt || null,
        cache_system: enableCaching,
        tools: tools,
        cache_tools: enableToolsCaching,
        max_tokens: 4096,
        temperature: 1.0
    }, {
        containerId: 'cachingChatMessages',
        debugPanelId: 'cachingDebug',
        messagesKey: 'cachingMessages'
    });
}

export function updateCacheStats(usage) {
    const container = document.getElementById('cacheStats');
    const cacheCreated = usage.cache_creation_input_tokens || 0;
    const cacheRead = usage.cache_read_input_tokens || 0;

    container.innerHTML = `
        <div class="cache-stat ${cacheRead > 0 ? 'cache-hit' : ''}">
            <i class="bi bi-database"></i> Cache Read: ${cacheRead} tokens
        </div>
        <div class="cache-stat ${cacheCreated > 0 ? 'cache-miss' : ''}">
            <i class="bi bi-database-add"></i> Cache Created: ${cacheCreated} tokens
        </div>
        <div class="cache-stat">
            <i class="bi bi-arrow-down"></i> Input: ${usage.input_tokens} tokens
        </div>
        <div class="cache-stat">
            <i class="bi bi-arrow-up"></i> Output: ${usage.output_tokens} tokens
        </div>
    `;
}

// Make available globally
window.updateCacheStats = updateCacheStats;
