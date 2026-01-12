/**
 * Global application state
 */

export const state = {
    // Conversation histories for each section
    chatMessages: [],
    promptMessages: [],
    toolsMessages: [],
    filesMessages: [],
    thinkingMessages: [],
    cachingMessages: [],
    textEditorMessages: [],
    codeExecMessages: [],
    citationsMessages: [],

    // Uploaded files
    uploadedFiles: [],

    // Sample tools (loaded from API)
    sampleTools: [],

    // View mode (rendered vs raw)
    rawViewMode: false,

    // Currently streaming
    isStreaming: false,

    // Text Editor Tool
    textEditorSessionId: null,
    textEditorFiles: [],
    textEditorHistory: [],
    textEditorCurrentFile: null,
    textEditorCodeMirror: null,

    // Code Execution
    codeExecUploadedFiles: [],
    codeExecFileIds: [],
    codeExecCodeMirror: null,
    codeExecLastCode: '',

    // Citations
    citationsDocument: null,
    citationsDocumentBase64: null,
    citationsDocumentText: null,
    citationsDocumentType: 'application/pdf',
    citationsDocumentTitle: 'Document',

    // Evaluation
    evalDatasets: {},
    evalActiveDataset: null,
    evalResults: [],
    evalHistory: []
};

// Make state available globally for backward compatibility
window.state = state;
