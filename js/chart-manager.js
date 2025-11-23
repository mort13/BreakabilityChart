import { miningData, cleanLaserName } from './data-manager.js';
import { selectedLaserheads } from './laserhead-manager.js';
import { calculateTotalPower, calculateResistanceModifier, computeCurve, computeMassAtResistance, distributePowerAcrossLasers } from './calculations.js';

let chart = null;
let marker = null;
let operatorSeatMode = false;
let markerPosition = null; // Store last marker position for animation

// Helper function to get CSS variable colors
function getCSSColor(variableName) {
    // Get from body to account for dark-mode class
    let color = getComputedStyle(document.body).getPropertyValue(variableName).trim();
    // Remove quotes if present
    color = color.replace(/^["']|["']$/g, '');
    return color || '#000000'; // Fallback to black if empty
}

export function setupChart() {
    const canvas = document.getElementById('miningChart');
    if (!canvas) return;

    // Set canvas to fill its container
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    
    // Set proper container height
    const container = canvas.parentElement;
    if (container) {
        container.style.height = '70vh';
        container.style.width = '100%';
        container.style.position = 'relative';
        container.style.backgroundColor = getCSSColor('--color-bg-card');
        container.style.borderRadius = '8px';
        container.style.overflow = 'hidden';
    }

    const ctx = canvas.getContext('2d');
    chart = new Chart(ctx, {
        type: 'line',
        data: { 
            datasets: []
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { 
                    type: 'linear',
                    position: 'bottom',
                    title: { 
                        display: true, 
                        text: 'Base Resistance',
                        font: {
                            size: 14,
                            weight: 'bold'
                        },
                        color: getCSSColor('--color-text-primary')
                    }, 
                    min: 0, 
                    max: 100,
                    ticks: {
                        callback: function(value) {
                            return value + '%';
                        },
                        stepSize: 10,
                        maxTicksLimit: 11,
                        autoSkip: false,
                        maxRotation: 0,
                        font: {
                            size: 12,
                            weight: 'bold'
                        },
                        color: getCSSColor('--color-text-values')
                    },
                    grid: {
                        color: getCSSColor('--color-chart-grid')
                    },
                    border: {
                        width: 2,
                        color: getCSSColor('--color-chart-axis')
                    }
                },
                y: { 
                    title: { 
                        display: true, 
                        text: 'Mass',
                        font: {
                            size: 14,
                            weight: 'bold'
                        },
                        color: getCSSColor('--color-text-primary')
                    },
                    grid: {
                        color: getCSSColor('--color-chart-grid')
                    },
                    ticks: {
                        font: {
                            size: 12,
                            weight: 'bold'
                        },
                        color: getCSSColor('--color-text-values')
                    },
                    border: {
                        width: 2,
                        color: getCSSColor('--color-chart-axis')
                    },
                    min: 0,
                    beginAtZero: true,
                    clip: false  // Allow drawing outside the chart area
                }
            },
            plugins: { 
                legend: { 
                    display: true,
                    position: 'top',
                    onClick: function(e, legendItem, legend) {
                        const index = legendItem.datasetIndex;
                        const group = legend.chart.data.datasets[index].group;
                        const willHide = !legend.chart.data.datasets[index].hidden;
                        
                        // Find all datasets with the same group
                        legend.chart.data.datasets.forEach(dataset => {
                            if (dataset.group === group && dataset.group !== 'total') {
                                if (willHide) {
                                    // Store original data if we're hiding
                                    if (!dataset._originalData) {
                                        dataset._originalData = [...dataset.data];
                                    }
                                    // Animate to -5ßß
                                    dataset.data = dataset.data.map(point => ({ x: point.x, y: -500 }));
                                    dataset._animatingToZero = true;  // Mark as animating
                                } else {
                                    // Restore original data if we're showing
                                    if (dataset._originalData) {
                                        dataset.hidden = false;  // Make visible first
                                        dataset.data = [...dataset._originalData];
                                        delete dataset._originalData;
                                    }
                                }
                            }
                        });
                        
                        // Update with custom animation duration
                        legend.chart.update({
                            duration: 800,
                            easing: 'easeInOutQuart'
                        });
                        
                        // If hiding, set up a timeout to hide after animation
                        if (willHide) {
                            setTimeout(() => {
                                legend.chart.data.datasets.forEach(dataset => {
                                    if (dataset.group === group && dataset._animatingToZero) {
                                        dataset.hidden = true;
                                        delete dataset._animatingToZero;
                                        legend.chart.update(0);  // Update without animation
                                    }
                                });
                            }, 800);  // Same as animation duration
                        }
                    },
                    labels: {
                        filter: function(item, chart) {
                            // Only show datasets that don't end with '_min'
                            return !item.text.endsWith('_min');
                        },
                        sort: function(a, b) {
                            // Access datasets directly through the legend items
                            // Chart.js provides datasetIndex in the legend item
                            
                            // We need to check if the dataset is 'total' by looking at the label
                            const labelA = a.text;
                            const labelB = b.text;
                            
                            // Total should always be first (leftmost)
                            if (labelA === 'Total') return -1;
                            if (labelB === 'Total') return 1;
                            
                            // Otherwise maintain original order (by dataset index)
                            return a.datasetIndex - b.datasetIndex;
                        },
                        color: getCSSColor('--color-text-primary')
                    }
                }
            },
            animation: {
                duration: 800  // Default is 400, increasing to 800ms for slower animation
            },
            layout: {
                padding: {
                    top: 10,
                    right: 20,
                    bottom: 10,
                    left: 10
                }
            }
        }
    });

    // Handle window resize
    window.addEventListener('resize', () => {
        if (chart) {
            chart.resize();
        }
    });
    
    // Make x-axis title clickable to toggle resistance mode
    canvas.addEventListener('click', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Get the chart area dimensions
        const chartArea = chart.chartArea;
        const xScale = chart.scales.x;
        
        // The title is rendered below the chart area
        // Estimate the title position based on Chart.js layout
        const titleCenterX = (chartArea.left + chartArea.right) / 2;
        const titleY = chartArea.bottom + 35; // Title is about 35px below chart area
        const titleWidth = 150;
        const titleHeight = 20;
        
        // Check if click is in the title area
        if (y >= titleY - titleHeight / 2 && y <= titleY + titleHeight / 2 &&
            x >= titleCenterX - titleWidth && x <= titleCenterX + titleWidth) {
            operatorSeatMode = !operatorSeatMode;
            const resistanceText = operatorSeatMode ? 'Effective Resistance' : 'Base Resistance';
            chart.options.scales.x.title.text = resistanceText;
            
            // Update resistance input label
            const resistanceLabel = document.getElementById('resistanceLabel');
            if (resistanceLabel) {
                resistanceLabel.textContent = resistanceText + ' (%):';
            }
            
            updateBreakabilityChart();
            updateMarker(); // Update the required power display
        }
    });
    
    // Add cursor pointer style when hovering over title
    canvas.style.cursor = 'default';
    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const chartArea = chart.chartArea;
        const titleCenterX = (chartArea.left + chartArea.right) / 2;
        const titleY = chartArea.bottom + 35;
        const titleWidth = 150;
        const titleHeight = 20;
        
        if (y >= titleY - titleHeight / 2 && y <= titleY + titleHeight / 2 &&
            x >= titleCenterX - titleWidth && x <= titleCenterX + titleWidth) {
            canvas.style.cursor = 'pointer';
        } else {
            canvas.style.cursor = 'default';
        }
    });
    
    // Setup marker input listeners
    const massInput = document.getElementById('massInput');
    const resistanceInput = document.getElementById('resistanceInput');
    
    if (massInput && resistanceInput) {
        massInput.addEventListener('input', updateMarker);
        resistanceInput.addEventListener('input', updateMarker);
    }
    
    // Ensure colors are set correctly after initialization
    setTimeout(() => {
        updateChartColors();
    }, 0);
}

export function updateBreakabilityChart() {
    if (!chart) return;
    
    // Process selected laserheads
    if (!selectedLaserheads || selectedLaserheads.length === 0) {
        // Clear all laser datasets (keep marker and total)
        chart.data.datasets = chart.data.datasets.filter(ds => 
            ds.label === "Marker" || ds.group === 'total'
        );
        chart.update();
        return;
    }
    
    // Remove datasets for laserheads that no longer exist
    // Build a set of valid group IDs based on current laserheads
    const validGroups = new Set();
    selectedLaserheads.forEach((laserhead, i) => {
        const laserLabel = laserhead.customName || cleanLaserName(laserhead.name);
        const groupId = `laser_${i}_${laserLabel}`;
        validGroups.add(groupId);
    });
    
    // Remove datasets that don't have a valid group
    chart.data.datasets = chart.data.datasets.filter(ds => {
        // Keep marker and total datasets
        if (ds.label === "Marker" || ds.group === 'total') {
            return true;
        }
        // Keep laser datasets that are in the valid groups
        return ds.group && validGroups.has(ds.group);
    });

    // Arrays to store individual laser data for totals
    let maxPowers = [];
    let minPowers = [];
    let resistanceModifiers = [];

    for (let i = 0; i < selectedLaserheads.length; i++) {
        const laserhead = selectedLaserheads[i];
        
        // Get active modules
        const activeModules = laserhead.modules?.filter(m => m.isActive !== false) || [];

        // Calculate values for this laser
        const maxP = calculateTotalPower(laserhead, activeModules, true);
        const minP = calculateTotalPower(laserhead, activeModules, false);
        const r_mod = operatorSeatMode ? 1 : calculateResistanceModifier(laserhead, activeModules, selectedGadget);
        
        // Store values for total calculation
        maxPowers.push(maxP);
        minPowers.push(minP);
        resistanceModifiers.push(r_mod);

        // Add dataset for this laser configuration
        addLaserDataset(laserhead, activeModules, i);
    }
    
    // Handle total curves - update if exists, remove if only one laser left
    if (selectedLaserheads.length > 1) {
        // Function to update total curves
        const updateTotalCurves = () => {
            // Find total datasets
            const totalMaxDataset = chart.data.datasets.find(ds => ds.label === 'Total');
            const totalMinDataset = chart.data.datasets.find(ds => ds.label === 'Total_min');
            
            // If total datasets don't exist yet, create them
            if (!totalMaxDataset) {
                // Add min curve first for proper fill ordering
                const totalColor = getCSSColor('--color-plot-total');
                
                chart.data.datasets.push({
                    label: 'Total_min',  // Will be filtered from legend
                    data: [],
                    borderColor: totalColor,
                    borderWidth: 2,
                    borderDash: [5, 5],
                    fill: '+1',  // Fill to the max curve
                    backgroundColor: totalColor.replace(')', ', 0.1)').replace('rgb', 'rgba'),
                    pointRadius: 0,
                    group: 'total'  // Same group as max total
                });
                
                chart.data.datasets.push({
                    label: 'Total',
                    data: [],
                    borderColor: totalColor,
                    borderWidth: 2,
                    fill: false,
                    pointRadius: 0,
                    group: 'total'  // Separate group for total
                });
            }
            
            // Calculate new total values
            const newTotalMaxData = [];
            const newTotalMinData = [];
            
            for (let R = 0; R <= 100; R += 0.1) {
                let totalMaxMass = 0;
                let totalMinMass = 0;
                
                // Only include visible lasers in the total
                for (let i = 0; i < maxPowers.length; i++) {
                    // Safety check - ensure laserhead exists
                    if (i >= selectedLaserheads.length) continue;
                    
                    // Find the dataset for this laser by group ID
                    const laserhead = selectedLaserheads[i];
                    const laserLabel = laserhead.customName || cleanLaserName(laserhead.name);
                    const groupId = `laser_${i}_${laserLabel}`;
                    const laserDataset = chart.data.datasets.find(ds => ds.group === groupId && !ds.label.endsWith('_min'));
                    
                    // Check if this laser's dataset exists and is visible
                    const isVisible = laserDataset && !laserDataset.hidden;
                    if (isVisible) {
                        totalMaxMass += computeMassAtResistance(maxPowers[i], R, resistanceModifiers[i]);
                        totalMinMass += computeMassAtResistance(minPowers[i], R, resistanceModifiers[i]);
                    }
                }
                
                newTotalMaxData.push({ x: R, y: totalMaxMass });
                newTotalMinData.push({ x: R, y: totalMinMass });
            }
            
            // Update the data points
            const maxIndex = chart.data.datasets.findIndex(ds => ds.label === 'Total');
            const minIndex = chart.data.datasets.findIndex(ds => ds.label === 'Total_min');
            
            // Store current values for animation
            if (!chart.data.datasets[maxIndex]._previousData) {
                chart.data.datasets[maxIndex]._previousData = [...chart.data.datasets[maxIndex].data];
                chart.data.datasets[minIndex]._previousData = [...chart.data.datasets[minIndex].data];
            }

            // If no visible lasers, animate to -5
            const hasVisibleLasers = maxPowers.some((_, i) => {
                // Safety check - ensure laserhead exists
                if (i >= selectedLaserheads.length) return false;
                
                const laserhead = selectedLaserheads[i];
                const laserLabel = laserhead.customName || cleanLaserName(laserhead.name);
                const groupId = `laser_${i}_${laserLabel}`;
                const laserDataset = chart.data.datasets.find(ds => ds.group === groupId && !ds.label.endsWith('_min'));
                return laserDataset && !laserDataset.hidden;
            });
            if (!hasVisibleLasers) {
                newTotalMaxData.forEach(point => point.y = -5);
                newTotalMinData.forEach(point => point.y = -5);
            }

            // Update with animation
            chart.data.datasets[maxIndex].data = newTotalMaxData;
            chart.data.datasets[minIndex].data = newTotalMinData;
            
            chart.update({
                duration: 800,
                easing: 'easeInOutQuart'
            });

            // Store new values for next animation
            chart.data.datasets[maxIndex]._previousData = [...newTotalMaxData];
            chart.data.datasets[minIndex]._previousData = [...newTotalMinData];
        };
        
        // Initial total curves
        updateTotalCurves();
        
        // Initial total curves
        updateTotalCurves();

        // Override the legend click handler to handle both visibility and totals
        chart.options.plugins.legend.onClick = function(e, legendItem, legend) {
            const index = legendItem.datasetIndex;
            const group = legend.chart.data.datasets[index].group;
            const willHide = !legend.chart.data.datasets[index].hidden;
            
            // Handle total clicks - toggle both total datasets
            if (group === 'total') {
                legend.chart.data.datasets.forEach(dataset => {
                    if (dataset.group === 'total') {
                        if (willHide) {
                            if (!dataset._originalData) {
                                dataset._originalData = [...dataset.data];
                            }
                            dataset.data = dataset.data.map(point => ({ x: point.x, y: -5 }));
                            dataset._animatingToZero = true;
                        } else {
                            if (dataset._originalData) {
                                dataset.hidden = false;
                                dataset.data = [...dataset._originalData];
                                delete dataset._originalData;
                            }
                        }
                    }
                });
                
                chart.update({
                    duration: 800,
                    easing: 'easeInOutQuart'
                });
                
                if (willHide) {
                    setTimeout(() => {
                        legend.chart.data.datasets.forEach(dataset => {
                            if (dataset.group === 'total' && dataset._animatingToZero) {
                                dataset.hidden = true;
                                delete dataset._animatingToZero;
                            }
                        });
                        chart.update(0);
                    }, 800);
                }
                return;
            }

            // Update both individual curves and totals simultaneously
            legend.chart.data.datasets.forEach(dataset => {
                if (dataset.group === group && dataset.group !== 'total') {
                    if (willHide) {
                        if (!dataset._originalData) {
                            dataset._originalData = [...dataset.data];
                        }
                        dataset.data = dataset.data.map(point => ({ x: point.x, y: -5 }));
                        dataset._animatingToZero = true;
                    } else {
                        if (dataset._originalData) {
                            dataset.hidden = false;
                            dataset.data = [...dataset._originalData];
                            delete dataset._originalData;
                        }
                    }
                }
            });

            // Recalculate totals after visibility change
            const newTotalMaxData = [];
            const newTotalMinData = [];
            
            for (let R = 0; R <= 100; R += 0.1) {
                let totalMaxMass = 0;
                let totalMinMass = 0;
                
                for (let i = 0; i < maxPowers.length; i++) {
                    // Safety check - ensure laserhead exists
                    if (i >= selectedLaserheads.length) continue;
                    
                    // Find the dataset for this laser by group ID
                    const laserhead = selectedLaserheads[i];
                    const laserLabel = laserhead.customName || cleanLaserName(laserhead.name);
                    const groupId = `laser_${i}_${laserLabel}`;
                    const laserDataset = chart.data.datasets.find(ds => ds.group === groupId && !ds.label.endsWith('_min'));
                    
                    if (!laserDataset) continue;
                    
                    // Include a laser if it's currently visible and not being hidden,
                    // or currently hidden and being shown
                    const isVisible = !laserDataset.hidden;
                    const isThisGroup = laserDataset.group === group;
                    const shouldInclude = (isVisible && (!isThisGroup || !willHide)) || 
                                       (!isVisible && isThisGroup && !willHide);
                    
                    if (shouldInclude) {
                        totalMaxMass += computeMassAtResistance(maxPowers[i], R, resistanceModifiers[i]);
                        totalMinMass += computeMassAtResistance(minPowers[i], R, resistanceModifiers[i]);
                    }
                }
                
                newTotalMaxData.push({ x: R, y: totalMaxMass || -5 });
                newTotalMinData.push({ x: R, y: totalMinMass || -5 });
            }

            // Update total curves
            const totalMaxDataset = legend.chart.data.datasets.find(ds => ds.label === 'Total');
            const totalMinDataset = legend.chart.data.datasets.find(ds => ds.label === 'Total_min');
            
            if (totalMaxDataset) totalMaxDataset.data = newTotalMaxData;
            if (totalMinDataset) totalMinDataset.data = newTotalMinData;

            // Single update for all animations
            chart.update({
                duration: 800,
                easing: 'easeInOutQuart'
            });

            // Hide datasets after animation
            if (willHide) {
                setTimeout(() => {
                    legend.chart.data.datasets.forEach(dataset => {
                        if (dataset.group === group && dataset._animatingToZero) {
                            dataset.hidden = true;
                            delete dataset._animatingToZero;
                        }
                    });
                    chart.update(0);
                }, 800);
            }
        };
    } else if (selectedLaserheads.length === 1) {
        // Remove total curves if only one laser left
        chart.data.datasets = chart.data.datasets.filter(ds => ds.group !== 'total');
    }
    
    chart.update();
}

export function updateMarker() {
    if (!chart) return;
    
    const massInput = document.getElementById('massInput');
    const resistanceInput = document.getElementById('resistanceInput');
    const powerDisplay = document.getElementById('requiredPowerDisplay');
    
    if (!massInput || !resistanceInput) return;
    
    const m = parseFloat(massInput.value);
    const R = parseFloat(resistanceInput.value);

    // Only update marker if both values are valid numbers
    if (!isNaN(m) && !isNaN(R) && m > 0 && R >= 0 && R <= 100) {
        const newPosition = { x: R, y: m };
        
        // Find existing marker dataset
        let markerDataset = chart.data.datasets.find(ds => ds.label === "Marker");
        
        if (markerDataset) {
            // Update existing marker position (will animate from current to new)
            markerDataset.data = [newPosition];
        } else {
            // Create new marker (first time)
            chart.data.datasets.push({
                label: "Marker",
                data: [newPosition],
                type: "scatter",
                backgroundColor: "red",
                pointRadius: 8,
                pointHoverRadius: 10
            });
        }
        
        marker = true;
        markerPosition = newPosition;
        
        // Calculate required power
        calculateRequiredPowerDisplay(m, R);
        
        chart.update({
            duration: 400,
            easing: 'easeInOutQuad'
        });
    } else {
        // Remove marker if values are invalid
        chart.data.datasets = chart.data.datasets.filter(ds => ds.label !== "Marker");
        marker = false;
        markerPosition = null;
        if (powerDisplay) powerDisplay.textContent = '-';
        chart.update(0);
    }
}

function calculateRequiredPowerDisplay(mass, resistance) {
    const powerDisplay = document.getElementById('requiredPowerDisplay');
    if (!powerDisplay || !selectedLaserheads || selectedLaserheads.length === 0) {
        if (powerDisplay) powerDisplay.textContent = '-';
        return;
    }
    
    // Build list of lasers with their parameters
    const laserParameters = selectedLaserheads.map((laserhead) => {
        const activeModules = laserhead.modules?.filter(m => m.isActive !== false) || [];
        const resistanceMod = operatorSeatMode ? 1 : calculateResistanceModifier(laserhead, activeModules, selectedGadget);
        
        return {
            maxPower: calculateTotalPower(laserhead, activeModules, true),
            minPower: calculateTotalPower(laserhead, activeModules, false),
            resistanceModifier: resistanceMod
        };
    });
    
    // Use calculation function to distribute power
    const distribution = distributePowerAcrossLasers(mass, resistance, laserParameters);
    
    powerDisplay.innerHTML = distribution;
}

import { selectedGadget } from './gadget-manager.js';

function addLaserDataset(laserhead, modules, index) {
    const laserLabel = laserhead.customName || cleanLaserName(laserhead.name);
    const groupId = `laser_${index}_${laserLabel}`;  // Unique group ID using index
    
    // Verify that the required power attributes exist
    const maxPowerAttr = laserhead.attributes.find(attr => 
        attr.attribute_name === "Maximum Laser Power"
    );
    const minPowerAttr = laserhead.attributes.find(attr => 
        attr.attribute_name === "Minimum Laser Power"
    );
    
    if (!maxPowerAttr || !minPowerAttr) {
        return;
    }
    
    // Calculate max and min power values
    const maxP = calculateTotalPower(laserhead, modules, true);  // true for max power
    const minP = calculateTotalPower(laserhead, modules, false); // false for min power
    const r_mod = operatorSeatMode ? 1 : calculateResistanceModifier(laserhead, modules, selectedGadget);
    
    const color = getColor(index);
    
    // Compute final curve data
    const finalMinData = computeCurve(minP, r_mod);
    const finalMaxData = computeCurve(maxP, r_mod);
    
    // Find existing datasets by position (index * 2 for min, index * 2 + 1 for max)
    // Skip marker and total datasets
    const laserDatasets = chart.data.datasets.filter(ds => 
        ds.label !== "Marker" && ds.group !== 'total'
    );
    const minDatasetIndex = laserDatasets.findIndex((ds, idx) => idx === index * 2);
    const maxDatasetIndex = laserDatasets.findIndex((ds, idx) => idx === index * 2 + 1);
    
    // Get actual indices in the full datasets array
    let minDataset = minDatasetIndex >= 0 ? laserDatasets[minDatasetIndex] : null;
    let maxDataset = maxDatasetIndex >= 0 ? laserDatasets[maxDatasetIndex] : null;
    
    // If datasets exist at these positions, update them
    if (minDataset && maxDataset) {
        // Update labels (for rename)
        minDataset.label = laserLabel + '_min';
        maxDataset.label = laserLabel;
        minDataset.group = groupId;
        maxDataset.group = groupId;
        
        // Update data
        minDataset.data = finalMinData;
        maxDataset.data = finalMaxData;
        
        // Update colors
        minDataset.borderColor = color;
        minDataset.backgroundColor = color.replace(')', ', 0.1)').replace('rgb', 'rgba');
        maxDataset.borderColor = color;
    } else {
        // Create new datasets if they don't exist
        chart.data.datasets.push({
            label: laserLabel + '_min',
            data: finalMinData,
            borderColor: color,
            borderDash: [5, 5],
            fill: '+1',
            backgroundColor: color.replace(')', ', 0.1)').replace('rgb', 'rgba'),
            pointRadius: 0,
            group: groupId
        });
        
        chart.data.datasets.push({
            label: laserLabel,
            data: finalMaxData,
            borderColor: color,
            fill: false,
            pointRadius: 0,
            group: groupId
        });
    }
}

// Calculation functions are now in calculations.js

function getColor(index) {
    // Get colors from CSS variables (different for light/dark mode)
    const colors = [
        getCSSColor('--color-plot-1'),
        getCSSColor('--color-plot-2'),
        getCSSColor('--color-plot-3'),
        getCSSColor('--color-plot-4'),
        getCSSColor('--color-plot-5'),
        getCSSColor('--color-plot-6')
    ];
    return colors[index % colors.length];
}

// Function to update chart colors when dark mode is toggled
export function updateChartColors() {
    if (!chart) return;
    
    const textPrimary = getCSSColor('--color-text-primary');
    const textValues = getCSSColor('--color-text-values');
    const chartAxis = getCSSColor('--color-chart-axis');
    const chartGrid = getCSSColor('--color-chart-grid');
    const bgCard = getCSSColor('--color-bg-card');
    
    // Update container background color
    const container = chart.canvas.parentElement;
    if (container) {
        container.style.backgroundColor = bgCard;
    }
    
    // Update axis title colors
    chart.options.scales.x.title.color = textPrimary;
    chart.options.scales.y.title.color = textPrimary;
    
    // Update tick colors
    chart.options.scales.x.ticks.color = textValues;
    chart.options.scales.y.ticks.color = textValues;
    
    // Update grid colors
    chart.options.scales.x.grid.color = chartGrid;
    chart.options.scales.y.grid.color = chartGrid;
    
    // Update border colors
    chart.options.scales.x.border.color = chartAxis;
    chart.options.scales.y.border.color = chartAxis;
    
    // Update legend label color
    chart.options.plugins.legend.labels.color = textPrimary;
    
    // Update plot colors for all laser datasets
    let laserIndex = 0;
    chart.data.datasets.forEach(dataset => {
        if (dataset.group === 'total') {
            // Update Total curve color
            const totalColor = getCSSColor('--color-plot-total');
            dataset.borderColor = totalColor;
            if (dataset.label === 'Total_min') {
                dataset.backgroundColor = totalColor.replace(')', ', 0.1)').replace('rgb', 'rgba');
            }
        } else if (dataset.group && dataset.group !== 'marker') {
            // This is a laser dataset
            const color = getColor(laserIndex);
            dataset.borderColor = color;
            if (dataset.label && dataset.label.endsWith('_min')) {
                // Min dataset with fill
                dataset.backgroundColor = color.replace(')', ', 0.1)').replace('rgb', 'rgba');
            }
            // Increment index only for max datasets (not for _min)
            if (dataset.label && !dataset.label.endsWith('_min')) {
                laserIndex++;
            }
        }
    });
    
    // Update the chart
    chart.update();
}
