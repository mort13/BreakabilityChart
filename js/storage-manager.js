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
 * Save laser setup to localStorage
 */
export function saveLaserSetup(selectedLaserheads) {
    try {
        const data = JSON.stringify(selectedLaserheads);
        localStorage.setItem(STORAGE_KEYS.LASER_SETUP, data);
    } catch (e) {
        console.warn('Failed to save laser setup:', e);
    }
}

/**
 * Load laser setup from localStorage
 */
export function loadLaserSetup() {
    try {
        const data = localStorage.getItem(STORAGE_KEYS.LASER_SETUP);
        return data ? JSON.parse(data) : null;
    } catch (e) {
        console.warn('Failed to load laser setup:', e);
        return null;
    }
}

/**
 * Save display attributes
 */
export function saveDisplayAttributes(attributes) {
    try {
        localStorage.setItem(STORAGE_KEYS.DISPLAY_ATTRIBUTES, JSON.stringify(attributes));
    } catch (e) {
        console.warn('Failed to save display attributes:', e);
    }
}

/**
 * Load display attributes
 */
export function loadDisplayAttributes() {
    try {
        const data = localStorage.getItem(STORAGE_KEYS.DISPLAY_ATTRIBUTES);
        return data ? JSON.parse(data) : null;
    } catch (e) {
        console.warn('Failed to load display attributes:', e);
        return null;
    }
}

/**
 * Save module display attributes
 */
export function saveModuleDisplayAttributes(attributes) {
    try {
        localStorage.setItem(STORAGE_KEYS.MODULE_DISPLAY_ATTRIBUTES, JSON.stringify(Array.from(attributes)));
    } catch (e) {
        console.warn('Failed to save module display attributes:', e);
    }
}

/**
 * Load module display attributes
 */
export function loadModuleDisplayAttributes() {
    try {
        const data = localStorage.getItem(STORAGE_KEYS.MODULE_DISPLAY_ATTRIBUTES);
        return data ? new Set(JSON.parse(data)) : null;
    } catch (e) {
        console.warn('Failed to load module display attributes:', e);
        return null;
    }
}

/**
 * Save active sizes filter
 */
export function saveActiveSizes(sizes) {
    try {
        localStorage.setItem(STORAGE_KEYS.ACTIVE_SIZES, JSON.stringify(Array.from(sizes)));
    } catch (e) {
        console.warn('Failed to save active sizes:', e);
    }
}

/**
 * Load active sizes filter
 */
export function loadActiveSizes() {
    try {
        const data = localStorage.getItem(STORAGE_KEYS.ACTIVE_SIZES);
        return data ? new Set(JSON.parse(data)) : null;
    } catch (e) {
        console.warn('Failed to load active sizes:', e);
        return null;
    }
}

/**
 * Save active module types filter
 */
export function saveActiveModuleTypes(types) {
    try {
        localStorage.setItem(STORAGE_KEYS.ACTIVE_MODULE_TYPES, JSON.stringify(Array.from(types)));
    } catch (e) {
        console.warn('Failed to save active module types:', e);
    }
}

/**
 * Load active module types filter
 */
export function loadActiveModuleTypes() {
    try {
        const data = localStorage.getItem(STORAGE_KEYS.ACTIVE_MODULE_TYPES);
        return data ? new Set(JSON.parse(data)) : null;
    } catch (e) {
        console.warn('Failed to load active module types:', e);
        return null;
    }
}

/**
 * Save active tiers filter
 */
export function saveActiveTiers(tiers) {
    try {
        localStorage.setItem(STORAGE_KEYS.ACTIVE_TIERS, JSON.stringify(Array.from(tiers)));
    } catch (e) {
        console.warn('Failed to save active tiers:', e);
    }
}

/**
 * Load active tiers filter
 */
export function loadActiveTiers() {
    try {
        const data = localStorage.getItem(STORAGE_KEYS.ACTIVE_TIERS);
        return data ? new Set(JSON.parse(data)) : null;
    } catch (e) {
        console.warn('Failed to load active tiers:', e);
        return null;
    }
}

/**
 * Save selected gadget
 */
export function saveSelectedGadget(gadget) {
    try {
        // Only save the gadget ID to keep storage small
        const gadgetId = gadget ? gadget.id : null;
        localStorage.setItem(STORAGE_KEYS.SELECTED_GADGET, JSON.stringify(gadgetId));
    } catch (e) {
        console.warn('Failed to save selected gadget:', e);
    }
}

/**
 * Load selected gadget ID
 */
export function loadSelectedGadgetId() {
    try {
        const data = localStorage.getItem(STORAGE_KEYS.SELECTED_GADGET);
        return data ? JSON.parse(data) : null;
    } catch (e) {
        console.warn('Failed to load selected gadget:', e);
        return null;
    }
}

/**
 * Save operator seat mode
 */
export function saveOperatorSeatMode(mode) {
    try {
        localStorage.setItem(STORAGE_KEYS.OPERATOR_SEAT_MODE, JSON.stringify(mode));
    } catch (e) {
        console.warn('Failed to save operator seat mode:', e);
    }
}

/**
 * Load operator seat mode
 */
export function loadOperatorSeatMode() {
    try {
        const data = localStorage.getItem(STORAGE_KEYS.OPERATOR_SEAT_MODE);
        return data ? JSON.parse(data) : null;
    } catch (e) {
        console.warn('Failed to load operator seat mode:', e);
        return null;
    }
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
