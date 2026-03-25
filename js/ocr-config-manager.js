/**
 * OCR configuration manager.
 * Loads defaults from ocr-data/ocr-config.json and merges with per-ship user overrides
 * stored in localStorage. Each ship (prospector, mole, golem) has its own override bucket
 * so settings like searchRegion and ROI offsets are saved independently per ship.
 */

const STORAGE_KEY_SHIP = 'ocrActiveShip';
const SHIP_STORAGE_PREFIX = 'ocrConfig_';
const KNOWN_SHIPS = ['prospector', 'mole', 'golem'];

let fileDefaults = null;   // parsed ocr-config.json
let activeShip = 'prospector';
let shipOverrides = {};    // user overrides for the currently active ship
let merged = null;         // final merged config (fileDefaults + ship anchor paths + shipOverrides)

// ── Public API ────────────────────────────────────────────────────────

/**
 * Load the default config from JSON, restore the last active ship, and build merged config.
 * @param {string} [configPath='ocr-data/ocr-config.json']
 * @returns {Promise<Object>} The merged config
 */
export async function loadConfig(configPath = 'ocr-data/ocr-config.json') {
    try {
        const resp = await fetch(configPath);
        fileDefaults = await resp.json();
    } catch (e) {
        console.warn('Failed to load OCR config, using built-in defaults:', e);
        fileDefaults = builtInDefaults();
    }

    // Restore last active ship
    try {
        const stored = localStorage.getItem(STORAGE_KEY_SHIP);
        if (stored && KNOWN_SHIPS.includes(stored)) activeShip = stored;
    } catch (_) {}

    _loadShipOverrides();
    _rebuild();
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
 * Get the active ship name.
 * @returns {string}
 */
export function getActiveShip() {
    return activeShip;
}

/**
 * Get list of known ship names.
 * @returns {string[]}
 */
export function getShips() {
    return KNOWN_SHIPS;
}

/**
 * Switch to a different ship. Saves nothing extra — each ship's overrides
 * are already persisted independently in localStorage.
 * @param {string} ship
 */
export function setActiveShip(ship) {
    if (!KNOWN_SHIPS.includes(ship)) return;
    activeShip = ship;
    try { localStorage.setItem(STORAGE_KEY_SHIP, ship); } catch (_) {}
    _loadShipOverrides();
    _rebuild();
}

/**
 * Get a specific ROI config by name.
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
 * Update a user override for the active ship and persist to localStorage.
 * Uses dot-notation path, e.g. "rois.mass.xOffset" = 130.
 * @param {string} path
 * @param {*} value
 */
export function setOverride(path, value) {
    setNestedValue(shipOverrides, path, value);
    _rebuild();
    _saveShipOverrides();
}

/**
 * Update an entire ROI definition for the active ship.
 * @param {string} name
 * @param {Object} roiDef
 */
export function setROIOverride(name, roiDef) {
    if (!shipOverrides.rois) shipOverrides.rois = {};
    shipOverrides.rois[name] = roiDef;
    _rebuild();
    _saveShipOverrides();
}

/**
 * Update an entire anchor definition for the active ship.
 * @param {string} name
 * @param {Object} anchorDef
 */
export function setAnchorOverride(name, anchorDef) {
    if (!shipOverrides.anchors) shipOverrides.anchors = {};
    shipOverrides.anchors[name] = anchorDef;
    _rebuild();
    _saveShipOverrides();
}

/**
 * Reset user overrides for the active ship back to defaults.
 */
export function resetToDefaults() {
    shipOverrides = {};
    _rebuild();
    try { localStorage.removeItem(SHIP_STORAGE_PREFIX + activeShip); } catch (_) {}
}

/**
 * Get the raw user overrides for the active ship (for debugging/export).
 * @returns {Object}
 */
export function getUserOverrides() {
    return { ...shipOverrides };
}

// ── Internal helpers ──────────────────────────────────────────────────

/** Load per-ship overrides from localStorage into shipOverrides. */
function _loadShipOverrides() {
    try {
        const stored = localStorage.getItem(SHIP_STORAGE_PREFIX + activeShip);
        shipOverrides = stored ? JSON.parse(stored) : {};
    } catch (e) {
        console.warn(`Failed to parse stored config for ship "${activeShip}":`, e);
        shipOverrides = {};
    }
}

/** Persist current ship overrides to localStorage. */
function _saveShipOverrides() {
    try {
        localStorage.setItem(SHIP_STORAGE_PREFIX + activeShip, JSON.stringify(shipOverrides));
    } catch (e) {
        console.warn('Failed to save OCR config to localStorage:', e);
    }
}

/**
 * Rebuild `merged` from: fileDefaults → ship anchor paths → shipOverrides.
 * The ship's anchor template paths and default thresholds override the base anchors,
 * and then user overrides (searchRegion, ROI offsets, etc.) are applied on top.
 */
function _rebuild() {
    const base = fileDefaults || builtInDefaults();

    // Apply ship-specific anchor overrides (templatePath, matchThreshold) from the ships block
    const shipDef = base.ships?.[activeShip] || {};
    let withShip = deepMerge(base, shipDef);

    // Apply user overrides for this ship
    merged = deepMerge(withShip, shipOverrides);
}

function builtInDefaults() {
    return {
        version: 2,
        modelPath: 'ocr-data/models/model_cnn.onnx',
        charClasses: '0123456789.-%',
        captureSettings: { fps: 10 },
        ships: {
            prospector: {
                anchors: {
                    mass:       { templatePath: 'ocr-data/anchors/prospector/mass.jpg',       matchThreshold: 0.51 },
                    resistance: { templatePath: 'ocr-data/anchors/prospector/resistance.jpg', matchThreshold: 0.60 },
                },
            },
            mole: {
                anchors: {
                    mass:       { templatePath: 'ocr-data/anchors/mole/mass.jpg',       matchThreshold: 0.51 },
                    resistance: { templatePath: 'ocr-data/anchors/mole/percentage.jpg', matchThreshold: 0.60 },
                },
            },
            golem: {
                anchors: {
                    mass:       { templatePath: 'ocr-data/anchors/golem/mass.jpg',       matchThreshold: 0.51 },
                    resistance: { templatePath: 'ocr-data/anchors/golem/resistance.jpg', matchThreshold: 0.60 },
                },
            },
        },
        anchors: {
            mass:       { templatePath: 'ocr-data/anchors/prospector/mass.jpg',       matchThreshold: 0.51, searchRegion: { x: 0, y: 0, w: 0, h: 0 } },
            resistance: { templatePath: 'ocr-data/anchors/prospector/resistance.jpg', matchThreshold: 0.60, searchRegion: { x: 0, y: 0, w: 0, h: 0 } },
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

// ── End of module ─────────────────────────────────────────────────────
