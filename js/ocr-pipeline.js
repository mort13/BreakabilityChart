/**
 * OCR recognition pipeline.
 * Orchestrates: screen capture -> anchor matching -> ROI extraction -> filtering -> segmentation -> CNN prediction.
 * Emits results via a callback so the UI can display them.
 */

import { loadTemplate, findAnchor } from './ocr-anchor.js';
import { applyFilters, toGrayscale } from './ocr-filters.js';
import { segment } from './ocr-segmenter.js';
import { loadModel, predictSequence, isModelLoaded } from './ocr-cnn.js';
import { getConfig, getROI, getAnchor } from './ocr-config-manager.js';

let mediaStream = null;
let videoEl = null;
let captureCanvas = null;
let captureCtx = null;
let intervalId = null;
let running = false;

// Loaded anchor templates: { [name]: { gray, width, height } }
const anchorTemplates = {};

// Callback: (results: { mass?: string, resistance?: string, debug?: Object }) => void
let onResultCallback = null;

/**
 * Initialize the pipeline: load model and anchor templates from config.
 * @param {Function} onResult - Callback receiving recognized values each frame
 * @returns {Promise<boolean>}
 */
export async function init(onResult) {
    onResultCallback = onResult;
    const cfg = getConfig();

    // Load ONNX model
    const modelOk = await loadModel(cfg.modelPath);
    if (!modelOk) {
        console.warn('OCR pipeline: model not loaded — inference will be skipped');
    }

    // Load anchor templates
    for (const [name, anchorCfg] of Object.entries(cfg.anchors || {})) {
        const tmpl = await loadTemplate(anchorCfg.templatePath);
        if (tmpl) {
            anchorTemplates[name] = tmpl;
            console.log(`Anchor "${name}" loaded (${tmpl.width}x${tmpl.height})`);
        } else {
            console.warn(`Failed to load anchor template: ${anchorCfg.templatePath}`);
        }
    }

    return modelOk;
}

/**
 * Start screen capture and OCR processing.
 * @returns {Promise<boolean>}
 */
export async function start() {
    if (running) return true;

    try {
        mediaStream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: 'never' },
            audio: false,
        });
    } catch (e) {
        console.error('Screen capture denied or failed:', e);
        return false;
    }

    // Create hidden video element to receive the stream
    videoEl = document.createElement('video');
    videoEl.srcObject = mediaStream;
    videoEl.muted = true;
    await videoEl.play();

    captureCanvas = document.createElement('canvas');
    captureCtx = captureCanvas.getContext('2d', { willReadFrequently: true });

    const cfg = getConfig();
    const fps = cfg.captureSettings?.fps || 2;
    running = true;

    // Handle stream ending (user clicks "Stop sharing" in the browser prompt)
    mediaStream.getVideoTracks()[0].addEventListener('ended', () => {
        stop();
    });

    intervalId = setInterval(() => processFrame(), 1000 / fps);
    console.log(`OCR pipeline started at ${fps} FPS`);
    return true;
}

/**
 * Stop capture and clean up.
 */
export function stop() {
    running = false;
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
    if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop());
        mediaStream = null;
    }
    if (videoEl) {
        videoEl.srcObject = null;
        videoEl = null;
    }
    console.log('OCR pipeline stopped');
}

/**
 * @returns {boolean}
 */
export function isRunning() {
    return running;
}

/**
 * Process a single frame: anchor match, ROI extract, filter, segment, predict.
 */
async function processFrame() {
    if (!videoEl || videoEl.readyState < 2) return;

    // Capture current video frame to canvas
    const vw = videoEl.videoWidth;
    const vh = videoEl.videoHeight;
    if (vw === 0 || vh === 0) return;

    captureCanvas.width = vw;
    captureCanvas.height = vh;
    captureCtx.drawImage(videoEl, 0, 0, vw, vh);

    const frameImageData = captureCtx.getImageData(0, 0, vw, vh);
    const frameGray = toGrayscale(frameImageData);

    const cfg = getConfig();
    const results = {};
    const debug = {};

    // Process each ROI
    for (const [roiName, roiCfg] of Object.entries(cfg.rois || {})) {
        const anchorName = roiCfg.anchorName || roiName;
        const anchorCfg = getAnchor(anchorName);
        const tmpl = anchorTemplates[anchorName];

        if (!tmpl || !anchorCfg) {
            debug[roiName] = { error: `anchor "${anchorName}" not available` };
            continue;
        }

        // Find anchor in frame
        const anchorResult = findAnchor(
            frameGray, vw, vh,
            tmpl.gray, tmpl.width, tmpl.height,
            anchorCfg.matchThreshold,
            anchorCfg.searchROI,
        );

        debug[roiName] = { anchor: anchorResult };

        if (!anchorResult.found) continue;

        // Compute ROI absolute position
        const roiX = Math.max(0, anchorResult.x + roiCfg.xOffset);
        const roiY = Math.max(0, anchorResult.y + roiCfg.yOffset);
        const roiX2 = Math.min(vw, roiX + roiCfg.width);
        const roiY2 = Math.min(vh, roiY + roiCfg.height);
        const roiW = roiX2 - roiX;
        const roiH = roiY2 - roiY;

        if (roiW <= 0 || roiH <= 0) continue;

        // Extract ROI from full frame ImageData
        const roiImageData = captureCtx.getImageData(roiX, roiY, roiW, roiH);

        // Apply filters
        const filtered = applyFilters(roiImageData, roiCfg.filters || {});

        // Convert to grayscale for segmentation
        const filteredGray = toGrayscale(filtered);

        // Segment characters
        const chars = segment(filteredGray, roiW, roiH, {
            segMode: roiCfg.segMode,
            charWidth: roiCfg.charWidth,
            charCount: roiCfg.charCount,
        });

        debug[roiName].charCount = chars.length;

        // Predict if model is loaded
        if (isModelLoaded() && chars.length > 0) {
            const text = await predictSequence(chars);
            results[roiName] = text;
            debug[roiName].text = text;
        }
    }

    if (onResultCallback) {
        onResultCallback({ ...results, _debug: debug });
    }
}

/**
 * Run a single-frame OCR pass (for testing/calibration without continuous capture).
 * Requires an active mediaStream.
 * @returns {Promise<Object>}
 */
export async function singleFrame() {
    if (!videoEl || videoEl.readyState < 2) return {};
    return new Promise((resolve) => {
        const origCb = onResultCallback;
        onResultCallback = (result) => {
            onResultCallback = origCb;
            resolve(result);
        };
        processFrame();
    });
}
