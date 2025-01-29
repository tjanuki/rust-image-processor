import init, { merge_half_images, compress_image } from '../pkg/image_processor.js';

let mainCanvas, mainCtx;
let loadedImages = [];
let activeImageIndex = -1;
let resizeHandle = null;

class ImageItem {
    constructor(file, img) {
        this.file = file;
        this.img = img;
        this.width = img.width;
        this.height = img.height;
        this.x = 0;
        this.y = 0;
        this.isDragging = false;
        this.isResizing = false;
    }

    getBounds() {
        return {
            left: this.x,
            top: this.y,
            right: this.x + this.width,
            bottom: this.y + this.height,
        };
    }

    getHandles() {
        const bounds = this.getBounds();
        const handleSize = 8;
        return {
            'nw': { x: bounds.left - handleSize/2, y: bounds.top - handleSize/2, cursor: 'nw-resize' },
            'ne': { x: bounds.right - handleSize/2, y: bounds.top - handleSize/2, cursor: 'ne-resize' },
            'se': { x: bounds.right - handleSize/2, y: bounds.bottom - handleSize/2, cursor: 'se-resize' },
            'sw': { x: bounds.left - handleSize/2, y: bounds.bottom - handleSize/2, cursor: 'sw-resize' }
        };
    }
}

async function initialize() {
    await init();

    mainCanvas = document.getElementById('mainCanvas');
    mainCtx = mainCanvas.getContext('2d');

    mainCanvas.width = 400;
    mainCanvas.height = 400;

    document.getElementById('imageInput').addEventListener('change', handleFileSelect);
    document.getElementById('mergeButton').addEventListener('click', mergeImages);
    document.getElementById('downloadButton').addEventListener('click', downloadMergedImage);

    // Setup compression quality display
    const qualityInput = document.getElementById('compressionQuality');
    const qualityValue = document.getElementById('qualityValue');
    qualityInput.addEventListener('input', () => {
        qualityValue.textContent = `${qualityInput.value}%`;
    });

    setupMouseHandlers();
}

function handleFileSelect(event) {
    const files = event.target.files;
    if (!files.length) return;

    loadedImages = [];
    activeImageIndex = -1;
    updateImageList();

    Array.from(files).forEach((file, index) => {
        const img = new Image();
        img.src = URL.createObjectURL(file);

        img.onload = () => {
            const imageItem = new ImageItem(file, img);

            // Scale image if it's too large
            const maxDimension = 400;
            if (imageItem.width > maxDimension || imageItem.height > maxDimension) {
                const scale = maxDimension / Math.max(imageItem.width, imageItem.height);
                imageItem.width *= scale;
                imageItem.height *= scale;
            }

            // Center the image
            imageItem.x = (mainCanvas.width - imageItem.width) / 2;
            imageItem.y = (mainCanvas.height - imageItem.height) / 2;

            loadedImages.push(imageItem);
            if (index === 0) {
                activeImageIndex = 0;
            }
            updateImageList();
            redrawCanvas();
        };
    });
}

function setupMouseHandlers() {
    let startX, startY;
    let originalWidth, originalHeight, originalX, originalY;

    mainCanvas.addEventListener('mousedown', (e) => {
        const rect = mainCanvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // First check if we clicked on a handle of the active image
        if (activeImageIndex !== -1) {
            const activeImage = loadedImages[activeImageIndex];
            const handles = activeImage.getHandles();

            for (const [position, handle] of Object.entries(handles)) {
                if (isPointInHandle(mouseX, mouseY, handle)) {
                    activeImage.isResizing = true;
                    resizeHandle = position;
                    startX = mouseX;
                    startY = mouseY;
                    originalWidth = activeImage.width;
                    originalHeight = activeImage.height;
                    originalX = activeImage.x;
                    originalY = activeImage.y;
                    return;
                }
            }
        }

        // Check all images in reverse order (top to bottom)
        for (let i = loadedImages.length - 1; i >= 0; i--) {
            const image = loadedImages[i];
            if (isPointInImage(mouseX, mouseY, image)) {
                // If clicking a different image, update selection
                if (i !== activeImageIndex) {
                    activeImageIndex = i;
                    updateImageList();
                }

                // Set up dragging
                image.isDragging = true;
                startX = mouseX - image.x;
                startY = mouseY - image.y;
                redrawCanvas();
                return;
            }
        }

        // If we clicked empty space, deselect
        activeImageIndex = -1;
        updateImageList();
        redrawCanvas();
    });

    // Keep existing mousemove handler
    mainCanvas.addEventListener('mousemove', (e) => {
        if (activeImageIndex === -1) return;

        const rect = mainCanvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const activeImage = loadedImages[activeImageIndex];

        // Update cursor based on position
        updateCursor(mouseX, mouseY, activeImage);

        if (activeImage.isResizing && resizeHandle) {
            const deltaX = mouseX - startX;
            const deltaY = mouseY - startY;

            // Calculate new size while maintaining aspect ratio
            const aspectRatio = activeImage.img.width / activeImage.img.height;

            switch (resizeHandle) {
                case 'se':
                    activeImage.width = Math.max(50, originalWidth + deltaX);
                    activeImage.height = activeImage.width / aspectRatio;
                    break;
                case 'sw':
                    activeImage.width = Math.max(50, originalWidth - deltaX);
                    activeImage.height = activeImage.width / aspectRatio;
                    activeImage.x = originalX + (originalWidth - activeImage.width);
                    break;
                case 'ne':
                    activeImage.width = Math.max(50, originalWidth + deltaX);
                    activeImage.height = activeImage.width / aspectRatio;
                    activeImage.y = originalY + (originalHeight - activeImage.height);
                    break;
                case 'nw':
                    activeImage.width = Math.max(50, originalWidth - deltaX);
                    activeImage.height = activeImage.width / aspectRatio;
                    activeImage.x = originalX + (originalWidth - activeImage.width);
                    activeImage.y = originalY + (originalHeight - activeImage.height);
                    break;
            }
        } else if (activeImage.isDragging) {
            activeImage.x = mouseX - startX;
            activeImage.y = mouseY - startY;
        }

        redrawCanvas();
    });

    // Keep existing mouseup and mouseleave handlers
    mainCanvas.addEventListener('mouseup', () => {
        if (activeImageIndex !== -1) {
            loadedImages[activeImageIndex].isDragging = false;
            loadedImages[activeImageIndex].isResizing = false;
            resizeHandle = null;
        }
    });

    mainCanvas.addEventListener('mouseleave', () => {
        if (activeImageIndex !== -1) {
            loadedImages[activeImageIndex].isDragging = false;
            loadedImages[activeImageIndex].isResizing = false;
            resizeHandle = null;
        }
    });
}

function isPointInHandle(x, y, handle) {
    const handleSize = 8;
    return x >= handle.x - handleSize/2 && x <= handle.x + handleSize/2 &&
        y >= handle.y - handleSize/2 && y <= handle.y + handleSize/2;
}

function isPointInImage(x, y, image) {
    const bounds = image.getBounds();
    return x >= bounds.left && x <= bounds.right &&
        y >= bounds.top && y <= bounds.bottom;
}

function updateCursor(x, y, image) {
    const handles = image.getHandles();
    let cursor = 'default';

    // Check handles first
    for (const handle of Object.values(handles)) {
        if (isPointInHandle(x, y, handle)) {
            cursor = handle.cursor;
            break;
        }
    }

    // Check if over image
    if (cursor === 'default' && isPointInImage(x, y, image)) {
        cursor = 'move';
    }

    mainCanvas.style.cursor = cursor;
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
            redrawCanvas();
        };
        imageList.appendChild(div);
    });
}

function redrawCanvas() {
    mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);

    loadedImages.forEach((imageItem, index) => {
        // Draw image
        mainCtx.drawImage(imageItem.img, imageItem.x, imageItem.y, imageItem.width, imageItem.height);

        // Draw resize handles for active image
        if (index === activeImageIndex) {
            mainCtx.strokeStyle = '#00ff00';
            mainCtx.lineWidth = 2;
            mainCtx.strokeRect(imageItem.x, imageItem.y, imageItem.width, imageItem.height);

            // Draw resize handles
            const handles = imageItem.getHandles();
            mainCtx.fillStyle = '#ffffff';
            mainCtx.strokeStyle = '#00ff00';

            for (const handle of Object.values(handles)) {
                mainCtx.beginPath();
                mainCtx.arc(handle.x, handle.y, 4, 0, Math.PI * 2);
                mainCtx.fill();
                mainCtx.stroke();
            }
        }
    });
}

function mergeImages() {
    if (loadedImages.length < 2) {
        alert('Please load at least two images');
        return;
    }

    const imageData = mainCtx.getImageData(0, 0, mainCanvas.width, mainCanvas.height);

    try {
        merge_half_images(
            mainCtx,
            mainCanvas.width,
            mainCanvas.height,
            new Uint8Array(imageData.data),
            new Uint8Array(imageData.data)
        );

        document.getElementById('downloadButton').disabled = false;
    } catch (error) {
        console.error('Error merging images:', error);
    }
}

async function downloadMergedImage() {
    const quality = parseInt(document.getElementById('compressionQuality').value) / 100;
    const imageData = mainCtx.getImageData(0, 0, mainCanvas.width, mainCanvas.height);

    try {
        await compress_image(
            mainCtx,
            mainCanvas.width,
            mainCanvas.height,
            new Uint8Array(imageData.data),
            quality
        );

        const format = quality < 1 ? 'image/jpeg' : 'image/png';
        const extension = quality < 1 ? 'jpg' : 'png';
        const compressedData = mainCanvas.toDataURL(format, quality);

        const link = document.createElement('a');
        link.href = compressedData;
        link.download = `merged-image.${extension}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        mainCtx.putImageData(imageData, 0, 0);
    } catch (error) {
        console.error('Error compressing image:', error);
    }
}

initialize();