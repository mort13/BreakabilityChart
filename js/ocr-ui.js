/**
 * OCR UI - Screen capture controls, per-region configuration with preview canvases,
 * live value display, and auto-fill functionality.
 * Groups settings by region (mass, resistance) for clarity. Easily expandable to more regions.
 */

import { loadConfig, getConfig, setOverride, resetToDefaults, getActiveShip, setActiveShip, getShips } from './ocr-config-manager.js';
import {
    init as initPipeline,
    start as startPipeline,
    stop as stopPipeline,
    setPreviewEnabled,
    updateFps,
    isRunning as isPipelineRunning,
    getFrameDimensions,
    getThumbCanvas,
    reloadAnchors
} from './ocr-pipeline.js';
import { isModelLoaded } from './ocr-cnn.js';
import { updateMarker } from './chart-manager.js';

/** Width in px of preview canvases. */
const PREVIEW_WIDTH = 300;

/** Region names — add entries here to expand to more regions. */
const REGION_NAMES = ['mass', 'resistance'];

let massDisplay = null;
let resistanceDisplay = null;

/** Screen preview state */
let screenPreviewCanvas = null;
let screenPreviewCtx = null;
let screenPreviewRAF = null;
/** Whether the big preview is frozen (stops updating after region selected) */
let screenPreviewFrozen = false;
/** Currently selected region for drag-select (null, 'mass', or 'resistance') */
let dragTarget = null;
/** Drag state */
let dragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragCurX = 0;
let dragCurY = 0;

/**
 * Initialize the OCR UI: load config, render panel, wire events.
 */
export async function setupOCR() {
    await loadConfig();
    renderOCRPanel();
    wireEvents();
}

/** Called by ui-manager when the active tab changes. */
export function setOCRTabActive(active) {
    setPreviewEnabled(active);
}

// ─── Rendering ────────────────────────────────────────────────────────

function renderOCRPanel() {
    const container = document.getElementById('ocr-controls');
    if (!container) return;
    const cfg = getConfig();

    container.innerHTML = `
        <div class="ocr-section">
            <h3>Screen Capture</h3>
            <div class="ocr-ship-row">
                <label class="ocr-ship-label">Ship</label>
                <div class="ocr-ship-btns">
                    ${getShips().map(s => `
                        <button class="ocr-btn ocr-ship-btn${s === getActiveShip() ? ' ocr-ship-active' : ''}" data-ship="${s}">
                            ${s.charAt(0).toUpperCase() + s.slice(1)}
                        </button>
                    `).join('')}
                </div>
            </div>
            <div class="ocr-status">
                <span id="ocrStatus" class="ocr-status-label">Stopped</span>
                <span id="ocrModelStatus" class="ocr-model-status"></span>
            </div>
            <div class="ocr-buttons">
                <button id="ocrStartBtn" class="ocr-btn ocr-btn-start">Start Capture</button>
                <button id="ocrStopBtn" class="ocr-btn ocr-btn-stop" disabled>Stop Capture</button>
            </div>
            <div class="ocr-slider-row">
                <label>Capture Rate (Hz)</label>
                <input type="range" id="ocrFps" min="1" max="10" value="${cfg.captureSettings?.fps || 10}">
                <span id="ocrFpsValue" class="ocr-slider-value">${cfg.captureSettings?.fps || 10}</span>
            </div>
        </div>

        <div class="ocr-section">
            <h3>Screen Preview</h3>
            <p class="ocr-hint">Select a region below, then drag a rectangle on the preview to set its search area.</p>
            <div class="ocr-drag-controls">
                <label>Drag target:</label>
                ${REGION_NAMES.map(name => `
                    <button class="ocr-btn ocr-drag-target-btn" data-target="${name}">${name.charAt(0).toUpperCase() + name.slice(1)}</button>
                `).join('')}
                <button class="ocr-btn ocr-drag-target-btn ocr-drag-target-none" data-target="">None</button>
                <button id="ocrPreviewFreezeBtn" class="ocr-btn" title="Refresh the screen preview">Refresh Preview</button>
            </div>
            <div class="ocr-screen-preview-wrap">
                <canvas id="ocrScreenPreview" class="ocr-screen-preview-canvas"></canvas>
                <div id="ocrScreenPlaceholder" class="ocr-screen-placeholder">Start capture to see preview</div>
            </div>
        </div>

        ${REGION_NAMES.map(name => renderRegion(name, cfg)).join('')}

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
            <button id="ocrResetBtn" class="ocr-btn ocr-btn-reset">Reset to Defaults</button>
        </div>
    `;
}

function renderRegion(name, cfg) {
    const roi = cfg.rois?.[name] || {};
    const anchor = cfg.anchors?.[name] || {};
    const sr = anchor.searchRegion || { x: 0, y: 0, w: 0, h: 0 };
    const filters = roi.filters || {};
    const label = name.charAt(0).toUpperCase() + name.slice(1);

    return `
    <div class="ocr-section ocr-region-section" data-region="${name}">
        <h3>${label}</h3>

        <fieldset class="ocr-fieldset">
            <legend>Anchor Search Region</legend>
            <p class="ocr-hint">Screen area to search for the anchor. Set all to 0 for full screen.</p>
            <div class="ocr-roi-grid">
                <label>X <input type="number" class="ocr-sr-input" data-field="x" value="${sr.x}" min="0"></label>
                <label>Y <input type="number" class="ocr-sr-input" data-field="y" value="${sr.y}" min="0"></label>
                <label>W <input type="number" class="ocr-sr-input" data-field="w" value="${sr.w}" min="0"></label>
                <label>H <input type="number" class="ocr-sr-input" data-field="h" value="${sr.h}" min="0"></label>
            </div>
            <div class="ocr-slider-row">
                <label>Threshold</label>
                <input type="range" class="ocr-anchor-slider" data-field="matchThreshold"
                       min="0" max="100" value="${Math.round((anchor.matchThreshold || 0.5) * 100)}">
                <span class="ocr-slider-value">${(anchor.matchThreshold || 0.5).toFixed(2)}</span>
            </div>
        </fieldset>

        <fieldset class="ocr-fieldset">
            <legend>ROI (relative to anchor)</legend>
            <div class="ocr-roi-grid">
                <label>X Offset <input type="number" class="ocr-roi-input" data-field="xOffset" value="${roi.xOffset || 0}"></label>
                <label>Y Offset <input type="number" class="ocr-roi-input" data-field="yOffset" value="${roi.yOffset || 0}"></label>
                <label>Width <input type="number" class="ocr-roi-input" data-field="width" value="${roi.width || 50}" min="1"></label>
                <label>Height <input type="number" class="ocr-roi-input" data-field="height" value="${roi.height || 24}" min="1"></label>
            </div>
            <div class="ocr-setting">
                <label>Digits:</label>
                <input type="number" class="ocr-roi-input" data-field="charCount" value="${roi.charCount || 5}" min="1" max="20" style="width:60px">
            </div>
        </fieldset>

        <fieldset class="ocr-fieldset">
            <legend>Preprocessing</legend>
            <div class="ocr-slider-row">
                <label>Brightness</label>
                <input type="range" class="ocr-filter-slider" data-field="brightness"
                       min="-255" max="255" value="${filters.brightness || 0}">
                <span class="ocr-slider-value">${filters.brightness || 0}</span>
            </div>
            <div class="ocr-slider-row">
                <label>Contrast</label>
                <input type="range" class="ocr-filter-slider" data-field="contrast"
                       min="-100" max="100" value="${filters.contrast || 0}">
                <span class="ocr-slider-value">${filters.contrast || 0}</span>
            </div>
        </fieldset>

        <div class="ocr-preview-section">
            <div class="ocr-preview-header">
                <span class="ocr-preview-title">Preview</span>
                <span class="ocr-preview-recognized" id="ocrRecognized_${name}">--</span>
            </div>
            <canvas id="ocrPreview_${name}" class="ocr-preview-canvas" width="${PREVIEW_WIDTH}" height="150"></canvas>
            <div class="ocr-preview-status" id="ocrAnchorStatus_${name}">Anchor: waiting...</div>
        </div>
    </div>
    `;
}

// ─── Event wiring ─────────────────────────────────────────────────────

function wireEvents() {
    const startBtn = document.getElementById('ocrStartBtn');
    const stopBtn = document.getElementById('ocrStopBtn');
    const statusLabel = document.getElementById('ocrStatus');
    massDisplay = document.getElementById('ocrMassValue');
    resistanceDisplay = document.getElementById('ocrResistanceValue');

    // Screen preview canvas
    screenPreviewCanvas = document.getElementById('ocrScreenPreview');
    screenPreviewCtx = screenPreviewCanvas ? screenPreviewCanvas.getContext('2d') : null;

    wireScreenPreviewDrag();
    wireDragTargetButtons();
    wireShipButtons();

    if (startBtn) {
        startBtn.addEventListener('click', async () => {
            statusLabel.textContent = 'Initializing...';
            startBtn.disabled = true;

            await initPipeline(onOCRResult, onPipelineStopped);
            updateModelStatus();

            const ok = await startPipeline();
            if (ok) {
                statusLabel.textContent = 'Running';
                statusLabel.classList.add('ocr-running');
                stopBtn.disabled = false;
                startScreenPreviewLoop();
            } else {
                statusLabel.textContent = 'Failed';
                startBtn.disabled = false;
            }
        });
    }

    if (stopBtn) {
        stopBtn.addEventListener('click', () => {
            stopPipeline();
            stopScreenPreviewLoop();
            statusLabel.textContent = 'Stopped';
            statusLabel.classList.remove('ocr-running');
            startBtn.disabled = false;
            stopBtn.disabled = true;
        });
    }

    // FPS slider
    const fpsSlider = document.getElementById('ocrFps');
    const fpsLabel = document.getElementById('ocrFpsValue');
    if (fpsSlider) {
        fpsSlider.addEventListener('input', () => {
            const val = parseInt(fpsSlider.value) || 10;
            fpsLabel.textContent = val;
            setOverride('captureSettings.fps', val);
            updateFps();
        });
    }

    // Per-region controls
    document.querySelectorAll('.ocr-region-section').forEach(section => {
        const name = section.dataset.region;

        // Search region number inputs
        section.querySelectorAll('.ocr-sr-input').forEach(input => {
            input.addEventListener('change', () => {
                const field = input.dataset.field;
                const val = parseInt(input.value) || 0;
                setOverride(`anchors.${name}.searchRegion.${field}`, val);
            });
        });

        // Anchor threshold slider
        section.querySelectorAll('.ocr-anchor-slider').forEach(slider => {
            const valSpan = slider.nextElementSibling;
            slider.addEventListener('input', () => {
                const val = parseInt(slider.value) / 100;
                valSpan.textContent = val.toFixed(2);
                setOverride(`anchors.${name}.matchThreshold`, val);
            });
        });

        // ROI number inputs
        section.querySelectorAll('.ocr-roi-input').forEach(input => {
            input.addEventListener('change', () => {
                const field = input.dataset.field;
                const val = parseFloat(input.value) || 0;
                setOverride(`rois.${name}.${field}`, val);
            });
        });

        // Preprocessing sliders (brightness, contrast)
        section.querySelectorAll('.ocr-filter-slider').forEach(slider => {
            const valSpan = slider.nextElementSibling;
            slider.addEventListener('input', () => {
                const field = slider.dataset.field;
                const val = parseInt(slider.value) || 0;
                valSpan.textContent = val;
                setOverride(`rois.${name}.filters.${field}`, val);
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

// ─── Result callback ──────────────────────────────────────────────────

/** Called when pipeline stops (e.g. user clicks "Stop sharing" in browser). */
function onPipelineStopped() {
    stopScreenPreviewLoop();
    const statusLabel = document.getElementById('ocrStatus');
    const startBtn = document.getElementById('ocrStartBtn');
    const stopBtn = document.getElementById('ocrStopBtn');
    if (statusLabel) {
        statusLabel.textContent = 'Stopped';
        statusLabel.classList.remove('ocr-running');
    }
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
}

function onOCRResult(results) {
    const previews = results._previews || {};

    // Update live value displays
    if (massDisplay && results.mass !== undefined) {
        massDisplay.textContent = results.mass || '--';
    }
    if (resistanceDisplay && results.resistance !== undefined) {
        resistanceDisplay.textContent = results.resistance || '--';
    }

    // Update per-region previews
    for (const name of REGION_NAMES) {
        const preview = previews[name];
        if (!preview) continue;

        // Anchor status text
        const statusEl = document.getElementById(`ocrAnchorStatus_${name}`);
        if (statusEl) {
            if (preview.error) {
                statusEl.textContent = preview.error;
                statusEl.className = 'ocr-preview-status ocr-status-error';
            } else if (preview.anchorFound) {
                statusEl.textContent = `Anchor: found (${(preview.anchorConfidence * 100).toFixed(1)}%)`;
                statusEl.className = 'ocr-preview-status ocr-status-found';
            } else {
                statusEl.textContent = `Anchor: not found (best: ${(preview.anchorConfidence * 100).toFixed(1)}%)`;
                statusEl.className = 'ocr-preview-status ocr-status-missing';
            }
        }

        // Recognized value
        const recEl = document.getElementById(`ocrRecognized_${name}`);
        if (recEl) {
            recEl.textContent = preview.text || '--';
        }

        // Draw preview canvas — show search region with overlays
        if (preview.searchImageData) {
            drawPreview(name, preview);
        }
    }

    // Auto-fill chart inputs
    const autoFill = document.getElementById('ocrAutoFill');
    if (autoFill && autoFill.checked) {
        const massInput = document.getElementById('massInput');
        const resistanceInput = document.getElementById('resistanceInput');
        const massVal = parseFloat(results.mass);
        const resVal = parseFloat(results.resistance);

        if (massInput && !isNaN(massVal)) massInput.value = massVal;
        if (resistanceInput && !isNaN(resVal)) resistanceInput.value = resVal;
        if (!isNaN(massVal) || !isNaN(resVal)) updateMarker();
    }
}

// ─── Preview canvas rendering ─────────────────────────────────────────

/**
 * Draw the small per-region preview.
 * Shows the search region image with overlaid anchor box, ROI rectangle,
 * segmentation lines and recognized characters.
 */
function drawPreview(regionName, preview) {
    const canvas = document.getElementById(`ocrPreview_${regionName}`);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const img = preview.searchImageData;
    const imgW = preview.searchW;
    const imgH = preview.searchH;

    // Scale to fit PREVIEW_WIDTH
    const scale = PREVIEW_WIDTH / imgW;
    const displayH = Math.max(40, Math.round(imgH * scale));

    canvas.width = PREVIEW_WIDTH;
    canvas.height = displayH;

    // Draw the search region image
    const tmp = document.createElement('canvas');
    tmp.width = imgW;
    tmp.height = imgH;
    tmp.getContext('2d').putImageData(img, 0, 0);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, PREVIEW_WIDTH, displayH);

    // Draw anchor box (green if found, orange if not)
    if (preview.anchorRelX !== undefined) {
        const ax = preview.anchorRelX * scale;
        const ay = preview.anchorRelY * scale;
        const aw = preview.anchorW * scale;
        const ah = preview.anchorH * scale;

        ctx.strokeStyle = preview.anchorFound ? '#4caf50' : '#e67e22';
        ctx.lineWidth = 2;
        ctx.setLineDash(preview.anchorFound ? [] : [4, 2]);
        ctx.strokeRect(ax, ay, aw, ah);
        ctx.setLineDash([]);

        // Anchor label
        ctx.font = 'bold 10px sans-serif';
        ctx.fillStyle = preview.anchorFound ? '#4caf50' : '#e67e22';
        const label = preview.anchorFound
            ? `anchor ${(preview.anchorConfidence * 100).toFixed(0)}%`
            : `best ${(preview.anchorConfidence * 100).toFixed(0)}%`;
        ctx.fillText(label, ax + 2, ay - 3);
    }

    // Draw ROI rectangle (relative to search region)
    if (preview.roiRelX !== undefined) {
        const rx = preview.roiRelX * scale;
        const ry = preview.roiRelY * scale;
        const rw = preview.roiW * scale;
        const rh = preview.roiH * scale;

        ctx.strokeStyle = preview.anchorFound ? 'rgba(255, 60, 60, 0.9)' : 'rgba(255, 60, 60, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(rx, ry, rw, rh);

        // Draw segmentation lines inside ROI
        if (preview.segments && preview.anchorFound) {
            const segScale = rw / preview.roiW;
            ctx.strokeStyle = 'rgba(255, 255, 60, 0.7)';
            ctx.lineWidth = 1;

            for (const seg of preview.segments) {
                const x = Math.round(rx + seg.x * segScale) + 0.5;
                ctx.beginPath();
                ctx.moveTo(x, ry);
                ctx.lineTo(x, ry + rh);
                ctx.stroke();
            }
            // Right edge
            if (preview.segments.length > 0) {
                const last = preview.segments[preview.segments.length - 1];
                const x = Math.round(rx + (last.x + last.w) * segScale) + 0.5;
                ctx.beginPath();
                ctx.moveTo(x, ry);
                ctx.lineTo(x, ry + rh);
                ctx.stroke();
            }
        }

        // Draw recognized characters above ROI
        if (preview.charDetails && preview.segments && preview.anchorFound) {
            const segScale = rw / preview.roiW;
            const fontSize = Math.max(10, Math.min(14, Math.floor(rh * 0.6)));
            ctx.font = `bold ${fontSize}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';

            const len = Math.min(preview.charDetails.length, preview.segments.length);
            for (let i = 0; i < len; i++) {
                const seg = preview.segments[i];
                const detail = preview.charDetails[i];
                const cx = rx + (seg.x + seg.w / 2) * segScale;
                const cy = ry - 2;

                ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                ctx.fillText(detail.char, cx + 1, cy);
                ctx.fillStyle = '#00ff00';
                ctx.fillText(detail.char, cx, cy - 1);
            }
        }
    }
}

// ─── Screen preview (live frame + drag-to-select) ─────────────────────

const REGION_COLORS = { mass: '#4caf50', resistance: '#2196f3' };

function startScreenPreviewLoop() {
    const placeholder = document.getElementById('ocrScreenPlaceholder');
    if (placeholder) placeholder.style.display = 'none';
    if (screenPreviewRAF) return;
    function loop() {
        drawScreenPreview();
        screenPreviewRAF = requestAnimationFrame(loop);
    }
    screenPreviewRAF = requestAnimationFrame(loop);
}

function stopScreenPreviewLoop() {
    if (screenPreviewRAF) {
        cancelAnimationFrame(screenPreviewRAF);
        screenPreviewRAF = null;
    }
    screenPreviewFrozen = false;
    const placeholder = document.getElementById('ocrScreenPlaceholder');
    if (placeholder) placeholder.style.display = '';
}

function drawScreenPreview() {
    if (!screenPreviewCanvas || !screenPreviewCtx) return;
    const thumb = getThumbCanvas();
    const dims = getFrameDimensions();
    if (!thumb || !dims || !thumb.width || !thumb.height) return;

    const cw = screenPreviewCanvas.parentElement.clientWidth || 640;
    const aspect = dims.height / dims.width;
    const ch = Math.round(cw * aspect);

    if (screenPreviewCanvas.width !== cw || screenPreviewCanvas.height !== ch) {
        screenPreviewCanvas.width = cw;
        screenPreviewCanvas.height = ch;
    }

    const ctx = screenPreviewCtx;
    ctx.drawImage(thumb, 0, 0, cw, ch);

    const scaleX = cw / dims.width;
    const scaleY = ch / dims.height;

    // Draw existing search region rectangles
    const cfg = getConfig();
    for (const name of REGION_NAMES) {
        const sr = cfg.anchors?.[name]?.searchRegion;
        if (!sr || (sr.w === 0 && sr.h === 0)) continue;
        const color = REGION_COLORS[name] || '#fff';
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 3]);
        ctx.strokeRect(sr.x * scaleX, sr.y * scaleY, sr.w * scaleX, sr.h * scaleY);
        ctx.setLineDash([]);
        // Label
        ctx.font = 'bold 12px sans-serif';
        ctx.fillStyle = color;
        ctx.fillText(name, sr.x * scaleX + 4, sr.y * scaleY + 14);
    }

    // Draw in-progress drag rectangle
    if (dragging && dragTarget) {
        const rx = Math.min(dragStartX, dragCurX);
        const ry = Math.min(dragStartY, dragCurY);
        const rw = Math.abs(dragCurX - dragStartX);
        const rh = Math.abs(dragCurY - dragStartY);
        const color = REGION_COLORS[dragTarget] || '#ff0';
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 2]);
        ctx.strokeRect(rx, ry, rw, rh);
        ctx.setLineDash([]);
        ctx.fillStyle = color.replace(')', ', 0.15)').replace('rgb', 'rgba');
        ctx.fillRect(rx, ry, rw, rh);
    }
}

function wireScreenPreviewDrag() {
    if (!screenPreviewCanvas) return;

    screenPreviewCanvas.addEventListener('mousedown', (e) => {
        if (!dragTarget || !isPipelineRunning()) return;
        dragging = true;
        const rect = screenPreviewCanvas.getBoundingClientRect();
        dragStartX = e.clientX - rect.left;
        dragStartY = e.clientY - rect.top;
        dragCurX = dragStartX;
        dragCurY = dragStartY;
        e.preventDefault();
    });

    screenPreviewCanvas.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const rect = screenPreviewCanvas.getBoundingClientRect();
        dragCurX = Math.max(0, Math.min(e.clientX - rect.left, screenPreviewCanvas.width));
        dragCurY = Math.max(0, Math.min(e.clientY - rect.top, screenPreviewCanvas.height));
    });

    const finishDrag = (e) => {
        if (!dragging || !dragTarget) return;
        dragging = false;
        const dims = getFrameDimensions();
        if (!dims) return;

        const cw = screenPreviewCanvas.width;
        const ch = screenPreviewCanvas.height;
        const scaleX = dims.width / cw;
        const scaleY = dims.height / ch;

        const rx = Math.round(Math.min(dragStartX, dragCurX) * scaleX);
        const ry = Math.round(Math.min(dragStartY, dragCurY) * scaleY);
        const rw = Math.round(Math.abs(dragCurX - dragStartX) * scaleX);
        const rh = Math.round(Math.abs(dragCurY - dragStartY) * scaleY);

        if (rw < 10 || rh < 10) return; // too small, ignore

        setOverride(`anchors.${dragTarget}.searchRegion.x`, rx);
        setOverride(`anchors.${dragTarget}.searchRegion.y`, ry);
        setOverride(`anchors.${dragTarget}.searchRegion.w`, rw);
        setOverride(`anchors.${dragTarget}.searchRegion.h`, rh);

        // Update the number inputs in the region section
        const section = document.querySelector(`.ocr-region-section[data-region="${dragTarget}"]`);
        if (section) {
            const inputs = section.querySelectorAll('.ocr-sr-input');
            inputs.forEach(inp => {
                const field = inp.dataset.field;
                if (field === 'x') inp.value = rx;
                if (field === 'y') inp.value = ry;
                if (field === 'w') inp.value = rw;
                if (field === 'h') inp.value = rh;
            });
        }

        // Freeze the big preview after region selection to save resources
        freezeScreenPreview();
    };

    screenPreviewCanvas.addEventListener('mouseup', finishDrag);
    screenPreviewCanvas.addEventListener('mouseleave', finishDrag);
}

function freezeScreenPreview() {
    screenPreviewFrozen = true;
    if (screenPreviewRAF) {
        cancelAnimationFrame(screenPreviewRAF);
        screenPreviewRAF = null;
    }
    // Draw one last frame with overlays so the frozen image shows regions
    drawScreenPreview();
}

function unfreezeScreenPreview() {
    screenPreviewFrozen = false;
    if (isPipelineRunning() && !screenPreviewRAF) {
        startScreenPreviewLoop();
    }
}

function wireDragTargetButtons() {
    document.querySelectorAll('.ocr-drag-target-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.target || null;
            dragTarget = target || null;
            // Update active state
            document.querySelectorAll('.ocr-drag-target-btn').forEach(b => b.classList.remove('ocr-drag-active'));
            if (target) btn.classList.add('ocr-drag-active');
            // Unfreeze preview when user selects a new drag target
            if (target && screenPreviewFrozen) unfreezeScreenPreview();
        });
    });

    const freezeBtn = document.getElementById('ocrPreviewFreezeBtn');
    if (freezeBtn) {
        freezeBtn.addEventListener('click', () => {
            if (screenPreviewFrozen) {
                unfreezeScreenPreview();
            }
        });
    }
}

function wireShipButtons() {
    document.querySelectorAll('.ocr-ship-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const ship = btn.dataset.ship;
            if (ship === getActiveShip()) return;

            setActiveShip(ship);

            // Update button active states
            document.querySelectorAll('.ocr-ship-btn').forEach(b => b.classList.remove('ocr-ship-active'));
            btn.classList.add('ocr-ship-active');

            // Reload anchor templates if capture is running
            if (isPipelineRunning()) {
                await reloadAnchors();
            }

            // Re-render region panels so the inputs show ship-specific saved values
            const cfg = getConfig();
            document.querySelectorAll('.ocr-region-section').forEach(section => {
                const name = section.dataset.region;
                const roi = cfg.rois?.[name] || {};
                const anchor = cfg.anchors?.[name] || {};
                const sr = anchor.searchRegion || { x: 0, y: 0, w: 0, h: 0 };
                const filters = roi.filters || {};

                // Update search region inputs
                section.querySelectorAll('.ocr-sr-input').forEach(inp => {
                    const field = inp.dataset.field;
                    if (field in sr) inp.value = sr[field];
                });

                // Update anchor threshold
                section.querySelectorAll('.ocr-anchor-slider').forEach(slider => {
                    slider.value = Math.round((anchor.matchThreshold || 0.5) * 100);
                    if (slider.nextElementSibling) slider.nextElementSibling.textContent = (anchor.matchThreshold || 0.5).toFixed(2);
                });

                // Update ROI inputs
                section.querySelectorAll('.ocr-roi-input').forEach(inp => {
                    const field = inp.dataset.field;
                    if (field === 'xOffset') inp.value = roi.xOffset ?? 0;
                    else if (field === 'yOffset') inp.value = roi.yOffset ?? 0;
                    else if (field === 'width') inp.value = roi.width ?? 50;
                    else if (field === 'height') inp.value = roi.height ?? 24;
                    else if (field === 'charCount') inp.value = roi.charCount ?? 5;
                });

                // Update filter sliders
                section.querySelectorAll('.ocr-filter-slider').forEach(slider => {
                    const field = slider.dataset.field;
                    const val = filters[field] ?? 0;
                    slider.value = val;
                    if (slider.nextElementSibling) slider.nextElementSibling.textContent = val;
                });
            });
        });
    });
}
