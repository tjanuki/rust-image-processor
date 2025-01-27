import init, { merge_half_images, compress_image } from '../pkg/image_processor.js';

let mainCanvas, mainCtx;
let loadedImages = [];
let activeImageIndex = -1;

class ImageItem {
    constructor(file, img) {
        this.file = file;
        this.img = img;
        this.zoom = 1.0;
        this.offsetX = 0;
        this.offsetY = 0;
        this.isDragging = false;
    }
}

async function initialize() {
    await init();

    mainCanvas = document.getElementById('mainCanvas');
    mainCtx = mainCanvas.getContext('2d');

    // Set initial canvas size
    mainCanvas.width = 400;
    mainCanvas.height = 400;

    // Setup event listeners
    document.getElementById('imageInput').addEventListener('change', handleFileSelect);
    document.getElementById('mergeButton').addEventListener('click', mergeImages);
    document.getElementById('downloadButton').addEventListener('click', downloadMergedImage);
    document.getElementById('zoomInBtn').addEventListener('click', () => adjustZoom(0.1));
    document.getElementById('zoomOutBtn').addEventListener('click', () => adjustZoom(-0.1));
    document.getElementById('zoomRange').addEventListener('input', (e) => updateZoom(parseFloat(e.target.value)));
    setupDragHandlers();
}

function handleFileSelect(event) {
    const files = event.target.files;
    if (!files.length) return;

    // Clear previous images if any
    loadedImages = [];
    activeImageIndex = -1;
    updateImageList();
    updateZoomControls();

    // Load each selected image
    Array.from(files).forEach((file, index) => {
        const img = new Image();
        img.src = URL.createObjectURL(file);

        img.onload = () => {
            loadedImages.push(new ImageItem(file, img));
            if (index === 0) {
                activeImageIndex = 0;
            }
            updateImageList();
            redrawCanvas();
        };
    });
}

function updateImageList() {
    const imageList = document.getElementById('imageList');
    imageList.innerHTML = '';

    loadedImages.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = `image-item ${index === activeImageIndex ? 'active' : ''}`;
        div.textContent = `Image ${index + 1}: ${item.file.name}`;
        div.onclick = () => {
            activeImageIndex = index;
            updateImageList();
            updateZoomControls();
            redrawCanvas();
        };
        imageList.appendChild(div);
    });
}

function updateZoomControls() {
    const zoomRange = document.getElementById('zoomRange');
    const zoomValue = document.getElementById('zoomValue');
    const zoomControls = document.querySelector('.zoom-controls');

    if (activeImageIndex !== -1) {
        const currentZoom = loadedImages[activeImageIndex].zoom;
        zoomRange.value = currentZoom;
        zoomValue.textContent = `${Math.round(currentZoom * 100)}%`;
        zoomControls.style.opacity = '1';
        zoomControls.style.pointerEvents = 'auto';
    } else {
        zoomRange.value = 1;
        zoomValue.textContent = '100%';
        zoomControls.style.opacity = '0.5';
        zoomControls.style.pointerEvents = 'none';
    }
}

function adjustZoom(delta) {
    if (activeImageIndex === -1) return;

    const zoomRange = document.getElementById('zoomRange');
    const currentZoom = parseFloat(zoomRange.value);
    const newZoom = Math.max(0.1, Math.min(3.0, currentZoom + delta));
    updateZoom(newZoom);
    zoomRange.value = newZoom;
}

function updateZoom(value) {
    if (activeImageIndex === -1) return;

    const zoom = parseFloat(value);
    loadedImages[activeImageIndex].zoom = zoom;
    document.getElementById('zoomValue').textContent = `${Math.round(zoom * 100)}%`;
    redrawCanvas();
}

function redrawCanvas() {
    mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);

    loadedImages.forEach((imageItem, index) => {
        const zoomedWidth = imageItem.img.width * imageItem.zoom;
        const zoomedHeight = imageItem.img.height * imageItem.zoom;

        // Calculate centered position
        const x = (mainCanvas.width - zoomedWidth) / 2 + imageItem.offsetX;
        const y = (mainCanvas.height - zoomedHeight) / 2 + imageItem.offsetY;

        // Draw image
        mainCtx.drawImage(imageItem.img, x, y, zoomedWidth, zoomedHeight);

        // Highlight active image with a border
        if (index === activeImageIndex) {
            mainCtx.strokeStyle = '#00ff00';
            mainCtx.lineWidth = 2;
            mainCtx.strokeRect(x, y, zoomedWidth, zoomedHeight);
        }
    });
}

function setupDragHandlers() {
    let lastX = 0;
    let lastY = 0;

    mainCanvas.addEventListener('mousedown', (e) => {
        if (activeImageIndex === -1) return;

        const rect = mainCanvas.getBoundingClientRect();
        lastX = e.clientX - rect.left;
        lastY = e.clientY - rect.top;
        loadedImages[activeImageIndex].isDragging = true;
    });

    mainCanvas.addEventListener('mousemove', (e) => {
        if (activeImageIndex === -1 || !loadedImages[activeImageIndex].isDragging) return;

        const rect = mainCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const deltaX = x - lastX;
        const deltaY = y - lastY;

        loadedImages[activeImageIndex].offsetX += deltaX;
        loadedImages[activeImageIndex].offsetY += deltaY;

        lastX = x;
        lastY = y;
        redrawCanvas();
    });

    mainCanvas.addEventListener('mouseup', () => {
        if (activeImageIndex !== -1) {
            loadedImages[activeImageIndex].isDragging = false;
        }
    });

    mainCanvas.addEventListener('mouseleave', () => {
        if (activeImageIndex !== -1) {
            loadedImages[activeImageIndex].isDragging = false;
        }
    });
}

function mergeImages() {
    if (loadedImages.length < 2) {
        alert('Please load at least two images');
        return;
    }

    // Get the current canvas state
    const imageData = mainCtx.getImageData(0, 0, mainCanvas.width, mainCanvas.height);

    try {
        // Use existing merge function
        merge_half_images(
            mainCtx,
            mainCanvas.width,
            mainCanvas.height,
            new Uint8Array(imageData.data),
            new Uint8Array(imageData.data)
        );

        // Enable download button after successful merge
        document.getElementById('downloadButton').disabled = false;
    } catch (error) {
        console.error('Error merging images:', error);
    }
}

async function downloadMergedImage() {
    const quality = parseInt(document.getElementById('compressionQuality').value) / 100;
    const imageData = mainCtx.getImageData(0, 0, mainCanvas.width, mainCanvas.height);

    try {
        // Apply compression
        await compress_image(
            mainCtx,
            mainCanvas.width,
            mainCanvas.height,
            new Uint8Array(imageData.data),
            quality
        );

        // Download the compressed image
        const format = quality < 1 ? 'image/jpeg' : 'image/png';
        const extension = quality < 1 ? 'jpg' : 'png';
        const compressedData = mainCanvas.toDataURL(format, quality);

        const link = document.createElement('a');
        link.href = compressedData;
        link.download = `merged-image.${extension}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Restore the original merged image
        mainCtx.putImageData(imageData, 0, 0);
    } catch (error) {
        console.error('Error compressing image:', error);
    }
}

initialize();