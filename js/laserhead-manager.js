import { 
    miningData, 
    ATTRIBUTE_ORDER_NAMES, 
    MODULE_ATTRIBUTE_ORDER,
    MODULE_DISPLAY_ATTRIBUTES,
    calculateCombinedValue, 
    getUnit, 
    cleanLaserName 
} from './data-manager.js';
import { updateBreakabilityChart } from './chart-manager.js';
import { isActiveModule } from './module-manager.js';

let currentLaserheadIndex = null;
let filteredLaserheads = [];
export let selectedLaserheads = [];
let activeSizes = new Set(["1","2"]); // Only S1/S2 lasers

export function setupLaserheadUI() {
    setupLaserheadModal();
    setupSizeFilters();
    filteredLaserheads = miningData.laserheads;
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
            renderLaserheadCards();
        });
    });
}

// Process attributes for display
function processAttribute(attr, ignoreAttributeFilter = false, modules = []) {
    // Get module modifiers for this attribute name
    const attrName = attr ? attr.attribute_name : '';
    const moduleModifiers = modules
        .filter(m => m && m.attributes)
        .map(m => m.attributes.find(a => a.attribute_name === attrName))
        .filter(a => a && a.value)
        .map(a => parseFloat(a.value));

    if (!attr && moduleModifiers.length > 0) {
        const moduleAttr = modules[0].attributes.find(a => a.attribute_name === attrName);
        if (moduleAttr) {
            const baseValue = moduleAttr.value;
            moduleModifiers.shift();
            attr = {
                attribute_name: attrName,
                value: baseValue,
                unit: moduleAttr.unit
            };
        }
    }

    if(!attr || !attr.value) return [];
    
    // Special handling for "Mining Laser Power" - treat it as if it contains Min/Max Laser Power
    const isValidAttribute = ATTRIBUTE_ORDER_NAMES.includes(attr.attribute_name) || 
                            attr.attribute_name === "Mining Laser Power";
    
    if(!isValidAttribute) return [];
    
    // For "Mining Laser Power", check if either Min or Max is enabled (unless ignoring filter)
    if(!ignoreAttributeFilter && attr.attribute_name === "Mining Laser Power") {
        const hasMinEnabled = window.displayAttributes.includes("Minimum Laser Power");
        const hasMaxEnabled = window.displayAttributes.includes("Maximum Laser Power");
        if (!hasMinEnabled && !hasMaxEnabled) return [];
    } else if(!ignoreAttributeFilter && !window.displayAttributes.includes(attr.attribute_name)) {
        return [];
    }

    const val = attr.value.trim();
    const unit = getUnit(attr);
    const rangeMatch = val.match(/^(\d+(\.\d+)?)-(\d+(\.\d+)?)$/);

        function formatValue(baseValue) {
        let finalValue = parseFloat(baseValue);
        
        if (moduleModifiers.length > 0 && unit === '%') {
            let factor = 1 + (finalValue / 100); // Convert base value to factor
            
            // Apply each module's modifier only if it's active and not disabled
            moduleModifiers.forEach((modValue, index) => {
                const module = modules[index];
                const isActive = module?.attributes?.some(a => 
                    a.attribute_name === "Item Type" && a.value === "Active"
                );
                if (isActive && module?.isActive !== false) {
                    const modFactor = 1 + (modValue / 100); // Convert module value to factor
                    factor *= modFactor; // Multiply factors
                }
            });
            
            // Convert final factor back to percentage
            finalValue = (factor - 1) * 100;            // Round to 2 decimal places
            finalValue = Math.round(finalValue * 100) / 100;
            
            // Remove decimal point if whole number
            if (finalValue % 1 === 0) {
                finalValue = Math.round(finalValue);
            }
        } else if (moduleModifiers.length > 0) {
            // For non-percentage values, use the original calculation
            moduleModifiers.forEach((modValue, index) => {
                const moduleActive = modules[index]?.isActive !== false;
                finalValue = calculateCombinedValue(finalValue, modValue, unit, moduleActive, attr.attribute_name);
            });
            finalValue = Math.round(finalValue * 100) / 100;
            if (finalValue % 1 === 0) {
                finalValue = Math.round(finalValue);
            }
        }
        
        return `<td class="value-number">${finalValue}</td><td class="value-unit">${unit}</td>`;
    }

    if (rangeMatch) {
        const minVal = rangeMatch[1];
        const maxVal = rangeMatch[3];
        if (attr.attribute_name === "Mining Laser Power") {
            const results = [];
            // Check individually if each should be displayed
            if (ignoreAttributeFilter || window.displayAttributes.includes("Minimum Laser Power")) {
                results.push({ name: "Minimum Laser Power", value: formatValue(minVal) });
            }
            if (ignoreAttributeFilter || window.displayAttributes.includes("Maximum Laser Power")) {
                results.push({ name: "Maximum Laser Power", value: formatValue(maxVal) });
            }
            return results;
        } else {
            return [
                { name: `${attr.attribute_name} Min`, value: formatValue(minVal) },
                { name: `${attr.attribute_name} Max`, value: formatValue(maxVal) }
            ];
        }
    }
    
    return [{ name: attr.attribute_name, value: formatValue(val) }];
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

export function showLaserheadSelection(idx) {
    currentLaserheadIndex = idx;
    document.getElementById('laserheadModal').classList.remove('hidden');
    renderLaserheadCards();
}

export function removeLaserhead(idx) {
    if (idx >= 0 && idx < selectedLaserheads.length) {
        selectedLaserheads.splice(idx, 1);
        renderSelectedLaserheads();
        updateBreakabilityChart();
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
            card.innerHTML = generateLaserheadCardHTML(laserhead);
            
            // Add click handler
            card.addEventListener('click', () => {
                selectLaserhead(card.dataset.id);
            });
            
            container.appendChild(card);
        });
}

function generateLaserheadCardHTML(laserhead) {
    // Process attributes for display - show all attributes in selection cards
    const attrs = laserhead.attributes
        .map(attr => processAttribute(attr, true))
        .flat()
        .filter(Boolean);

    // Sort attributes in display order
    const sortedAttrs = sortAttributes(attrs);

    // Generate table rows
    const rows = sortedAttrs.map(attr => `
        <tr>
            <td class="attr-name">${attr.name}</td>
            ${attr.value}
        </tr>
    `).join('');

    return `
        <div class="card-header">
            <div class="size">S${laserhead.size || 1}</div>
            <div class="name">${cleanLaserName(laserhead.name)}</div>
        </div>
        <table class="attributes-table">
            <tbody>${rows}</tbody>
        </table>
    `;
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
    
    // If currentLaserheadIndex is set (meaning we're replacing), replace at that index
    if (typeof currentLaserheadIndex === 'number' && currentLaserheadIndex >= 0) {
        selectedLaserheads[currentLaserheadIndex] = { ...laserhead, modules: [] };
    } else {
        // Otherwise add to the end
        selectedLaserheads.push({ ...laserhead, modules: [] });
    }
    
    renderSelectedLaserheads();
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
    container.querySelectorAll('.name[contenteditable="true"]').forEach((nameElement, idx) => {
        nameElement.addEventListener('blur', function() {
            const newName = this.textContent.trim();
            if (newName === '') {
                this.textContent = this.dataset.originalName;
            } else {
                selectedLaserheads[idx].customName = newName;
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
    
    container.innerHTML = selectedLaserheads.map((laserhead, idx) => {
        // Get all displayable attributes (from both laserhead and modules)
        const displayableAttributes = new Set(ATTRIBUTE_ORDER_NAMES);
        
        // First process existing laserhead attributes
        const laserAttrs = (laserhead.attributes || [])
            .map(attr => processAttribute(attr, false, laserhead.modules || []))
            .flat()
            .filter(Boolean);
        
        // Track which attributes we've already processed
        const processedAttrs = new Set(laserAttrs.map(attr => attr.name.replace(/ (Min|Max)$/, "")));
        
        // Create virtual attributes for remaining displayable attributes
        const virtualAttrs = Array.from(displayableAttributes)
            .filter(attrName => !processedAttrs.has(attrName))
            .map(attrName => {
                // Check if any module has this attribute
                const hasModuleWithAttr = laserhead.modules?.some(module => 
                    module?.attributes?.some(attr => 
                        attr.attribute_name === attrName && attr.value && attr.value !== '0'
                    )
                );
                
                if (hasModuleWithAttr) {
                    // Create virtual attribute
                    const virtualAttr = {
                        attribute_name: attrName,
                        value: "0",
                        unit: "%"
                    };
                    return processAttribute(virtualAttr, false, laserhead.modules || []);
                }
                return [];
            })
            .flat()
            .filter(Boolean);

        // Combine and sort all attributes
        const attrs = [...laserAttrs, ...virtualAttrs];

        // Sort attributes in display order
        const sortedAttrs = sortAttributes(attrs);

        // Generate table rows
        const rows = sortedAttrs.map(attr => `
            <tr>
                <td>${attr.name}</td>
                ${attr.value}
            </tr>
        `).join('');

        // Generate module slots with a section header
        const moduleSection = `
        <div class="module-section">
            <h3 class="module-section-title">Modules</h3>
            <div class="module-slots">
            ${Array(3).fill(null).map((_, i) => {
            const module = laserhead.modules[i];
            if (module) {
                const moduleAttrs = MODULE_ATTRIBUTE_ORDER
                    .filter(attrName => MODULE_DISPLAY_ATTRIBUTES.has(attrName))
                    .map(attrName => {
                        const attr = module.attributes?.find(a => a.attribute_name === attrName);
                        if (!attr?.value || attr.value.trim() === '' || attr.value === '0') return '';
                        
                        let value = attr.value;
                        const numValue = parseFloat(value);
                        if (!isNaN(numValue)) {
                            const rounded = Math.round(numValue * 100) / 100;
                            value = rounded % 1 === 0 ? Math.round(rounded).toString() : rounded.toString();
                        }
                        
                        const unit = attr.unit || '';
                        return `<tr>
                            <td>${attrName}</td>
                            <td class="value-number">${value}</td>
                            <td class="value-unit">${unit}</td>
                        </tr>`;
                    })
                    .filter(row => row !== '')
                    .join('');

                const hasVisibleAttrs = moduleAttrs !== '';
                return `
                    <div class="module-slot filled">
                        <div class="module-header">
                            <div class="module-slot-info">
                                <span class="module-name ${module.isActive === false ? 'inactive' : ''} ${isActiveModule(module) ? 'clickable' : ''}" ${isActiveModule(module) ? `onclick="toggleModule(${idx}, ${i})"` : ''}>${module.name || ''}</span>
                            </div>
                            <div class="module-actions">
                                <button onclick="showModuleSelection(${idx}, ${i})" class="replace-btn">Replace</button>
                                <button onclick="removeModule(${idx}, ${i})" class="remove-btn">×</button>
                            </div>
                        </div>
                        ${hasVisibleAttrs ? `
                            <table class="module-table ${module.isActive === false ? 'inactive' : ''}">
                                <tbody>${moduleAttrs}</tbody>
                            </table>
                        ` : `
                            <div class="no-attributes">
                                No visible attributes with this filter
                            </div>
                        `}
                    </div>
                `;
            } else {
                return `
                    <div class="module-slot empty">
                        <div class="module-header">
                            <button onclick="showModuleSelection(${idx}, ${i})" class="add-module-btn">Add Module</button>
                        </div>
                    </div>
                `;
            }
        }).join('')}
            </div>
        </div>
        `;

        return `
            <div class="selected-laserhead">
                <div class="laserhead-info">
                    <div class="size">S${laserhead.size || 1}</div>
                    <div class="name" contenteditable="true" data-original-name="${laserhead.customName || cleanLaserName(laserhead.name)}">${laserhead.customName || cleanLaserName(laserhead.name)}</div>
                    <button onclick="replaceLaserhead(${idx})" class="replace-btn">Replace</button>
                    <button onclick="removeLaserhead(${idx})" class="remove-btn">×</button>
                </div>
                <table class="laserhead-table">
                    <tbody>${rows}</tbody>
                </table>
                <div class="module-section">
                        ${Array(3).fill(null).map((_, i) => {
                            const module = laserhead.modules[i];
                            if (module) {
                                const moduleAttrs = MODULE_ATTRIBUTE_ORDER
                                    .filter(attrName => window.moduleDisplayAttributes.has(attrName))
                                    .map(attrName => {
                                        const attr = module.attributes?.find(a => a.attribute_name === attrName);
                                        if (!attr?.value || attr.value.trim() === '' || attr.value === '0') return '';
                                        
                                        let value = attr.value;
                                        const numValue = parseFloat(value);
                                        if (!isNaN(numValue)) {
                                            const rounded = Math.round(numValue * 100) / 100;
                                            value = rounded % 1 === 0 ? Math.round(rounded).toString() : rounded.toString();
                                        }
                                        
                                        const unit = attr.unit || '';
                                        // Grey out values if module is inactive
                                        const inactiveClass = module.isActive === false ? 'inactive-value' : '';
                                        return `<tr class="${inactiveClass}">
                                            <td>${attrName}</td>
                                            <td class="value-number">${value}</td>
                                            <td class="value-unit">${unit}</td>
                                        </tr>`;
                                    })
                                    .filter(row => row !== '')
                                    .join('');

                                const hasVisibleAttrs = moduleAttrs !== '';
                                return `
                                    <div class="module-slot filled">
                                        <div class="module-header">
                                            <div class="module-slot-info">
                                                <span class="module-name ${module.isActive === false ? 'inactive' : ''} ${isActiveModule(module) ? 'clickable' : ''}" ${isActiveModule(module) ? `onclick="toggleModule(${idx}, ${i})"` : ''}>${module.name || ''}</span>
                                            </div>
                                            <div class="module-actions">
                                                <button onclick="showModuleSelection(${idx}, ${i})" class="replace-btn">Replace</button>
                                                <button onclick="removeModule(${idx}, ${i})" class="remove-btn">×</button>
                                            </div>
                                        </div>
                                        ${hasVisibleAttrs ? `
                                            <table class="module-table ${module.isActive === false ? 'inactive' : ''}">
                                                <tbody>${moduleAttrs}</tbody>
                                            </table>
                                        ` : `
                                            <div class="no-attributes">
                                                No visible attributes with this filter
                                            </div>
                                        `}
                                    </div>
                                `;
                            } else {
                                return `
                                    <div class="module-slot empty">
                                        <div class="module-header">
                                            <button onclick="showModuleSelection(${idx}, ${i})" class="add-module-btn">Add Module</button>
                                        </div>
                                    </div>
                                `;
                            }
                        }).join('')}
                </div>
            </div>
        `;
    }).join('');
    
    // Add event handlers for name editing after rendering
    addNameEditingHandlers(container);
}