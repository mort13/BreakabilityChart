import { loadMiningData } from './data-manager.js';
import { setupChart } from './chart-manager.js';
import { setupLaserheadUI } from './laserhead-manager.js';
import { setupModuleUI } from './module-manager.js';
import { setupTabs, setupLaserheadButtons, setupDarkModeToggle } from './ui-manager.js';
import { setupGadgetUI } from './gadget-manager.js';

// Main initialization
window.addEventListener("DOMContentLoaded", async () => {
    await loadMiningData();
    setupDarkModeToggle();
    setupTabs();
    setupChart();
    setupLaserheadUI();
    setupModuleUI();
    setupLaserheadButtons();
    setupGadgetUI();
});