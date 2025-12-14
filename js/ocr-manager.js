/**
 * OCR Manager - Screen capture and template matching for rock values
 * Captures screen at 1Hz and extracts mass/resistance values
 */

// Character templates will be loaded from images
let charTemplates = {};
let isCapturing = false;
let captureStream = null;
let captureInterval = null;
let videoElement = null;
let canvasElement = null;
let canvasCtx = null;

// Capture regions (relative to captured screen, in pixels)
let massRegion = null;      // { x, y, width, height }
let resistanceRegion = null; // { x, y, width, height }

// OCR settings
let ocrSettings = {
    threshold: 128,           // Binary threshold (0-255)
    invertPolarity: false,    // If true, swap black/white for captured image
    invertTemplates: false,   // If true, templates are black-on-white and need inversion
    matchThreshold: 0.5       // Minimum match score (0-1) - lowered for testing
};

// Callbacks
let onValuesDetected = null;

/**
 * Initialize the OCR system
 * @param {Function} callback - Called with { mass, resistance } when values are detected
 */
export function initOCR(callback) {
    onValuesDetected = callback;
    
    // Create hidden video and canvas elements for capture
    videoElement = document.createElement('video');
    videoElement.style.display = 'none';
    document.body.appendChild(videoElement);
    
    canvasElement = document.createElement('canvas');
    canvasElement.style.display = 'none';
    document.body.appendChild(canvasElement);
    canvasCtx = canvasElement.getContext('2d', { willReadFrequently: true });
    
    // Load settings from localStorage
    loadOCRSettings();
    
    // Load character templates
    loadCharacterTemplates();
}

/**
 * Load character template images
 * Templates should be in /ocr-templates/ folder as 0.jpg, 1.jpg, ..., 9.jpg
 * Mass: 3-5 digits, Resistance: 1-2 digits (ignore % sign)
 */
async function loadCharacterTemplates() {
    const chars = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    charTemplates = {}; // Clear existing templates
    
    for (let i = 0; i < chars.length; i++) {
        try {
            const img = new Image();
            img.src = `ocr-templates/${chars[i]}.jpg`;
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
            });
            
            // Convert to grayscale pixel data for matching
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = img.width;
            tempCanvas.height = img.height;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(img, 0, 0);
            const imageData = tempCtx.getImageData(0, 0, img.width, img.height);
            
            // Pre-compute binary version of template (white = 255, black = 0)
            const binary = new Uint8Array(img.width * img.height);
            for (let j = 0; j < imageData.data.length; j += 4) {
                const gray = imageData.data[j] * 0.299 + imageData.data[j + 1] * 0.587 + imageData.data[j + 2] * 0.114;
                let value = gray > 128 ? 255 : 0;
                // If templates are black-on-white (inverted), flip them
                if (ocrSettings.invertTemplates) {
                    value = 255 - value;
                }
                binary[j / 4] = value;
            }
            
            charTemplates[chars[i]] = {
                width: img.width,
                height: img.height,
                binary: binary
            };
            
            console.log(`Loaded template for '${chars[i]}' (${img.width}x${img.height})`);
        } catch (e) {
            console.warn(`Could not load template for '${chars[i]}':`, e);
        }
    }
    
    console.log(`Loaded ${Object.keys(charTemplates).length} character templates (invertTemplates: ${ocrSettings.invertTemplates})`);
}

/**
 * Reload templates (call after changing invertTemplates setting)
 */
export async function reloadTemplates() {
    await loadCharacterTemplates();
}

/**
 * Start screen capture
 */
export async function startCapture() {
    if (isCapturing) return;
    
    try {
        // Request screen capture permission
        captureStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                cursor: 'never',
                displaySurface: 'window'
            }
        });
        
        videoElement.srcObject = captureStream;
        await videoElement.play();
        
        // Set canvas size to match video
        canvasElement.width = videoElement.videoWidth;
        canvasElement.height = videoElement.videoHeight;
        
        isCapturing = true;
        
        // Start capture loop at 1Hz
        captureInterval = setInterval(captureFrame, 1000);
        
        // Also capture immediately
        captureFrame();
        
        console.log(`Screen capture started: ${videoElement.videoWidth}x${videoElement.videoHeight}`);
        
        // Handle stream ending (user stops sharing)
        captureStream.getVideoTracks()[0].addEventListener('ended', () => {
            stopCapture();
        });
        
        return true;
    } catch (e) {
        console.error('Failed to start screen capture:', e);
        return false;
    }
}

/**
 * Stop screen capture
 */
export function stopCapture() {
    if (!isCapturing) return;
    
    if (captureInterval) {
        clearInterval(captureInterval);
        captureInterval = null;
    }
    
    if (captureStream) {
        captureStream.getTracks().forEach(track => track.stop());
        captureStream = null;
    }
    
    videoElement.srcObject = null;
    isCapturing = false;
    
    console.log('Screen capture stopped');
}

/**
 * Check if currently capturing
 */
export function isCaptureActive() {
    return isCapturing;
}

/**
 * Capture a single frame and process it
 */
function captureFrame() {
    if (!isCapturing) return;
    
    // Need at least one region to do anything useful
    if (!massRegion && !resistanceRegion) return;
    
    // Draw current video frame to canvas
    canvasCtx.drawImage(videoElement, 0, 0);
    
    // Extract and recognize mass value (if region is set)
    const massValue = massRegion ? extractValueFromRegion(massRegion, 'mass') : null;
    
    // Extract and recognize resistance value (if region is set)
    const resistanceValue = resistanceRegion ? extractValueFromRegion(resistanceRegion, 'resistance') : null;
    
    // Call callback if we got valid values
    if (massValue !== null || resistanceValue !== null) {
        if (onValuesDetected) {
            onValuesDetected({
                mass: massValue,
                resistance: resistanceValue
            });
        }
    }
}

/**
 * Extract numeric value from a region using template matching
 * @param {Object} region - { x, y, width, height }
 * @param {string} type - 'mass' or 'resistance'
 * @returns {number|null} - Extracted value or null
 */
function extractValueFromRegion(region, type = 'mass') {
    if (!region) return null;
    
    // Get image data for the region
    const imageData = canvasCtx.getImageData(region.x, region.y, region.width, region.height);
    
    // Convert to grayscale and threshold for better matching
    const processed = preprocessImage(imageData);
    
    // Estimate expected digit count based on region dimensions
    // Typical digit aspect ratio is ~0.6 (width/height)
    const expectedDigitWidth = region.height * 0.6;
    const estimatedDigits = Math.round(region.width / expectedDigitWidth);
    
    // Expected digit counts by type
    const expectedCounts = type === 'mass' ? [3, 4, 5] : [1, 2];
    
    // Find best matching digit count
    let targetDigits = estimatedDigits;
    if (!expectedCounts.includes(estimatedDigits)) {
        // Pick closest valid count
        targetDigits = expectedCounts.reduce((a, b) => 
            Math.abs(b - estimatedDigits) < Math.abs(a - estimatedDigits) ? b : a
        );
    }
    
    console.log(`Region ${type}: ${region.width}x${region.height}, estimated ${estimatedDigits} digits, targeting ${targetDigits}`);
    
    // Find and match characters with target digit count hint
    const text = matchCharacters(processed, region.width, region.height, targetDigits);
    
    // Parse the text to an integer
    const value = parseInt(text, 10);
    
    if (isNaN(value)) return null;
    
    // Validate based on type
    if (type === 'mass') {
        // Mass should be 3-5 digits (100 to 99999)
        if (value < 100 || value > 99999) return null;
    } else if (type === 'resistance') {
        // Resistance should be 1-2 digits (0 to 99)
        if (value < 0 || value > 99) return null;
    }
    
    return value;
}

/**
 * Preprocess image data - convert to binary (black/white)
 * @param {ImageData} imageData
 * @returns {Uint8Array} - Binary image (0 or 255 per pixel)
 */
function preprocessImage(imageData) {
    const data = imageData.data;
    const binary = new Uint8Array(imageData.width * imageData.height);
    
    for (let i = 0; i < data.length; i += 4) {
        // Convert to grayscale
        const gray = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
        // Apply configurable threshold
        let value = gray > ocrSettings.threshold ? 255 : 0;
        // Apply polarity inversion if needed
        if (ocrSettings.invertPolarity) {
            value = 255 - value;
        }
        binary[i / 4] = value;
    }
    
    return binary;
}

/**
 * Find individual digit regions by looking for gaps between characters
 * @param {Uint8Array} binary - Binary image data
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {Array} - Array of {start, end} column indices for each digit
 */
function findDigitRegions(binary, width, height) {
    // Calculate column density (% of white pixels in each column)
    const colDensity = [];
    for (let x = 0; x < width; x++) {
        let whiteCount = 0;
        for (let y = 0; y < height; y++) {
            if (binary[y * width + x] === 255) whiteCount++;
        }
        colDensity.push(whiteCount / height);
    }
    
    console.log('Column densities (first 20):', colDensity.slice(0, 20).map(d => d.toFixed(2)));
    
    // Find regions where density > threshold (character present)
    let regions = [];
    let inRegion = false;
    let start = 0;
    const densityThreshold = 0.03; // Lowered to 3% to catch thin parts
    
    for (let x = 0; x < width; x++) {
        if (colDensity[x] > densityThreshold) {
            if (!inRegion) {
                start = x;
                inRegion = true;
            }
        } else {
            if (inRegion) {
                regions.push({ start, end: x - 1 });
                inRegion = false;
            }
        }
    }
    if (inRegion) {
        regions.push({ start, end: width - 1 });
    }
    
    console.log('Initial regions found:', regions);
    
    // If we found very few regions but the width suggests more digits,
    // try splitting wide regions by expected digit width
    // Typical digit aspect ratio is about 0.5-0.7 (width/height)
    const expectedDigitWidth = Math.round(height * 0.6);
    console.log('Expected digit width based on height:', expectedDigitWidth);
    
    const splitRegions = [];
    for (const region of regions) {
        const regionWidth = region.end - region.start + 1;
        
        // If region is much wider than expected single digit, split it
        if (regionWidth > expectedDigitWidth * 1.5) {
            const numDigits = Math.round(regionWidth / expectedDigitWidth);
            const digitWidth = regionWidth / numDigits;
            
            console.log(`Splitting wide region (${regionWidth}px) into ${numDigits} digits`);
            
            for (let i = 0; i < numDigits; i++) {
                splitRegions.push({
                    start: Math.round(region.start + i * digitWidth),
                    end: Math.round(region.start + (i + 1) * digitWidth) - 1
                });
            }
        } else {
            splitRegions.push(region);
        }
    }
    
    return splitRegions;
}

/**
 * Recognize a single digit using feature extraction
 * More robust than template matching for shifting text
 * @param {Uint8Array} binary - Binary image data  
 * @param {number} imgWidth - Full image width
 * @param {number} height - Image height
 * @param {number} startX - Start column of digit
 * @param {number} endX - End column of digit
 * @returns {string} - Recognized digit
 */
function recognizeDigit(binary, imgWidth, height, startX, endX) {
    const digitWidth = endX - startX + 1;
    
    // Extract features from the digit region
    // Divide into 3x3 grid and calculate density in each cell
    const gridRows = 3;
    const gridCols = 3;
    const cellH = Math.floor(height / gridRows);
    const cellW = Math.floor(digitWidth / gridCols);
    
    const grid = [];
    for (let gr = 0; gr < gridRows; gr++) {
        for (let gc = 0; gc < gridCols; gc++) {
            let whiteCount = 0;
            let total = 0;
            
            const yStart = gr * cellH;
            const yEnd = Math.min((gr + 1) * cellH, height);
            const xStart = startX + gc * cellW;
            const xEnd = Math.min(startX + (gc + 1) * cellW, endX + 1);
            
            for (let y = yStart; y < yEnd; y++) {
                for (let x = xStart; x < xEnd; x++) {
                    if (binary[y * imgWidth + x] === 255) whiteCount++;
                    total++;
                }
            }
            
            grid.push(total > 0 ? whiteCount / total : 0);
        }
    }
    
    // Also calculate aspect ratio
    const aspectRatio = digitWidth / height;
    
    // Calculate horizontal line features (top, middle, bottom)
    const hLines = [0.15, 0.5, 0.85].map(yRatio => {
        const y = Math.floor(height * yRatio);
        let whiteCount = 0;
        for (let x = startX; x <= endX; x++) {
            if (binary[y * imgWidth + x] === 255) whiteCount++;
        }
        return whiteCount / digitWidth;
    });
    
    // Calculate vertical line features (left, center, right)
    const vLines = [0.2, 0.5, 0.8].map(xRatio => {
        const x = startX + Math.floor(digitWidth * xRatio);
        let whiteCount = 0;
        for (let y = 0; y < height; y++) {
            if (binary[y * imgWidth + x] === 255) whiteCount++;
        }
        return whiteCount / height;
    });
    
    // Debug: log features for this digit
    console.log(`Digit features [${startX}-${endX}]: aspect=${aspectRatio.toFixed(2)}, hLines=[${hLines.map(h => h.toFixed(2)).join(',')}], vLines=[${vLines.map(v => v.toFixed(2)).join(',')}]`);
    
    // Match against digit patterns
    // These patterns are approximate - may need tuning for specific fonts
    // Format: hLines = [top, middle, bottom], vLines = [left, center, right]
    // Values indicate expected density (0-1) at those positions
    const patterns = {
        '0': { hLines: [0.4, 0.0, 0.4], vLines: [0.8, 0.0, 0.8] },  // Top/bottom bars, left/right sides, empty middle
        '1': { hLines: [0.1, 0.1, 0.1], vLines: [0.0, 0.8, 0.1] },  // Vertical line in center
        '2': { hLines: [0.4, 0.4, 0.4], vLines: [0.2, 0.3, 0.4] },  // Top, middle, bottom bars
        '3': { hLines: [0.4, 0.3, 0.4], vLines: [0.1, 0.2, 0.7] },  // Right side heavy
        '4': { hLines: [0.1, 0.4, 0.1], vLines: [0.4, 0.4, 0.8] },  // Middle bar, right side
        '5': { hLines: [0.4, 0.3, 0.4], vLines: [0.5, 0.2, 0.4] },  // Top, bottom bars
        '6': { hLines: [0.3, 0.3, 0.4], vLines: [0.7, 0.3, 0.5] },  // Left side + bottom loop
        '7': { hLines: [0.5, 0.1, 0.1], vLines: [0.1, 0.3, 0.5] },  // Top bar, diagonal
        '8': { hLines: [0.4, 0.3, 0.4], vLines: [0.6, 0.2, 0.6] },  // Two loops
        '9': { hLines: [0.4, 0.3, 0.2], vLines: [0.5, 0.3, 0.7] }   // Top loop + right side
    };
    
    let bestMatch = '?';
    let bestScore = -Infinity;
    let scores = {};
    
    for (const [digit, pattern] of Object.entries(patterns)) {
        let score = 0;
        
        // Score horizontal lines (weight = 1)
        for (let i = 0; i < 3; i++) {
            const diff = Math.abs(hLines[i] - pattern.hLines[i]);
            score -= diff;
        }
        
        // Score vertical lines (weight = 1)
        for (let i = 0; i < 3; i++) {
            const diff = Math.abs(vLines[i] - pattern.vLines[i]);
            score -= diff;
        }
        
        scores[digit] = score.toFixed(2);
        
        if (score > bestScore) {
            bestScore = score;
            bestMatch = digit;
        }
    }
    
    console.log(`Pattern scores: ${JSON.stringify(scores)} => best: '${bestMatch}'`);
    
    return bestMatch;
}

/**
 * Match characters in the processed image using feature-based recognition
 * This approach is more robust for slightly shifting text
 * @param {Uint8Array} binary - Binary image data
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} targetDigits - Expected number of digits (hint for segmentation)
 * @returns {string} - Recognized text
 */
function matchCharacters(binary, width, height, targetDigits = 0) {
    // If we have a target digit count, divide evenly
    let regions;
    
    if (targetDigits > 0) {
        // Force exact segmentation based on expected digit count
        const digitWidth = width / targetDigits;
        regions = [];
        for (let i = 0; i < targetDigits; i++) {
            regions.push({
                start: Math.round(i * digitWidth),
                end: Math.round((i + 1) * digitWidth) - 1
            });
        }
        console.log(`Forced ${targetDigits} digit regions:`, regions);
    } else {
        // Use automatic region detection
        regions = findDigitRegions(binary, width, height);
        
        if (regions.length === 0) {
            console.log('No digit regions found in image');
            return '';
        }
        
        console.log(`Found ${regions.length} digit regions:`, regions);
    }
    
    let result = '';
    for (const region of regions) {
        const digit = recognizeDigit(binary, width, height, region.start, region.end);
        result += digit;
    }
    
    console.log('Feature-based OCR result:', result);
    return result;
}

/**
 * Calculate match score between template and image region
 * Uses scaling to match template to region height
 * @param {Uint8Array} binary - Binary image (already processed with threshold/polarity)
 * @param {number} imgWidth - Image width
 * @param {number} imgHeight - Image height
 * @param {number} offsetX - X offset in image
 * @param {Object} template - Character template with pre-computed binary
 * @returns {Object} - { score: number, scaledWidth: number }
 */
function matchTemplate(binary, imgWidth, imgHeight, offsetX, template) {
    // Scale template to match image height
    const scale = imgHeight / template.height;
    const scaledWidth = Math.round(template.width * scale);
    const scaledHeight = Math.round(template.height * scale);
    
    if (offsetX + scaledWidth > imgWidth || scaledWidth === 0) {
        return { score: 0, scaledWidth: 0 };
    }
    
    let matches = 0;
    let total = 0;
    
    // Sample the template at scaled positions
    for (let sy = 0; sy < scaledHeight; sy++) {
        for (let sx = 0; sx < scaledWidth; sx++) {
            const imgX = offsetX + sx;
            const imgY = sy;
            
            if (imgX >= imgWidth || imgY >= imgHeight) continue;
            
            // Map back to template coordinates
            const tx = Math.floor(sx / scale);
            const ty = Math.floor(sy / scale);
            
            if (tx >= template.width || ty >= template.height) continue;
            
            // Get template pixel (pre-computed binary: 255 = white, 0 = black)
            const tIdx = ty * template.width + tx;
            const tBinary = template.binary[tIdx];
            
            // Get image pixel (also binary: 255 = white, 0 = black)
            const iIdx = imgY * imgWidth + imgX;
            const iBinary = binary[iIdx];
            
            // Compare
            if (tBinary === iBinary) matches++;
            total++;
        }
    }
    
    return { 
        score: total > 0 ? matches / total : 0,
        scaledWidth
    };
}

/**
 * Set the capture region for mass value
 * @param {Object} region - { x, y, width, height }
 */
export function setMassRegion(region) {
    massRegion = region;
    saveRegions();
    console.log('Mass region set:', region);
}

/**
 * Set the capture region for resistance value
 * @param {Object} region - { x, y, width, height }
 */
export function setResistanceRegion(region) {
    resistanceRegion = region;
    saveRegions();
    console.log('Resistance region set:', region);
}

/**
 * Get current regions
 */
export function getRegions() {
    return {
        mass: massRegion,
        resistance: resistanceRegion
    };
}

/**
 * Save regions to localStorage
 */
function saveRegions() {
    const data = {
        mass: massRegion,
        resistance: resistanceRegion
    };
    localStorage.setItem('ocrRegions', JSON.stringify(data));
}

/**
 * Load regions from localStorage
 */
export function loadRegions() {
    try {
        const data = JSON.parse(localStorage.getItem('ocrRegions'));
        if (data) {
            massRegion = data.mass;
            resistanceRegion = data.resistance;
            console.log('Loaded OCR regions:', data);
        }
    } catch (e) {
        console.warn('Could not load OCR regions:', e);
    }
}

/**
 * Get current capture frame as image data URL (for region selection UI)
 */
export function getCurrentFrameDataURL() {
    if (!isCapturing) return null;
    
    canvasCtx.drawImage(videoElement, 0, 0);
    return canvasElement.toDataURL('image/png');
}

/**
 * Get capture dimensions
 */
export function getCaptureDimensions() {
    if (!isCapturing) return null;
    return {
        width: videoElement.videoWidth,
        height: videoElement.videoHeight
    };
}

/**
 * Get current OCR settings
 */
export function getOCRSettings() {
    return { ...ocrSettings };
}

/**
 * Update OCR settings
 * @param {Object} newSettings - Partial settings to update
 */
export function updateOCRSettings(newSettings) {
    ocrSettings = { ...ocrSettings, ...newSettings };
    saveOCRSettings();
    console.log('OCR settings updated:', ocrSettings);
}

/**
 * Save OCR settings to localStorage
 */
function saveOCRSettings() {
    localStorage.setItem('ocrSettings', JSON.stringify(ocrSettings));
}

/**
 * Load OCR settings from localStorage
 */
function loadOCRSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem('ocrSettings'));
        if (saved) {
            ocrSettings = { ...ocrSettings, ...saved };
            console.log('Loaded OCR settings:', ocrSettings);
        }
    } catch (e) {
        console.warn('Could not load OCR settings:', e);
    }
}

/**
 * Get a preview of the binary-processed region
 * Returns a data URL of the thresholded image for debugging
 * @param {string} regionType - 'mass' or 'resistance'
 * @returns {string|null} - Data URL of processed image
 */
export function getProcessedRegionPreview(regionType) {
    if (!isCapturing) return null;
    
    const region = regionType === 'mass' ? massRegion : resistanceRegion;
    if (!region) return null;
    
    // Capture current frame
    canvasCtx.drawImage(videoElement, 0, 0);
    
    // Get region image data
    const imageData = canvasCtx.getImageData(region.x, region.y, region.width, region.height);
    
    // Process to binary
    const binary = preprocessImage(imageData);
    
    // Create a new canvas for the preview
    const previewCanvas = document.createElement('canvas');
    previewCanvas.width = region.width;
    previewCanvas.height = region.height;
    const previewCtx = previewCanvas.getContext('2d');
    
    // Convert binary back to image
    const previewData = previewCtx.createImageData(region.width, region.height);
    for (let i = 0; i < binary.length; i++) {
        const idx = i * 4;
        previewData.data[idx] = binary[i];     // R
        previewData.data[idx + 1] = binary[i]; // G
        previewData.data[idx + 2] = binary[i]; // B
        previewData.data[idx + 3] = 255;       // A
    }
    previewCtx.putImageData(previewData, 0, 0);
    
    return previewCanvas.toDataURL('image/png');
}

/**
 * Get the raw region image (before processing)
 * @param {string} regionType - 'mass' or 'resistance'
 * @returns {string|null} - Data URL of raw region
 */
export function getRawRegionPreview(regionType) {
    if (!isCapturing) return null;
    
    const region = regionType === 'mass' ? massRegion : resistanceRegion;
    if (!region) return null;
    
    // Capture current frame
    canvasCtx.drawImage(videoElement, 0, 0);
    
    // Create a new canvas for just the region
    const regionCanvas = document.createElement('canvas');
    regionCanvas.width = region.width;
    regionCanvas.height = region.height;
    const regionCtx = regionCanvas.getContext('2d');
    
    // Copy the region
    regionCtx.drawImage(
        canvasElement,
        region.x, region.y, region.width, region.height,
        0, 0, region.width, region.height
    );
    
    return regionCanvas.toDataURL('image/png');
}

/**
 * Auto-detect the best threshold for a region
 * Uses Otsu's method to find optimal threshold
 * @param {string} regionType - 'mass' or 'resistance'
 * @returns {number} - Suggested threshold value
 */
export function autoDetectThreshold(regionType) {
    if (!isCapturing) return 128;
    
    const region = regionType === 'mass' ? massRegion : resistanceRegion;
    if (!region) return 128;
    
    // Capture current frame
    canvasCtx.drawImage(videoElement, 0, 0);
    
    // Get region image data
    const imageData = canvasCtx.getImageData(region.x, region.y, region.width, region.height);
    const data = imageData.data;
    
    // Build histogram
    const histogram = new Array(256).fill(0);
    for (let i = 0; i < data.length; i += 4) {
        const gray = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
        histogram[gray]++;
    }
    
    // Otsu's method
    const total = data.length / 4;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * histogram[i];
    
    let sumB = 0;
    let wB = 0;
    let wF = 0;
    let maxVariance = 0;
    let threshold = 128;
    
    for (let t = 0; t < 256; t++) {
        wB += histogram[t];
        if (wB === 0) continue;
        
        wF = total - wB;
        if (wF === 0) break;
        
        sumB += t * histogram[t];
        
        const mB = sumB / wB;
        const mF = (sum - sumB) / wF;
        
        const variance = wB * wF * (mB - mF) * (mB - mF);
        
        if (variance > maxVariance) {
            maxVariance = variance;
            threshold = t;
        }
    }
    
    console.log(`Auto-detected threshold for ${regionType}: ${threshold}`);
    return threshold;
}

/**
 * Detect if polarity should be inverted (light text on dark background)
 * @param {string} regionType - 'mass' or 'resistance'
 * @returns {boolean} - true if polarity should be inverted
 */
export function detectPolarity(regionType) {
    if (!isCapturing) return false;
    
    const region = regionType === 'mass' ? massRegion : resistanceRegion;
    if (!region) return false;
    
    // Capture current frame
    canvasCtx.drawImage(videoElement, 0, 0);
    
    // Get region image data
    const imageData = canvasCtx.getImageData(region.x, region.y, region.width, region.height);
    const data = imageData.data;
    
    // Calculate average brightness
    let totalBrightness = 0;
    for (let i = 0; i < data.length; i += 4) {
        totalBrightness += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    }
    const avgBrightness = totalBrightness / (data.length / 4);
    
    // If average is dark (< 128), assume light text on dark background
    const shouldInvert = avgBrightness < 128;
    console.log(`Detected polarity for ${regionType}: avg brightness = ${avgBrightness.toFixed(1)}, invert = ${shouldInvert}`);
    
    return shouldInvert;
}

/**
 * Get debug info about templates and current region
 * @param {string} regionType - 'mass' or 'resistance'
 * @returns {Object} - Debug information
 */
export function getDebugInfo(regionType) {
    const templateInfo = {};
    for (const [char, template] of Object.entries(charTemplates)) {
        templateInfo[char] = { width: template.width, height: template.height };
    }
    
    const region = regionType === 'mass' ? massRegion : resistanceRegion;
    let regionInfo = null;
    let matchScores = null;
    
    if (region && isCapturing) {
        canvasCtx.drawImage(videoElement, 0, 0);
        const imageData = canvasCtx.getImageData(region.x, region.y, region.width, region.height);
        const binary = preprocessImage(imageData);
        
        regionInfo = {
            x: region.x,
            y: region.y,
            width: region.width,
            height: region.height
        };
        
        // Get match scores for first position
        matchScores = {};
        for (const [char, template] of Object.entries(charTemplates)) {
            const { score, scaledWidth } = matchTemplate(binary, region.width, region.height, 0, template);
            matchScores[char] = { score: score.toFixed(3), scaledWidth };
        }
        
        // Diagnostic: Calculate % white pixels in region and in a template
        let regionWhite = 0;
        for (let i = 0; i < binary.length; i++) {
            if (binary[i] === 255) regionWhite++;
        }
        const regionWhitePercent = (regionWhite / binary.length * 100).toFixed(1);
        
        // Check template '5' as reference
        const template5 = charTemplates['5'];
        if (template5) {
            let templateWhite = 0;
            for (let i = 0; i < template5.binary.length; i++) {
                if (template5.binary[i] === 255) templateWhite++;
            }
            const templateWhitePercent = (templateWhite / template5.binary.length * 100).toFixed(1);
            console.log(`Polarity check: Region has ${regionWhitePercent}% white, Template '5' has ${templateWhitePercent}% white`);
            console.log('If both are similar (both low or both high), polarity matches. If opposite, toggle Invert Templates.');
        }
    }
    
    return {
        templatesLoaded: Object.keys(charTemplates).length,
        templates: templateInfo,
        settings: ocrSettings,
        region: regionInfo,
        matchScoresAtX0: matchScores
    };
}

/**
 * Force a manual OCR test and return results
 * @param {string} regionType - 'mass' or 'resistance'
 * @returns {Object} - Test results
 */
export function testOCR(regionType) {
    if (!isCapturing) {
        return { error: 'Not capturing' };
    }
    
    const region = regionType === 'mass' ? massRegion : resistanceRegion;
    if (!region) {
        return { error: 'Region not set' };
    }
    
    canvasCtx.drawImage(videoElement, 0, 0);
    const imageData = canvasCtx.getImageData(region.x, region.y, region.width, region.height);
    const binary = preprocessImage(imageData);
    const text = matchCharacters(binary, region.width, region.height);
    const value = parseFloat(text.replace('%', ''));
    
    return {
        region,
        text,
        value: isNaN(value) ? null : value,
        settings: ocrSettings
    };
}

/**
 * Get a data URL preview of a template (for debugging)
 * @param {string} char - Character to preview ('0'-'9')
 * @returns {string|null} - Data URL of the template
 */
export function getTemplatePreview(char) {
    const template = charTemplates[char];
    if (!template) return null;
    
    const canvas = document.createElement('canvas');
    canvas.width = template.width;
    canvas.height = template.height;
    const ctx = canvas.getContext('2d');
    
    const imageData = ctx.createImageData(template.width, template.height);
    for (let i = 0; i < template.binary.length; i++) {
        const idx = i * 4;
        imageData.data[idx] = template.binary[i];     // R
        imageData.data[idx + 1] = template.binary[i]; // G
        imageData.data[idx + 2] = template.binary[i]; // B
        imageData.data[idx + 3] = 255;                // A
    }
    ctx.putImageData(imageData, 0, 0);
    
    return canvas.toDataURL('image/png');
}

/**
 * Get all template previews for debugging
 * @returns {Object} - Object with char keys and data URL values
 */
export function getAllTemplatePreviews() {
    const previews = {};
    for (const char of Object.keys(charTemplates)) {
        previews[char] = getTemplatePreview(char);
    }
    return previews;
}

/**
 * Detailed diagnostic: show side-by-side comparison of template and region
 */
export function diagnoseMatch(regionType, templateChar) {
    if (!isCapturing) return { error: 'Not capturing' };
    
    const region = regionType === 'mass' ? massRegion : resistanceRegion;
    if (!region) return { error: 'Region not set' };
    
    const template = charTemplates[templateChar];
    if (!template) return { error: 'Template not found' };
    
    // Get the processed region
    canvasCtx.drawImage(videoElement, 0, 0);
    const imageData = canvasCtx.getImageData(region.x, region.y, region.width, region.height);
    const regionBinary = preprocessImage(imageData);
    
    // Calculate scaling
    const scale = region.height / template.height;
    const scaledWidth = Math.round(template.width * scale);
    
    console.log(`Region: ${region.width}x${region.height}, Template: ${template.width}x${template.height}, Scale: ${scale.toFixed(2)}, Scaled template width: ${scaledWidth}`);
    
    // Count matches at position 0
    let matches = 0;
    let mismatches = 0;
    let mismatchDetails = [];
    
    for (let sy = 0; sy < region.height && sy < Math.round(template.height * scale); sy++) {
        for (let sx = 0; sx < scaledWidth && sx < region.width; sx++) {
            const tx = Math.floor(sx / scale);
            const ty = Math.floor(sy / scale);
            
            if (tx >= template.width || ty >= template.height) continue;
            
            const tIdx = ty * template.width + tx;
            const tBinary = template.binary[tIdx];
            
            const iIdx = sy * region.width + sx;
            const iBinary = regionBinary[iIdx];
            
            if (tBinary === iBinary) {
                matches++;
            } else {
                mismatches++;
                if (mismatchDetails.length < 10) {
                    mismatchDetails.push({ x: sx, y: sy, template: tBinary, region: iBinary });
                }
            }
        }
    }
    
    const total = matches + mismatches;
    const score = total > 0 ? matches / total : 0;
    
    return {
        region: { width: region.width, height: region.height },
        template: { char: templateChar, width: template.width, height: template.height },
        scale,
        scaledTemplateWidth: scaledWidth,
        matches,
        mismatches,
        total,
        score: score.toFixed(3),
        sampleMismatches: mismatchDetails
    };
}
