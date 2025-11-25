// Mining data container
export let miningData = {
    laserheads: [],
    modules: [],
    gadgets: []
};

// Attribute display order for laserheads
export const ATTRIBUTE_ORDER_NAMES = [
    "Maximum Laser Power",
    "Minimum Laser Power",
    "Extraction Laser Power",
    "Resistance",
    "Laser Instability",
    "Optimal Charge Window Size",
    "Optimal Charge Window Rate",
    "Maximum Range",
    "Optimal Range",
    "Inert Material Level",
];

// Module attribute order
export const MODULE_ATTRIBUTE_ORDER = [
    "Mining Laser Power",
    "Extraction Laser Power",
    "Resistance",
    "Laser Instability",
    "Optimal Charge Window Size",
    "Optimal Charge Window Rate",
    "Optimal Charge Rate",
    "Catastrophic Charge Rate",
    "Shatter Damage",
    "Inert Material Level",
    "Duration",
    "Uses"
];

// Attributes to display for modules
export const MODULE_DISPLAY_ATTRIBUTES = new Set([
    "Minimum Laser Power",
    "Maximum Laser Power",
    "Mining Laser Power",
    "Extraction Laser Power",
    "Resistance",
    "Laser Instability",
    "Optimal Charge Window Size",
    "Optimal Charge Window Rate",
    "Optimal Charge Rate",
    "Catastrophic Charge Rate",
    "Shatter Damage",
    "Inert Material Level",
    "Duration",
    "Uses"
]);

// Hardcoded units for attributes
const HARDCODED_UNITS = {
    "Minimum Laser Power": "MW",
    "Maximum Laser Power": "MW",
    "Mining Laser Power": "MW",
    "Extraction Laser Power": "MW",
    "Resistance": "%",
    "Laser Instability": "%",
    "Optimal Charge Window Size": "%",
    "Optimal Charge Window Rate": "%",
    "Optimal Charge Rate": "%",
    "Catastrophic Charge Rate": "%",
    "Maximum Range": "m",
    "Optimal Range": "m",
    "Shatter Damage": "%",
    "Maximum Damage": "%",
    "Inert Material Level": "%",
    "Duration": "s",
    "Uses": ""
};

// Default active attributes to show in selected lasers
export const DEFAULT_ACTIVE_NAMES = [
    "Maximum Laser Power",
    "Minimum Laser Power",
    "Mining Laser Power",
    "Extraction Laser Power",
    "Resistance",
    "Laser Instability",
    "Optimal Charge Window Size",
    "Optimal Charge Window Rate",
    "Maximum Range",
    "Optimal Range",
    "Inert Material Level"
];

// Default active module attributes
export const DEFAULT_ACTIVE_MODULE_NAMES = [
    "Mining Laser Power",
    "Extraction Laser Power",
    "Resistance",
    "Laser Instability",
    "Optimal Charge Window Size",
    "Optimal Charge Window Rate",
    "Optimal Charge Rate",
    "Catastrophic Charge Rate",
    "Shatter Damage",
    "Inert Material Level",
    "Duration",
    "Uses"
];

// Utility functions
export function getUnit(attr) {
    if(attr.unit) return attr.unit;
    return HARDCODED_UNITS[attr.attribute_name] || "";
}

// Convert percentage to factor (e.g., 25% -> 1.25, -10% -> 0.9)
export function percentageToFactor(percentage) {
    return 1 + (parseFloat(percentage) / 100);
}

// Convert factor back to percentage (e.g., 1.25 -> 25%, 0.9 -> -10%)
export function factorToPercentage(factor) {
    return (factor - 1) * 100;
}

// Calculate combined value with module modifiers
export function calculateCombinedValue(baseValue, moduleValue, unit, moduleActive = true, attributeName = '') {
    try {
        if (!moduleActive) return baseValue;
        
        let base = parseFloat(baseValue);
        if (isNaN(base)) return baseValue;
        
        let mod = parseFloat(moduleValue);
        if (isNaN(mod)) return base;

        if (unit === '%') {
            // Standard calculation for other percentage attributes
            const baseFactor = 1 + (base / 100);
            const modFactor = 1 + (mod / 100);
            const combinedFactor = baseFactor * modFactor;
            const finalPercentage = (combinedFactor - 1) * 100;
            return finalPercentage;
        } else if (unit === 'MW') {
            const effectiveBase = base === 0 ? 1 : base;
            const modFactor = 1 + ((mod-100) / 100);
            return effectiveBase * modFactor;
        } else {
            if (Math.abs(mod) <= 100) {
                const effectiveBase = base === 0 ? 1 : base;
                const modFactor = 1 + (mod / 100);
                return effectiveBase * modFactor;
            } else {
                return base + mod;
            }
        }
    } catch (err) {
        console.error("Error in calculateCombinedValue:", err);
        return baseValue;
    }
}

export function cleanLaserName(name) {
    return name.replace(/\s*\(S\d\)/, "")
               .replace(/Mining Laser ?/i, "");
}

// Import storage functions
import { loadDisplayAttributes, loadModuleDisplayAttributes } from './storage-manager.js';

// Initialize window globals with saved values or defaults
window.displayAttributes = loadDisplayAttributes() || DEFAULT_ACTIVE_NAMES;
window.moduleDisplayAttributes = loadModuleDisplayAttributes() || new Set(DEFAULT_ACTIVE_MODULE_NAMES);

export async function loadMiningData() {
    try {
        const files = ['laserheads', 'modules', 'gadgets'];
        const loadPromises = files.map(async (type) => {
            const response = await fetch(`data/${type}_merged.json`);
            if (!response.ok) {
                throw new Error(`Failed to load ${type}: ${response.statusText}`);
            }
            const data = await response.json();
            miningData[type] = data;
        });

        await Promise.all(loadPromises);
        console.log("Data loaded:", miningData);
    } catch (error) {
        console.error("Error loading data:", error);
    }
}