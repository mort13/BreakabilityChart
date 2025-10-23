import { miningData } from './data-manager.js';
import { 
    showLaserheadSelection, 
    removeLaserhead,
    replaceLaserhead,
    renderLaserheadCards 
} from './laserhead-manager.js';
import { 
    showModuleSelection, 
    removeModule, 
    renderModuleCards,
    renderDisplayOptions
} from './module-manager.js';
import { toggleModule } from './laserhead-manager.js';
import { updateMarker, updateBreakabilityChart, updateChartColors } from './chart-manager.js';

export function equalizeCardDimensions(cards) {
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
            if (maxWidth - rect.width > 5) {
                c.style.width = maxWidth + 'px';
            }
            if (maxHeight - rect.height > 5) {
                c.style.height = maxHeight + 'px';
            }
        });
    });
}

export function setupTabs() {
    const buttons = document.querySelectorAll('.tab-button');
    if (buttons.length === 0) {
        console.warn('No tab buttons found');
        return;
    }

    buttons.forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
            
            button.classList.add('active');
            const contentId = button.getAttribute('data-tab');
            const content = document.getElementById(contentId);
            if (content) {
                content.classList.remove('hidden');
            }
            
            // If switching to chart tab, update the chart
            if (contentId === 'breakability') {
                console.log('Switching to Breakability Chart Tab - Updating Chart');
                updateBreakabilityChart();
            }
        });
    });
}

export function setupLaserheadButtons() {
    const addBtn = document.getElementById("addLaserheadBtn");
    const closeBtn = document.getElementById("closeModalBtn");
    const displayBtn = document.getElementById("displayOptionsBtn");
    const closeDisplayBtn = document.getElementById("closeDisplayOptionsBtn");
    const closeModuleBtn = document.getElementById("closeModuleModalBtn");

    if (addBtn) {
        addBtn.addEventListener("click", () => {
            const modal = document.getElementById("laserheadModal");
            modal.classList.remove("hidden");
            renderLaserheadCards();
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener("click", () => {
            const modal = document.getElementById("laserheadModal");
            modal.classList.add("hidden");
        });
    }

    if (displayBtn) {
        displayBtn.addEventListener("click", () => {
            const modal = document.getElementById("displayOptionsModal");
            modal.classList.remove("hidden");
            // Call the renderDisplayOptions function from module-manager
            renderDisplayOptions();
        });
    }

    if (closeDisplayBtn) {
        closeDisplayBtn.addEventListener("click", () => {
            const modal = document.getElementById("displayOptionsModal");
            modal.classList.add("hidden");
        });
    }

    if (closeModuleBtn) {
        closeModuleBtn.addEventListener("click", () => {
            const modal = document.getElementById("moduleModal");
            modal.classList.add("hidden");
        });
    }
}

export function setupDarkModeToggle() {
    const toggleBtn = document.getElementById("darkModeToggle");
    
    if (!toggleBtn) {
        console.warn('Dark mode toggle button not found');
        return;
    }
    
    // Check localStorage for saved preference
    const isDarkMode = localStorage.getItem('darkMode') === 'true';
    if (isDarkMode) {
        document.body.classList.add('dark-mode');
        toggleBtn.textContent = '☀️';
        updateUexLogo(true);
    }
    
    toggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        const isNowDark = document.body.classList.contains('dark-mode');
        
        // Update button icon
        toggleBtn.textContent = isNowDark ? '☀️' : '🌙';
        
        // Save preference to localStorage
        localStorage.setItem('darkMode', isNowDark);
        
        // Update chart colors
        updateChartColors();
        
        // Update UEX logo
        updateUexLogo(isNowDark);
    });
}

function updateUexLogo(isDarkMode) {
    const logos = document.querySelectorAll('.uex-logo');
    logos.forEach(logo => {
        logo.src = isDarkMode ? 'data/logo-white.png' : 'data/logo-black.png';
    });
}

// New function to inject footer template into all tabs
export function injectFooterToTabs() {
  const footerTemplate = document.getElementById('footerTemplate');
  if (!footerTemplate) return;
  document.querySelectorAll('#footerContainer').forEach(container => {
    container.innerHTML = '';
    container.appendChild(footerTemplate.content.cloneNode(true));
  });
  // Update logo for theme
  const isDarkMode = document.body.classList.contains('dark-mode');
  updateUexLogo(isDarkMode);
}

// Export functions that need to be globally available
window.showLaserheadSelection = showLaserheadSelection;
window.removeLaserhead = removeLaserhead;
window.replaceLaserhead = replaceLaserhead;
window.showModuleSelection = showModuleSelection;
window.removeModule = removeModule;
window.toggleModule = toggleModule;
window.updateMarker = updateMarker;
window.injectFooterToTabs = injectFooterToTabs;