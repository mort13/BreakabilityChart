/**
 * OCR recognition pipeline.
 * Captures screen, finds anchors in defined search regions, extracts ROIs,
 * preprocesses (brightness/contrast/greyscale) and feeds into CNN for digit recognition.
 * Supports preview mode (debug images for UI) and headless mode (values only).
 */

import { loadTemplate, findAnchor } from './ocr-anchor.js';
import { applyFilters, toGrayscale } from './ocr-filters.js';
import { segment } from './ocr-segmenter.js';
import { loadModel, predictSequenceWithDetails, isModelLoaded } from './ocr-cnn.js';
import { getConfig, getAnchor } from './ocr-config-manager.js';

let mediaStream = null;
let videoEl = null;
let captureCanvas = null;
let captureCtx = null;
let intervalId = null;
let running = false;
let processing = false;
let previewEnabled = true;

/** Thumbnail canvas for full-frame preview (downscaled). */
let thumbCanvas = null;
let thumbCtx = null;
const THUMB_MAX_W = 640;

const anchorTemplates = {};
let onResultCallback = null;
let onStopCallback = null;

/**
 * Initialize: load ONNX model and anchor templates.
 * @param {Function} onResult - callback receiving results each frame
 */
export async function init(onResult, onStop) {
    onResultCallback = onResult;
    onStopCallback = onStop || null;
    const cfg = getConfig();

    const modelOk = await loadModel(cfg.modelPath);
    if (!modelOk) console.warn('OCR pipeline: model not loaded');

    for (const [name, anchorCfg] of Object.entries(cfg.anchors || {})) {
        const tmpl = await loadTemplate(anchorCfg.templatePath);
        if (tmpl) {
            anchorTemplates[name] = tmpl;
            console.log(`Anchor "${name}" loaded (${tmpl.width}x${tmpl.height})`);
        } else {
            console.warn(`Failed to load anchor: ${anchorCfg.templatePath}`);
        }
    }

    return modelOk;
}

/**
 * Reload anchor templates from the current config (e.g. after a ship switch).
 * Safe to call while capture is running.
 * @returns {Promise<void>}
 */
export async function reloadAnchors() {
    const cfg = getConfig();
    for (const [name, anchorCfg] of Object.entries(cfg.anchors || {})) {
        const tmpl = await loadTemplate(anchorCfg.templatePath);
        if (tmpl) {
            anchorTemplates[name] = tmpl;
            console.log(`Anchor "${name}" reloaded (${tmpl.width}x${tmpl.height})`);
        } else {
            console.warn(`Failed to reload anchor: ${anchorCfg.templatePath}`);
        }
    }
}

/**
 * Start screen capture and begin processing loop.
 */
export async function start() {
    if (running) return true;

    try {
        mediaStream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: 'never' },
            audio: false,
        });
    } catch (e) {
        console.error('Screen capture denied:', e);
        return false;
    }

    videoEl = document.createElement('video');
    videoEl.srcObject = mediaStream;
    videoEl.muted = true;
    await videoEl.play();

    captureCanvas = document.createElement('canvas');
    captureCtx = captureCanvas.getContext('2d', { willReadFrequently: true });

    thumbCanvas = document.createElement('canvas');
    thumbCtx = thumbCanvas.getContext('2d');

    running = true;
    mediaStream.getVideoTracks()[0].addEventListener('ended', () => stop());

    startLoop();
    return true;
}

function startLoop() {
    if (intervalId) clearInterval(intervalId);
    const cfg = getConfig();
    const fps = cfg.captureSettings?.fps || 10;
    intervalId = setInterval(tick, 1000 / fps);
    console.log(`OCR loop at ${fps} Hz`);
}

/** Call after changing fps setting to restart the interval. */
export function updateFps() {
    if (running) startLoop();
}

/** Stop capture and clean up. */
export function stop() {
    const wasRunning = running;
    running = false;
    if (intervalId) { clearInterval(intervalId); intervalId = null; }
    if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
    if (videoEl) { videoEl.srcObject = null; videoEl = null; }
    console.log('OCR pipeline stopped');
    if (wasRunning && onStopCallback) onStopCallback();
}

export function isRunning() { return running; }

/**
 * Return the current video frame dimensions (full capture resolution).
 * @returns {{width: number, height: number} | null}
 */
export function getFrameDimensions() {
    if (!videoEl || videoEl.readyState < 2) return null;
    return { width: videoEl.videoWidth, height: videoEl.videoHeight };
}

/**
 * Return the thumbnail canvas for the current capture frame.
 * The canvas is re-used each frame and scaled to max THUMB_MAX_W wide.
 * @returns {HTMLCanvasElement | null}
 */
export function getThumbCanvas() {
    return thumbCanvas;
}

/** Enable/disable preview data generation (disable when OCR tab not visible). */
export function setPreviewEnabled(enabled) { previewEnabled = enabled; }

function tick() {
    if (processing) return;
    processing = true;
    processFrame().finally(() => { processing = false; });
}

async function processFrame() {
    if (!videoEl || videoEl.readyState < 2) return;

    const vw = videoEl.videoWidth;
    const vh = videoEl.videoHeight;
    if (!vw || !vh) return;

    captureCanvas.width = vw;
    captureCanvas.height = vh;
    captureCtx.drawImage(videoEl, 0, 0, vw, vh);

    // Generate a downscaled thumbnail for the live screen preview
    if (previewEnabled && thumbCanvas && thumbCtx) {
        const scale = Math.min(1, THUMB_MAX_W / vw);
        const tw = Math.round(vw * scale);
        const th = Math.round(vh * scale);
        if (thumbCanvas.width !== tw || thumbCanvas.height !== th) {
            thumbCanvas.width = tw;
            thumbCanvas.height = th;
        }
        thumbCtx.drawImage(captureCanvas, 0, 0, tw, th);
    }

    const cfg = getConfig();
    const results = {};
    const previews = {};

    for (const [roiName, roiCfg] of Object.entries(cfg.rois || {})) {
        const anchorName = roiCfg.anchorName || roiName;
        const anchorCfg = getAnchor(anchorName);
        const tmpl = anchorTemplates[anchorName];

        if (!tmpl || !anchorCfg) {
            previews[roiName] = { error: `Anchor "${anchorName}" not loaded` };
            continue;
        }

        // Determine search region (0/0/0/0 means full frame)
        const sr = anchorCfg.searchRegion || null;
        let searchImageData, offX = 0, offY = 0;

        if (sr && sr.w > 0 && sr.h > 0) {
            const sx = Math.max(0, Math.min(sr.x, vw - 1));
            const sy = Math.max(0, Math.min(sr.y, vh - 1));
            const sw = Math.min(sr.w, vw - sx);
            const sh = Math.min(sr.h, vh - sy);
            if (sw < tmpl.width || sh < tmpl.height) {
                previews[roiName] = { error: 'Search region too small for anchor' };
                continue;
            }
            searchImageData = captureCtx.getImageData(sx, sy, sw, sh);
            offX = sx;
            offY = sy;
        } else {
            searchImageData = captureCtx.getImageData(0, 0, vw, vh);
        }

        const searchGray = toGrayscale(searchImageData);

        const match = findAnchor(
            searchGray, searchImageData.width, searchImageData.height,
            tmpl.gray, tmpl.width, tmpl.height,
            anchorCfg.matchThreshold
        );

        const absAnchorX = match.x + offX;
        const absAnchorY = match.y + offY;

        const preview = {
            anchorFound: match.found,
            anchorConfidence: match.confidence,
            anchorX: absAnchorX,
            anchorY: absAnchorY,
        };

        // Attach search region image for the small preview (always, even if anchor not found)
        if (previewEnabled) {
            preview.searchImageData = searchImageData;
            preview.searchW = searchImageData.width;
            preview.searchH = searchImageData.height;
            // Anchor position relative to search region
            preview.anchorRelX = match.x;
            preview.anchorRelY = match.y;
            preview.anchorW = tmpl.width;
            preview.anchorH = tmpl.height;
        }

        if (!match.found) {
            // Still include ROI offset info so the UI can show projected ROI position
            if (previewEnabled) {
                preview.roiRelX = match.x + (roiCfg.xOffset || 0);
                preview.roiRelY = match.y + (roiCfg.yOffset || 0);
                preview.roiW = roiCfg.width || 50;
                preview.roiH = roiCfg.height || 24;
            }
            previews[roiName] = preview;
            continue;
        }

        // Compute ROI absolute position from anchor
        const rx = Math.max(0, absAnchorX + (roiCfg.xOffset || 0));
        const ry = Math.max(0, absAnchorY + (roiCfg.yOffset || 0));
        const rw = Math.min(roiCfg.width || 50, vw - rx);
        const rh = Math.min(roiCfg.height || 24, vh - ry);
        if (rw <= 0 || rh <= 0) { previews[roiName] = preview; continue; }

        // Extract ROI pixels from full canvas
        const roiImageData = captureCtx.getImageData(rx, ry, rw, rh);

        // Preprocess: brightness, contrast, force greyscale
        const filters = roiCfg.filters || {};
        const filtered = applyFilters(roiImageData, {
            brightness: filters.brightness || 0,
            contrast: filters.contrast || 0,
            grayscale: true,
            thresholdEnabled: false,
            invert: false,
            channel: 'none',
        });

        const grayROI = toGrayscale(filtered);

        // Segment using fixed width
        const charCount = roiCfg.charCount || 5;
        const chars = segment(grayROI, rw, rh, {
            segMode: 'fixed_width',
            charCount: charCount,
        });

        // CNN prediction
        let text = '';
        let charDetails = [];
        if (isModelLoaded() && chars.length > 0) {
            const pred = await predictSequenceWithDetails(chars);
            text = pred.text;
            charDetails = pred.details;
        }

        results[roiName] = text;
        preview.text = text;

        // Attach preview data only when OCR tab is visible
        if (previewEnabled) {
            preview.roiImageData = filtered;
            preview.roiRelX = match.x + (roiCfg.xOffset || 0);
            preview.roiRelY = match.y + (roiCfg.yOffset || 0);
            preview.roiW = rw;
            preview.roiH = rh;
            preview.segments = getSegmentBoundaries(rw, charCount);
            preview.charDetails = charDetails;
        }

        previews[roiName] = preview;
    }

    if (onResultCallback) {
        onResultCallback({ ...results, _previews: previews });
    }
}

/** Compute fixed-width segment boundary positions. */
function getSegmentBoundaries(roiW, charCount) {
    if (charCount <= 0) return [];
    const cw = roiW / charCount;
    const boundaries = [];
    for (let i = 0; i < charCount; i++) {
        boundaries.push({
            x: Math.floor(i * cw),
            w: Math.floor((i + 1) * cw) - Math.floor(i * cw),
        });
    }
    return boundaries;
}
