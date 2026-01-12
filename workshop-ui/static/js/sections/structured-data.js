/**
 * Structured Data section
 */

import { state } from '../state.js';
import { getConfig } from '../utils/api.js';
import { showError } from '../utils/dom.js';
import { streamChat } from '../core/streaming.js';

export function initStructuredData() {
    const extractBtn = document.getElementById('extractStructured');
    const loadSampleBtn = document.getElementById('loadSampleSchema');

    extractBtn.addEventListener('click', extractStructuredData);

    loadSampleBtn.addEventListener('click', () => {
        const sampleSchema = {
            type: "object",
            properties: {
                name: {
                    type: "string",
                    description: "The person's full name"
                },
                age: {
                    type: "integer",
                    description: "The person's age in years"
                },
                email: {
                    type: "string",
                    description: "The person's email address"
                },
                skills: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of skills"
                }
            },
            required: ["name"]
        };
        document.getElementById('outputSchema').value = JSON.stringify(sampleSchema, null, 2);
        document.getElementById('structuredInput').value =
            "John Smith is a 32-year-old software engineer. You can reach him at john.smith@email.com. " +
            "He's proficient in Python, JavaScript, and machine learning.";
    });
}

async function extractStructuredData() {
    if (state.isStreaming) return;

    const schemaText = document.getElementById('outputSchema').value.trim();
    const inputText = document.getElementById('structuredInput').value.trim();

    if (!schemaText || !inputText) {
        showError('Please provide both a schema and input text', 'structuredOutput');
        return;
    }

    let schema;
    try {
        schema = JSON.parse(schemaText);
    } catch (e) {
        showError('Invalid JSON schema: ' + e.message, 'structuredOutput');
        return;
    }

    state.isStreaming = true;
    document.getElementById('structuredOutput').querySelector('code').textContent = 'Extracting...';

    await streamChat('/api/structured', {
        config: getConfig(),
        messages: [{ role: 'user', content: inputText }],
        output_schema: schema,
        system: "Extract the requested information from the user's input according to the provided schema."
    }, {
        containerId: 'structuredOutput',
        debugPanelId: 'structuredDebug'
    });
}
