/**
 * API utility functions
 */

export function getConfig() {
    const customModel = document.getElementById('customModel').value.trim();
    return {
        api_key: document.getElementById('apiKey').value,
        base_url: document.getElementById('baseUrl').value,
        model: customModel || document.getElementById('modelSelect').value
    };
}

// Make available globally for backward compatibility
window.getConfig = getConfig;
