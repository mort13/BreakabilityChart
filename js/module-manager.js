import { 
    miningData, 
    MODULE_ATTRIBUTE_ORDER, 
    MODULE_DISPLAY_ATTRIBUTES,
    ATTRIBUTE_ORDER_NAMES,
    DEFAULT_ACTIVE_NAMES,
    DEFAULT_ACTIVE_MODULE_NAMES,
    calculateCombinedValue,
    getUnit
} from './data-manager.js';
import { renderSelectedLaserheads, selectedLaserheads } from './laserhead-manager.js';

let currentLaserheadIndex = null;
let currentModuleSlot = null;

export function setupModuleUI() {
    setupModuleModal();
}

export function showModuleSelection(laserIdx, slotIdx) {
    currentLaserheadIndex = laserIdx;
    currentModuleSlot = slotIdx;
    document.getElementById('moduleModal').classList.remove('hidden');
    renderModuleCards();
}

export function removeModule(laserIdx, moduleIdx) {
    const laserhead = selectedLaserheads[laserIdx];
    if (laserhead && Array.isArray(laserhead.modules)) {
        // Remove the module
        laserhead.modules[moduleIdx] = null;
        
        // Clean up null entries at the end of the array
        while (laserhead.modules.length > 0 && laserhead.modules[laserhead.modules.length - 1] === null) {
            laserhead.modules.pop();
        }
        
        // Update the display
        renderSelectedLaserheads();
        updateBreakabilityChart();
    }
}

export function toggleModule(laserIdx, moduleIdx) {
    const slots = document.getElementById('laserSlots');
    const laserSlot = slots.children[laserIdx];
    if (!laserSlot) return;

    const moduleSlots = laserSlot.querySelector('.module-slots');
    const moduleSlot = moduleSlots.children[moduleIdx];
    if (!moduleSlot) return;

    const moduleNameSpan = moduleSlot.querySelector('.module-name');
    const moduleName = moduleNameSpan.textContent;
    const module = miningData.modules.find(m => m.name === moduleName);

    if (!isActiveModule(module)) return;

    const isCurrentlyActive = !moduleNameSpan.classList.contains('inactive');
    moduleNameSpan.classList.toggle('inactive', isCurrentlyActive);

    const moduleTable = moduleSlot.querySelector('.module-table');
    if (moduleTable) {
        moduleTable.classList.toggle('inactive', isCurrentlyActive);
    }

    updateBreakabilityChart();
}

export function isActiveModule(module) {
    return module?.attributes?.some(attr => 
        attr.attribute_name === "Item Type" && 
        attr.value === "Active"
    ) ?? false;
}

export function renderDisplayOptions() {
    const laserheadCheckboxes = document.getElementById('displayOptionsCheckboxes');
    const moduleCheckboxes = document.getElementById('moduleOptionsCheckboxes');

    if (laserheadCheckboxes) {
        laserheadCheckboxes.innerHTML = ATTRIBUTE_ORDER_NAMES.map(attrName => `
            <div>
                <input type="checkbox" 
                       id="attr_${attrName}" 
                       ${window.displayAttributes.includes(attrName) ? 'checked' : ''}>
                <label for="attr_${attrName}">${attrName}</label>
            </div>
        `).join('');

        const checkboxes = laserheadCheckboxes.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                const checked = Array.from(checkboxes)
                    .filter(cb => cb.checked)
                    .map(cb => cb.id.replace('attr_', ''));
                window.displayAttributes = checked;
                renderSelectedLaserheads();
            });
        });
    }

    if (moduleCheckboxes) {
        moduleCheckboxes.innerHTML = MODULE_ATTRIBUTE_ORDER.map(attrName => `
            <div>
                <input type="checkbox" 
                       id="mod_${attrName}" 
                       ${window.moduleDisplayAttributes.has(attrName) ? 'checked' : ''}>
                <label for="mod_${attrName}">${attrName}</label>
            </div>
        `).join('');

        const checkboxes = moduleCheckboxes.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                const checked = new Set(
                    Array.from(checkboxes)
                        .filter(cb => cb.checked)
                        .map(cb => cb.id.replace('mod_', ''))
                );
                window.moduleDisplayAttributes = checked;
                renderSelectedLaserheads();
            });
        });
    }
}

function setupModuleModal() {
    const modal = document.getElementById("moduleModal");
    
    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.add('hidden');
        }
    });
}

export function renderModuleCards() {
    const container = document.getElementById('moduleCards');
    container.innerHTML = '';
    
    miningData.modules.forEach(module => {
        const card = document.createElement('div');
        card.className = 'laser-card';  // Use same styling as laser cards
        card.dataset.id = module.id;
        
        // Generate card HTML
        card.innerHTML = generateModuleCardHTML(module);
        
        // Add click handler
        card.addEventListener('click', () => {
            selectModule(card.dataset.id);
        });
        
        container.appendChild(card);
    });
}

function generateModuleCardHTML(module) {
    const moduleAttrs = MODULE_ATTRIBUTE_ORDER
        .map(attrName => {
            const attr = module.attributes?.find(a => a.attribute_name === attrName);
            if (!attr?.value || attr.value.trim() === '' || attr.value === '0') return '';
            
            let value = attr.value;
            const numValue = parseFloat(value);
            if (!isNaN(numValue)) {
                const rounded = Math.round(numValue * 100) / 100;
                value = rounded % 1 === 0 ? Math.round(rounded).toString() : rounded.toString();
            }
            
            const unit = getUnit(attr) || attr.unit || '';
            return `<tr>
                <td class="attr-name">${attrName}</td>
                <td class="value-number">${value}</td>
                <td class="value-unit">${unit}</td>
            </tr>`;
        })
        .filter(row => row !== '')
        .join('');

    return `
        <div class="card-header">
            <div class="name">${module.name}</div>
        </div>
        <table class="attributes-table">
            <tbody>${moduleAttrs}</tbody>
        </table>
    `;
}

function generateEmptyModuleSlotHTML(slotIdx) {
    return `
        <div class="module-slot empty">
            <div class="module-header">
                <button onclick="showModuleSelection(${currentLaserheadIndex}, ${slotIdx})" class="add-module-btn">Add Module</button>
            </div>
        </div>
    `;
}

function selectModule(id) {
    const module = miningData.modules.find(m => m.id === parseInt(id));
    if (!module) return;

    // Add module to the selected laserhead's modules
    if (typeof currentLaserheadIndex === 'number' && typeof currentModuleSlot === 'number') {
        const laserhead = selectedLaserheads[currentLaserheadIndex];
        if (laserhead) {
            laserhead.modules[currentModuleSlot] = { ...module };
            renderSelectedLaserheads();
        }
    }

    // Close modal
    document.getElementById("moduleModal")?.classList.add("hidden");
    if (!module) return;
    
    const modal = document.getElementById("moduleModal");
    modal.classList.add('hidden');
    
    // Update the selected module in the slot
    // ... (implement the selection logic)
    
    updateBreakabilityChart();
}

function updateBreakabilityChart() {
    // Trigger chart update
    // This will be handled by the chart manager
}