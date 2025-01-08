import init, { apply_grayscale } from '../../pkg/image_processor.js';

let originalCanvas, processedCanvas;
let originalCtx, processedCtx;

async function initialize() {
    await init();

    originalCanvas = document.getElementById('originalCanvas');
    processedCanvas = document.getElementById('processedCanvas');
    originalCtx = originalCanvas.getContext('2d');
    processedCtx = processedCanvas.getContext('2d');

    document.getElementById('imageInput').addEventListener('change', loadImage);
    document.getElementById('processButton').addEventListener('click', processImage);
}

async function loadImage(event) {
    const file = event.target.files[0];
    if (!file) return;

    const img = new Image();
    img.src = URL.createObjectURL(file);

    img.onload = () => {
        // Set canvas sizes
        originalCanvas.width = img.width;
        originalCanvas.height = img.height;
        processedCanvas.width = img.width;
        processedCanvas.height = img.height;

        // Draw original image
        originalCtx.drawImage(img, 0, 0);
    };
}

function processImage() {
    const imageData = originalCtx.getImageData(
        0, 0,
        originalCanvas.width,
        originalCanvas.height
    );

    try {
        apply_grayscale(
            processedCtx,
            originalCanvas.width,
            originalCanvas.height,
            new Uint8Array(imageData.data)
        );
    } catch (error) {
        console.error('Error processing image:', error);
    }
}

initialize();