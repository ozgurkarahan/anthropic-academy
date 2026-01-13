/**
 * Prompt Evaluation section
 */

import { state } from '../state.js';
import { getConfig } from '../utils/api.js';
import { escapeHtml, showError } from '../utils/dom.js';

export function initEvaluation() {
    loadEvalState();

    document.getElementById('newDatasetBtn').addEventListener('click', createNewDataset);
    document.getElementById('deleteDatasetBtn').addEventListener('click', deleteDataset);
    document.getElementById('datasetSelect').addEventListener('change', selectDataset);
    document.getElementById('importDatasetBtn').addEventListener('click', () => {
        document.getElementById('importDatasetFile').click();
    });
    document.getElementById('importDatasetFile').addEventListener('change', importDataset);
    document.getElementById('exportDatasetBtn').addEventListener('click', exportDataset);
    document.getElementById('addTestCaseBtn').addEventListener('click', addTestCase);
    document.getElementById('generateDatasetBtn').addEventListener('click', generateDataset);
    document.getElementById('runEvaluationBtn').addEventListener('click', runEvaluation);
    document.getElementById('resultsFilter').addEventListener('change', filterResults);
    document.getElementById('exportResultsBtn').addEventListener('click', exportResults);

    refreshDatasetSelect();
    updateEvalTabInfo();
}

function loadEvalState() {
    try {
        const savedDatasets = localStorage.getItem('eval_datasets');
        if (savedDatasets) {
            state.evalDatasets = JSON.parse(savedDatasets);
        }
        const savedActiveDataset = localStorage.getItem('eval_active_dataset');
        if (savedActiveDataset && state.evalDatasets[savedActiveDataset]) {
            state.evalActiveDataset = savedActiveDataset;
        }
        const savedHistory = localStorage.getItem('eval_history');
        if (savedHistory) {
            state.evalHistory = JSON.parse(savedHistory);
            renderEvalHistory();
        }
    } catch (e) {
        console.error('Error loading eval state:', e);
    }
}

function saveEvalState() {
    try {
        localStorage.setItem('eval_datasets', JSON.stringify(state.evalDatasets));
        localStorage.setItem('eval_active_dataset', state.evalActiveDataset || '');
        localStorage.setItem('eval_history', JSON.stringify(state.evalHistory));
    } catch (e) {
        console.error('Error saving eval state:', e);
    }
}

function refreshDatasetSelect() {
    const select = document.getElementById('datasetSelect');
    const names = Object.keys(state.evalDatasets);

    select.innerHTML = '<option value="">-- Sélectionner un dataset --</option>';
    names.forEach(name => {
        const count = state.evalDatasets[name].length;
        select.innerHTML += `<option value="${escapeHtml(name)}">${escapeHtml(name)} (${count} cas)</option>`;
    });

    if (state.evalActiveDataset && state.evalDatasets[state.evalActiveDataset]) {
        select.value = state.evalActiveDataset;
    }
}

function createNewDataset() {
    const name = prompt('Nom du nouveau dataset:');
    if (!name || name.trim() === '') return;

    if (state.evalDatasets[name]) {
        alert('Un dataset avec ce nom existe déjà');
        return;
    }

    state.evalDatasets[name] = [];
    state.evalActiveDataset = name;
    saveEvalState();
    refreshDatasetSelect();
    renderTestCases();
    updateEvalTabInfo();
}

function deleteDataset() {
    if (!state.evalActiveDataset) {
        alert('Sélectionnez un dataset à supprimer');
        return;
    }

    if (!confirm(`Supprimer le dataset "${state.evalActiveDataset}" ?`)) return;

    delete state.evalDatasets[state.evalActiveDataset];
    state.evalActiveDataset = null;
    saveEvalState();
    refreshDatasetSelect();
    renderTestCases();
    updateEvalTabInfo();
}

function selectDataset() {
    const select = document.getElementById('datasetSelect');
    state.evalActiveDataset = select.value || null;
    renderTestCases();
    updateEvalTabInfo();
}

function renderTestCases() {
    const container = document.getElementById('testCasesList');
    
    if (!state.evalActiveDataset || !state.evalDatasets[state.evalActiveDataset]) {
        container.innerHTML = '<div class="text-muted text-center py-3">Sélectionnez ou créez un dataset</div>';
        document.getElementById('testCaseCount').textContent = '0';
        return;
    }

    const cases = state.evalDatasets[state.evalActiveDataset];
    document.getElementById('testCaseCount').textContent = cases.length;
    
    if (cases.length === 0) {
        container.innerHTML = '<div class="text-muted text-center py-3">Aucun cas de test. Ajoutez-en ou générez-en.</div>';
        return;
    }

    container.innerHTML = cases.map((tc, index) => `
        <div class="card mb-2 test-case-item" data-index="${index}">
            <div class="card-body">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <span class="badge bg-primary">#${index + 1}</span>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteTestCase(${index})">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
                <div class="mb-2">
                    <strong>Input:</strong>
                    <div class="text-muted">${escapeHtml(tc.input)}</div>
                </div>
                <div>
                    <strong>Expected:</strong>
                    <div class="text-muted">${escapeHtml(tc.expected_output)}</div>
                </div>
            </div>
        </div>
    `).join('');
}

function addTestCase() {
    if (!state.evalActiveDataset) {
        alert('Sélectionnez d\'abord un dataset');
        return;
    }

    const inputEl = document.getElementById('newTestInput');
    const expectedEl = document.getElementById('newTestExpected');
    
    const input = inputEl.value.trim();
    const expected = expectedEl.value.trim();
    
    if (!input || !expected) {
        showError('Veuillez remplir les deux champs', 'testCasesList');
        return;
    }

    state.evalDatasets[state.evalActiveDataset].push({
        input: input,
        expected_output: expected
    });
    
    // Clear the form fields
    inputEl.value = '';
    expectedEl.value = '';
    
    saveEvalState();
    refreshDatasetSelect();
    renderTestCases();
    updateEvalTabInfo();
}

function deleteTestCase(index) {
    if (!state.evalActiveDataset) return;
    
    state.evalDatasets[state.evalActiveDataset].splice(index, 1);
    saveEvalState();
    refreshDatasetSelect();
    renderTestCases();
    updateEvalTabInfo();
}

async function generateDataset() {
    const context = document.getElementById('evalContext').value.trim();
    const count = parseInt(document.getElementById('evalCount').value) || 5;

    if (!context) {
        showError('Veuillez fournir un contexte', 'testCasesList');
        return;
    }

    if (!state.evalActiveDataset) {
        const name = prompt('Nom du nouveau dataset:');
        if (!name) return;
        state.evalDatasets[name] = [];
        state.evalActiveDataset = name;
    }

    const btn = document.getElementById('generateDatasetBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Génération...';

    try {
        const response = await fetch('/api/eval/generate-dataset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                config: getConfig(),
                context: context,
                count: count
            })
        });

        const data = await response.json();
        
        if (data.success && data.cases) {
            state.evalDatasets[state.evalActiveDataset].push(...data.cases);
            saveEvalState();
            refreshDatasetSelect();
            renderTestCases();
            updateEvalTabInfo();
        } else {
            showError(data.error || 'Erreur lors de la génération', 'testCasesList');
        }
    } catch (error) {
        showError(error.message, 'testCasesList');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-magic"></i> Générer';
    }
}

async function runEvaluation() {
    if (!state.evalActiveDataset || state.evalDatasets[state.evalActiveDataset].length === 0) {
        alert('Sélectionnez un dataset avec des cas de test');
        return;
    }

    const systemPrompt = document.getElementById('evalSystemPrompt').value.trim();
    const criteria = [];
    document.querySelectorAll('.eval-criteria:checked').forEach(cb => {
        criteria.push(cb.value);
    });

    if (criteria.length === 0) {
        alert('Sélectionnez au moins un critère d\'évaluation');
        return;
    }

    const btn = document.getElementById('runEvaluationBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Évaluation...';

    try {
        const response = await fetch('/api/eval/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                config: getConfig(),
                system_prompt: systemPrompt || null,
                dataset: state.evalDatasets[state.evalActiveDataset],
                criteria: criteria
            })
        });

        const data = await response.json();
        
        if (data.success) {
            state.evalResults = data.results;
            renderEvalResults(data);
            
            // Save to history
            state.evalHistory.unshift({
                timestamp: new Date().toISOString(),
                dataset: state.evalActiveDataset,
                stats: data.stats,
                criteria: criteria
            });
            if (state.evalHistory.length > 20) state.evalHistory.pop();
            saveEvalState();
            renderEvalHistory();
            
            // Switch to Results tab
            const resultsTab = document.getElementById('results-tab');
            if (resultsTab) {
                resultsTab.click();
            }
        } else {
            showError(data.error || 'Erreur lors de l\'évaluation', 'evalResultsContainer');
        }
    } catch (error) {
        showError(error.message, 'evalResultsContainer');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-play-circle"></i> Lancer l\'évaluation';
    }
}

function renderEvalResults(data) {
    const container = document.getElementById('evalResultsContainer');
    const stats = data.stats;

    let html = `
        <!-- Stats Cards -->
        <div class="row mb-3">
            <div class="col-md-3">
                <div class="card">
                    <div class="card-body text-center">
                        <h3 class="mb-0">${stats.avg_score.toFixed(2)}/5</h3>
                        <small class="text-muted">Score Moyen</small>
                    </div>
                </div>
            </div>
                <div class="col-md-3">
                <div class="card">
                    <div class="card-body text-center">
                        <h3 class="mb-0">${stats.pass_rate.toFixed(1)}%</h3>
                        <small class="text-muted">Pass Rate (≥4)</small>
                    </div>
                    </div>
                </div>
                <div class="col-md-3">
                <div class="card">
                    <div class="card-body text-center">
                        <h3 class="mb-0">${stats.passed}/${stats.total}</h3>
                        <small class="text-muted">Tests réussis</small>
                    </div>
                    </div>
                </div>
                <div class="col-md-3">
                <div class="card">
                    <div class="card-body text-center">
                        <h3 class="mb-0">
                            <button class="btn btn-sm btn-outline-secondary" id="exportResultsBtn">
                                <i class="bi bi-download"></i> Export
                            </button>
                        </h3>
                        <small class="text-muted">Export JSON</small>
                    </div>
                </div>
            </div>
        </div>

        <!-- Results List -->
        <div class="card mb-3">
            <div class="card-header d-flex justify-content-between align-items-center">
                <span>Détail des résultats</span>
                <select class="form-select form-select-sm" id="resultsFilter" style="width: auto; display: inline-block;">
                    <option value="all">Tous</option>
                    <option value="pass">Pass (≥4)</option>
                    <option value="fail">Fail (<4)</option>
                </select>
            </div>
            <div class="card-body" style="max-height: 400px; overflow-y: auto;">
        <div class="eval-results-list">
    `;

    data.results.forEach((result, index) => {
        const scoreClass = result.score >= 4 ? 'success' : result.score >= 3 ? 'warning' : 'danger';
        html += `
            <div class="card mb-2 border-${scoreClass} eval-result-item" data-score="${result.score}">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <span class="badge bg-secondary">#${index + 1}</span>
                        <span class="badge bg-${scoreClass}">${result.score}/5</span>
                    </div>
                    <div class="mb-2">
                        <strong>Input:</strong>
                        <div class="text-muted small">${escapeHtml(result.input)}</div>
                    </div>
                    <div class="mb-2">
                        <strong>Expected:</strong>
                        <div class="text-muted small">${escapeHtml(result.expected_output)}</div>
                    </div>
                    <div class="mb-2">
                        <strong>Actual:</strong>
                        <div class="text-muted small">${escapeHtml(result.actual_output)}</div>
                    </div>
                    <div class="mb-2">
                        <strong>Justification:</strong>
                        <div class="text-muted small">${escapeHtml(result.justification)}</div>
                    </div>
                    ${result.strengths && result.strengths.length > 0 ? `
                        <div class="text-success small">
                            <strong>Forces:</strong> ${result.strengths.map(s => escapeHtml(s)).join(', ')}
                        </div>
                    ` : ''}
                    ${result.weaknesses && result.weaknesses.length > 0 ? `
                        <div class="text-danger small">
                            <strong>Faiblesses:</strong> ${result.weaknesses.map(w => escapeHtml(w)).join(', ')}
                </div>
                    ` : ''}
                </div>
            </div>
        `;
    });

    html += `
                </div>
            </div>
        </div>
    `;
    
    container.innerHTML = html;
    
    // Re-attach the export button listener
    document.getElementById('exportResultsBtn').addEventListener('click', exportResults);
    document.getElementById('resultsFilter').addEventListener('change', filterResults);
}

function filterResults() {
    const filter = document.getElementById('resultsFilter').value;
    const items = document.querySelectorAll('.eval-result-item');

    items.forEach(item => {
        const score = parseInt(item.dataset.score);
        if (filter === 'all') {
            item.style.display = '';
        } else if (filter === 'pass' && score >= 4) {
            item.style.display = '';
        } else if (filter === 'fail' && score < 4) {
            item.style.display = '';
        } else {
            item.style.display = 'none';
        }
    });
}

function renderEvalHistory() {
    const container = document.getElementById('evalHistoryList');
    if (!state.evalHistory || state.evalHistory.length === 0) {
        container.innerHTML = '<div class="text-muted text-center py-3">Aucun historique</div>';
        return;
    }

    // Filter out invalid entries and render valid ones
    const validEntries = state.evalHistory.filter(entry => 
        entry && entry.stats && typeof entry.stats.avg_score === 'number'
    );

    if (validEntries.length === 0) {
        container.innerHTML = '<div class="text-muted text-center py-3">Aucun historique valide</div>';
        return;
    }

    container.innerHTML = validEntries.map((entry, index) => `
        <div class="card mb-2">
            <div class="card-body py-2">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <div><strong>${escapeHtml(entry.dataset || 'Dataset inconnu')}</strong></div>
                        <small class="text-muted">${new Date(entry.timestamp).toLocaleString()}</small>
                    </div>
                    <div class="text-end">
                        <div>Score: <strong>${entry.stats.avg_score.toFixed(2)}</strong></div>
                        <small class="text-muted">Réussite: ${entry.stats.pass_rate.toFixed(1)}%</small>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

function importDataset(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            const name = file.name.replace('.json', '');
            
            if (Array.isArray(data)) {
                state.evalDatasets[name] = data;
            } else if (data.cases) {
                state.evalDatasets[name] = data.cases;
            }
            
            state.evalActiveDataset = name;
            saveEvalState();
            refreshDatasetSelect();
            renderTestCases();
            updateEvalTabInfo();
        } catch (error) {
            alert('Erreur lors de l\'import: ' + error.message);
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function exportDataset() {
    if (!state.evalActiveDataset) {
        alert('Sélectionnez un dataset à exporter');
        return;
    }

    const data = state.evalDatasets[state.evalActiveDataset];
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.evalActiveDataset}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function exportResults() {
    if (!state.evalResults || state.evalResults.length === 0) {
        alert('Aucun résultat à exporter');
        return;
    }

    const blob = new Blob([JSON.stringify(state.evalResults, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eval_results_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function updateEvalTabInfo() {
    const datasetCount = Object.keys(state.evalDatasets).length;
    const testCaseCount = state.evalActiveDataset 
        ? state.evalDatasets[state.evalActiveDataset]?.length || 0 
        : 0;
    
    // Update badge in sidebar
    const badge = document.querySelector('[data-section="evaluationSection"] .badge');
    if (badge) {
        badge.textContent = datasetCount;
    }
    
    // Update evaluation tab info
    const evalDatasetNameEl = document.getElementById('evalDatasetName');
    const evalTestCountEl = document.getElementById('evalTestCount');
    const runEvaluationBtn = document.getElementById('runEvaluationBtn');
    
    if (evalDatasetNameEl) {
        if (state.evalActiveDataset) {
            evalDatasetNameEl.textContent = state.evalActiveDataset;
            evalDatasetNameEl.classList.remove('text-muted');
        } else {
            evalDatasetNameEl.textContent = 'Aucun sélectionné';
            evalDatasetNameEl.classList.add('text-muted');
        }
    }
    
    if (evalTestCountEl) {
        evalTestCountEl.textContent = testCaseCount;
    }
    
    // Enable/disable run button based on whether we have test cases
    if (runEvaluationBtn) {
        if (state.evalActiveDataset && testCaseCount > 0) {
            runEvaluationBtn.disabled = false;
        } else {
            runEvaluationBtn.disabled = true;
        }
    }
}

// Make functions available globally
window.deleteTestCase = deleteTestCase;
