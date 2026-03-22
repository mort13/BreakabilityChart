/**
 * Image filter pipeline for OCR preprocessing.
 * Mirrors the Python ImageFilterPipeline: brightness -> contrast -> channel -> grayscale -> threshold -> invert.
 * Operates on ImageData (RGBA pixel arrays from Canvas).
 */

/**
 * Apply the full filter chain to an ImageData object.
 * Returns a new ImageData (does not mutate the input).
 * @param {ImageData} imageData
 * @param {Object} filters
 * @param {number}  filters.brightness      - additive brightness (-255..255)
 * @param {number}  filters.contrast        - contrast adjustment (-100..100)
 * @param {number}  filters.threshold       - binary threshold level (0..255)
 * @param {boolean} filters.thresholdEnabled
 * @param {boolean} filters.grayscale
 * @param {boolean} filters.invert
 * @param {string}  filters.channel         - "none" | "red" | "green" | "blue"
 * @returns {ImageData}
 */
export function applyFilters(imageData, filters) {
    const { width, height } = imageData;
    const src = imageData.data;
    const dst = new Uint8ClampedArray(src.length);
    dst.set(src);

    // 1. Brightness
    if (filters.brightness !== 0) {
        for (let i = 0; i < dst.length; i += 4) {
            dst[i]     = dst[i]     + filters.brightness;
            dst[i + 1] = dst[i + 1] + filters.brightness;
            dst[i + 2] = dst[i + 2] + filters.brightness;
        }
    }

    // 2. Contrast
    if (filters.contrast !== 0) {
        const alpha = 1.0 + filters.contrast / 100.0;
        for (let i = 0; i < dst.length; i += 4) {
            dst[i]     = alpha * dst[i];
            dst[i + 1] = alpha * dst[i + 1];
            dst[i + 2] = alpha * dst[i + 2];
        }
    }

    // 3. Channel isolation
    if (filters.channel && filters.channel !== 'none') {
        const keepMap = { red: 0, green: 1, blue: 2 };
        const keep = keepMap[filters.channel];
        if (keep !== undefined) {
            for (let i = 0; i < dst.length; i += 4) {
                for (let c = 0; c < 3; c++) {
                    if (c !== keep) dst[i + c] = 0;
                }
            }
        }
    }

    // 4. Grayscale
    if (filters.grayscale) {
        for (let i = 0; i < dst.length; i += 4) {
            // BT.601 luma weights (matching OpenCV's cvtColor BGR2GRAY)
            const gray = 0.114 * dst[i] + 0.587 * dst[i + 1] + 0.299 * dst[i + 2];
            dst[i] = dst[i + 1] = dst[i + 2] = gray;
        }
    }

    // 5. Binary threshold
    if (filters.thresholdEnabled) {
        for (let i = 0; i < dst.length; i += 4) {
            const gray = 0.114 * dst[i] + 0.587 * dst[i + 1] + 0.299 * dst[i + 2];
            const val = gray >= filters.threshold ? 255 : 0;
            dst[i] = dst[i + 1] = dst[i + 2] = val;
        }
    }

    // 6. Invert
    if (filters.invert) {
        for (let i = 0; i < dst.length; i += 4) {
            dst[i]     = 255 - dst[i];
            dst[i + 1] = 255 - dst[i + 1];
            dst[i + 2] = 255 - dst[i + 2];
        }
    }

    return new ImageData(dst, width, height);
}

/**
 * Convert an ImageData to a single-channel grayscale Uint8Array.
 * @param {ImageData} imageData
 * @returns {Uint8Array} w*h grayscale values
 */
export function toGrayscale(imageData) {
    const { width, height, data } = imageData;
    const gray = new Uint8Array(width * height);
    for (let i = 0; i < gray.length; i++) {
        const p = i * 4;
        gray[i] = 0.114 * data[p] + 0.587 * data[p + 1] + 0.299 * data[p + 2];
    }
    return gray;
}
