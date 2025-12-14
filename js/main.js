import { loadMiningData } from './data-manager.js';
import { setupChart } from './chart-manager.js';
import { setupLaserheadUI } from './laserhead-manager.js';
import { setupModuleUI } from './module-manager.js';
import { setupTabs, setupLaserheadButtons, setupDarkModeToggle, injectFooterToTabs } from './ui-manager.js';
import { setupGadgetUI } from './gadget-manager.js';
import { initOCRUI, updateOCRValues } from './ocr-ui.js';
import { setMarkerFromOCR } from './chart-manager.js';

// Main initialization
window.addEventListener("DOMContentLoaded", async () => {
    await loadMiningData();
    setupDarkModeToggle();
    setupTabs();
    injectFooterToTabs();
    setupChart();
    setupLaserheadUI();
    setupModuleUI();
    setupLaserheadButtons();
    setupGadgetUI();
    
    // Initialize OCR with callback to update chart marker
    initOCRUI((values) => {
        updateOCRValues(values);
        if (values.mass !== null && values.resistance !== null) {
            setMarkerFromOCR(values.mass, values.resistance);
        }
    });
});