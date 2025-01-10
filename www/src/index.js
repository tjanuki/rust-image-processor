import init, { apply_grayscale, merge_half_images } from '../pkg/image_processor.js';

let originalCanvas1, originalCanvas2, mergedCanvas;
let originalCtx1, originalCtx2, mergedCtx;
let images = { first: null, second: null };

async function initialize() {
    await init();

    originalCanvas1 = document.getElementById('originalCanvas1');
    originalCanvas2 = document.getElementById('originalCanvas2');
    mergedCanvas = document.getElementById('mergedCanvas');

    originalCtx1 = originalCanvas1.getContext('2d');
    originalCtx2 = originalCanvas2.getContext('2d');
    mergedCtx = mergedCanvas.getContext('2d');

    document.getElementById('imageInput1').addEventListener('change', (e) => loadImage(e, 'first'));
    document.getElementById('imageInput2').addEventListener('change', (e) => loadImage(e, 'second'));
    document.getElementById('mergeButton').addEventListener('click', mergeImages);
}

async function loadImage(event, which) {
    const file = event.target.files[0];
    if (!file) return;

    const img = new Image();
    img.src = URL.createObjectURL(file);

    img.onload = () => {
        const canvas = which === 'first' ? originalCanvas1 : originalCanvas2;
        const ctx = which === 'first' ? originalCtx1 : originalCtx2;

        // Store image dimensions
        images[which] = { width: img.width, height: img.height };

        // Set canvas sizes
        canvas.width = img.width;
        canvas.height = img.height;
        mergedCanvas.width = img.width;
        mergedCanvas.height = img.height;

        // Draw original image
        ctx.drawImage(img, 0, 0);
    };
}

function mergeImages() {
    if (!images.first || !images.second) {
        alert('Please load both images first');
        return;
    }

    const imageData1 = originalCtx1.getImageData(
        0, 0,
        originalCanvas1.width,
        originalCanvas1.height
    );

    const imageData2 = originalCtx2.getImageData(
        0, 0,
        originalCanvas2.width,
        originalCanvas2.height
    );

    try {
        merge_half_images(
            mergedCtx,
            originalCanvas1.width,
            originalCanvas1.height,
            new Uint8Array(imageData1.data),
            new Uint8Array(imageData2.data)
        );
    } catch (error) {
        console.error('Error merging images:', error);
    }
}

initialize();