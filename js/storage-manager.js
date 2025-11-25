// LocalStorage management for persisting user data

const STORAGE_KEYS = {
    LASER_SETUP: 'breakabilityChart_laserSetup',
    DISPLAY_ATTRIBUTES: 'breakabilityChart_displayAttributes',
    MODULE_DISPLAY_ATTRIBUTES: 'breakabilityChart_moduleDisplayAttributes',
    ACTIVE_SIZES: 'breakabilityChart_activeSizes',
    ACTIVE_MODULE_TYPES: 'breakabilityChart_activeModuleTypes',
    ACTIVE_TIERS: 'breakabilityChart_activeTiers',
    SELECTED_GADGET: 'breakabilityChart_selectedGadget',
    OPERATOR_SEAT_MODE: 'breakabilityChart_operatorSeatMode'
};

/**
 * Generic save function for localStorage
 * @param {string} key - Storage key
 * @param {*} data - Data to save
 * @param {Function} transform - Optional transform function before saving
 */
function saveToStorage(key, data, transform = null) {
    try {
        const toSave = transform ? transform(data) : data;
        localStorage.setItem(key, JSON.stringify(toSave));
    } catch (e) {
        console.warn(`Failed to save ${key}:`, e);
    }
}

/**
 * Generic load function from localStorage
 * @param {string} key - Storage key
 * @param {Function} transform - Optional transform function after loading
 * @returns {*} - Loaded data or null
 */
function loadFromStorage(key, transform = null) {
    try {
        const data = localStorage.getItem(key);
        if (!data) return null;
        const parsed = JSON.parse(data);
        return transform ? transform(parsed) : parsed;
    } catch (e) {
        console.warn(`Failed to load ${key}:`, e);
        return null;
    }
}

// Transform functions for Set conversions
const setToArray = (set) => Array.from(set);
const arrayToSet = (arr) => new Set(arr);

/**
 * Save laser setup to localStorage
 */
export function saveLaserSetup(selectedLaserheads) {
    saveToStorage(STORAGE_KEYS.LASER_SETUP, selectedLaserheads);
}

/**
 * Load laser setup from localStorage
 */
export function loadLaserSetup() {
    return loadFromStorage(STORAGE_KEYS.LASER_SETUP);
}

/**
 * Save display attributes
 */
export function saveDisplayAttributes(attributes) {
    saveToStorage(STORAGE_KEYS.DISPLAY_ATTRIBUTES, attributes);
}

/**
 * Load display attributes
 */
export function loadDisplayAttributes() {
    return loadFromStorage(STORAGE_KEYS.DISPLAY_ATTRIBUTES);
}

/**
 * Save module display attributes
 */
export function saveModuleDisplayAttributes(attributes) {
    saveToStorage(STORAGE_KEYS.MODULE_DISPLAY_ATTRIBUTES, attributes, setToArray);
}

/**
 * Load module display attributes
 */
export function loadModuleDisplayAttributes() {
    return loadFromStorage(STORAGE_KEYS.MODULE_DISPLAY_ATTRIBUTES, arrayToSet);
}

/**
 * Save active sizes filter
 */
export function saveActiveSizes(sizes) {
    saveToStorage(STORAGE_KEYS.ACTIVE_SIZES, sizes, setToArray);
}

/**
 * Load active sizes filter
 */
export function loadActiveSizes() {
    return loadFromStorage(STORAGE_KEYS.ACTIVE_SIZES, arrayToSet);
}

/**
 * Save active module types filter
 */
export function saveActiveModuleTypes(types) {
    saveToStorage(STORAGE_KEYS.ACTIVE_MODULE_TYPES, types, setToArray);
}

/**
 * Load active module types filter
 */
export function loadActiveModuleTypes() {
    return loadFromStorage(STORAGE_KEYS.ACTIVE_MODULE_TYPES, arrayToSet);
}

/**
 * Save active tiers filter
 */
export function saveActiveTiers(tiers) {
    saveToStorage(STORAGE_KEYS.ACTIVE_TIERS, tiers, setToArray);
}

/**
 * Load active tiers filter
 */
export function loadActiveTiers() {
    return loadFromStorage(STORAGE_KEYS.ACTIVE_TIERS, arrayToSet);
}

/**
 * Save selected gadget
 */
export function saveSelectedGadget(gadget) {
    const gadgetId = gadget ? gadget.id : null;
    saveToStorage(STORAGE_KEYS.SELECTED_GADGET, gadgetId);
}

/**
 * Load selected gadget ID
 */
export function loadSelectedGadgetId() {
    return loadFromStorage(STORAGE_KEYS.SELECTED_GADGET);
}

/**
 * Save operator seat mode
 */
export function saveOperatorSeatMode(mode) {
    saveToStorage(STORAGE_KEYS.OPERATOR_SEAT_MODE, mode);
}

/**
 * Load operator seat mode
 */
export function loadOperatorSeatMode() {
    return loadFromStorage(STORAGE_KEYS.OPERATOR_SEAT_MODE);
}

/**
 * Clear all saved data
 */
export function clearAllData() {
    try {
        Object.values(STORAGE_KEYS).forEach(key => {
            localStorage.removeItem(key);
        });
        console.log('All saved data cleared');
    } catch (e) {
        console.warn('Failed to clear data:', e);
    }
}
