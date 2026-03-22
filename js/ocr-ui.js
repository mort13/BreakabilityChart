/**
 * OCR UI - control panel, ROI configuration editor, and live preview.
 * Renders into the #ocr tab content area defined in index.html.
 */

import { loadConfig, getConfig, getROI, setROIOverride, setOverride, resetToDefaults } from './ocr-config-manager.js';
import { init as initPipeline, start as startPipeline, stop as stopPipeline } from './ocr-pipeline.js';
import { isModelLoaded } from './ocr-cnn.js';
import { updateMarker } from './chart-manager.js';

let massDisplay = null;
let resistanceDisplay = null;
let statusLabel = null;
let startBtn = null;
let stopBtn = null;

/**
 * Initialize the OCR UI: render controls and wire events.
 */
export async function setupOCR() {
    await loadConfig();
    renderOCRPanel();
    wireEvents();
}

function renderOCRPanel() {
    const container = document.getElementById('ocr-controls');
    if (!container) return;

    const cfg = getConfig();

    container.innerHTML = `
        <div class="ocr-section">
            <h3>Screen Capture</h3>
            <div class="ocr-status">
                <span id="ocrStatus" class="ocr-status-label">Stopped</span>
                <span id="ocrModelStatus" class="ocr-model-status"></span>
            </div>
            <div class="ocr-buttons">
                <button id="ocrStartBtn" class="ocr-btn ocr-btn-start">Start Capture</button>
                <button id="ocrStopBtn" class="ocr-btn ocr-btn-stop" disabled>Stop Capture</button>
            </div>
            <div class="ocr-setting">
                <label for="ocrFps">Capture FPS:</label>
                <input type="number" id="ocrFps" min="1" max="10" value="${cfg.captureSettings?.fps || 2}">
            </div>
        </div>

        <div class="ocr-section">
            <h3>Live Values</h3>
            <div class="ocr-values">
                <div class="ocr-value-card">
                    <span class="ocr-value-label">Mass</span>
                    <span id="ocrMassValue" class="ocr-value-number">--</span>
                </div>
                <div class="ocr-value-card">
                    <span class="ocr-value-label">Resistance</span>
                    <span id="ocrResistanceValue" class="ocr-value-number">--</span>
                </div>
            </div>
            <label class="ocr-checkbox-label">
                <input type="checkbox" id="ocrAutoFill" checked>
                Auto-fill chart inputs
            </label>
        </div>

        <div class="ocr-section">
            <h3>ROI Settings</h3>
            <p class="ocr-hint">Adjust the region-of-interest boxes relative to each anchor.</p>
            ${renderROIEditor('mass', cfg.rois?.mass)}
            ${renderROIEditor('resistance', cfg.rois?.resistance)}
        </div>

        <div class="ocr-section">
            <h3>Anchor Settings</h3>
            ${renderAnchorSettings('mass', cfg.anchors?.mass)}
            ${renderAnchorSettings('resistance', cfg.anchors?.resistance)}
        </div>

        <div class="ocr-section">
            <button id="ocrResetBtn" class="ocr-btn ocr-btn-reset">Reset to Defaults</button>
        </div>
    `;
}

function renderROIEditor(name, roi) {
    if (!roi) return '';
    return `
        <fieldset class="ocr-roi-fieldset" data-roi="${name}">
            <legend>${name.charAt(0).toUpperCase() + name.slice(1)} ROI</legend>
            <div class="ocr-roi-grid">
                <label>X Offset: <input type="number" class="ocr-roi-input" data-field="xOffset" value="${roi.xOffset}"></label>
                <label>Y Offset: <input type="number" class="ocr-roi-input" data-field="yOffset" value="${roi.yOffset}"></label>
                <label>Width: <input type="number" class="ocr-roi-input" data-field="width" value="${roi.width}" min="1"></label>
                <label>Height: <input type="number" class="ocr-roi-input" data-field="height" value="${roi.height}" min="1"></label>
            </div>
            <div class="ocr-roi-grid">
                <label>Seg Mode:
                    <select class="ocr-roi-input" data-field="segMode">
                        <option value="projection" ${roi.segMode === 'projection' ? 'selected' : ''}>Projection</option>
                        <option value="fixed_width" ${roi.segMode === 'fixed_width' ? 'selected' : ''}>Fixed Width</option>
                    </select>
                </label>
                <label>Char Count: <input type="number" class="ocr-roi-input" data-field="charCount" value="${roi.charCount}" min="0"></label>
            </div>
            <details class="ocr-filter-details">
                <summary>Filters</summary>
                <div class="ocr-roi-grid">
                    <label>Brightness: <input type="number" class="ocr-roi-input" data-field="filters.brightness" value="${roi.filters?.brightness || 0}" min="-255" max="255"></label>
                    <label>Contrast: <input type="number" class="ocr-roi-input" data-field="filters.contrast" value="${roi.filters?.contrast || 0}" min="-100" max="100"></label>
                    <label>Threshold: <input type="number" class="ocr-roi-input" data-field="filters.threshold" value="${roi.filters?.threshold || 127}" min="0" max="255"></label>
                    <label class="ocr-checkbox-label"><input type="checkbox" class="ocr-roi-input" data-field="filters.thresholdEnabled" ${roi.filters?.thresholdEnabled ? 'checked' : ''}> Threshold Enabled</label>
                    <label class="ocr-checkbox-label"><input type="checkbox" class="ocr-roi-input" data-field="filters.grayscale" ${roi.filters?.grayscale ? 'checked' : ''}> Grayscale</label>
                    <label class="ocr-checkbox-label"><input type="checkbox" class="ocr-roi-input" data-field="filters.invert" ${roi.filters?.invert ? 'checked' : ''}> Invert</label>
                    <label>Channel:
                        <select class="ocr-roi-input" data-field="filters.channel">
                            <option value="none" ${(roi.filters?.channel || 'none') === 'none' ? 'selected' : ''}>None</option>
                            <option value="red" ${roi.filters?.channel === 'red' ? 'selected' : ''}>Red</option>
                            <option value="green" ${roi.filters?.channel === 'green' ? 'selected' : ''}>Green</option>
                            <option value="blue" ${roi.filters?.channel === 'blue' ? 'selected' : ''}>Blue</option>
                        </select>
                    </label>
                </div>
            </details>
        </fieldset>
    `;
}

function renderAnchorSettings(name, anchor) {
    if (!anchor) return '';
    return `
        <fieldset class="ocr-anchor-fieldset" data-anchor="${name}">
            <legend>${name.charAt(0).toUpperCase() + name.slice(1)} Anchor</legend>
            <div class="ocr-roi-grid">
                <label>Match Threshold: <input type="number" class="ocr-anchor-input" data-field="matchThreshold" value="${anchor.matchThreshold}" min="0" max="1" step="0.01"></label>
            </div>
        </fieldset>
    `;
}

function wireEvents() {
    startBtn = document.getElementById('ocrStartBtn');
    stopBtn = document.getElementById('ocrStopBtn');
    statusLabel = document.getElementById('ocrStatus');
    massDisplay = document.getElementById('ocrMassValue');
    resistanceDisplay = document.getElementById('ocrResistanceValue');

    if (startBtn) {
        startBtn.addEventListener('click', async () => {
            statusLabel.textContent = 'Initializing...';
            startBtn.disabled = true;

            await initPipeline(onOCRResult);
            updateModelStatus();

            const ok = await startPipeline();
            if (ok) {
                statusLabel.textContent = 'Running';
                statusLabel.classList.add('ocr-running');
                stopBtn.disabled = false;
            } else {
                statusLabel.textContent = 'Failed to start';
                startBtn.disabled = false;
            }
        });
    }

    if (stopBtn) {
        stopBtn.addEventListener('click', () => {
            stopPipeline();
            statusLabel.textContent = 'Stopped';
            statusLabel.classList.remove('ocr-running');
            startBtn.disabled = false;
            stopBtn.disabled = true;
        });
    }

    // FPS setting
    const fpsInput = document.getElementById('ocrFps');
    if (fpsInput) {
        fpsInput.addEventListener('change', () => {
            setOverride('captureSettings.fps', parseInt(fpsInput.value) || 2);
        });
    }

    // ROI inputs
    document.querySelectorAll('.ocr-roi-fieldset').forEach(fieldset => {
        const roiName = fieldset.dataset.roi;
        fieldset.querySelectorAll('.ocr-roi-input').forEach(input => {
            const field = input.dataset.field;
            const event = input.type === 'checkbox' ? 'change' : 'change';
            input.addEventListener(event, () => {
                const currentRoi = { ...getROI(roiName) };
                setFieldValue(currentRoi, field, input);
                setROIOverride(roiName, currentRoi);
            });
        });
    });

    // Anchor inputs
    document.querySelectorAll('.ocr-anchor-fieldset').forEach(fieldset => {
        const anchorName = fieldset.dataset.anchor;
        fieldset.querySelectorAll('.ocr-anchor-input').forEach(input => {
            const field = input.dataset.field;
            input.addEventListener('change', () => {
                setOverride(`anchors.${anchorName}.${field}`, parseFloat(input.value));
            });
        });
    });

    // Reset button
    const resetBtn = document.getElementById('ocrResetBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (confirm('Reset all OCR settings to defaults?')) {
                resetToDefaults();
                renderOCRPanel();
                wireEvents();
            }
        });
    }
}

function setFieldValue(obj, path, input) {
    const keys = path.split('.');
    let cur = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        if (!cur[keys[i]] || typeof cur[keys[i]] !== 'object') {
            cur[keys[i]] = {};
        }
        cur = cur[keys[i]];
    }
    const lastKey = keys[keys.length - 1];
    if (input.type === 'checkbox') {
        cur[lastKey] = input.checked;
    } else if (input.type === 'number') {
        cur[lastKey] = parseFloat(input.value) || 0;
    } else {
        cur[lastKey] = input.value;
    }
}

function updateModelStatus() {
    const el = document.getElementById('ocrModelStatus');
    if (!el) return;
    if (isModelLoaded()) {
        el.textContent = 'Model loaded';
        el.classList.add('ocr-model-ok');
        el.classList.remove('ocr-model-missing');
    } else {
        el.textContent = 'Model not loaded';
        el.classList.add('ocr-model-missing');
        el.classList.remove('ocr-model-ok');
    }
}

/**
 * Called by the pipeline each time a frame is processed.
 */
function onOCRResult(results) {
    if (massDisplay && results.mass !== undefined) {
        massDisplay.textContent = results.mass || '--';
    }
    if (resistanceDisplay && results.resistance !== undefined) {
        resistanceDisplay.textContent = results.resistance || '--';
    }

    // Auto-fill chart inputs if enabled
    const autoFill = document.getElementById('ocrAutoFill');
    if (autoFill && autoFill.checked) {
        const massInput = document.getElementById('massInput');
        const resistanceInput = document.getElementById('resistanceInput');
        const massVal = parseFloat(results.mass);
        const resVal = parseFloat(results.resistance);

        if (massInput && !isNaN(massVal)) {
            massInput.value = massVal;
        }
        if (resistanceInput && !isNaN(resVal)) {
            resistanceInput.value = resVal;
        }

        // Trigger chart marker update if we got valid values
        if (!isNaN(massVal) || !isNaN(resVal)) {
            updateMarker();
        }
    }
}
