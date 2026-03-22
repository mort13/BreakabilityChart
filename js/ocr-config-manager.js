/**
 * OCR configuration manager.
 * Loads defaults from ocr-data/ocr-config.json and merges with user overrides stored in localStorage.
 * Provides getters/setters and persistence.
 */

const STORAGE_KEY = 'ocrConfig';

let defaults = null;
let userOverrides = {};
let merged = null;

/**
 * Load the default config from the JSON file and merge with localStorage overrides.
 * @param {string} [configPath='ocr-data/ocr-config.json']
 * @returns {Promise<Object>} The merged config
 */
export async function loadConfig(configPath = 'ocr-data/ocr-config.json') {
    try {
        const resp = await fetch(configPath);
        defaults = await resp.json();
    } catch (e) {
        console.warn('Failed to load OCR config, using built-in defaults:', e);
        defaults = builtInDefaults();
    }

    // Load user overrides from localStorage
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            userOverrides = JSON.parse(stored);
        }
    } catch (e) {
        console.warn('Failed to parse stored OCR config:', e);
        userOverrides = {};
    }

    merged = deepMerge(defaults, userOverrides);
    return merged;
}

/**
 * Get the current merged config.
 * @returns {Object}
 */
export function getConfig() {
    return merged || builtInDefaults();
}

/**
 * Get a specific ROI config by name (e.g. "mass", "resistance").
 * @param {string} name
 * @returns {Object|null}
 */
export function getROI(name) {
    const cfg = getConfig();
    return cfg.rois ? cfg.rois[name] || null : null;
}

/**
 * Get a specific anchor config by name.
 * @param {string} name
 * @returns {Object|null}
 */
export function getAnchor(name) {
    const cfg = getConfig();
    return cfg.anchors ? cfg.anchors[name] || null : null;
}

/**
 * Update a user override and persist to localStorage.
 * Uses dot-notation path, e.g. "rois.mass.xOffset" = 130.
 * @param {string} path
 * @param {*} value
 */
export function setOverride(path, value) {
    setNestedValue(userOverrides, path, value);
    merged = deepMerge(defaults || builtInDefaults(), userOverrides);
    saveToStorage();
}

/**
 * Update an entire ROI definition.
 * @param {string} name - ROI name (e.g. "mass")
 * @param {Object} roiDef - Full ROI definition object
 */
export function setROIOverride(name, roiDef) {
    if (!userOverrides.rois) userOverrides.rois = {};
    userOverrides.rois[name] = roiDef;
    merged = deepMerge(defaults || builtInDefaults(), userOverrides);
    saveToStorage();
}

/**
 * Update an entire anchor definition.
 * @param {string} name
 * @param {Object} anchorDef
 */
export function setAnchorOverride(name, anchorDef) {
    if (!userOverrides.anchors) userOverrides.anchors = {};
    userOverrides.anchors[name] = anchorDef;
    merged = deepMerge(defaults || builtInDefaults(), userOverrides);
    saveToStorage();
}

/**
 * Reset all user overrides back to defaults.
 */
export function resetToDefaults() {
    userOverrides = {};
    merged = deepMerge(defaults || builtInDefaults(), {});
    localStorage.removeItem(STORAGE_KEY);
}

/**
 * Get the raw user overrides (for debugging or export).
 * @returns {Object}
 */
export function getUserOverrides() {
    return { ...userOverrides };
}

// ── Internal helpers ──

function saveToStorage() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(userOverrides));
    } catch (e) {
        console.warn('Failed to save OCR config to localStorage:', e);
    }
}

function builtInDefaults() {
    return {
        version: 1,
        modelPath: 'ocr-data/models/digit_cnn.onnx',
        charClasses: '0123456789.-%',
        captureSettings: { fps: 2 },
        anchors: {
            mass: { templatePath: 'ocr-data/anchors/mass.jpg', matchThreshold: 0.51, searchROI: null },
            resistance: { templatePath: 'ocr-data/anchors/resistance.jpg', matchThreshold: 0.6, searchROI: null },
        },
        rois: {
            mass: {
                anchorName: 'mass', xOffset: 128, yOffset: 0, width: 46, height: 24,
                filters: { brightness: 15, contrast: 0, threshold: 115, thresholdEnabled: false, grayscale: true, invert: false, channel: 'none' },
                segMode: 'fixed_width', charWidth: 0, charCount: 5,
            },
            resistance: {
                anchorName: 'resistance', xOffset: 80, yOffset: 0, width: 50, height: 24,
                filters: { brightness: 0, contrast: 0, threshold: 127, thresholdEnabled: false, grayscale: true, invert: false, channel: 'none' },
                segMode: 'fixed_width', charWidth: 0, charCount: 4,
            },
        },
    };
}

function deepMerge(base, overrides) {
    if (!overrides || typeof overrides !== 'object') return base;
    const result = Array.isArray(base) ? [...base] : { ...base };
    for (const key of Object.keys(overrides)) {
        if (overrides[key] !== null && typeof overrides[key] === 'object' && !Array.isArray(overrides[key])
            && base[key] && typeof base[key] === 'object' && !Array.isArray(base[key])) {
            result[key] = deepMerge(base[key], overrides[key]);
        } else {
            result[key] = overrides[key];
        }
    }
    return result;
}

function setNestedValue(obj, path, value) {
    const keys = path.split('.');
    let cur = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        if (!cur[keys[i]] || typeof cur[keys[i]] !== 'object') {
            cur[keys[i]] = {};
        }
        cur = cur[keys[i]];
    }
    cur[keys[keys.length - 1]] = value;
}
