import { miningData } from './data-manager.js';
import { updateBreakabilityChart, updateMarker } from './chart-manager.js';

export let selectedGadget = null;

export function setupGadgetUI() {
    const select = document.getElementById('gadgetSelect');
    if (!select) return;

    // Get all gadgets with resistance values
    const gadgetsWithResistance = miningData.gadgets.filter(gadget => {
        return gadget.attributes.some(attr => 
            attr.attribute_name === "Resistance" && attr.value
        );
    });

    // Add gadgets to select
    gadgetsWithResistance.forEach(gadget => {
        const resValue = gadget.attributes.find(a => a.attribute_name === "Resistance").value;
        const option = document.createElement('option');
        option.value = gadget.id;
        option.text = `${gadget.name} (${resValue}%)`;
        select.appendChild(option);
    });

    // Handle gadget selection
    select.addEventListener('change', (e) => {
        const gadgetId = e.target.value;
        if (gadgetId === 'none') {
            selectedGadget = null;
        } else {
            selectedGadget = miningData.gadgets.find(g => g.id.toString() === gadgetId);
        }
        updateBreakabilityChart();
        updateMarker(); // Update marker and power calculations
    });
}