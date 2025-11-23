// Pure calculation functions - no DOM manipulation
import { getUnit, calculateCombinedValue } from './data-manager.js';

// Mining constant for mass calculations
export const c_mass = 0.2;

/**
 * Calculate mass at a given resistance
 * @param {number} power - Power value
 * @param {number} resistance - Resistance percentage (0-100)
 * @param {number} resistanceModifier - Resistance modifier multiplier
 * @returns {number} - Calculated mass
 */
export function computeMassAtResistance(power, resistance, resistanceModifier) {
    return power / ((1 + (resistance / 100) * resistanceModifier) * c_mass);
}

/**
 * Calculate required power for a given mass and resistance
 * @param {number} mass - Mass value
 * @param {number} resistance - Resistance percentage (0-100)
 * @param {number} resistanceModifier - Resistance modifier multiplier
 * @returns {number} - Required power
 */
export function computeRequiredPower(mass, resistance, resistanceModifier) {
    return mass * (1 + (resistance / 100) * resistanceModifier) * c_mass;
}

/**
 * Calculate the modified attribute value with module modifiers applied
 * @param {Object} attr - The attribute object
 * @param {Array} modules - Array of module objects
 * @returns {number} - The calculated final value
 */
export function calculateAttributeValue(attr, modules = []) {
    if (!attr || !attr.value) return null;
    
    const attrName = attr.attribute_name;
    const baseValue = parseFloat(attr.value.trim());
    const unit = getUnit(attr);
    
    // Get module modifiers for this attribute
    const moduleModifiers = getModuleModifiers(attrName, modules);
    
    if (moduleModifiers.length === 0) {
        return baseValue;
    }
    
    // Special handling for Maximum/Minimum Laser Power
    if (attrName === "Maximum Laser Power" || attrName === "Minimum Laser Power") {
        return calculateLaserPowerWithModifiers(baseValue, moduleModifiers, modules, attrName);
    }
    
    // Percentage attributes
    if (unit === '%') {
        return calculatePercentageWithModifiers(baseValue, moduleModifiers, modules, attrName);
    }
    
    // Other attributes
    return calculateWithCombinedValue(baseValue, moduleModifiers, modules, unit, attrName);
}

/**
 * Get module modifiers for a specific attribute
 * @param {string} attrName - The attribute name
 * @param {Array} modules - Array of module objects
 * @returns {Array} - Array of modifier values
 */
function getModuleModifiers(attrName, modules) {
    // Special handling for Maximum/Minimum Laser Power - use Mining Laser Power modifiers
    const modifierAttrName = (attrName === "Maximum Laser Power" || attrName === "Minimum Laser Power")
        ? "Mining Laser Power"
        : attrName;
    
    return modules
        .filter(m => m && m.attributes)
        .map(m => m.attributes.find(a => a.attribute_name === modifierAttrName))
        .filter(a => a && a.value)
        .map(a => parseFloat(a.value));
}

/**
 * Calculate laser power with module modifiers (using factor = value/100)
 * @param {number} baseValue - Base power value
 * @param {Array} moduleModifiers - Array of modifier values (unused)
 * @param {Array} modules - Array of module objects
 * @param {string} attrName - Attribute name (unused, kept for consistency)
 * @returns {number} - Calculated power
 */
function calculateLaserPowerWithModifiers(baseValue, moduleModifiers, modules, attrName) {
    let finalValue = baseValue;
    
    modules.forEach((module) => {
        if (module && module.attributes) {
            const modAttr = module.attributes.find(a => a.attribute_name === "Mining Laser Power");
            if (modAttr && modAttr.value) {
                const isPassive = isPassiveModule(module);
                const useModule = isPassive || module.isActive !== false;
                if (useModule) {
                    const modFactor = parseFloat(modAttr.value) / 100;
                    finalValue *= modFactor;
                }
            }
        }
    });
    
    return roundValue(finalValue);
}

/**
 * Calculate percentage attribute with module modifiers
 * @param {number} baseValue - Base percentage value
 * @param {Array} moduleModifiers - Array of modifier values (unused)
 * @param {Array} modules - Array of module objects
 * @param {string} attrName - Attribute name
 * @returns {number} - Calculated percentage
 */
function calculatePercentageWithModifiers(baseValue, moduleModifiers, modules, attrName) {
    let factor = 1 + (baseValue / 100); // Convert base value to factor
    
    modules.forEach((module) => {
        if (module && module.attributes) {
            const modAttr = module.attributes.find(a => a.attribute_name === attrName);
            if (modAttr && modAttr.value) {
                const isPassive = isPassiveModule(module);
                const useModule = isPassive || module.isActive !== false;
                if (useModule) {
                    const modFactor = 1 + (parseFloat(modAttr.value) / 100);
                    factor *= modFactor;
                }
            }
        }
    });
    
    // Convert final factor back to percentage
    const finalValue = (factor - 1) * 100;
    return roundValue(finalValue);
}

/**
 * Calculate attribute using calculateCombinedValue
 * @param {number} baseValue - Base value
 * @param {Array} moduleModifiers - Array of modifier values
 * @param {Array} modules - Array of module objects
 * @param {string} unit - Unit of measurement
 * @param {string} attrName - Attribute name
 * @returns {number} - Calculated value
 */
function calculateWithCombinedValue(baseValue, moduleModifiers, modules, unit, attrName) {
    let finalValue = baseValue;
    
    moduleModifiers.forEach((modValue, index) => {
        const moduleActive = modules[index]?.isActive !== false;
        finalValue = calculateCombinedValue(finalValue, modValue, unit, moduleActive, attrName);
    });
    
    return roundValue(finalValue);
}

/**
 * Check if a module is passive type
 * @param {Object} module - Module object
 * @returns {boolean} - True if passive
 */
function isPassiveModule(module) {
    return module.attributes?.some(a => 
        a.attribute_name === "Item Type" && a.value === "Passive"
    ) ?? false;
}

/**
 * Round value to 2 decimal places, return integer if whole number
 * @param {number} value - Value to round
 * @returns {number} - Rounded value
 */
function roundValue(value) {
    const rounded = Math.round(value * 100) / 100;
    return rounded % 1 === 0 ? Math.round(rounded) : rounded;
}

/**
 * Calculate total power for a laserhead with modules
 * @param {Object} laserhead - Laserhead object
 * @param {Array} modules - Array of modules
 * @param {boolean} useMax - True for max power, false for min power
 * @returns {number} - Total power value
 */
export function calculateTotalPower(laserhead, modules, useMax = true) {
    const powerAttrName = useMax ? "Maximum Laser Power" : "Minimum Laser Power";
    const baseAttr = laserhead.attributes.find(attr => attr.attribute_name === powerAttrName);
    
    if (!baseAttr) return 0;
    
    let baseValue = parseFloat(baseAttr.value);
    
    // Collect all module modifiers for Mining Laser Power
    const moduleModifiers = modules
        .filter(m => m && m.attributes)
        .map(m => m.attributes.find(a => a.attribute_name === "Mining Laser Power"))
        .filter(a => a && a.value)
        .map(a => parseFloat(a.value));
    
    // Apply all module modifiers using factor = value/100
    moduleModifiers.forEach(modValue => {
        baseValue *= (modValue / 100);
    });
    
    return roundValue(baseValue);
}

/**
 * Calculate resistance modifier for a laserhead
 * @param {Object} laserhead - Laserhead object
 * @param {Array} modules - Array of modules
 * @param {Object} gadget - Gadget object (optional)
 * @returns {number} - Resistance multiplier (e.g., 1.25 for 25% resistance)
 */
export function calculateResistanceModifier(laserhead, modules, gadget = null) {
    let resistanceAttr = laserhead.attributes.find(attr => 
        attr.attribute_name === "Resistance"
    );
    
    // Check if any modules have resistance modifiers
    const hasResistanceModules = modules.some(m => 
        m.attributes?.some(a => a.attribute_name === "Resistance")
    );
    
    // If no base resistance but modules have it, start from 0%
    if (!resistanceAttr && hasResistanceModules) {
        resistanceAttr = {
            attribute_name: "Resistance",
            value: "0",
            unit: "%"
        };
    } else if (!resistanceAttr) {
        return 1;
    }
    
    let resistance = parseFloat(resistanceAttr.value) || 0;
    const unit = getUnit(resistanceAttr) || '%';
    
    // Apply module modifiers
    modules.forEach(module => {
        const resMod = module.attributes.find(attr => 
            attr.attribute_name === "Resistance"
        );
        if (resMod) {
            resistance = parseFloat(
                calculateCombinedValue(
                    resistance.toString(), 
                    resMod.value, 
                    unit, 
                    module.isActive !== false, 
                    "Resistance"
                )
            );
        }
    });
    
    // Apply gadget modifier if present
    if (gadget && gadget.attributes) {
        const gadgetResMod = gadget.attributes.find(attr => 
            attr.attribute_name === "Resistance" && attr.value
        );
        if (gadgetResMod) {
            resistance = parseFloat(
                calculateCombinedValue(
                    resistance.toString(), 
                    gadgetResMod.value, 
                    unit, 
                    true, 
                    "Resistance"
                )
            );
        }
    }
    
    // Convert final percentage to multiplier (e.g., 25% -> 1.25)
    return 1 + (resistance / 100);
}

/**
 * Compute curve data for chart
 * @param {number} power - Power value
 * @param {number} resistanceModifier - Resistance modifier
 * @returns {Array} - Array of {x, y} points
 */
export function computeCurve(power, resistanceModifier) {
    const data = [];
    for (let R = 0; R <= 100; R += 0.1) {
        data.push({ 
            x: R, 
            y: computeMassAtResistance(power, R, resistanceModifier)
        });
    }
    return data;
}

/**
 * Create synthetic attribute when laserhead doesn't have it but module modifies it
 * @param {string} attrName - Attribute name
 * @param {Array} modules - Array of modules
 * @returns {Object|null} - Synthetic attribute or null
 */
export function createSyntheticAttribute(attrName, modules) {
    const moduleModifiers = getModuleModifiers(attrName, modules);
    
    if (moduleModifiers.length === 0) return null;
    
    let moduleAttr;
    if (attrName === "Maximum Laser Power" || attrName === "Minimum Laser Power") {
        moduleAttr = modules[0].attributes.find(a => a.attribute_name === "Mining Laser Power");
    } else {
        moduleAttr = modules[0].attributes.find(a => a.attribute_name === attrName);
    }
    
    if (!moduleAttr) return null;
    
    return {
        attribute_name: attrName,
        value: "0",  // Base value of 0 (factor of 1) when laser doesn't have attribute
        unit: moduleAttr.unit
    };
}

/**
 * Calculate power distribution across multiple lasers
 * Returns a single percentage that applies to all lasers simultaneously
 * @param {number} mass - Mass value
 * @param {number} resistance - Resistance percentage (0-100)
 * @param {Array} laserParameters - Array of laser objects with {maxPower, minPower, resistanceModifier}
 * @returns {Object} - {percentage: number, usedLasers: number, insufficient: boolean}
 */
export function calculatePowerPercentage(mass, resistance, laserParameters) {
    if (laserParameters.length === 0) {
        return { percentage: 0, usedLasers: 0, insufficient: true };
    }
    
    // The effective resistance modifier accumulates laser modifiers
    // Each laser's resistanceModifier already includes gadget effect from calculateResistanceModifier
    let effResistanceModifier = laserParameters[0].resistanceModifier;
    let maxPower = laserParameters[0].maxPower;
    let i = 0;
    
    let powerNeeded = mass * c_mass * (1 + resistance / 100) * effResistanceModifier;
    let powerPercentage = powerNeeded / maxPower;
    
    // Keep adding lasers until we can handle the power needed
    while (powerPercentage > 1 && i < laserParameters.length - 1) {
        i += 1;
        effResistanceModifier *= laserParameters[i].resistanceModifier;
        powerNeeded = mass * c_mass * (1 + resistance / 100) * effResistanceModifier;
        maxPower += laserParameters[i].maxPower;
        powerPercentage = powerNeeded / maxPower;
    }
    
    // Check if all lasers at 100% is still insufficient
    if (powerPercentage > 1) {
        return { 
            percentage: 100, 
            usedLasers: i + 1, 
            insufficient: true,
            missingPower: powerNeeded - maxPower
        };
    }
    
    return { 
        percentage: powerPercentage * 100, 
        usedLasers: i + 1, 
        insufficient: false 
    };
}

/**
 * Distribute power across multiple lasers and format for display
 * @param {number} mass - Mass value
 * @param {number} resistance - Resistance percentage (0-100)
 * @param {Array} lasers - Array of laser objects with {index, maxPower, minPower, resistanceModifier}
 * @returns {string} - Formatted display string
 */
export function distributePowerAcrossLasers(mass, resistance, lasers) {
    const result = calculatePowerPercentage(mass, resistance, lasers);
    
    // Build list of laser names
    const laserNames = [];
    for (let i = 0; i < result.usedLasers; i++) {
        laserNames.push(`L${i + 1}`);
    }
    
    let output = `Required lasers: ${laserNames.join(', ')} at ${result.percentage.toFixed(1)}%`;
    
    // If insufficient, show how much more power is needed
    if (result.insufficient) {
        output += ` <span style="color: red;">(+${result.missingPower.toFixed(1)} MW needed)</span>`;
    }
    
    return output;
}
