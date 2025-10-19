export const SIZE_ATTRIBUTE = 19;

// Fixed attribute display order exactly matching your JSON
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
    "Inert Material Level"
];

// Units override if missing
export const HARDCODED_UNITS = {
    "Optimal Range": "m",
    "Extraction Laser Power": "MW",
    "Mining Laser Power": "MW",
    "Minimum Laser Power": "MW",
    "Maximum Laser Power": "MW",
    "Resistance": "%",
    "Laser Instability": "%",
    "Optimal Charge Window Size": "%",
    "Optimal Charge Window Rate": "%",
    "Inert Material Level": "%"
};

// Data state management
export let miningData = {
    laserheads: [],
    modules: [],
    gadgets: []
};

export const DISPLAY_ATTRIBUTES = new Set([
    "Power Draw",
    "Heat Generation",
    "Base Power",
    "Optimal Charge Window Size",
    "Optimal Charge Rate",
    "Catastrophic Charge Rate",
    "Shatter Damage",
    "Extraction Laser Power",
    "Resistance Modifier",
    "Instability Modifier",
    "Range",
    "Throttle Strength",
    "Module Health",
]);

export const MODULE_DISPLAY_ATTRIBUTES = new Set([
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

export const LASERHEAD_ATTRIBUTE_ORDER = [
    "Power Draw",
    "Heat Generation",
    "Base Power",
    "Optimal Charge Window Size",
    "Optimal Charge Rate",
    "Catastrophic Charge Rate",
    "Shatter Damage",
    "Extraction Laser Power",
    "Resistance Modifier",
    "Instability Modifier",
    "Range",
    "Throttle Strength",
    "Module Health",
];

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
            console.log(`Base ${base}% to factor: ${baseFactor}`);
            
            const modFactor = 1 + (mod / 100);
            console.log(`Module ${mod}% to factor: ${modFactor}`);
            
            const combinedFactor = baseFactor * modFactor;
            console.log(`Combined factor: ${combinedFactor}`);
            
            const finalPercentage = (combinedFactor - 1) * 100;
            console.log(`Final percentage: ${finalPercentage}%`);
            
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

// Initialize window globals
window.displayAttributes = DEFAULT_ACTIVE_NAMES;
window.moduleDisplayAttributes = new Set(DEFAULT_ACTIVE_MODULE_NAMES);

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
        console.error("Error loading mining data:", error);
        throw error; // Re-throw to handle in the UI
    }
}