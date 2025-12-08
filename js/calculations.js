// Pure calculation functions - no DOM manipulation
import { getUnit, calculateCombinedValue } from './data-manager.js';

// Mining constants
export const c_mass = 0.175;  // Mass coefficient
export const c_r = 1;       // Resistance coefficient

/**
 * Calculate effective resistance after applying laser/module resistance modifier
 * @param {number} resistance - Rock resistance percentage (0-100)
 * @param {number} resistanceModifier - Resistance modifier as multiplier (e.g., 0.75 means -25% resistance)
 * @returns {number} - Effective resistance (0-1)
 */
export function computeEffectiveResistance(resistance, resistanceModifier) {
    // resistanceModifier is already in multiplier form from calculateResistanceModifier
    // e.g., 0.75 means -25% (reduces resistance), 1.25 means +25% (increases resistance)
    // r_factor = resistanceModifier (already computed as 1 + r_mod/100)
    const r_factor = resistanceModifier;
    return Math.max(0, Math.min(1, (resistance / 100) * r_factor)) * c_r;
}

/**
 * Calculate mass at a given resistance
 * Formula: mass = (power * (1 - effective_resistance)) / c_mass
 * @param {number} power - Power value
 * @param {number} resistance - Rock resistance percentage (0-100)
 * @param {number} resistanceModifier - Resistance modifier multiplier
 * @returns {number} - Calculated mass
 */
export function computeMassAtResistance(power, resistance, resistanceModifier) {
    const effectiveResistance = computeEffectiveResistance(resistance, resistanceModifier);
    return (power * (1 - effectiveResistance)) / c_mass;
}

/**
 * Calculate required raw laser power for a given mass and resistance
 * Since effective laser power = rawPower * (1 - effective_resistance),
 * we need more raw power to compensate for the resistance reduction
 * @param {number} mass - Mass value
 * @param {number} resistance - Resistance percentage (0-100)
 * @param {number} resistanceModifier - Resistance modifier (e.g., 0.75 = -25%)
 * @returns {number} - Required raw laser power
 */
export function computeRequiredPower(mass, resistance = 0, resistanceModifier = 1) {
    const effectiveResistance = computeEffectiveResistance(resistance, resistanceModifier);
    // power = (mass * c_mass) / (1 - effective_resistance)
    const denominator = 1 - effectiveResistance;
    if (denominator <= 0) return Infinity; // Can't break at 100%+ effective resistance
    return (mass * c_mass) / denominator;
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
export function roundValue(value) {
    const rounded = Math.round(value * 100) / 100;
    return rounded % 1 === 0 ? Math.round(rounded) : rounded;
}

/**
 * Round and format value to string for HTML display
 * @param {number} value - Value to round and format
 * @returns {string} - Rounded value as string
 */
export function roundAndFormatValue(value) {
    const rounded = Math.round(value * 100) / 100;
    return rounded % 1 === 0 ? Math.round(rounded).toString() : rounded.toString();
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
        m && m.attributes?.some(a => a.attribute_name === "Resistance")
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
        if (!module) return;
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
 * Compute combined curve data for multiple lasers
 * Combines power (sum) and resistance modifiers (product) from visible lasers
 * @param {Array} laserParams - Array of {maxPower, minPower, resistanceModifier, isVisible}
 * @returns {Object} - {maxData: Array, minData: Array} of {x, y} points
 */
export function computeCombinedCurve(laserParams) {
    const maxData = [];
    const minData = [];
    
    for (let R = 0; R <= 100; R += 0.1) {
        // Combine power and resistance modifiers from all visible lasers
        let combinedMaxPower = 0;
        let combinedMinPower = 0;
        let combinedResistanceModifier = 1;
        
        for (const laser of laserParams) {
            if (laser.isVisible) {
                combinedMaxPower += laser.maxPower;
                combinedMinPower += laser.minPower;
                combinedResistanceModifier *= laser.resistanceModifier;
            }
        }
        
        // Calculate total mass with combined power and combined resistance modifier
        const totalMaxMass = computeMassAtResistance(combinedMaxPower, R, combinedResistanceModifier);
        const totalMinMass = computeMassAtResistance(combinedMinPower, R, combinedResistanceModifier);
        
        maxData.push({ x: R, y: totalMaxMass });
        minData.push({ x: R, y: totalMinMass });
    }
    
    return { maxData, minData };
}

/**
 * Create synthetic attribute when laserhead doesn't have it but module modifies it
 * @param {string} attrName - Attribute name
 * @param {Array} modules - Array of modules (may contain nulls)
 * @returns {Object|null} - Synthetic attribute or null
 */
export function createSyntheticAttribute(attrName, modules) {
    // Filter out null modules for calculations
    const validModules = modules.filter(m => m);
    const moduleModifiers = getModuleModifiers(attrName, validModules);
    
    if (moduleModifiers.length === 0) return null;
    
    let moduleAttr;
    if (attrName === "Maximum Laser Power" || attrName === "Minimum Laser Power") {
        moduleAttr = validModules[0].attributes.find(a => a.attribute_name === "Mining Laser Power");
    } else {
        moduleAttr = validModules[0].attributes.find(a => a.attribute_name === attrName);
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
        return { percentage: 0, usedLasers: [], insufficient: true };
    }
    
    // Generate all possible non-empty subsets of lasers
    const n = laserParameters.length;
    const allSubsets = [];
    
    for (let mask = 1; mask < (1 << n); mask++) {
        const subset = [];
        for (let i = 0; i < n; i++) {
            if (mask & (1 << i)) {
                subset.push(i);
            }
        }
        allSubsets.push(subset);
    }
    
    // Sort subsets by size (prefer fewer lasers)
    allSubsets.sort((a, b) => a.length - b.length);
    
    let bestResult = null;
    
    for (const subset of allSubsets) {
        // Calculate combined values for this subset
        let combinedMaxPower = 0;
        let combinedResistanceModifier = 1;
        
        for (const idx of subset) {
            combinedMaxPower += laserParameters[idx].maxPower;
            combinedResistanceModifier *= laserParameters[idx].resistanceModifier;
        }
        
        // Calculate required power for this combination
        const powerNeeded = computeRequiredPower(mass, resistance, combinedResistanceModifier);
        
        // Skip if unbreakable with this combination
        if (!isFinite(powerNeeded)) {
            continue;
        }
        
        const powerPercentage = powerNeeded / combinedMaxPower;
        
        // Check if this combination can break the rock
        if (powerPercentage <= 1) {
            // Found a working combination - return it (already sorted by size, so this is minimal)
            return { 
                percentage: powerPercentage * 100, 
                usedLasers: subset.map(i => laserParameters[i].name || `L${i + 1}`),
                insufficient: false 
            };
        }
        
        // Track the best insufficient result (lowest percentage = closest to breaking)
        if (!bestResult || powerPercentage < bestResult.actualPercentage) {
            bestResult = {
                percentage: 100,
                usedLasers: subset.map(i => laserParameters[i].name || `L${i + 1}`),
                insufficient: true,
                missingPower: powerNeeded - combinedMaxPower,
                actualPercentage: powerPercentage
            };
        }
    }
    
    // No combination could break the rock
    if (bestResult) {
        return bestResult;
    }
    
    // All combinations were unbreakable (100%+ effective resistance)
    return { 
        percentage: Infinity, 
        usedLasers: laserParameters.map((laser, i) => laser.name || `L${i + 1}`), 
        insufficient: true, 
        unbreakable: true 
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
    
    // Handle unbreakable case (100%+ effective resistance)
    if (result.unbreakable) {
        return `<span style="color: red;">Unbreakable at this resistance</span>`;
    }
    
    // usedLasers now contains the actual laser names
    const laserNames = result.usedLasers;
    
    let output = `Required: ${laserNames.join(', ')} at ${result.percentage.toFixed(1)}%`;
    
    // If insufficient, show how much more power is needed
    if (result.insufficient) {
        output += ` <span style="color: red;">(+${result.missingPower.toFixed(1)} MW needed)</span>`;
    }
    
    return output;
}
