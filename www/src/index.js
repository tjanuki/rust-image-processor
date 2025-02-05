import init, {compress_image, merge_half_images} from '../pkg/image_processor.js';

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
            // Corner handles
            'nw': {x: bounds.left - handleSize / 2, y: bounds.top - handleSize / 2, cursor: 'nw-resize'},
            'ne': {x: bounds.right - handleSize / 2, y: bounds.top - handleSize / 2, cursor: 'ne-resize'},
            'se': {x: bounds.right - handleSize / 2, y: bounds.bottom - handleSize / 2, cursor: 'se-resize'},
            'sw': {x: bounds.left - handleSize / 2, y: bounds.bottom - handleSize / 2, cursor: 'sw-resize'},
            // Edge handles
            'n': {
                x: bounds.left + (bounds.right - bounds.left) / 2 - handleSize / 2,
                y: bounds.top - handleSize / 2,
                cursor: 'n-resize'
            },
            's': {
                x: bounds.left + (bounds.right - bounds.left) / 2 - handleSize / 2,
                y: bounds.bottom - handleSize / 2,
                cursor: 's-resize'
            },
            'w': {
                x: bounds.left - handleSize / 2,
                y: bounds.top + (bounds.bottom - bounds.top) / 2 - handleSize / 2,
                cursor: 'w-resize'
            },
            'e': {
                x: bounds.right - handleSize / 2,
                y: bounds.top + (bounds.bottom - bounds.top) / 2 - handleSize / 2,
                cursor: 'e-resize'
            }
        };
    }
}

async function initialize() {
    await init();

    mainCanvas = document.getElementById('mainCanvas');
    mainCtx = mainCanvas.getContext('2d');

    mainCanvas.width = 400;
    mainCanvas.height = 400;

    // Draw initial guides
    drawGuides();

    // Hide the original file input
    const fileInput = document.getElementById('imageInput');
    fileInput.style.display = 'none';

    // Create Add Files button
    const addFilesBtn = document.createElement('button');
    addFilesBtn.id = 'addFilesBtn';
    addFilesBtn.textContent = 'Add Files';
    addFilesBtn.onclick = () => fileInput.click();

    // Insert the new button before the existing file input
    fileInput.parentNode.insertBefore(addFilesBtn, fileInput);

    // Update event listeners
    fileInput.addEventListener('change', handleFileSelect);
    document.getElementById('mergeButton').addEventListener('click', mergeImages);
    document.getElementById('downloadButton').addEventListener('click', downloadMergedImage);

    // Setup compression quality display
    const qualityInput = document.getElementById('compressionQuality');
    const qualityValue = document.getElementById('qualityValue');
    qualityInput.addEventListener('input', () => {
        qualityValue.textContent = `${qualityInput.value}%`;
    });

    setupMouseHandlers();

    // Add the button styles
    const style = document.createElement('style');
    style.textContent = `
        #addFilesBtn {
            padding: 8px 16px;
            margin-right: 10px;
            background-color: #4CAF50;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }

        #addFilesBtn:hover {
            background-color: #45a049;
        }
    `;
    document.head.appendChild(style);
}

function bringImageToFront(index) {
    if (index < 0 || index >= loadedImages.length) return;

    // Remove the image from its current position and add it to the end
    const image = loadedImages.splice(index, 1)[0];
    loadedImages.push(image);

    // Update active index to point to the new position
    activeImageIndex = loadedImages.length - 1;

    // Update the display
    updateImageList();
    redrawCanvas();
}

function handleFileSelect(event) {
    const files = event.target.files;
    if (!files.length) return;

    // Instead of clearing existing images, we'll add to them
    Array.from(files).forEach((file) => {
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

            // Center the image with slight offset from previous images
            const offset = loadedImages.length * 20;
            imageItem.x = (mainCanvas.width - imageItem.width) / 2 + offset;
            imageItem.y = (mainCanvas.height - imageItem.height) / 2 + offset;

            loadedImages.push(imageItem);
            activeImageIndex = loadedImages.length - 1;

            updateImageList();
            redrawCanvas();
        };
    });

    // Reset the file input so the same files can be selected again if needed
    event.target.value = '';
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
                if (i !== activeImageIndex) {
                    // Bring the clicked image to front
                    bringImageToFront(i);
                }

                // Set up dragging
                loadedImages[activeImageIndex].isDragging = true;
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

            switch (resizeHandle) {
                case 'se':
                    activeImage.width = Math.max(50, originalWidth + deltaX);
                    activeImage.height = Math.max(50, originalHeight + deltaY);
                    break;
                case 'sw':
                    activeImage.width = Math.max(50, originalWidth - deltaX);
                    activeImage.height = Math.max(50, originalHeight + deltaY);
                    activeImage.x = originalX + (originalWidth - activeImage.width);
                    break;
                case 'ne':
                    activeImage.width = Math.max(50, originalWidth + deltaX);
                    activeImage.height = Math.max(50, originalHeight - deltaY);
                    activeImage.y = originalY + (originalHeight - activeImage.height);
                    break;
                case 'nw':
                    activeImage.width = Math.max(50, originalWidth - deltaX);
                    activeImage.height = Math.max(50, originalHeight - deltaY);
                    activeImage.x = originalX + (originalWidth - activeImage.width);
                    activeImage.y = originalY + (originalHeight - activeImage.height);
                    break;
                case 'n':
                    activeImage.height = Math.max(50, originalHeight - deltaY);
                    activeImage.y = originalY + (originalHeight - activeImage.height);
                    break;
                case 's':
                    activeImage.height = Math.max(50, originalHeight + deltaY);
                    break;
                case 'w':
                    activeImage.width = Math.max(50, originalWidth - deltaX);
                    activeImage.x = originalX + (originalWidth - activeImage.width);
                    break;
                case 'e':
                    activeImage.width = Math.max(50, originalWidth + deltaX);
                    break;
            }
        } else if (activeImage.isDragging) {
            activeImage.x = mouseX - startX;
            activeImage.y = mouseY - startY;
        }

        redrawCanvas();
    });

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
    return x >= handle.x - handleSize / 2 && x <= handle.x + handleSize / 2 &&
        y >= handle.y - handleSize / 2 && y <= handle.y + handleSize / 2;
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

function removeImage(index) {
    if (index < 0 || index >= loadedImages.length) return;

    // Remove the image
    loadedImages.splice(index, 1);

    // Update active index
    if (activeImageIndex === index) {
        // If we removed the active image, select the last image or -1 if none left
        activeImageIndex = loadedImages.length > 0 ? loadedImages.length - 1 : -1;
    } else if (activeImageIndex > index) {
        // If we removed an image before the active one, decrement the active index
        activeImageIndex--;
    }

    // Update the display
    updateImageList();
    redrawCanvas();
}

function updateImageList() {
    const imageList = document.getElementById('imageList');
    imageList.innerHTML = '';

    loadedImages.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = `image-item ${index === activeImageIndex ? 'active' : ''}`;

        // Create container for image name and remove button
        const nameSpan = document.createElement('span');
        nameSpan.textContent = `Image ${index + 1}: ${item.file.name}`;
        nameSpan.style.flex = '1';
        nameSpan.style.cursor = 'pointer';
        nameSpan.onclick = (e) => {
            e.stopPropagation();
            bringImageToFront(index);
        };

        const removeBtn = document.createElement('button');
        removeBtn.textContent = '×';
        removeBtn.style.marginLeft = '8px';
        removeBtn.style.padding = '2px 6px';
        removeBtn.style.backgroundColor = '#ff4444';
        removeBtn.style.color = 'white';
        removeBtn.style.border = 'none';
        removeBtn.style.borderRadius = '3px';
        removeBtn.style.cursor = 'pointer';
        removeBtn.onclick = (e) => {
            e.stopPropagation();
            removeImage(index);
        };

        div.appendChild(nameSpan);
        div.appendChild(removeBtn);
        div.onclick = () => {
            bringImageToFront(index);
        };

        imageList.appendChild(div);
    });
}

function drawGuides() {
    const centerX = mainCanvas.width / 2;
    const centerY = mainCanvas.height / 2;

    // Set guide style
    mainCtx.setLineDash([5, 5]);
    mainCtx.lineWidth = 1;
    mainCtx.strokeStyle = 'rgba(102, 102, 102, 0.8)';

    // Draw vertical guide
    mainCtx.beginPath();
    mainCtx.moveTo(centerX, 0);
    mainCtx.lineTo(centerX, mainCanvas.height);
    mainCtx.stroke();

    // Draw horizontal guide
    mainCtx.beginPath();
    mainCtx.moveTo(0, centerY);
    mainCtx.lineTo(mainCanvas.width, centerY);
    mainCtx.stroke();

    // Reset line style
    mainCtx.setLineDash([]);
}

function redrawCanvas() {
    mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);

    // Draw guides first (will be underneath images)
    drawGuides();

    // Draw images
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

    // Draw guides again on top
    drawGuides();
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
