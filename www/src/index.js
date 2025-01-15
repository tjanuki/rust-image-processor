import init, { apply_grayscale, merge_half_images, compress_image } from '../pkg/image_processor.js';

let originalCanvas1, originalCanvas2, mergedCanvas;
let originalCtx1, originalCtx2, mergedCtx;
let images = {
    first: { img: null, zoom: 1.0, width: 0, height: 0, offsetX: 0, offsetY: 0, isDragging: false },
    second: { img: null, zoom: 1.0, width: 0, height: 0, offsetX: 0, offsetY: 0, isDragging: false }
};

async function initialize() {
    await init();

    originalCanvas1 = document.getElementById('originalCanvas1');
    originalCanvas2 = document.getElementById('originalCanvas2');
    mergedCanvas = document.getElementById('mergedCanvas');

    originalCtx1 = originalCanvas1.getContext('2d');
    originalCtx2 = originalCanvas2.getContext('2d');
    mergedCtx = mergedCanvas.getContext('2d');

    // Add initial canvas sizes
    originalCanvas1.width = 400;
    originalCanvas1.height = 400;
    originalCanvas2.width = 400;
    originalCanvas2.height = 400;
    mergedCanvas.width = 400;
    mergedCanvas.height = 400;

    // Setup event listeners for dragging
    setupDragHandlers('first', originalCanvas1);
    setupDragHandlers('second', originalCanvas2);

    document.getElementById('imageInput1').addEventListener('change', (e) => loadImage(e, 'first'));
    document.getElementById('imageInput2').addEventListener('change', (e) => loadImage(e, 'second'));
    document.getElementById('mergeButton').addEventListener('click', mergeImages);
    document.getElementById('downloadButton').addEventListener('click', downloadMergedImage);

    // Initialize zoom controls
    window.adjustZoom = adjustZoom;
    window.updateZoom = updateZoom;
}

async function loadImage(event, which) {
    const file = event.target.files[0];
    if (!file) return;

    const img = new Image();
    img.src = URL.createObjectURL(file);

    img.onload = () => {
        // Store the image object and its original dimensions
        images[which].img = img;
        images[which].width = img.width;
        images[which].height = img.height;

        // Reset zoom when loading new image
        images[which].zoom = 1.0;
        document.getElementById(`zoomRange${which === 'first' ? '1' : '2'}`).value = 1;
        document.getElementById(`zoomValue${which === 'first' ? '1' : '2'}`).textContent = '100%';

        redrawImage(which);
    };
}

function redrawImage(which) {
    const canvas = which === 'first' ? originalCanvas1 : originalCanvas2;
    const ctx = which === 'first' ? originalCtx1 : originalCtx2;
    const imageData = images[which];

    if (!imageData.img) return;

    // Calculate zoomed dimensions
    const zoomedWidth = imageData.width * imageData.zoom;
    const zoomedHeight = imageData.height * imageData.zoom;

    // Set canvas size to container size
    canvas.width = 400;  // Match container width
    canvas.height = 400; // Match container height

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Calculate position to center the image
    const x = (canvas.width - zoomedWidth) / 2 + imageData.offsetX;
    const y = (canvas.height - zoomedHeight) / 2 + imageData.offsetY;

    // Draw zoomed image with offset
    ctx.drawImage(imageData.img, x, y, zoomedWidth, zoomedHeight);

    // Add shading overlay for unused portion
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'; // Semi-transparent black

    if (which === 'first') {
        // Shade right half for first image
        ctx.fillRect(canvas.width / 2, 0, canvas.width / 2, canvas.height);
    } else {
        // Shade left half for second image
        ctx.fillRect(0, 0, canvas.width / 2, canvas.height);
    }

    // Add a vertical line to show the split
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 0);
    ctx.lineTo(canvas.width / 2, canvas.height);
    ctx.stroke();
}

function adjustZoom(which, delta) {
    const rangeInput = document.getElementById(`zoomRange${which === 'first' ? '1' : '2'}`);
    const newZoom = Math.max(0.1, Math.min(3.0, parseFloat(rangeInput.value) + delta));
    updateZoom(which, newZoom);
    rangeInput.value = newZoom;
}

function updateZoom(which, value) {
    const zoom = parseFloat(value);
    images[which].zoom = zoom;
    document.getElementById(`zoomValue${which === 'first' ? '1' : '2'}`).textContent = `${Math.round(zoom * 100)}%`;
    redrawImage(which);
}

function mergeImages() {
    if (!images.first.img || !images.second.img) {
        alert('Please load both images first');
        return;
    }

    // Set merged canvas dimensions
    const width = 400;  // Match container width
    const height = 400; // Match container height
    mergedCanvas.width = width;
    mergedCanvas.height = height;

    // Get the current view of each canvas (what's visible in the viewport)
    const imageData1 = originalCtx1.getImageData(0, 0, width, height);
    const imageData2 = originalCtx2.getImageData(0, 0, width, height);

    try {
        merge_half_images(
            mergedCtx,
            width,
            height,
            new Uint8Array(imageData1.data),
            new Uint8Array(imageData2.data)
        );
    } catch (error) {
        console.error('Error merging images:', error);
    }

    // Enable download button after successful merge
    document.getElementById('downloadButton').disabled = false;
}

function setupDragHandlers(which, canvas) {
    let lastX = 0;
    let lastY = 0;

    canvas.addEventListener('mousedown', (e) => {
        const imageData = images[which];
        imageData.isDragging = true;
        const rect = canvas.getBoundingClientRect();
        lastX = e.clientX - rect.left;
        lastY = e.clientY - rect.top;
    });

    canvas.addEventListener('mousemove', (e) => {
        const imageData = images[which];
        if (!imageData.isDragging) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const deltaX = x - lastX;
        const deltaY = y - lastY;

        imageData.offsetX += deltaX;
        imageData.offsetY += deltaY;

        lastX = x;
        lastY = y;

        redrawImage(which);
    });

    canvas.addEventListener('mouseup', () => {
        images[which].isDragging = false;
    });

    canvas.addEventListener('mouseleave', () => {
        images[which].isDragging = false;
    });
}

function resetImagePosition(which) {
    images[which].offsetX = 0;
    images[which].offsetY = 0;
    images[which].isDragging = false;
}

async function downloadMergedImage() {
    const quality = parseInt(document.getElementById('compressionQuality').value) / 100;
    const imageData = mergedCtx.getImageData(0, 0, mergedCanvas.width, mergedCanvas.height);

    try {
        // Apply Rust-based compression
        await compress_image(
            mergedCtx,
            mergedCanvas.width,
            mergedCanvas.height,
            new Uint8Array(imageData.data),
            quality
        );

        // Get the compressed image and download
        const format = quality < 1 ? 'image/jpeg' : 'image/png';
        const extension = quality < 1 ? 'jpg' : 'png';
        const compressedData = mergedCanvas.toDataURL(format, quality);

        const link = document.createElement('a');
        link.href = compressedData;
        link.download = `merged-image.${extension}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Restore the original merged image
        mergedCtx.putImageData(imageData, 0, 0);
    } catch (error) {
        console.error('Error compressing image:', error);
    }
}

initialize();