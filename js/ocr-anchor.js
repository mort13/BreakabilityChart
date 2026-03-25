/**
 * Anchor template matching for OCR.
 * Finds a template image (anchor) within a captured frame using
 * normalized cross-correlation (NCC) on grayscale data.
 *
 * This is the JavaScript equivalent of core/anchor.py using TM_CCOEFF_NORMED.
 */

import { toGrayscale } from './ocr-filters.js';

/**
 * Load an image from a URL/path and return its grayscale pixel data.
 * @param {string} src
 * @returns {Promise<{gray: Uint8Array, width: number, height: number} | null>}
 */
export async function loadTemplate(src) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const gray = toGrayscale(imageData);
            resolve({ gray, width: canvas.width, height: canvas.height });
        };
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

/**
 * Find the best match of a template within a frame using normalized cross-correlation.
 *
 * @param {Uint8Array} frameGray   - Grayscale pixel data of the frame
 * @param {number}     frameW      - Frame width
 * @param {number}     frameH      - Frame height
 * @param {Uint8Array} tmplGray    - Grayscale pixel data of the template
 * @param {number}     tmplW       - Template width
 * @param {number}     tmplH       - Template height
 * @param {number}     threshold   - Minimum correlation to count as found (0..1)
 * @param {Object}     [searchROI] - Optional sub-region {x, y, w, h} to restrict search
 * @returns {{found: boolean, x: number, y: number, confidence: number, anchorW: number, anchorH: number}}
 */
export function findAnchor(frameGray, frameW, frameH, tmplGray, tmplW, tmplH, threshold, searchROI) {
    const notFound = { found: false, x: 0, y: 0, confidence: 0, anchorW: tmplW, anchorH: tmplH };

    // Optionally restrict to a search sub-region
    let searchGray = frameGray;
    let sW = frameW;
    let sH = frameH;
    let offsetX = 0;
    let offsetY = 0;

    if (searchROI && searchROI.w > 0 && searchROI.h > 0) {
        const rx = Math.max(0, searchROI.x);
        const ry = Math.max(0, searchROI.y);
        const rx2 = Math.min(frameW, rx + searchROI.w);
        const ry2 = Math.min(frameH, ry + searchROI.h);
        sW = rx2 - rx;
        sH = ry2 - ry;

        if (sW < tmplW || sH < tmplH) return notFound;

        searchGray = new Uint8Array(sW * sH);
        for (let y = 0; y < sH; y++) {
            for (let x = 0; x < sW; x++) {
                searchGray[y * sW + x] = frameGray[(ry + y) * frameW + (rx + x)];
            }
        }
        offsetX = rx;
        offsetY = ry;
    }

    if (sW < tmplW || sH < tmplH) return notFound;

    // Precompute template stats
    const tmplN = tmplW * tmplH;
    let tmplSum = 0;
    for (let i = 0; i < tmplN; i++) tmplSum += tmplGray[i];
    const tmplMean = tmplSum / tmplN;

    let tmplStd = 0;
    for (let i = 0; i < tmplN; i++) {
        const d = tmplGray[i] - tmplMean;
        tmplStd += d * d;
    }
    tmplStd = Math.sqrt(tmplStd);
    if (tmplStd === 0) return notFound;

    // Slide template over search area, compute NCC.
    // Two-pass coarse-to-fine: stride 4 first, then refine in local neighbourhood.
    const maxX = sW - tmplW;
    const maxY = sH - tmplH;

    function nccAt(sx, sy) {
        let patchSum = 0;
        for (let ty = 0; ty < tmplH; ty++) {
            const rowOff = (sy + ty) * sW + sx;
            for (let tx = 0; tx < tmplW; tx++) {
                patchSum += searchGray[rowOff + tx];
            }
        }
        const patchMean = patchSum / tmplN;
        let numer = 0;
        let patchStd = 0;
        for (let ty = 0; ty < tmplH; ty++) {
            const rowOff = (sy + ty) * sW + sx;
            const tRowOff = ty * tmplW;
            for (let tx = 0; tx < tmplW; tx++) {
                const pd = searchGray[rowOff + tx] - patchMean;
                const td = tmplGray[tRowOff + tx] - tmplMean;
                numer += pd * td;
                patchStd += pd * pd;
            }
        }
        patchStd = Math.sqrt(patchStd);
        if (patchStd === 0) return -Infinity;
        return numer / (patchStd * tmplStd);
    }

    let bestScore = -Infinity;
    let bestX = 0;
    let bestY = 0;

    // Pass 1: coarse search (stride 4) — skip if search area is small enough
    const STRIDE = 4;
    const useCoarse = maxX > STRIDE * 4 && maxY > STRIDE * 4;
    const step = useCoarse ? STRIDE : 1;

    for (let sy = 0; sy <= maxY; sy += step) {
        for (let sx = 0; sx <= maxX; sx += step) {
            const score = nccAt(sx, sy);
            if (score > bestScore) {
                bestScore = score;
                bestX = sx;
                bestY = sy;
            }
        }
    }

    // Pass 2: refine around best coarse match at single-pixel resolution
    if (useCoarse) {
        const rx0 = Math.max(0, bestX - STRIDE);
        const rx1 = Math.min(maxX, bestX + STRIDE);
        const ry0 = Math.max(0, bestY - STRIDE);
        const ry1 = Math.min(maxY, bestY + STRIDE);
        for (let sy = ry0; sy <= ry1; sy++) {
            for (let sx = rx0; sx <= rx1; sx++) {
                const score = nccAt(sx, sy);
                if (score > bestScore) {
                    bestScore = score;
                    bestX = sx;
                    bestY = sy;
                }
            }
        }
    }

    if (bestScore >= threshold) {
        return {
            found: true,
            x: bestX + offsetX,
            y: bestY + offsetY,
            confidence: bestScore,
            anchorW: tmplW,
            anchorH: tmplH,
        };
    }

    return { ...notFound, confidence: bestScore };
}
