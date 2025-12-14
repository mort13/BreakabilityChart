/**
 * OCR UI - Region selection and capture controls
 */

import { 
    initOCR, 
    startCapture, 
    stopCapture, 
    isCaptureActive,
    setMassRegion,
    setResistanceRegion,
    getRegions,
    loadRegions,
    getCurrentFrameDataURL,
    getCaptureDimensions,
    getOCRSettings,
    updateOCRSettings,
    getProcessedRegionPreview,
    getRawRegionPreview,
    autoDetectThreshold,
    detectPolarity,
    getDebugInfo,
    testOCR,
    reloadTemplates,
    getTemplatePreview,
    getAllTemplatePreviews,
    diagnoseMatch
} from './ocr-manager.js';

let regionSelectModal = null;
let settingsModal = null;
let currentRegionType = null; // 'mass' or 'resistance'
let selectionStart = null;
let selectionRect = null;

/**
 * Initialize OCR UI
 * @param {Function} onValuesCallback - Called when values are detected
 */
export function initOCRUI(onValuesCallback) {
    // Initialize OCR engine
    initOCR(onValuesCallback);
    loadRegions();
    
    // Create the OCR control panel
    createOCRPanel();
    
    // Create region selection modal
    createRegionSelectModal();
    
    // Expose debug functions globally for console access
    window.ocrDebug = {
        getDebugInfo,
        testOCR,
        getRegions,
        getSettings: getOCRSettings,
        getTemplatePreview,
        getAllTemplatePreviews,
        diagnoseMatch,
        clearRegions: () => {
            localStorage.removeItem('ocrRegions');
            console.log('Regions cleared. Reload the page.');
        },
        showTemplate: (char) => {
            const url = getTemplatePreview(char);
            if (url) {
                const img = new Image();
                img.src = url;
                img.style.cssText = 'image-rendering: pixelated; width: 100px; border: 1px solid red;';
                console.log(`Template '${char}':`, img);
            }
        }
    };
    console.log('OCR Debug: Use window.ocrDebug.diagnoseMatch("mass", "5") to see detailed comparison');
}

/**
 * Create the OCR control panel
 */
function createOCRPanel() {
    const panel = document.createElement('div');
    panel.id = 'ocr-panel';
    panel.className = 'ocr-panel';
    panel.innerHTML = `
        <div class="ocr-header">
            <span>📷 Screen OCR</span>
            <div class="ocr-header-buttons">
                <button id="ocr-settings" class="ocr-btn ocr-btn-small" title="OCR Settings">⚙️</button>
                <button id="ocr-toggle" class="ocr-btn">Start Capture</button>
            </div>
        </div>
        <div class="ocr-body">
            <div class="ocr-status">
                <span id="ocr-status-text">Not capturing</span>
            </div>
            <div class="ocr-regions">
                <button id="ocr-set-mass" class="ocr-btn ocr-btn-small">Set Mass Region</button>
                <button id="ocr-set-resistance" class="ocr-btn ocr-btn-small">Set Resistance Region</button>
            </div>
            <div class="ocr-preview-row" id="ocr-preview-row" style="display: none;">
                <div class="ocr-preview-item">
                    <label>Mass Preview:</label>
                    <div class="ocr-preview-images">
                        <img id="ocr-mass-raw" class="ocr-preview-img" title="Raw capture" />
                        <img id="ocr-mass-processed" class="ocr-preview-img" title="After threshold" />
                    </div>
                </div>
                <div class="ocr-preview-item">
                    <label>Resistance Preview:</label>
                    <div class="ocr-preview-images">
                        <img id="ocr-resistance-raw" class="ocr-preview-img" title="Raw capture" />
                        <img id="ocr-resistance-processed" class="ocr-preview-img" title="After threshold" />
                    </div>
                </div>
            </div>
            <div class="ocr-values">
                <div class="ocr-value">
                    <label>Mass:</label>
                    <span id="ocr-mass-value">-</span>
                </div>
                <div class="ocr-value">
                    <label>Resistance:</label>
                    <span id="ocr-resistance-value">-</span>
                </div>
            </div>
        </div>
    `;
    
    // Insert after the chart controls or at end of chart section
    const chartSection = document.querySelector('.chart-section');
    if (chartSection) {
        chartSection.appendChild(panel);
    } else {
        document.body.appendChild(panel);
    }
    
    // Add event listeners
    document.getElementById('ocr-toggle').addEventListener('click', toggleCapture);
    document.getElementById('ocr-set-mass').addEventListener('click', () => openRegionSelector('mass'));
    document.getElementById('ocr-set-resistance').addEventListener('click', () => openRegionSelector('resistance'));
    document.getElementById('ocr-settings').addEventListener('click', openSettingsModal);
}

/**
 * Create the region selection modal
 */
function createRegionSelectModal() {
    regionSelectModal = document.createElement('div');
    regionSelectModal.id = 'ocr-region-modal';
    regionSelectModal.className = 'ocr-modal hidden';
    regionSelectModal.innerHTML = `
        <div class="ocr-modal-content">
            <div class="ocr-modal-header">
                <span id="ocr-modal-title">Select Region</span>
                <button id="ocr-modal-close" class="ocr-modal-close">×</button>
            </div>
            <div class="ocr-modal-body">
                <p>Draw a rectangle around the <span id="ocr-region-type">value</span> on the captured screen.</p>
                <div id="ocr-capture-container" class="ocr-capture-container">
                    <img id="ocr-capture-image" class="ocr-capture-image" />
                    <div id="ocr-selection-box" class="ocr-selection-box hidden"></div>
                </div>
            </div>
            <div class="ocr-modal-footer">
                <button id="ocr-region-confirm" class="ocr-btn" disabled>Confirm Selection</button>
                <button id="ocr-region-cancel" class="ocr-btn">Cancel</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(regionSelectModal);
    
    // Add event listeners
    document.getElementById('ocr-modal-close').addEventListener('click', closeRegionSelector);
    document.getElementById('ocr-region-cancel').addEventListener('click', closeRegionSelector);
    document.getElementById('ocr-region-confirm').addEventListener('click', confirmRegionSelection);
    
    // Selection drawing
    const container = document.getElementById('ocr-capture-container');
    container.addEventListener('mousedown', startSelection);
    container.addEventListener('mousemove', updateSelection);
    container.addEventListener('mouseup', endSelection);
}

/**
 * Create the settings modal
 */
function createSettingsModal() {
    settingsModal = document.createElement('div');
    settingsModal.id = 'ocr-settings-modal';
    settingsModal.className = 'ocr-modal hidden';
    
    const settings = getOCRSettings();
    
    settingsModal.innerHTML = `
        <div class="ocr-modal-content ocr-settings-content">
            <div class="ocr-modal-header">
                <span>OCR Settings</span>
                <button id="ocr-settings-close" class="ocr-modal-close">×</button>
            </div>
            <div class="ocr-modal-body">
                <div class="ocr-setting">
                    <label for="ocr-threshold">Brightness Threshold (0-255):</label>
                    <div class="ocr-setting-row">
                        <input type="range" id="ocr-threshold" min="0" max="255" value="${settings.threshold}" />
                        <span id="ocr-threshold-value">${settings.threshold}</span>
                    </div>
                    <p class="ocr-setting-help">Pixels brighter than this become white, darker become black.</p>
                </div>
                
                <div class="ocr-setting">
                    <label>
                        <input type="checkbox" id="ocr-invert" ${settings.invertPolarity ? 'checked' : ''} />
                        Invert Capture (check if text appears BLACK on white in preview)
                    </label>
                    <p class="ocr-setting-help">Text should appear WHITE on black background in the processed preview.</p>
                </div>
                
                <div class="ocr-setting">
                    <label>
                        <input type="checkbox" id="ocr-invert-templates" ${settings.invertTemplates ? 'checked' : ''} />
                        Invert Templates (check if your template images are dark digits on light background)
                    </label>
                    <p class="ocr-setting-help">Enable if your template images have black/dark digits on white/light background.</p>
                </div>
                
                <div class="ocr-setting">
                    <label for="ocr-match-threshold">Match Confidence (0-100%):</label>
                    <div class="ocr-setting-row">
                        <input type="range" id="ocr-match-threshold" min="50" max="100" value="${settings.matchThreshold * 100}" />
                        <span id="ocr-match-threshold-value">${Math.round(settings.matchThreshold * 100)}%</span>
                    </div>
                    <p class="ocr-setting-help">Minimum similarity required to recognize a character.</p>
                </div>
                
                <div class="ocr-setting">
                    <label>Auto-detect from regions:</label>
                    <div class="ocr-setting-row">
                        <button id="ocr-auto-threshold" class="ocr-btn ocr-btn-small">Auto Threshold</button>
                        <button id="ocr-auto-polarity" class="ocr-btn ocr-btn-small">Auto Polarity</button>
                    </div>
                </div>
                
                <div class="ocr-setting">
                    <label>Preview (current capture):</label>
                    <div class="ocr-preview-container">
                        <div class="ocr-preview-column">
                            <span>Mass Region</span>
                            <div class="ocr-preview-pair">
                                <div>
                                    <small>Raw</small>
                                    <img id="ocr-settings-mass-raw" class="ocr-preview-large" />
                                </div>
                                <div>
                                    <small>Processed</small>
                                    <img id="ocr-settings-mass-processed" class="ocr-preview-large" />
                                </div>
                            </div>
                        </div>
                        <div class="ocr-preview-column">
                            <span>Resistance Region</span>
                            <div class="ocr-preview-pair">
                                <div>
                                    <small>Raw</small>
                                    <img id="ocr-settings-resistance-raw" class="ocr-preview-large" />
                                </div>
                                <div>
                                    <small>Processed</small>
                                    <img id="ocr-settings-resistance-processed" class="ocr-preview-large" />
                                </div>
                            </div>
                        </div>
                    </div>
                    <button id="ocr-refresh-preview" class="ocr-btn ocr-btn-small">Refresh Preview</button>
                </div>
            </div>
            <div class="ocr-modal-footer">
                <button id="ocr-settings-save" class="ocr-btn">Save & Close</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(settingsModal);
    
    // Add event listeners
    document.getElementById('ocr-settings-close').addEventListener('click', closeSettingsModal);
    document.getElementById('ocr-settings-save').addEventListener('click', saveSettings);
    document.getElementById('ocr-auto-threshold').addEventListener('click', handleAutoThreshold);
    document.getElementById('ocr-auto-polarity').addEventListener('click', handleAutoPolarity);
    document.getElementById('ocr-refresh-preview').addEventListener('click', refreshSettingsPreview);
    
    // Live update threshold - apply immediately and refresh preview
    document.getElementById('ocr-threshold').addEventListener('input', (e) => {
        document.getElementById('ocr-threshold-value').textContent = e.target.value;
        updateOCRSettings({ threshold: parseInt(e.target.value) });
        refreshSettingsPreview();
    });
    
    // Live update match threshold
    document.getElementById('ocr-match-threshold').addEventListener('input', (e) => {
        document.getElementById('ocr-match-threshold-value').textContent = e.target.value + '%';
        updateOCRSettings({ matchThreshold: parseInt(e.target.value) / 100 });
    });
    
    // Live update invert polarity
    document.getElementById('ocr-invert').addEventListener('change', (e) => {
        updateOCRSettings({ invertPolarity: e.target.checked });
        refreshSettingsPreview();
    });
    
    // Live update invert templates - needs to reload templates
    document.getElementById('ocr-invert-templates').addEventListener('change', async (e) => {
        updateOCRSettings({ invertTemplates: e.target.checked });
        await reloadTemplates();
        console.log('Templates reloaded with invertTemplates:', e.target.checked);
    });
}

/**
 * Open settings modal
 */
function openSettingsModal() {
    if (!settingsModal) {
        createSettingsModal();
    }
    
    // Update values from current settings
    const settings = getOCRSettings();
    document.getElementById('ocr-threshold').value = settings.threshold;
    document.getElementById('ocr-threshold-value').textContent = settings.threshold;
    document.getElementById('ocr-invert').checked = settings.invertPolarity;
    document.getElementById('ocr-invert-templates').checked = settings.invertTemplates;
    document.getElementById('ocr-match-threshold').value = settings.matchThreshold * 100;
    document.getElementById('ocr-match-threshold-value').textContent = Math.round(settings.matchThreshold * 100) + '%';
    
    settingsModal.classList.remove('hidden');
    refreshSettingsPreview();
}

/**
 * Close settings modal
 */
function closeSettingsModal() {
    settingsModal.classList.add('hidden');
}

/**
 * Save settings and close modal (settings are already applied live)
 */
function saveSettings() {
    // Settings are already applied live, just close
    closeSettingsModal();
}

/**
 * Handle auto-threshold button
 */
function handleAutoThreshold() {
    if (!isCaptureActive()) {
        alert('Please start capture first');
        return;
    }
    
    const regions = getRegions();
    let threshold = 128;
    
    if (regions.mass) {
        threshold = autoDetectThreshold('mass');
    } else if (regions.resistance) {
        threshold = autoDetectThreshold('resistance');
    } else {
        alert('Please set at least one region first');
        return;
    }
    
    document.getElementById('ocr-threshold').value = threshold;
    document.getElementById('ocr-threshold-value').textContent = threshold;
    
    // Apply immediately and refresh preview
    updateOCRSettings({ threshold });
    refreshSettingsPreview();
}

/**
 * Handle auto-polarity button
 */
function handleAutoPolarity() {
    if (!isCaptureActive()) {
        alert('Please start capture first');
        return;
    }
    
    const regions = getRegions();
    let shouldInvert = false;
    
    if (regions.mass) {
        shouldInvert = detectPolarity('mass');
    } else if (regions.resistance) {
        shouldInvert = detectPolarity('resistance');
    } else {
        alert('Please set at least one region first');
        return;
    }
    
    document.getElementById('ocr-invert').checked = shouldInvert;
    
    // Apply immediately and refresh preview
    updateOCRSettings({ invertPolarity: shouldInvert });
    refreshSettingsPreview();
}

/**
 * Refresh the preview images in settings modal
 */
function refreshSettingsPreview() {
    if (!isCaptureActive()) return;
    
    const massRaw = document.getElementById('ocr-settings-mass-raw');
    const massProcessed = document.getElementById('ocr-settings-mass-processed');
    const resistanceRaw = document.getElementById('ocr-settings-resistance-raw');
    const resistanceProcessed = document.getElementById('ocr-settings-resistance-processed');
    
    const massRawUrl = getRawRegionPreview('mass');
    const massProcessedUrl = getProcessedRegionPreview('mass');
    const resistanceRawUrl = getRawRegionPreview('resistance');
    const resistanceProcessedUrl = getProcessedRegionPreview('resistance');
    
    if (massRaw && massRawUrl) massRaw.src = massRawUrl;
    if (massProcessed && massProcessedUrl) massProcessed.src = massProcessedUrl;
    if (resistanceRaw && resistanceRawUrl) resistanceRaw.src = resistanceRawUrl;
    if (resistanceProcessed && resistanceProcessedUrl) resistanceProcessed.src = resistanceProcessedUrl;
}

/**
 * Toggle capture on/off
 */
async function toggleCapture() {
    const btn = document.getElementById('ocr-toggle');
    const status = document.getElementById('ocr-status-text');
    
    if (isCaptureActive()) {
        stopCapture();
        btn.textContent = 'Start Capture';
        btn.classList.remove('active');
        status.textContent = 'Not capturing';
    } else {
        btn.textContent = 'Starting...';
        const success = await startCapture();
        
        if (success) {
            btn.textContent = 'Stop Capture';
            btn.classList.add('active');
            status.textContent = 'Capturing at 1Hz';
        } else {
            btn.textContent = 'Start Capture';
            status.textContent = 'Failed to start';
        }
    }
}

/**
 * Open region selector for mass or resistance
 */
function openRegionSelector(type) {
    if (!isCaptureActive()) {
        alert('Please start screen capture first');
        return;
    }
    
    currentRegionType = type;
    selectionRect = null;
    
    // Get current frame
    const dataURL = getCurrentFrameDataURL();
    if (!dataURL) {
        alert('Could not capture frame');
        return;
    }
    
    // Set up modal
    document.getElementById('ocr-region-type').textContent = type;
    document.getElementById('ocr-modal-title').textContent = `Select ${type.charAt(0).toUpperCase() + type.slice(1)} Region`;
    document.getElementById('ocr-capture-image').src = dataURL;
    document.getElementById('ocr-region-confirm').disabled = true;
    document.getElementById('ocr-selection-box').classList.add('hidden');
    
    // Show modal
    regionSelectModal.classList.remove('hidden');
}

/**
 * Close region selector
 */
function closeRegionSelector() {
    regionSelectModal.classList.add('hidden');
    currentRegionType = null;
    selectionRect = null;
}

/**
 * Start drawing selection rectangle
 */
function startSelection(e) {
    const container = document.getElementById('ocr-capture-container');
    const rect = container.getBoundingClientRect();
    
    selectionStart = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
    
    const box = document.getElementById('ocr-selection-box');
    box.style.left = selectionStart.x + 'px';
    box.style.top = selectionStart.y + 'px';
    box.style.width = '0px';
    box.style.height = '0px';
    box.classList.remove('hidden');
}

/**
 * Update selection rectangle while dragging
 */
function updateSelection(e) {
    if (!selectionStart) return;
    
    const container = document.getElementById('ocr-capture-container');
    const rect = container.getBoundingClientRect();
    const box = document.getElementById('ocr-selection-box');
    
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;
    
    const left = Math.min(selectionStart.x, currentX);
    const top = Math.min(selectionStart.y, currentY);
    const width = Math.abs(currentX - selectionStart.x);
    const height = Math.abs(currentY - selectionStart.y);
    
    box.style.left = left + 'px';
    box.style.top = top + 'px';
    box.style.width = width + 'px';
    box.style.height = height + 'px';
}

/**
 * End selection rectangle
 */
function endSelection(e) {
    if (!selectionStart) return;
    
    const container = document.getElementById('ocr-capture-container');
    const image = document.getElementById('ocr-capture-image');
    const rect = container.getBoundingClientRect();
    
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;
    
    // Calculate selection in display coordinates
    const displayLeft = Math.min(selectionStart.x, currentX);
    const displayTop = Math.min(selectionStart.y, currentY);
    const displayWidth = Math.abs(currentX - selectionStart.x);
    const displayHeight = Math.abs(currentY - selectionStart.y);
    
    // Convert to actual capture coordinates
    const scaleX = image.naturalWidth / image.clientWidth;
    const scaleY = image.naturalHeight / image.clientHeight;
    
    selectionRect = {
        x: Math.round(displayLeft * scaleX),
        y: Math.round(displayTop * scaleY),
        width: Math.round(displayWidth * scaleX),
        height: Math.round(displayHeight * scaleY)
    };
    
    selectionStart = null;
    
    // Enable confirm button if selection is valid
    const confirmBtn = document.getElementById('ocr-region-confirm');
    confirmBtn.disabled = selectionRect.width < 10 || selectionRect.height < 5;
}

/**
 * Confirm region selection
 */
function confirmRegionSelection() {
    if (!selectionRect || !currentRegionType) return;
    
    if (currentRegionType === 'mass') {
        setMassRegion(selectionRect);
    } else if (currentRegionType === 'resistance') {
        setResistanceRegion(selectionRect);
    }
    
    closeRegionSelector();
    updateRegionIndicators();
}

/**
 * Update UI to show which regions are set
 */
function updateRegionIndicators() {
    const regions = getRegions();
    
    const massBtn = document.getElementById('ocr-set-mass');
    const resistanceBtn = document.getElementById('ocr-set-resistance');
    
    if (regions.mass) {
        massBtn.classList.add('region-set');
        massBtn.textContent = '✓ Mass Region';
    } else {
        massBtn.classList.remove('region-set');
        massBtn.textContent = 'Set Mass Region';
    }
    
    if (regions.resistance) {
        resistanceBtn.classList.add('region-set');
        resistanceBtn.textContent = '✓ Resistance Region';
    } else {
        resistanceBtn.classList.remove('region-set');
        resistanceBtn.textContent = 'Set Resistance Region';
    }
}

/**
 * Update displayed OCR values
 */
export function updateOCRValues(values) {
    const massEl = document.getElementById('ocr-mass-value');
    const resistanceEl = document.getElementById('ocr-resistance-value');
    
    if (massEl && values.mass !== null) {
        massEl.textContent = values.mass.toFixed(1);
    }
    
    if (resistanceEl && values.resistance !== null) {
        resistanceEl.textContent = values.resistance.toFixed(1) + '%';
    }
}

// Initialize region indicators on load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(updateRegionIndicators, 100);
});
