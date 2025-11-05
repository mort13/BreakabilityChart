import { miningData, calculateCombinedValue, getUnit, cleanLaserName } from './data-manager.js';
import { selectedLaserheads } from './laserhead-manager.js';

let chart = null;
let marker = null;

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
                        text: 'Resistance',
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
    // Keep datasets whose index is less than the number of selected laserheads
    const laserDatasets = chart.data.datasets.filter(ds => 
        ds.label !== "Marker" && ds.group !== 'total'
    );
    
    // Remove excess datasets (when a laserhead was deleted)
    while (laserDatasets.length > selectedLaserheads.length * 2) {
        // Find and remove the last laser dataset
        for (let i = chart.data.datasets.length - 1; i >= 0; i--) {
            const ds = chart.data.datasets[i];
            if (ds.label !== "Marker" && ds.group !== 'total') {
                chart.data.datasets.splice(i, 1);
                break;
            }
        }
    }

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
        const r_mod = calculateResistanceModifier(laserhead, activeModules, selectedGadget);
        
        // Store values for total calculation
        maxPowers.push(maxP);
        minPowers.push(minP);
        resistanceModifiers.push(r_mod);

        // Add dataset for this laser configuration
        addLaserDataset(laserhead, activeModules, i);
    }
    
    // Add total curves if there's more than one laser
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
                    // Check if this laser's dataset is visible
                    const isVisible = !chart.data.datasets[i * 2].hidden;
                    if (isVisible) {
                        totalMaxMass += maxPowers[i] / ((1 + (R/100) * resistanceModifiers[i]) * 0.182);
                        totalMinMass += minPowers[i] / ((1 + (R/100) * resistanceModifiers[i]) * 0.182);
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
            const hasVisibleLasers = maxPowers.some((_, i) => !chart.data.datasets[i * 2].hidden);
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
            
            if (group === 'total') return; // Don't process total clicks

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
                    // Include a laser if it's currently visible and not being hidden,
                    // or currently hidden and being shown
                    const isVisible = !chart.data.datasets[i * 2].hidden;
                    const isThisGroup = chart.data.datasets[i * 2].group === group;
                    const shouldInclude = (isVisible && (!isThisGroup || !willHide)) || 
                                       (!isVisible && isThisGroup && !willHide);
                    
                    if (shouldInclude) {
                        totalMaxMass += maxPowers[i] / ((1 + (R/100) * resistanceModifiers[i]) * 0.182);
                        totalMinMass += minPowers[i] / ((1 + (R/100) * resistanceModifiers[i]) * 0.182);
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
    }
    
    chart.update();
}

export function updateMarker() {
    const m = parseFloat(document.getElementById('massInput').value);
    const R = parseFloat(document.getElementById('resistanceInput').value);
    if (!chart) return;

    if (marker) {
        chart.data.datasets = chart.data.datasets.filter(ds => ds.label !== "Marker");
    }

    chart.data.datasets.push({
        label: "Marker",
        data: [{ x: R, y: m }],
        type: "scatter",
        backgroundColor: "red",
        pointRadius: 6
    });

    chart.update();
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
    const r_mod = calculateResistanceModifier(laserhead, modules, selectedGadget);
    
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

function computeCurve(P, r_mod) {
    const data = [];
    for (let R = 0; R <= 100; R += 0.1) {
        data.push({ x: R, y: P / ((1 + (R/100) * r_mod) * 0.182) });
    }
    return data;
}

function calculateTotalPower(laserhead, modules, useMax = true) {
    // Get the appropriate power attribute (Minimum or Maximum)
    const powerAttrName = useMax ? "Maximum Laser Power" : "Minimum Laser Power";
    let baseAttr = laserhead.attributes.find(attr => attr.attribute_name === powerAttrName);
    let baseValue = baseAttr ? parseFloat(baseAttr.value) : 0;
    let unit = baseAttr ? getUnit(baseAttr) || 'MW' : 'MW';

    // Collect all module modifiers (active and passive) for Mining Laser Power
    let moduleModifiers = modules
        .filter(m => m && m.attributes)
        .map(m => m.attributes.find(a => a.attribute_name === "Mining Laser Power"))
        .filter(a => a && a.value)
        .map(a => parseFloat(a.value));

    // Apply all module modifiers using factor = value/100
    moduleModifiers.forEach(modValue => {
        baseValue *= (modValue / 100);
    });

    // Round as in laserhead-manager.js
    baseValue = Math.round(baseValue * 100) / 100;
    if (baseValue % 1 === 0) {
        baseValue = Math.round(baseValue);
    }

    return baseValue;
}

function calculateResistanceModifier(laserhead, modules, gadget = null) {
    // Get base resistance attribute or create virtual one with 0%
    let resistanceAttr = laserhead.attributes.find(attr => 
        attr.attribute_name === "Resistance"
    );
    
    // Check if any modules have resistance modifiers
    const hasResistanceModules = modules.some(m => 
        m.attributes?.some(a => a.attribute_name === "Resistance")
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
    
    // Start with base resistance value
    let resistance = parseFloat(resistanceAttr.value) || 0;
    const unit = getUnit(resistanceAttr) || '%';
    
    // Apply module modifiers
    modules.forEach(module => {
        const resMod = module.attributes.find(attr => 
            attr.attribute_name === "Resistance"
        );
        if (resMod) {
            resistance = parseFloat(calculateCombinedValue(resistance.toString(), resMod.value, unit, module.isActive !== false, "Resistance"));
        }
    });

    // Apply gadget modifier if present
    if (gadget && gadget.attributes) {
        const gadgetResMod = gadget.attributes.find(attr => 
            attr.attribute_name === "Resistance" && attr.value
        );
        if (gadgetResMod) {
            resistance = parseFloat(calculateCombinedValue(resistance.toString(), gadgetResMod.value, unit, true, "Resistance"));
        }
    }
    
    // Convert final percentage to multiplier (e.g., 25% -> 1.25)
    const finalMultiplier = 1 + (resistance / 100);
    return finalMultiplier;
}

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
