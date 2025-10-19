const SIZE_ATTRIBUTE = 19;

// Fixed attribute display order exactly matching your JSON
const ATTRIBUTE_ORDER_NAMES = [
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

// Default active attributes to show in selected lasers - modify this array to change default visible attributes
const DEFAULT_ACTIVE_NAMES = [
  "Mining Laser Power",
  "Resistance",
  "Laser Instability"
];

// Units override if missing
const HARDCODED_UNITS = {
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

// Define which module attributes to display and their order
const MODULE_ATTRIBUTE_ORDER = [
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

// Default active module attributes
const DEFAULT_ACTIVE_MODULE_NAMES = [
  "Mining Laser Power",
  "Resistance",
  "Laser Instability",
  "Duration",
  "Uses"
];

// Set of attributes to display (for faster lookup)
const MODULE_DISPLAY_ATTRIBUTES = new Set(DEFAULT_ACTIVE_MODULE_NAMES);


let laserheads = [];
let modules = [];
let filteredLaserheads = [];
let selectedLaserheads = [];
window.displayAttributes = DEFAULT_ACTIVE_NAMES;
let activeAttributes = new Set(DEFAULT_ACTIVE_NAMES);

const modal = document.getElementById("laserheadModal");
const cardsContainer = document.getElementById("laserheadCards");
const selectedContainer = document.getElementById("selectedList");

const displayOptionsModal = document.getElementById("displayOptionsModal");
const displayOptionsCheckboxes = document.getElementById("displayOptionsCheckboxes");

let activeSizes = new Set(["1","2"]); // Only S1/S2 lasers

async function init() {
  try {
    const [laserRes, moduleRes] = await Promise.all([
      fetch("data/laserheads_merged.json"),
      fetch("data/modules_merged.json")
    ]);
    laserheads = await laserRes.json();
    modules = await moduleRes.json();
    
    // Debug the structure of first few laserheads
    console.log('First few laserheads:', laserheads.slice(0, 3).map(lh => ({
      name: lh.name,
      id: lh.id,
      id_gadget: lh.id_gadget
    })));
    
    filteredLaserheads = laserheads;

    const addBtn = document.getElementById("addLaserheadBtn");
    const closeBtn = document.getElementById("closeModalBtn");
    const displayBtn = document.getElementById("displayOptionsBtn");
    const closeDisplayBtn = document.getElementById("closeDisplayOptionsBtn");

    addBtn.addEventListener("click", () => {
      modal.classList.remove("hidden");
      renderLaserheadCards();
    });

    closeBtn.addEventListener("click", () => modal.classList.add("hidden"));

    displayBtn.addEventListener("click", () => {
      displayOptionsModal.classList.remove("hidden");
      renderDisplayOptions();
    });

    closeDisplayBtn.addEventListener("click", () => displayOptionsModal.classList.add("hidden"));

    // Size filter buttons
    document.querySelectorAll(".sizeFilter").forEach(btn => {
      const size = btn.dataset.size;

      // Highlight button if it's initially active
      if (activeSizes.has(size)) {
        btn.classList.add("active");
      }

      btn.addEventListener("click", () => {
        if(activeSizes.has(size)){
          activeSizes.delete(size);
          btn.classList.remove("active");
        } else {
          activeSizes.add(size);
          btn.classList.add("active");
        }
        renderLaserheadCards();
      });
    });

  } catch(err){
    console.error("Failed to load laserheads:", err);
  }

  // Initialize tabs
  initializeTabs();
}


function getUnit(attr) {
  if(attr.unit) return attr.unit;
  return HARDCODED_UNITS[attr.attribute_name] || "";
}

// Convert percentage to factor (e.g., 25% -> 1.25, -10% -> 0.9)
function percentageToFactor(percentage) {
  return 1 + (parseFloat(percentage) / 100);
}

// Convert factor back to percentage (e.g., 1.25 -> 25%, 0.9 -> -10%)
function factorToPercentage(factor) {
  return (factor - 1) * 100;
}

// Calculate combined value with module modifiers
function calculateCombinedValue(baseValue, moduleValue, unit, moduleActive = true) {
  try {
    // If module is inactive, return base value without modification
    if (!moduleActive) return baseValue;
    
    let base = parseFloat(baseValue);
    if (isNaN(base)) return baseValue;
    
    let mod = parseFloat(moduleValue);
    if (isNaN(mod)) return base;
    
    if (unit === '%') {
      // If base is 0 (virtual attribute), treat it as 100% (factor of 1)
      const baseFactor = base === 0 ? 1 : percentageToFactor(base);
      // Convert modifier to factor
      const modFactor = percentageToFactor(mod);
      // Multiply factors and convert back to percentage
      return factorToPercentage(baseFactor * modFactor);
    } else if (unit === 'MW') {
      // For laser power, if base is 0, start with 1 as base value
      const effectiveBase = base === 0 ? 1 : base;
      return effectiveBase * percentageToFactor(mod);
    } else {
      // For other units, if base is 0 and mod is percentage, start with 1 as base
      if (Math.abs(mod) <= 100) {
        const effectiveBase = base === 0 ? 1 : base;
        return effectiveBase * percentageToFactor(mod);
      } else {
        return base + mod;
      }
    }
    
  } catch (err) {
    console.error("Error in calculateCombinedValue:", err);
    return baseValue;
  }
}

// Only split proper positive ranges (e.g., "900-3600"), negative numbers are ignored
function processAttribute(attr, ignoreActive=false, modules=[]){
  // Get module modifiers for this attribute name (even if laser doesn't have it)
  const attrName = attr ? attr.attribute_name : '';
  const moduleModifiers = modules
    .filter(m => m && m.attributes)
    .map(m => m.attributes.find(a => a.attribute_name === attrName))
    .filter(a => a && a.value)
    .map(a => parseFloat(a.value));

  // If no attribute but modules have it, use the first module's attribute as base
  if (!attr && moduleModifiers.length > 0) {
    const moduleAttr = modules[0].attributes.find(a => a.attribute_name === attrName);
    if (moduleAttr) {
      // Create virtual attribute with the first module's value as base
      const baseValue = moduleAttr.value;
      // Remove this first module from modifiers since we're using its value as base
      moduleModifiers.shift();
      
      attr = {
        attribute_name: attrName,
        value: baseValue,
        unit: moduleAttr.unit
      };
    }
  }

  if(!attr || !attr.value) return [];
  // Only include attributes in fixed list
  if(!ATTRIBUTE_ORDER_NAMES.includes(attr.attribute_name)) return [];
  if(!ignoreActive && !activeAttributes.has(attr.attribute_name)) return [];

  const val = attr.value.trim();
  const unit = getUnit(attr);
  const rangeMatch = val.match(/^(\d+(\.\d+)?)-(\d+(\.\d+)?)$/);

  function formatValue(baseValue) {
    let finalValue = parseFloat(baseValue);
    if (moduleModifiers.length > 0) {
      // Apply each active module's modifier
      moduleModifiers.forEach((modValue, index) => {
        const moduleActive = modules[index]?.isActive !== false;
        finalValue = calculateCombinedValue(finalValue, modValue, unit, moduleActive);
      });
      // Round to 2 decimal places for display
      finalValue = Math.round(finalValue * 100) / 100;
      // Remove decimal point if the number is whole
      if (finalValue % 1 === 0) {
        finalValue = Math.round(finalValue);
      }
    }
    return `<td class="value-number">${finalValue}</td><td class="value-unit">${unit}</td>`;
  }

  if (rangeMatch) {
    const minVal = rangeMatch[1];
    const maxVal = rangeMatch[3];
    return [
      { name: `${attr.attribute_name} Min`, value: formatValue(minVal) },
      { name: `${attr.attribute_name} Max`, value: formatValue(maxVal) }
    ];
  }
  
  return [{ name: attr.attribute_name, value: formatValue(val) }];
}

function sortAttributes(attrs){
  return attrs.sort((a,b)=>{
    const nameA = a.name.replace(/\s(Min|Max)$/, "");
    const nameB = b.name.replace(/\s(Min|Max)$/, "");

    const idxA = ATTRIBUTE_ORDER_NAMES.indexOf(nameA);
    const idxB = ATTRIBUTE_ORDER_NAMES.indexOf(nameB);

    const orderA = idxA >= 0 ? idxA : 999;
    const orderB = idxB >= 0 ? idxB : 999;

    // Min before Max
    const suffixA = a.name.endsWith("Min") ? 0 : a.name.endsWith("Max") ? 1 : 0;
    const suffixB = b.name.endsWith("Min") ? 0 : b.name.endsWith("Max") ? 1 : 0;

    return orderA - orderB || suffixA - suffixB;
  });
}

function equalizeCardDimensions(cards) {
  // Reset any previous fixed dimensions
  cards.forEach(c => {
    c.style.width = 'fit-content';
    c.style.height = 'auto';
  });

  // Let the browser layout settle
  requestAnimationFrame(() => {
    let maxWidth = 0;
    let maxHeight = 0;

    // First pass: measure natural sizes
    cards.forEach(c => {
      const rect = c.getBoundingClientRect();
      maxWidth = Math.max(maxWidth, rect.width);
      maxHeight = Math.max(maxHeight, rect.height);
    });

    // Second pass: apply the larger dimensions only if significantly different
    cards.forEach(c => {
      const rect = c.getBoundingClientRect();
      if (maxWidth - rect.width > 5) { // Only adjust if difference is more than 5px
        c.style.width = maxWidth + 'px';
      }
      if (maxHeight - rect.height > 5) {
        c.style.height = maxHeight + 'px';
      }
    });
  });
}

function cleanLaserName(name){
  return name.replace(/\s*\(S\d\)/, "")
             .replace(/Mining Laser ?/i, "");  // Remove "Mining Laser" text
}

// Add a laserhead to the selected list
function selectLaserhead(id) {
  console.log('selectLaserhead called with id:', id);
  if (!id) {
    console.log('No id provided');
    return;
  }
  
  // Convert id to number for comparison since dataset values are always strings
  const numericId = parseInt(id, 10);
  console.log('Looking for laserhead with numeric id:', numericId);
  
  // Debug available IDs before searching
  console.log('All available laserhead IDs:', filteredLaserheads.map(lh => ({
    id: lh.id,
    id_gadget: lh.id_gadget,
    name: lh.name
  })));
  
  const laserhead = filteredLaserheads.find(lh => {
    // First try exact matches with the numeric ID
    if (lh.id_gadget === numericId || lh.id === numericId) {
      console.log('Found exact numeric match:', lh.name);
      return true;
    }
    
    // Then try string comparisons if needed
    const stringMatch = lh.id_gadget?.toString() === id || lh.id?.toString() === id;
    if (stringMatch) {
      console.log('Found string match:', lh.name);
      return true;
    }
    
    return false;
  });
  
  console.log('Found laserhead:', laserhead);
  if (!laserhead) {
    console.log('No laserhead found with id:', id);
    // Debug info to see what we're working with
    console.log('Available IDs:', filteredLaserheads.map(lh => ({
      id: lh.id,
      id_gadget: lh.id_gadget,
      name: lh.name
    })));
    return;
  }
  
  selectedLaserheads.push({ ...laserhead, modules: [] });
  console.log('Added to selectedLaserheads, now:', selectedLaserheads.length);
  renderSelectedLaserheads();
  if (modal) modal.classList.add("hidden");
}

// Render laser selection modal (always show all attributes in fixed order)
// Render all laserhead cards in the modal
function renderLaserheadCards() {
  cardsContainer.innerHTML = "";
  const displayedLaserheads = [];
  
  // Helper function to process Mining Laser Power attribute
  function processLaserPower(attr) {
    if (!attr || !attr.value) return null;
    const val = attr.value.trim();
    const unit = attr.unit || "MW";
    const rangeMatch = val.match(/^(\d+)-(\d+)$/);
    
    // Helper function to format number
    function formatNumber(num) {
      const numValue = parseFloat(num);
      if (isNaN(numValue)) return num;
      const rounded = Math.round(numValue * 100) / 100;
      return rounded % 1 === 0 ? Math.round(rounded).toString() : rounded.toString();
    }
    
    return rangeMatch ? {
      type: "range",
      min: formatNumber(rangeMatch[1]),
      max: formatNumber(rangeMatch[2]),
      unit: unit
    } : {
      type: "single",
      value: formatNumber(val),
      unit: unit
    };
  }
  
  // Helper function to process normal attributes using processAttribute
  function processNormalAttribute(attr) {
    if (!attr) return null;
    const processed = processAttribute(attr, true);
    if (!processed || processed.length === 0) return null;
    
    const match = processed[0].value.match(/<td class="value-number">([^<]+)<\/td><td class="value-unit">([^<]+)<\/td>/);
    if (!match) return null;
    
    // Format number value
    let value = match[1];
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      const rounded = Math.round(numValue * 100) / 100;
      value = rounded % 1 === 0 ? Math.round(rounded).toString() : rounded.toString();
    }
    
    return {
      value: value,
      unit: match[2]
    };
  }
  
  // Helper function to render a single attribute row
  function renderAttributeRow(name, value, unit) {
    // Split the number into integer and decimal parts
    let [integerPart, decimalPart] = value.toString().split('.');
    // If there's no decimal part, add an empty one for alignment
    decimalPart = decimalPart || '0';
    return `<tr>
      <td class="attr-name">${name}</td>
      <td class="value-number" data-value="${value}">
        <span class="integer-part">${integerPart}</span><span class="decimal-separator">.</span><span class="decimal-part">${decimalPart}</span>
      </td>
      <td class="value-unit">${unit}</td>
    </tr>`;
  }
  
  // Helper function to build all table rows from attributes
  function buildTableRows(attrMap) {
    if (!attrMap) return [];
    const rows = [];
    
    ATTRIBUTE_ORDER_NAMES.forEach(attrName => {
      if (attrName === "Mining Laser Power") {
        const power = attrMap.get(attrName);
        if (!power) return;
        
        if (power.type === "range") {
          if (power.max && power.unit) {
            rows.push(renderAttributeRow("Maximum Laser Power", power.max, power.unit));
          }
          if (power.min && power.unit) {
            rows.push(renderAttributeRow("Minimum Laser Power", power.min, power.unit));
          }
        } else if (power.value && power.unit) {
          rows.push(renderAttributeRow("Mining Laser Power", power.value, power.unit));
        }
      } else {
        const attr = attrMap.get(attrName);
        if (attr && attr.value && attr.unit) {
          rows.push(renderAttributeRow(attrName, attr.value, attr.unit));
        }
      }
    });
    
    return rows;
  }
  
    // Process each laserhead
    for (const lh of filteredLaserheads) {
      // Skip invalid laserheads
      if (!lh || !lh.attributes) continue;
      
      const size = lh.attributes.find(a => a?.id_category_attribute === SIZE_ATTRIBUTE)?.value || "-";
      
      if (size !== "1" && size !== "2") continue;
      if (activeSizes.size > 0 && !activeSizes.has(size)) continue;
      
      const attrMap = new Map();
      
      // Process attributes
      for (const attr of lh.attributes) {
        if (!attr || !attr.attribute_name || !ATTRIBUTE_ORDER_NAMES.includes(attr.attribute_name)) continue;
        
        // Ensure we have a unit (use hardcoded if available)
        const unit = HARDCODED_UNITS[attr.attribute_name] || attr.unit || '';      if (attr.attribute_name === "Mining Laser Power") {
        const powerAttr = processLaserPower(attr);
        if (powerAttr) {
          attrMap.set(attr.attribute_name, powerAttr);
        }
      } else {
        const processed = processNormalAttribute(attr);
        if (processed) {
          attrMap.set(attr.attribute_name, processed);
        }
      }
    }
    
    const tableRows = buildTableRows(attrMap);
    
    // Create the card element directly
    const card = document.createElement('div');
    card.className = 'laserhead-card';
    card.dataset.size = size;
    
    // Debug the available IDs
    console.log('Creating card for laserhead:', {
      name: lh.name,
      id: lh.id,
      id_gadget: lh.id_gadget
    });
    
    // Store the ID, preferring id_gadget if available
    const cardId = lh.id_gadget || lh.id;
    if (cardId !== undefined && cardId !== null) {
      // Store as a string since dataset values are always strings
      card.dataset.id = cardId.toString();
      console.log('Card created with ID:', card.dataset.id);
    } else {
      console.log('Warning: No valid ID for laserhead:', lh.name);
    }
    
    card.innerHTML = `
      <div class="card-header">
        <span class="size">S${size}</span>
        <span class="name">${cleanLaserName(lh.name || '')}</span>
      </div>
      <table class="attributes-table">
        ${tableRows.join('')}
      </table>
    `;
    
    try {
      // Add click event listener to the card
      card.addEventListener('click', (e) => {
        console.log('Card clicked, id:', card.dataset.id);
        e.preventDefault();
        e.stopPropagation();
        selectLaserhead(card.dataset.id);
      });
      
      cardsContainer.appendChild(card);
      displayedLaserheads.push(card);
    } catch (err) {
      console.error('Error creating laserhead card:', err);
    }
  }
  
  // Equalize card dimensions after all cards are rendered
  if (displayedLaserheads.length > 0) {
    requestAnimationFrame(() => {
      try {
        equalizeCardDimensions(displayedLaserheads);
      } catch (err) {
        console.error('Error equalizing card dimensions:', err);
      }
    });
  }
}

// Render selected lasers with activeAttributes filtering
// Render selected laserheads with their modules and attributes
// Render selected lasers with activeAttributes filtering
function renderSelectedLaserheads() {
  selectedContainer.innerHTML = "";
  const displayAttributes = window.displayAttributes.length > 0 ? window.displayAttributes : [];

  for (const [idx, lh] of selectedLaserheads.entries()) {
    if (!lh || !lh.attributes) continue;
    
    const size = lh.attributes.find(a => a?.id_category_attribute === SIZE_ATTRIBUTE)?.value || "-";
    const attrMap = new Map();
    
    // Collect all possible attributes we might need to display
    const allAttributes = new Map(); // Map to store attribute name -> unit
    
    // First add all standard attributes from ATTRIBUTE_ORDER_NAMES
    for (const attrName of ATTRIBUTE_ORDER_NAMES) {
      allAttributes.set(attrName, HARDCODED_UNITS[attrName] || '');
    }
    
    // Then add any additional attributes from modules
    if (Array.isArray(lh.modules)) {
      for (const module of lh.modules) {
        if (!module?.attributes) continue;
        for (const attr of module.attributes) {
          if (attr?.attribute_name && ATTRIBUTE_ORDER_NAMES.includes(attr.attribute_name)) {
            // Store the unit for this attribute if not already set
            if (!allAttributes.has(attr.attribute_name)) {
              allAttributes.set(attr.attribute_name, attr.unit || '');
            }
          }
        }
      }
    }

    // First pass: process all attributes (including virtual ones for missing attributes)
    const processableAttrs = [...lh.attributes];
    
    // Add virtual attributes for all missing attributes from ATTRIBUTE_ORDER_NAMES
    for (const attrName of ATTRIBUTE_ORDER_NAMES) {
      if (!processableAttrs.some(a => a?.attribute_name === attrName)) {
        // Get the unit from hardcoded units or module unit
        const unit = HARDCODED_UNITS[attrName] || allAttributes.get(attrName) || '';
        // Create virtual attribute with base value of 0
        processableAttrs.push({
          attribute_name: attrName,
          value: '0',  // Base value of 0
          unit: unit
        });
      }
    }

    // Now process all attributes (both real and virtual)
    for (const attr of processableAttrs) {
      if (!attr || !attr.attribute_name) continue;
      
      console.log('Processing attribute:', {
        name: attr.attribute_name,
        value: attr.value,
        unit: attr.unit,
        isVirtual: attr.value === '0'
      });
      
      if (attr.attribute_name === "Mining Laser Power") {
        const val = attr.value?.trim();
        if (!val) continue;
        
        const unit = attr.unit || "MW";
        const rangeMatch = val.match(/^(\d+)-(\d+)$/);
        
        // Get module modifiers for Mining Laser Power
        const moduleModifiers = (lh.modules || [])
          .filter(m => m && m.attributes)
          .map(m => m.attributes.find(a => a.attribute_name === "Mining Laser Power"))
          .filter(a => a && a.value)
          .map(a => parseFloat(a.value) - 100); // Subtract 100 from the module value
          
        function calculateFinalValue(baseVal) {
          try {
            let finalVal = parseFloat(baseVal);
            for (const modVal of moduleModifiers) {
              if (!isNaN(modVal)) {
                finalVal *= (1 + modVal/100);
              }
            }
            const rounded = Math.round(finalVal * 100) / 100;
            // Remove decimal point if the number is whole
            return rounded % 1 === 0 ? Math.round(rounded) : rounded;
          } catch (err) {
            console.error('Error calculating value:', err);
            return baseVal;
          }
        }
        
        if (rangeMatch) {
          const [_, min, max] = rangeMatch;
          attrMap.set("Mining Laser Power", {
            min: calculateFinalValue(min),
            max: calculateFinalValue(max),
            unit: unit
          });
        } else {
          attrMap.set("Mining Laser Power", {
            value: calculateFinalValue(val),
            unit: unit
          });
        }
      } else {
        // Process the attribute (including any module modifiers)
        const processed = processAttribute(attr, true, lh.modules || []);
        for (const p of processed) {
          if (!p || !p.value) continue;
          
          const match = p.value.match(/<td class="value-number">([^<]+)<\/td><td class="value-unit">([^<]+)<\/td>/);
          if (match) {
            attrMap.set(p.name, {
              value: match[1],
              unit: match[2]
            });
          }
        }
      }
    }

    function renderAttributeRow(name, value, unit) {
      // Format number if it's numeric
      let displayValue = value;
      const numValue = parseFloat(value);
      if (!isNaN(numValue)) {
        const rounded = Math.round(numValue * 100) / 100;
        displayValue = rounded % 1 === 0 ? Math.round(rounded) : rounded;
      }
      return `<tr><td class="attr-name">${name}</td><td class="value-number">${displayValue}</td><td class="value-unit">${unit}</td></tr>`;
    }
    
    // Build table rows in display order
    function buildTableRows(attrMap, displayAttributes) {
      const rows = [];
      
      // Always include all attributes in ATTRIBUTE_ORDER_NAMES
      for (const attrName of ATTRIBUTE_ORDER_NAMES) {
        // Only show if it's in displayAttributes
        if (!displayAttributes.includes(attrName)) continue;
        
        if (attrName === "Mining Laser Power") {
          const power = attrMap.get("Mining Laser Power");
          if (power) {
            if ("min" in power) {
              rows.push(renderAttributeRow("Maximum Laser Power", power.max, power.unit));
              rows.push(renderAttributeRow("Minimum Laser Power", power.min, power.unit));
            } else {
              rows.push(renderAttributeRow("Mining Laser Power", power.value, power.unit));
            }
          } else {
            // Process virtual mining laser power with modules
            const processed = processAttribute(
              {
                attribute_name: "Mining Laser Power",
                value: '0',
                unit: HARDCODED_UNITS["Mining Laser Power"]
              },
              true,
              lh.modules || []
            );
            if (processed && processed[0]) {
              const match = processed[0].value.match(/<td class="value-number">([^<]+)<\/td><td class="value-unit">([^<]+)<\/td>/);
              if (match) {
                // Only add the row if the value is not 0 for MW
                const value = parseFloat(match[1]);
                const unit = match[2];
                if (!(value === 0 && unit === 'MW')) {
                  rows.push(renderAttributeRow("Mining Laser Power", match[1], match[2]));
                }
              }
            }
          }
        } else {
          const attr = attrMap.get(attrName);
          if (attr) {
            rows.push(renderAttributeRow(attrName, attr.value, attr.unit));
          } else {
            // Process virtual attribute with modules
            const processed = processAttribute(
              {
                attribute_name: attrName,
                value: '0',
                unit: HARDCODED_UNITS[attrName]
              },
              true,
              lh.modules || []
            );
            if (processed && processed[0]) {
              const match = processed[0].value.match(/<td class="value-number">([^<]+)<\/td><td class="value-unit">([^<]+)<\/td>/);
              if (match) {
                // Only add the row if the value is not 0%
                const value = parseFloat(match[1]);
                const unit = match[2];
                if (!(value === 0 && unit === '%')) {
                  rows.push(renderAttributeRow(attrName, match[1], match[2]));
                }
              }
            }
          }
        }
      }
      
      return rows;
    }
    
    // Generate module list HTML
    function generateModulesHtml(laserhead, idx) {
      if (!laserhead || !laserhead.attributes) return '';
      
      // Generate module slots based on the laserhead's Module Slots attribute
      const moduleSlotAttr = laserhead.attributes.find(a => a.attribute_name === "Module Slots");
      const moduleSlots = parseInt(moduleSlotAttr?.value || "0", 10);
      
      // Create array of module slots with existing modules or empty slots
      const slots = Array.from({ length: moduleSlots }, (_, i) => {
        const module = (laserhead.modules || [])[i] || null;
        if (!module) return `
          <div class="module-slot empty">
            <div class="module-slot-header">
              <span class="slot-number">Slot ${i + 1}</span>
            </div>
            <button onclick="showModuleSelection(${idx}, ${i})" class="add-module-btn">Add Module</button>
          </div>
        `;
        
        // Process module attributes
        const moduleAttrs = MODULE_ATTRIBUTE_ORDER
          .filter(attrName => MODULE_DISPLAY_ATTRIBUTES.has(attrName))
          .map(attrName => {
            const attr = module.attributes?.find(a => a.attribute_name === attrName);
            // Only include attribute if it exists, has a value, and the value is not empty or zero
            if (!attr?.value || attr.value.trim() === '' || attr.value === '0') return '';
            
            // Format number values
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
        
        // If there are no visible attributes after filtering, show a message
        const hasVisibleAttrs = moduleAttrs !== '';
        return `
          <div class="module-slot filled">
            <div class="module-header">
              <div class="module-slot-info">
                <span class="slot-number">Slot ${i + 1}</span>
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
      });
      
      console.log('Generated slots:', slots);
      const html = `
        <div class="modules">
          ${slots.join('')}
        </div>
      `;
      console.log('Generated modules HTML:', html);
      return html;
    }
    
    // Generate card HTML
    const tableRows = buildTableRows(attrMap, displayAttributes);
    console.log('Generating modules HTML for laserhead:', lh.name);
    console.log('Laserhead:', lh);
    const modulesHtml = generateModulesHtml(lh, idx);
    console.log('Generated modules HTML:', modulesHtml);
    
    const html = `
      <div class="selected-laserhead">
        <div class="laserhead-info">
          <span class="size">S${size}</span>
          <span class="name">${cleanLaserName(lh.name || '')}</span>
          <button onclick="showLaserheadSelection(${idx})" class="replace-btn">Replace</button>
          <button onclick="removeLaserhead(${idx})" class="remove-btn">×</button>
        </div>
        <table>${tableRows.join('')}</table>
        ${modulesHtml}
      </div>
    `;
    
    selectedContainer.insertAdjacentHTML('beforeend', html);
  }
}

// Initialize displayAttributes with default attributes
window.displayAttributes = DEFAULT_ACTIVE_NAMES;
window.moduleDisplayAttributes = new Set(DEFAULT_ACTIVE_MODULE_NAMES);

// Function to render the display options modal
function renderDisplayOptions() {
  // Render laser attributes
  const laserContainer = document.getElementById("displayOptionsCheckboxes");
  if(laserContainer) {
    laserContainer.innerHTML = ""; // clear previous
    ATTRIBUTE_ORDER_NAMES.forEach(attrName => {
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "displayOptionCheckbox";
      checkbox.value = attrName;
      checkbox.checked = window.displayAttributes.includes(attrName);

      checkbox.addEventListener("change", () => {
        const checked = Array.from(document.querySelectorAll(".displayOptionCheckbox:checked"))
                             .map(c => c.value);
        window.displayAttributes = checked;
        renderSelectedLaserheads(); // update selected cards immediately
      });

      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(attrName));
      laserContainer.appendChild(label);
      laserContainer.appendChild(document.createElement("br"));
    });
  }

  // Render module attributes
  const moduleContainer = document.getElementById("moduleOptionsCheckboxes");
  if(moduleContainer) {
    moduleContainer.innerHTML = ""; // clear previous
    MODULE_ATTRIBUTE_ORDER.forEach(attrName => {
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "moduleOptionCheckbox";
      checkbox.value = attrName;
      checkbox.checked = window.moduleDisplayAttributes.has(attrName);

      checkbox.addEventListener("change", () => {
        const checked = new Set(
          Array.from(document.querySelectorAll(".moduleOptionCheckbox:checked"))
               .map(c => c.value)
        );
        window.moduleDisplayAttributes = checked;
        MODULE_DISPLAY_ATTRIBUTES.clear();
        checked.forEach(attr => MODULE_DISPLAY_ATTRIBUTES.add(attr));
        renderSelectedLaserheads(); // update selected cards immediately
      });

      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(attrName));
      moduleContainer.appendChild(label);
      moduleContainer.appendChild(document.createElement("br"));
    });
  }
}

// Module selection functionality
const moduleModal = document.getElementById("moduleModal");
const moduleCards = document.getElementById("moduleCards");
const closeModuleModalBtn = document.getElementById("closeModuleModalBtn");

if (closeModuleModalBtn) {
  closeModuleModalBtn.addEventListener("click", () => {
    if (moduleModal) moduleModal.classList.add("hidden");
  });
}

function showModuleSelection(laserIdx, slotIdx) {
  if (!moduleCards) return;
  moduleCards.innerHTML = "";
  
  // Check if the laser exists and has available slots
  const laser = selectedLaserheads[laserIdx];
  if (!laser) return;
  
  const moduleSlots = parseInt(laser.attributes.find(a => a.attribute_name === "Module Slots")?.value || "0", 10);
  if (slotIdx >= moduleSlots) {
    console.error('Invalid slot index:', slotIdx);
    return;
  }
  
  // Create all cards first
  if (!Array.isArray(modules)) return;
  
  const allCards = modules.map(module => {
    if (!module) return null;
    
    const card = document.createElement("div");
    card.className = "laser-card";
    
    // Create a map of all attributes for selection view
    const attrMap = new Map();
    if (Array.isArray(module.attributes)) {
      for (const attr of module.attributes) {
        if (attr?.value && attr.attribute_name && MODULE_ATTRIBUTE_ORDER.includes(attr.attribute_name)) {
          // Format number value before storing
          let value = attr.value;
          const numValue = parseFloat(value);
          if (!isNaN(numValue)) {
            const rounded = Math.round(numValue * 100) / 100;
            value = rounded % 1 === 0 ? Math.round(rounded).toString() : rounded.toString();
          }
          attrMap.set(attr.attribute_name, {...attr, value});
        }
      }
    }
    
    // Generate rows in specified order
    const moduleAttrs = MODULE_ATTRIBUTE_ORDER
      .map(attrName => {
        const attr = attrMap.get(attrName);
        if (!attr) return '';
        const unit = attr.unit || '';
        return `<tr>
          <td>${attrName}</td>
          <td class="value-number" data-value="${attr.value}">${attr.value}</td>
          <td class="value-unit">${unit}</td>
        </tr>`;
      })
      .filter(row => row !== '')
      .join('');

    // Check if it's an active module (has Duration or Uses)
    const isActive = module.attributes?.some(attr => 
      attr && (attr.attribute_name === "Duration" || attr.attribute_name === "Uses") && attr.value
    ) || false;

    card.innerHTML = `
      <h3>${module.name || ''}${isActive ? ' (Active)' : ''}</h3>
      <table><tbody>${moduleAttrs}</tbody></table>
    `;

    card.addEventListener("click", () => {
      // Add module to the laser's slot
      const laser = selectedLaserheads[laserIdx];
      if (!laser?.modules) {
        if (laser) laser.modules = [];
        else return;
      }
      // Ensure we have an array of the correct size
      while (laser.modules.length <= slotIdx) {
        laser.modules.push(null);
      }
      laser.modules[slotIdx] = { ...module };
      
      // Update display
      renderSelectedLaserheads();
      if (moduleModal) moduleModal.classList.add("hidden");
    });

    return card;
  }).filter(card => card !== null);
  
  // Add all cards to the container
  for (const card of allCards) {
    if (card) moduleCards.appendChild(card);
  }
  
  // Let the layout settle, then measure for minimum viable width
  requestAnimationFrame(() => {
    try {
      const cards = Array.from(moduleCards?.children || []);
      // Reset any existing width to get true content width
      cards.forEach(card => {
        if (card) card.style.width = 'auto';
      });
      
      // Find the content width for each card
      const cardWidths = cards.map(card => {
        if (!card) return 0;
        
        const table = card.querySelector('table');
        const rows = table ? Array.from(table.querySelectorAll('tr')) : [];
        
        // Measure each row separately
        const rowWidths = rows.map(row => {
          if (!row) return 0;
          const label = row.querySelector('td:first-child');
          const value = row.querySelector('td:last-child');
          return (label?.offsetWidth || 0) + (value?.offsetWidth || 0);
        });
        
        const headerWidth = card.querySelector('h3')?.offsetWidth || 0;
        const maxRowWidth = Math.max(0, ...rowWidths);
        return Math.max(maxRowWidth, headerWidth);
      });
      
      // Find the minimum width needed
      const maxWidth = Math.max(0, ...cardWidths);
      // Add minimal padding
      const optimalWidth = maxWidth + 16; // 8px padding on each side
      cards.forEach(card => {
        if (card) card.style.width = optimalWidth + 'px';
      });
    } catch (err) {
      console.error('Error measuring module cards:', err);
    }
  });

  if (moduleModal) moduleModal.classList.remove("hidden");
}

// Initialize displayAttributes with default attributes
window.displayAttributes = DEFAULT_ACTIVE_NAMES;
window.moduleDisplayAttributes = new Set(DEFAULT_ACTIVE_MODULE_NAMES);

// Function to check if a module is of type "Active"
function isActiveModule(module) {
  return module?.attributes?.some(attr => 
    attr.attribute_name === "Item Type" && attr.value === "Active"
  );
}

// Function to toggle module active state
function toggleModule(laserIdx, slotIdx) {
  const laser = selectedLaserheads[laserIdx];
  if (laser && Array.isArray(laser.modules) && laser.modules[slotIdx]) {
    const module = laser.modules[slotIdx];
    // Only allow toggle for Active type modules
    if (isActiveModule(module)) {
      // Initialize isActive if it doesn't exist, default to true
      if (typeof module.isActive === 'undefined') {
        module.isActive = true;
      }
      // Toggle the active state
      module.isActive = !module.isActive;
      renderSelectedLaserheads();
    }
  }
}

// Functions for removing laserheads and modules
function removeLaserhead(idx) {
  selectedLaserheads.splice(idx, 1);
  renderSelectedLaserheads();
}

function removeModule(laserIdx, slotIdx) {
  const laser = selectedLaserheads[laserIdx];
  if (laser && Array.isArray(laser.modules) && laser.modules[slotIdx]) {
    laser.modules[slotIdx] = null;
    // Clean up any trailing null values
    while (laser.modules.length > 0 && laser.modules[laser.modules.length - 1] === null) {
      laser.modules.pop();
    }
    renderSelectedLaserheads();
  }
}

// Make these functions globally available
window.removeLaserhead = removeLaserhead;
window.removeModule = removeModule;
window.toggleModule = toggleModule;

// Initialize tab functionality
function initializeTabs() {
  const tabs = document.querySelectorAll('.tab-button');
  const contents = document.querySelectorAll('.tab-content');

  // Hide all tab contents initially except the first one
  contents.forEach((content, index) => {
    if (index === 0) {
      content.classList.remove('hidden');
    } else {
      content.classList.add('hidden');
    }
  });

  // Set the first tab as active
  if (tabs.length > 0) {
    tabs[0].classList.add('active');
  }

  // Add click handlers to all tabs
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active class from all tabs
      tabs.forEach(t => t.classList.remove('active'));
      
      // Add active class to clicked tab
      tab.classList.add('active');
      
      // Hide all tab contents
      contents.forEach(content => content.classList.add('hidden'));
      
      // Show the corresponding content
      const targetId = tab.getAttribute('data-tab');
      document.getElementById(targetId).classList.remove('hidden');
    });
  });
}
window.removeModule = removeModule;
window.showModuleSelection = showModuleSelection;

function showLaserheadSelection(idx) {
  currentLaserheadIndex = idx;
  document.getElementById('laserheadModal').classList.remove('hidden');
  renderLaserheadCards();
}
window.showLaserheadSelection = showLaserheadSelection;

// Start initialization when the page loads
document.addEventListener('DOMContentLoaded', () => {
  init();
});
