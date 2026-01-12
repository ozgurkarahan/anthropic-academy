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
        return;
    }

    const cases = state.evalDatasets[state.evalActiveDataset];
    if (cases.length === 0) {
        container.innerHTML = '<div class="text-muted text-center py-3">Aucun cas de test. Ajoutez-en ou générez-en.</div>';
        return;
    }

    container.innerHTML = cases.map((tc, index) => `
        <div class="test-case-item" data-index="${index}">
            <div class="test-case-header">
                <span class="test-case-number">#${index + 1}</span>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteTestCase(${index})">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
            <div class="test-case-content">
                <div class="mb-2">
                    <strong>Input:</strong>
                    <div class="test-case-text">${escapeHtml(tc.input)}</div>
                </div>
                <div>
                    <strong>Expected:</strong>
                    <div class="test-case-text">${escapeHtml(tc.expected_output)}</div>
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

    const input = prompt('Input du cas de test:');
    if (!input) return;

    const expected = prompt('Output attendu:');
    if (!expected) return;

    state.evalDatasets[state.evalActiveDataset].push({
        input: input,
        expected_output: expected
    });
    
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
        <div class="eval-summary mb-4">
            <div class="row">
                <div class="col-md-3">
                    <div class="stat-card">
                        <div class="stat-value">${stats.avg_score.toFixed(2)}/5</div>
                        <div class="stat-label">Score moyen</div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="stat-card">
                        <div class="stat-value">${stats.pass_rate.toFixed(1)}%</div>
                        <div class="stat-label">Taux de réussite</div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="stat-card">
                        <div class="stat-value">${stats.passed}/${stats.total}</div>
                        <div class="stat-label">Tests réussis</div>
                    </div>
                </div>
            </div>
        </div>
        <div class="eval-results-list">
    `;

    data.results.forEach((result, index) => {
        const scoreClass = result.score >= 4 ? 'score-pass' : result.score >= 3 ? 'score-warn' : 'score-fail';
        html += `
            <div class="eval-result-item ${scoreClass}" data-score="${result.score}">
                <div class="result-header">
                    <span class="result-number">#${index + 1}</span>
                    <span class="result-score">${result.score}/5</span>
                </div>
                <div class="result-content">
                    <div class="mb-2"><strong>Input:</strong> ${escapeHtml(result.input)}</div>
                    <div class="mb-2"><strong>Expected:</strong> ${escapeHtml(result.expected_output)}</div>
                    <div class="mb-2"><strong>Actual:</strong> ${escapeHtml(result.actual_output)}</div>
                    <div class="mb-2"><strong>Justification:</strong> ${escapeHtml(result.justification)}</div>
                    ${result.strengths.length > 0 ? `<div class="text-success"><strong>Forces:</strong> ${result.strengths.join(', ')}</div>` : ''}
                    ${result.weaknesses.length > 0 ? `<div class="text-danger"><strong>Faiblesses:</strong> ${result.weaknesses.join(', ')}</div>` : ''}
                </div>
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;
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

    container.innerHTML = state.evalHistory.map((entry, index) => `
        <div class="history-item">
            <div class="history-date">${new Date(entry.timestamp).toLocaleString()}</div>
            <div class="history-dataset">${escapeHtml(entry.dataset)}</div>
            <div class="history-stats">
                Score: ${entry.stats.avg_score.toFixed(2)} | 
                Réussite: ${entry.stats.pass_rate.toFixed(1)}%
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
    
    // Update any UI elements that show eval status
    const badge = document.querySelector('[data-section="evaluation"] .badge');
    if (badge) {
        badge.textContent = datasetCount;
    }
}

// Make functions available globally
window.deleteTestCase = deleteTestCase;
