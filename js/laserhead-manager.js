import { 
    miningData, 
    ATTRIBUTE_ORDER_NAMES, 
    MODULE_ATTRIBUTE_ORDER,
    MODULE_DISPLAY_ATTRIBUTES,
    getUnit, 
    cleanLaserName,
    calculateCombinedValue
} from './data-manager.js';
import { updateBreakabilityChart } from './chart-manager.js';
import { isActiveModule } from './module-manager.js';
import { calculateAttributeValue, createSyntheticAttribute, roundValue } from './calculations.js';
import { saveLaserSetup, loadLaserSetup, saveActiveSizes, loadActiveSizes } from './storage-manager.js';
import { 
    generateLaserheadCardHTML,
    generateAttributeRow,
    generateFilledModuleSlotHTML,
    generateEmptyModuleSlotHTML,
    generateModuleAttributeRows,
    generateSelectedLaserheadHTML
} from './html-generators.js';

let currentLaserheadIndex = null;
let filteredLaserheads = [];
export let selectedLaserheads = [];
let activeSizes = new Set(["1","2"]); // Only S1/S2 lasers
const combinedNameOverrides = new Map();

export function setupLaserheadUI() {
    setupLaserheadModal();
    
    // Load saved active sizes
    const savedSizes = loadActiveSizes();
    if (savedSizes) {
        activeSizes = savedSizes;
    }
    
    setupSizeFilters();
    filteredLaserheads = miningData.laserheads;
    
    // Load saved laser setup
    const savedSetup = loadLaserSetup();
    if (savedSetup && Array.isArray(savedSetup)) {
        selectedLaserheads = savedSetup;
        renderSelectedLaserheads();
    }
}

function setupSizeFilters() {
    document.querySelectorAll(".sizeFilter").forEach(btn => {
        const size = btn.dataset.size;
        
        if (activeSizes.has(size)) {
            btn.classList.add("active");
        }
        
        btn.addEventListener("click", () => {
            if(activeSizes.has(size)) {
                activeSizes.delete(size);
                btn.classList.remove("active");
            } else {
                activeSizes.add(size);
                btn.classList.add("active");
            }
            saveActiveSizes(activeSizes);
            renderLaserheadCards();
        });
    });
}

// Process attributes for display
function processAttribute(attr, ignoreAttributeFilter = false, modules = []) {
    const attrName = attr ? attr.attribute_name : '';
    
    // Create synthetic attribute if needed
    if (!attr) {
        attr = createSyntheticAttribute(attrName, modules);
    }
    
    if(!attr || !attr.value) return [];
    
    // Check if attribute is valid and should be displayed
    const isValidAttribute = ATTRIBUTE_ORDER_NAMES.includes(attr.attribute_name);
    
    if(!isValidAttribute) return [];
    
    // Check if attribute is in display filter
    if(!ignoreAttributeFilter && !window.displayAttributes.includes(attr.attribute_name)) {
        return [];
    }

    const unit = getUnit(attr);
    
    // Calculate the final value using the calculations module
    const finalValue = calculateAttributeValue(attr, modules);
    
    // Format for display
    const formattedValue = `<td class="value-number">${finalValue}</td><td class="value-unit">${unit}</td>`;
    
    return [{ name: attr.attribute_name, value: formattedValue }];
}

function sortAttributes(attrs) {
    return attrs.sort((a,b) => {
        const nameA = a.name.replace(/\s(Min|Max)$/, "");
        const nameB = b.name.replace(/\s(Min|Max)$/, "");

        const idxA = ATTRIBUTE_ORDER_NAMES.indexOf(nameA);
        const idxB = ATTRIBUTE_ORDER_NAMES.indexOf(nameB);

        const orderA = idxA >= 0 ? idxA : 999;
        const orderB = idxB >= 0 ? idxB : 999;

        const suffixA = a.name.endsWith("Min") ? 0 : a.name.endsWith("Max") ? 1 : 0;
        const suffixB = b.name.endsWith("Min") ? 0 : b.name.endsWith("Max") ? 1 : 0;

        return orderA - orderB || suffixA - suffixB;
    });
}

function shouldShowCombinedLaserheads() {
    return window.chartDisplayAttributes?.has("Combined Lasers");
}

function getLaserheadSizeValue(laserhead) {
    if (laserhead?.size) {
        const size = parseInt(laserhead.size, 10);
        if (!isNaN(size)) return size;
    }
    const sizeAttr = laserhead?.attributes?.find(attr => attr.attribute_name === "Size");
    if (sizeAttr) {
        const size = parseInt(sizeAttr.value, 10);
        if (!isNaN(size)) return size;
    }
    return null;
}

function buildCombinedAttributes(laserheads) {
    const combinedMap = new Map();
    const minAttributes = new Set(['Maximum Range', 'Optimal Range']);
    
    laserheads.forEach(laserhead => {
        const modules = laserhead.modules || [];
        ATTRIBUTE_ORDER_NAMES.forEach(attrName => {
            let attr = (laserhead.attributes || []).find(a => a.attribute_name === attrName);
            if (!attr) {
                attr = createSyntheticAttribute(attrName, modules);
            }
            if (!attr) return;
            
            const value = calculateAttributeValue(attr, modules);
            if (value === null || isNaN(value)) return;
            
            const unit = getUnit(attr);
            if (!combinedMap.has(attrName)) {
                combinedMap.set(attrName, { value, unit });
                return;
            }
            
            const prev = combinedMap.get(attrName);
            let combinedValue;
            if (minAttributes.has(attrName)) {
                combinedValue = Math.min(prev.value, value);
            } else if (unit === '%') {
                combinedValue = calculateCombinedValue(prev.value, value, unit, true, attrName);
            } else {
                combinedValue = prev.value + value;
            }
            combinedMap.set(attrName, { value: roundValue(combinedValue), unit });
        });
    });
    
    return Array.from(combinedMap.entries()).map(([attribute_name, data]) => ({
        attribute_name,
        value: data.value.toString(),
        unit: data.unit
    }));
}

function generateIndexCombinations(indices) {
    const results = [];
    const n = indices.length;
    
    function backtrack(start, combo, targetSize) {
        if (combo.length === targetSize) {
            results.push([...combo]);
            return;
        }
        for (let i = start; i < n; i++) {
            combo.push(indices[i]);
            backtrack(i + 1, combo, targetSize);
            combo.pop();
        }
    }
    
    for (let size = 2; size <= n; size++) {
        backtrack(0, [], size);
    }
    
    return results;
}

function buildCombinedLaserhead(comboKey, indices) {
    const laserheads = indices.map(i => selectedLaserheads[i]).filter(Boolean);
    const sizeValues = laserheads.map(getLaserheadSizeValue).filter(v => v !== null);
    const combinedSize = sizeValues.length > 0 ? Math.max(...sizeValues) : 1;
    const defaultNameParts = laserheads.map(lh => lh.customName || cleanLaserName(lh.name));
    const defaultName = `Combined: ${defaultNameParts.join(' + ')}`;
    const customName = combinedNameOverrides.get(comboKey);
    
    return {
        id: `combined_${comboKey}`,
        name: defaultName,
        customName: customName || undefined,
        attributes: buildCombinedAttributes(laserheads),
        modules: [],
        size: combinedSize,
        isCombined: true,
        comboKey
    };
}

function buildDisplayLaserheadItems() {
    const baseItems = selectedLaserheads.map((laserhead, index) => ({
        laserhead,
        sourceIndex: index,
        isCombined: false,
        comboKey: ''
    }));
    
    if (!shouldShowCombinedLaserheads() || selectedLaserheads.length < 2) {
        return baseItems;
    }
    
    const indices = selectedLaserheads.map((_, i) => i);
    const combos = generateIndexCombinations(indices);
    const combinedItems = combos.map(combo => {
        const comboKey = combo.join(',');
        return {
            laserhead: buildCombinedLaserhead(comboKey, combo),
            sourceIndex: null,
            isCombined: true,
            comboKey
        };
    });
    
    return [...baseItems, ...combinedItems];
}

export function getChartLaserheads() {
    return buildDisplayLaserheadItems().map(item => item.laserhead);
}

export function getDisplayLaserheadItems() {
    return buildDisplayLaserheadItems();
}

export function showLaserheadSelection(idx) {
    currentLaserheadIndex = idx;
    document.getElementById('laserheadModal').classList.remove('hidden');
    renderLaserheadCards();
}

export function removeLaserhead(idx) {
    if (idx >= 0 && idx < selectedLaserheads.length) {
        selectedLaserheads.splice(idx, 1);
        renderSelectedLaserheads();
        saveLaserSetup(selectedLaserheads);
    }
}

export function replaceLaserhead(idx) {
    if (idx >= 0 && idx < selectedLaserheads.length) {
        currentLaserheadIndex = idx;
        document.getElementById('laserheadModal').classList.remove('hidden');
        renderLaserheadCards();
    }
}

function setupLaserheadModal() {
    const modal = document.getElementById("laserheadModal");
    
    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.add('hidden');
        }
    });
}

export function renderLaserheadCards() {
    const container = document.getElementById('laserheadCards');
    container.innerHTML = '';
    
    miningData.laserheads
        .filter(laserhead => {
            const sizeAttr = laserhead.attributes.find(attr => attr.attribute_name === "Size");
            const size = sizeAttr ? sizeAttr.value : "1"; // Default to size 1 if not specified
            return activeSizes.has(size);
        })
        .forEach(laserhead => {
            const card = document.createElement('div');
            card.className = 'laserhead-card';
            card.dataset.id = laserhead.id;
            
            // Generate card HTML
            card.innerHTML = buildLaserheadCardHTML(laserhead);
            
            // Add click handler
            card.addEventListener('click', () => {
                selectLaserhead(card.dataset.id);
            });
            
            container.appendChild(card);
        });
}

function buildLaserheadCardHTML(laserhead) {
    // Process attributes for display - show all attributes in selection cards
    const attrs = laserhead.attributes
        .map(attr => processAttribute(attr, true))
        .flat()
        .filter(Boolean);

    // Sort attributes in display order
    const sortedAttrs = sortAttributes(attrs);

    return generateLaserheadCardHTML(laserhead, sortedAttrs);
}

function selectLaserhead(id) {
    if (!id) {
        console.log('No id provided');
        return;
    }
    
    // Convert id to number for comparison since dataset values are always strings
    const numericId = parseInt(id, 10);
    
    const card = document.querySelector(`.laserhead-card[data-id="${id}"]`);
    const customName = card?.querySelector('.name')?.textContent;
    
    const laserhead = filteredLaserheads.find(lh => {
        return lh.id_gadget === numericId || 
               lh.id === numericId || 
               lh.id_gadget?.toString() === id || 
               lh.id?.toString() === id;
    });
    
    if (laserhead && customName) {
        laserhead.customName = customName;
    }
    
    if (!laserhead) {
        console.log('No laserhead found with id:', id);
        return;
    }
    
    // Get the number of module slots for this laserhead
    const moduleSlotAttr = laserhead.attributes?.find(attr => attr.attribute_name === "Module Slots");
    const numModuleSlots = moduleSlotAttr ? parseInt(moduleSlotAttr.value, 10) : 3;
    
    // Initialize modules array with null placeholders to maintain stable indices
    const initializedModules = Array(numModuleSlots).fill(null);
    
    // If currentLaserheadIndex is set (meaning we're replacing), replace at that index
    if (typeof currentLaserheadIndex === 'number' && currentLaserheadIndex >= 0) {
        selectedLaserheads[currentLaserheadIndex] = { ...laserhead, modules: initializedModules };
    } else {
        // Otherwise add to the end
        selectedLaserheads.push({ ...laserhead, modules: initializedModules });
    }
    
    renderSelectedLaserheads();
    saveLaserSetup(selectedLaserheads);
    const modal = document.getElementById("laserheadModal");
    if (modal) modal.classList.add("hidden");
    
    // Reset the current index
    currentLaserheadIndex = null;
}

export function toggleModule(laserheadIdx, moduleIdx) {
    const laserhead = selectedLaserheads[laserheadIdx];
    if (!laserhead?.modules) return;

    const module = laserhead.modules[moduleIdx];
    if (!module) return;

    // Only allow toggling if it's an active module
    const isActiveModule = module.attributes?.some(attr => 
        attr.attribute_name === "Item Type" && attr.value === "Active"
    );

    if (isActiveModule) {
        // Toggle the active state
        module.isActive = module.isActive === false ? true : false;
        // Re-render to update display
        renderSelectedLaserheads();
    }
}

function addNameEditingHandlers(container) {
    container.querySelectorAll('.name[contenteditable="true"]').forEach((nameElement) => {
        nameElement.addEventListener('blur', function() {
            const newName = this.textContent.trim();
            const isCombined = this.dataset.isCombined === 'true';
            const sourceIndex = parseInt(this.dataset.sourceIndex, 10);
            const comboKey = this.dataset.comboKey;
            
            if (newName === '') {
                this.textContent = this.dataset.originalName;
                return;
            }
            
            if (isCombined) {
                if (comboKey) {
                    combinedNameOverrides.set(comboKey, newName);
                }
            } else if (!isNaN(sourceIndex) && selectedLaserheads[sourceIndex]) {
                selectedLaserheads[sourceIndex].customName = newName;
                saveLaserSetup(selectedLaserheads);
            }
        });

        nameElement.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.blur();
            }
            if (e.key === 'Escape') {
                this.textContent = this.dataset.originalName;
                this.blur();
            }
        });
    });
}

export function renderSelectedLaserheads() {
    const container = document.getElementById('selectedList');
    if (!container) return;

    const displayItems = getDisplayLaserheadItems();
    const displayLaserheads = displayItems.map(item => item.laserhead);
    
    // First pass: collect all unique attributes from all selected laserheads and modules
    // Only include attributes that are in the display options
    const allAttributeNames = new Set();
    
    // Attributes that should not create synthetic entries (already represented by other attributes)
    const skipSyntheticAttributes = ['Mining Laser Power']; // Represented by Min/Max Laser Power
    
    displayLaserheads.forEach(laserhead => {
        // Add laserhead attributes
        (laserhead.attributes || []).forEach(attr => {
            const processedAttrs = processAttribute(attr, false, laserhead.modules || []);
            processedAttrs.forEach(pa => {
                // Only add if it's in display options
                if (window.displayAttributes.includes(pa.name)) {
                    allAttributeNames.add(pa.name);
                }
            });
        });
        
        // Add module attributes even if laserhead doesn't have them
        (laserhead.modules || []).forEach(module => {
            if (module && module.isActive !== false) {
                (module.attributes || []).forEach(modAttr => {
                    // If module has an attribute value and it's in display options, add it to the collection
                    // BUT skip attributes that shouldn't create synthetic entries
                    if (modAttr && modAttr.value && modAttr.value !== '0' && modAttr.value.trim() !== '' 
                        && window.displayAttributes.includes(modAttr.attribute_name)
                        && !skipSyntheticAttributes.includes(modAttr.attribute_name)) {
                        allAttributeNames.add(modAttr.attribute_name);
                    }
                });
            }
        });
    });
    
    // Create a sorted list of all attributes
    const allAttributesArray = Array.from(allAttributeNames);
    const sortedAllAttributes = sortAttributes(
        allAttributesArray.map(name => ({ name, value: '' }))
    ).map(a => a.name);
    
    container.innerHTML = displayItems.map((item, displayIdx) => {
        const laserhead = item.laserhead;
        const actionIndex = Number.isInteger(item.sourceIndex) ? item.sourceIndex : displayIdx;
        const isCombined = item.isCombined === true;
        const comboKey = item.comboKey || '';
        // Get the number of module slots from the laserhead attributes
        const moduleSlotAttr = laserhead.attributes?.find(attr => attr.attribute_name === "Module Slots");
        const numModuleSlots = moduleSlotAttr ? parseInt(moduleSlotAttr.value, 10) : 3;
        
        // Process existing laserhead attributes
        const laserAttrs = (laserhead.attributes || [])
            .map(attr => processAttribute(attr, false, laserhead.modules || []))
            .flat()
            .filter(Boolean)
            // Only keep attributes in display options
            .filter(attr => window.displayAttributes.includes(attr.name));
        
        // Create a map of attribute names to their values for quick lookup
        const attrMap = new Map(laserAttrs.map(attr => [attr.name, attr]));
        
        // Add synthetic attributes from modules for attributes the laserhead doesn't have
        const processedSyntheticAttrs = new Set();
        (laserhead.modules || []).forEach(module => {
            if (module && module.isActive !== false) {
                (module.attributes || []).forEach(modAttr => {
                    // If laserhead doesn't have this attribute but module modifies it
                    // AND it's in display options
                    // AND we haven't already processed this synthetic attribute
                    // AND it's not in the skip list
                    if (!attrMap.has(modAttr.attribute_name) && modAttr.value && modAttr.value !== '0' && modAttr.value.trim() !== ''
                        && window.displayAttributes.includes(modAttr.attribute_name)
                        && !processedSyntheticAttrs.has(modAttr.attribute_name)
                        && !skipSyntheticAttributes.includes(modAttr.attribute_name)) {
                        // Create synthetic attribute with ALL modules, not just one
                        const syntheticAttr = createSyntheticAttribute(modAttr.attribute_name, laserhead.modules || []);
                        if (syntheticAttr) {
                            const processedAttrs = processAttribute(syntheticAttr, false, laserhead.modules || []);
                            processedAttrs.forEach(pa => {
                                if (!attrMap.has(pa.name)) {
                                    attrMap.set(pa.name, pa);
                                    processedSyntheticAttrs.add(pa.name);
                                }
                            });
                        }
                    }
                });
            }
        });
        
        // Generate table rows with all attributes, filling in empty rows where needed
        const rows = sortedAllAttributes.map(attrName => {
            const attr = attrMap.get(attrName);
            return generateAttributeRow(attrName, attr);
        }).join('');

        // Generate module slots with a section header
        let moduleSectionHTML = '';
        if (!isCombined) {
            moduleSectionHTML = `<div class="module-section">
                            ${Array(numModuleSlots).fill(null).map((_, i) => {
                                const module = laserhead.modules?.[i];
                                if (module) {
                                    const moduleAttrs = generateModuleAttributeRows(module, window.moduleDisplayAttributes);
                                    return generateFilledModuleSlotHTML(module, moduleAttrs, actionIndex, i, isActiveModule(module));
                                } else {
                                    return generateEmptyModuleSlotHTML(actionIndex, i);
                                }
                            }).join('')}
                    </div>
                </div>`;
        }
        
        return generateSelectedLaserheadHTML(laserhead, displayIdx, rows, moduleSectionHTML, {
            sourceIndex: item.sourceIndex,
            actionIndex,
            isCombined,
            comboKey
        });
    }).join('');
    
    // Add event handlers for name editing after rendering
    addNameEditingHandlers(container);
    
    // Equalize card heights after rendering
    equalizeSelectedCardHeights();
}

export function buildLaserheadHoverHTML(laserhead) {
    const displayLaserhead = {
        ...laserhead,
        name: laserhead.customName || laserhead.name
    };
    const modules = laserhead.modules || [];
    const attrs = (displayLaserhead.attributes || [])
        .map(attr => processAttribute(attr, true, modules))
        .flat()
        .filter(Boolean);
    const sortedAttrs = sortAttributes(attrs);
    const cardInner = generateLaserheadCardHTML(displayLaserhead, sortedAttrs);
    return `<div class="laserhead-card hover-card">${cardInner}</div>`;
}

// Function to equalize the height of all selected laserhead cards using padding
function equalizeSelectedCardHeights() {
    const container = document.getElementById('selectedList');
    if (!container) return;
    
    const cards = container.querySelectorAll('.selected-laserhead');
    if (cards.length === 0) return;
    
    // Reset padding to get natural heights
    cards.forEach(card => {
        card.style.paddingBottom = '';
    });
    
    // Use requestAnimationFrame to ensure layout is calculated
    requestAnimationFrame(() => {
        let maxHeight = 0;
        
        // Find the maximum height
        cards.forEach(card => {
            const rect = card.getBoundingClientRect();
            maxHeight = Math.max(maxHeight, rect.height);
        });
        
        // Apply additional padding-bottom to cards that are shorter
        if (maxHeight > 0) {
            cards.forEach(card => {
                const rect = card.getBoundingClientRect();
                const heightDifference = maxHeight - rect.height;
                if (heightDifference > 0) {
                    const currentPaddingBottom = parseFloat(getComputedStyle(card).paddingBottom) || 10;
                    card.style.paddingBottom = (currentPaddingBottom + heightDifference) + 'px';
                }
            });
        }
    });
}
