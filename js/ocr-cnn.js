/**
 * OCR CNN inference via ONNX Runtime Web.
 * Loads an exported .onnx model and classifies 28x28 grayscale character images.
 */

let session = null;
let charClasses = '0123456789.-%';
let modelLoaded = false;

/**
 * Load the ONNX model and its companion metadata.
 * @param {string} modelPath - URL/path to the .onnx file
 * @param {string} [metaPath] - URL/path to the .json metadata (auto-derived if omitted)
 */
export async function loadModel(modelPath, metaPath) {
    if (typeof ort === 'undefined') {
        console.error('onnxruntime-web (ort) is not loaded. Add the CDN script to index.html.');
        return false;
    }

    try {
        // Load metadata if available
        if (!metaPath) {
            metaPath = modelPath.replace(/\.onnx$/, '.json');
        }
        try {
            const resp = await fetch(metaPath);
            if (resp.ok) {
                const meta = await resp.json();
                charClasses = meta.charClasses || charClasses;
            }
        } catch (_) {
            // Metadata file is optional
        }

        session = await ort.InferenceSession.create(modelPath, {
            executionProviders: ['wasm'],
        });
        modelLoaded = true;
        console.log(`OCR model loaded: ${modelPath} (${charClasses.length} classes)`);
        return true;
    } catch (e) {
        console.error('Failed to load ONNX model:', e);
        session = null;
        modelLoaded = false;
        return false;
    }
}

/**
 * @returns {boolean} Whether a model is currently loaded
 */
export function isModelLoaded() {
    return modelLoaded;
}

/**
 * @returns {string} The current character class string
 */
export function getCharClasses() {
    return charClasses;
}

/**
 * Set the character class string (if loaded externally).
 * @param {string} classes
 */
export function setCharClasses(classes) {
    charClasses = classes;
}

/**
 * Classify a single 28x28 grayscale character image.
 * @param {Float32Array} imageData - 784 values in [0, 1], row-major 28x28
 * @returns {Promise<{char: string, confidence: number}>}
 */
export async function predictSingle(imageData) {
    if (!session) return { char: '?', confidence: 0 };

    const tensor = new ort.Tensor('float32', imageData, [1, 1, 28, 28]);
    const results = await session.run({ input: tensor });
    const logits = results.logits.data;

    // Softmax
    const maxLogit = Math.max(...logits);
    const exps = Array.from(logits).map(v => Math.exp(v - maxLogit));
    const sumExp = exps.reduce((a, b) => a + b, 0);
    const probs = exps.map(v => v / sumExp);

    let bestIdx = 0;
    let bestProb = probs[0];
    for (let i = 1; i < probs.length; i++) {
        if (probs[i] > bestProb) {
            bestProb = probs[i];
            bestIdx = i;
        }
    }

    return {
        char: charClasses[bestIdx] || '?',
        confidence: bestProb,
    };
}

/**
 * Classify a batch of 28x28 character images.
 * @param {Float32Array[]} images - Array of 784-element Float32Arrays
 * @returns {Promise<string>} Concatenated recognized string
 */
export async function predictSequence(images) {
    if (!session || images.length === 0) return '';

    const batchSize = images.length;
    const batchData = new Float32Array(batchSize * 784);
    for (let i = 0; i < batchSize; i++) {
        batchData.set(images[i], i * 784);
    }

    const tensor = new ort.Tensor('float32', batchData, [batchSize, 1, 28, 28]);
    const results = await session.run({ input: tensor });
    const logits = results.logits.data;

    let text = '';
    const numClasses = charClasses.length;
    for (let b = 0; b < batchSize; b++) {
        const offset = b * numClasses;
        let bestIdx = 0;
        let bestVal = logits[offset];
        for (let c = 1; c < numClasses; c++) {
            if (logits[offset + c] > bestVal) {
                bestVal = logits[offset + c];
                bestIdx = c;
            }
        }
        text += charClasses[bestIdx] || '?';
    }

    return text;
}

/**
 * Unload the model and free resources.
 */
export function unloadModel() {
    session = null;
    modelLoaded = false;
}
