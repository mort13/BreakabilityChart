/**
 * Character segmentation for OCR.
 * Mirrors the Python CharacterSegmenter: projection, contour (connected-component), and fixed_width modes.
 * Operates on grayscale Uint8Array data.
 */

const TARGET_SIZE = 28;
const MIN_CHAR_WIDTH = 3;
const MIN_CHAR_HEIGHT = 5;
const PADDING = 2;

/**
 * Segment a grayscale ROI image into individual 28x28 character crops.
 * @param {Uint8Array} gray - Grayscale pixel data (w*h)
 * @param {number} width
 * @param {number} height
 * @param {Object} opts
 * @param {string} opts.segMode      - "projection" | "fixed_width"
 * @param {number} opts.charWidth    - px per char for fixed_width fallback (0 = estimate)
 * @param {number} opts.charCount    - exact char count for fixed_width (0 = use charWidth)
 * @returns {Float32Array[]} Array of 784-element Float32Arrays (28x28, [0,1])
 */
export function segment(gray, width, height, opts = {}) {
    const { segMode = 'projection', charWidth = 0, charCount = 0 } = opts;

    const binary = binarize(gray, width, height);

    let boxes;
    if (segMode === 'fixed_width') {
        boxes = boxesFixedWidth(binary, width, height, charWidth, charCount);
    } else {
        boxes = boxesProjection(binary, width, height);
    }

    return boxes.map(box => makeChar(gray, width, height, box));
}

/**
 * Otsu binarization (white chars on black background).
 * @param {Uint8Array} gray
 * @param {number} w
 * @param {number} h
 * @returns {Uint8Array} binary image (0 or 255)
 */
function binarize(gray, w, h) {
    const total = w * h;

    // Compute histogram
    const hist = new Int32Array(256);
    for (let i = 0; i < total; i++) hist[gray[i]]++;

    // Otsu threshold
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];

    let sumB = 0, wB = 0, wF = 0;
    let maxVariance = 0, threshold = 0;

    for (let t = 0; t < 256; t++) {
        wB += hist[t];
        if (wB === 0) continue;
        wF = total - wB;
        if (wF === 0) break;

        sumB += t * hist[t];
        const mB = sumB / wB;
        const mF = (sum - sumB) / wF;
        const between = wB * wF * (mB - mF) * (mB - mF);

        if (between > maxVariance) {
            maxVariance = between;
            threshold = t;
        }
    }

    const binary = new Uint8Array(total);
    for (let i = 0; i < total; i++) {
        binary[i] = gray[i] > threshold ? 255 : 0;
    }
    return binary;
}

/**
 * Vertical projection histogram segmentation.
 */
function boxesProjection(binary, w, h) {
    // Column projection: sum non-zero pixels per column
    const proj = new Int32Array(w);
    for (let x = 0; x < w; x++) {
        let count = 0;
        for (let y = 0; y < h; y++) {
            if (binary[y * w + x] > 0) count++;
        }
        proj[x] = count;
    }

    // Find contiguous non-zero spans
    const spans = [];
    let inChar = false, start = 0;
    for (let x = 0; x <= w; x++) {
        const val = x < w ? proj[x] : 0;
        if (val > 0 && !inChar) {
            inChar = true;
            start = x;
        } else if (val === 0 && inChar) {
            inChar = false;
            if (x - start >= MIN_CHAR_WIDTH) {
                spans.push([start, x]);
            }
        }
    }

    // Tighten vertical bounds for each span
    const boxes = [];
    for (const [x1, x2] of spans) {
        let y1 = h, y2 = 0;
        for (let y = 0; y < h; y++) {
            for (let x = x1; x < x2; x++) {
                if (binary[y * w + x] > 0) {
                    if (y < y1) y1 = y;
                    if (y > y2) y2 = y;
                }
            }
        }
        y2 += 1;
        if (y2 - y1 >= MIN_CHAR_HEIGHT) {
            boxes.push({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
        }
    }

    return boxes;
}

/**
 * Fixed-width column slicing.
 */
function boxesFixedWidth(binary, w, h, charWidth, charCount) {
    let nChars;
    if (charCount > 0) {
        nChars = charCount;
    } else {
        const cw = charWidth > 0 ? charWidth : Math.max(1, Math.floor(h * 0.6));
        nChars = Math.max(1, Math.round(w / cw));
    }

    const actualCw = w / nChars;
    const boxes = [];

    for (let i = 0; i < nChars; i++) {
        const x1 = Math.floor(i * actualCw);
        const x2 = Math.min(Math.floor((i + 1) * actualCw), w);
        if (x2 - x1 < MIN_CHAR_WIDTH) continue;

        // Tighten vertical bounds
        let y1 = h, y2 = 0;
        for (let y = 0; y < h; y++) {
            for (let x = x1; x < x2; x++) {
                if (binary[y * w + x] > 0) {
                    if (y < y1) y1 = y;
                    if (y > y2) y2 = y;
                }
            }
        }
        y2 += 1;
        if (y2 - y1 < MIN_CHAR_HEIGHT) continue;

        boxes.push({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
    }

    return boxes;
}

/**
 * Crop, pad, resize to 28x28, and normalize a character bounding box.
 * @returns {Float32Array} 784-element array, values [0,1]
 */
function makeChar(gray, imgW, imgH, box) {
    // Crop
    const crop = new Uint8Array(box.w * box.h);
    for (let y = 0; y < box.h; y++) {
        for (let x = 0; x < box.w; x++) {
            crop[y * box.w + x] = gray[(box.y + y) * imgW + (box.x + x)];
        }
    }

    // Pad with white (255)
    const pw = box.w + PADDING * 2;
    const ph = box.h + PADDING * 2;
    const padded = new Uint8Array(pw * ph);
    padded.fill(255);
    for (let y = 0; y < box.h; y++) {
        for (let x = 0; x < box.w; x++) {
            padded[(y + PADDING) * pw + (x + PADDING)] = crop[y * box.w + x];
        }
    }

    // Resize to 28x28 using bilinear interpolation
    const resized = resizeBilinear(padded, pw, ph, TARGET_SIZE, TARGET_SIZE);

    // Normalize to [0, 1]
    const normalized = new Float32Array(TARGET_SIZE * TARGET_SIZE);
    for (let i = 0; i < normalized.length; i++) {
        normalized[i] = resized[i] / 255.0;
    }

    return normalized;
}

/**
 * Bilinear interpolation resize for grayscale image.
 */
function resizeBilinear(src, srcW, srcH, dstW, dstH) {
    const dst = new Uint8Array(dstW * dstH);
    const xRatio = srcW / dstW;
    const yRatio = srcH / dstH;

    for (let dy = 0; dy < dstH; dy++) {
        for (let dx = 0; dx < dstW; dx++) {
            const sx = dx * xRatio;
            const sy = dy * yRatio;
            const x0 = Math.floor(sx);
            const y0 = Math.floor(sy);
            const x1 = Math.min(x0 + 1, srcW - 1);
            const y1 = Math.min(y0 + 1, srcH - 1);
            const xFrac = sx - x0;
            const yFrac = sy - y0;

            const tl = src[y0 * srcW + x0];
            const tr = src[y0 * srcW + x1];
            const bl = src[y1 * srcW + x0];
            const br = src[y1 * srcW + x1];

            const top = tl + (tr - tl) * xFrac;
            const bottom = bl + (br - bl) * xFrac;
            dst[dy * dstW + dx] = Math.round(top + (bottom - top) * yFrac);
        }
    }

    return dst;
}
