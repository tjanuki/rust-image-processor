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
        this.isCropping = false;
        this.cropStart = null;
        this.cropEnd = null;
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

    getCropRect() {
        if (!this.cropStart || !this.cropEnd) return null;

        return {
            x: Math.min(this.cropStart.x, this.cropEnd.x),
            y: Math.min(this.cropStart.y, this.cropEnd.y),
            width: Math.abs(this.cropStart.x - this.cropEnd.x),
            height: Math.abs(this.cropStart.y - this.cropEnd.y)
        };
    }
}

async function initialize() {
    await init();

    mainCanvas = document.getElementById('mainCanvas');
    mainCtx = mainCanvas.getContext('2d');

    mainCanvas.width = 400;
    mainCanvas.height = 400;

    drawGuides();

    const fileInput = document.getElementById('imageInput');
    fileInput.style.display = 'none';

    const addFilesBtn = document.createElement('button');
    addFilesBtn.id = 'addFilesBtn';
    addFilesBtn.textContent = 'Add Files';
    addFilesBtn.onclick = () => fileInput.click();

    fileInput.parentNode.insertBefore(addFilesBtn, fileInput);

    fileInput.addEventListener('change', handleFileSelect);
    document.getElementById('mergeButton').addEventListener('click', mergeImages);
    document.getElementById('downloadButton').addEventListener('click', downloadMergedImage);

    setupMouseHandlers();
    addCropButton();

    const style = document.createElement('style');
    style.textContent = `
        #addFilesBtn, #cropButton, #applyCropButton {
            padding: 8px 16px;
            margin-right: 10px;
            background-color: #4CAF50;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }

        #addFilesBtn:hover, #cropButton:hover, #applyCropButton:hover {
            background-color: #45a049;
        }
    `;
    document.head.appendChild(style);
}

function addCropButton() {
    const controls = document.querySelector('.controls');
    const cropBtn = document.createElement('button');
    cropBtn.id = 'cropButton';
    cropBtn.textContent = 'Toggle Crop Mode';
    cropBtn.style.marginRight = '10px';
    controls.insertBefore(cropBtn, document.getElementById('mergeButton'));

    const applyCropBtn = document.createElement('button');
    applyCropBtn.id = 'applyCropButton';
    applyCropBtn.textContent = 'Apply Crop';
    applyCropBtn.style.display = 'none';
    controls.insertBefore(applyCropBtn, document.getElementById('mergeButton'));

    cropBtn.onclick = toggleCropMode;
    applyCropBtn.onclick = applyCrop;
}

function toggleCropMode() {
    if (activeImageIndex === -1) {
        alert('Please select an image to crop');
        return;
    }

    const activeImage = loadedImages[activeImageIndex];
    activeImage.isCropping = !activeImage.isCropping;
    activeImage.cropStart = null;
    activeImage.cropEnd = null;

    document.getElementById('cropButton').textContent =
        activeImage.isCropping ? 'Cancel Crop' : 'Toggle Crop Mode';
    document.getElementById('applyCropButton').style.display =
        activeImage.isCropping ? 'inline' : 'none';

    redrawCanvas();
}

function bringImageToFront(index) {
    if (index < 0 || index >= loadedImages.length) return;

    const image = loadedImages.splice(index, 1)[0];
    loadedImages.push(image);
    activeImageIndex = loadedImages.length - 1;

    updateImageList();
    redrawCanvas();
}

function handleFileSelect(event) {
    const files = event.target.files;
    if (!files.length) return;

    Array.from(files).forEach((file) => {
        const img = new Image();
        img.src = URL.createObjectURL(file);

        img.onload = () => {
            const imageItem = new ImageItem(file, img);

            const maxDimension = 400;
            if (imageItem.width > maxDimension || imageItem.height > maxDimension) {
                const scale = maxDimension / Math.max(imageItem.width, imageItem.height);
                imageItem.width *= scale;
                imageItem.height *= scale;
            }

            const offset = loadedImages.length * 20;
            imageItem.x = (mainCanvas.width - imageItem.width) / 2 + offset;
            imageItem.y = (mainCanvas.height - imageItem.height) / 2 + offset;

            loadedImages.push(imageItem);
            activeImageIndex = loadedImages.length - 1;

            updateImageList();
            redrawCanvas();
        };
    });

    event.target.value = '';
}

function setupMouseHandlers() {
    let startX, startY;
    let originalWidth, originalHeight, originalX, originalY;

    mainCanvas.addEventListener('mousedown', (e) => {
        const rect = mainCanvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        if (activeImageIndex !== -1 && loadedImages[activeImageIndex].isCropping) {
            const activeImage = loadedImages[activeImageIndex];
            if (isPointInImage(mouseX, mouseY, activeImage)) {
                activeImage.cropStart = {
                    x: mouseX - activeImage.x,
                    y: mouseY - activeImage.y
                };
                activeImage.cropEnd = {...activeImage.cropStart};
                return;
            }
        }

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

        for (let i = loadedImages.length - 1; i >= 0; i--) {
            const image = loadedImages[i];
            if (isPointInImage(mouseX, mouseY, image)) {
                if (i !== activeImageIndex) {
                    bringImageToFront(i);
                }

                loadedImages[activeImageIndex].isDragging = true;
                startX = mouseX - image.x;
                startY = mouseY - image.y;
                redrawCanvas();
                return;
            }
        }

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

        if (activeImage.isCropping && activeImage.cropStart) {
            activeImage.cropEnd = {
                x: mouseX - activeImage.x,
                y: mouseY - activeImage.y
            };
            redrawCanvas();
            return;
        }

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
            const activeImage = loadedImages[activeImageIndex];
            if (activeImage.isCropping && activeImage.cropStart) {
                const cropRect = activeImage.getCropRect();
                if (cropRect.width < 10 || cropRect.height < 10) {
                    activeImage.cropStart = null;
                    activeImage.cropEnd = null;
                }
                redrawCanvas();
            }
            activeImage.isDragging = false;
            activeImage.isResizing = false;
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

    for (const handle of Object.values(handles)) {
        if (isPointInHandle(x, y, handle)) {
            cursor = handle.cursor;
            break;
        }
    }

    if (cursor === 'default' && isPointInImage(x, y, image)) {
        cursor = 'move';
    }

    mainCanvas.style.cursor = cursor;
}

function removeImage(index) {
    if (index < 0 || index >= loadedImages.length) return;

    loadedImages.splice(index, 1);

    if (activeImageIndex === index) {
        activeImageIndex = loadedImages.length > 0 ? loadedImages.length - 1 : -1;
    } else if (activeImageIndex > index) {
        activeImageIndex--;
    }

    updateImageList();
    redrawCanvas();
}

function updateImageList() {
    const imageList = document.getElementById('imageList');
    imageList.innerHTML = '';

    loadedImages.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = `image-item ${index === activeImageIndex ? 'active' : ''}`;

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

    mainCtx.setLineDash([5, 5]);
    mainCtx.lineWidth = 1;
    mainCtx.strokeStyle = 'rgba(102, 102, 102, 0.8)';

    mainCtx.beginPath();
    mainCtx.moveTo(centerX, 0);
    mainCtx.lineTo(centerX, mainCanvas.height);
    mainCtx.stroke();

    mainCtx.beginPath();
    mainCtx.moveTo(0, centerY);
    mainCtx.lineTo(mainCanvas.width, centerY);
    mainCtx.stroke();

    mainCtx.setLineDash([]);
}

function redrawCanvas() {
    mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
    drawGuides();

    loadedImages.forEach((imageItem, index) => {
        mainCtx.drawImage(imageItem.img, imageItem.x, imageItem.y, imageItem.width, imageItem.height);

        if (index === activeImageIndex) {
            mainCtx.strokeStyle = '#00ff00';
            mainCtx.lineWidth = 2;
            mainCtx.strokeRect(imageItem.x, imageItem.y, imageItem.width, imageItem.height);

            if (imageItem.isCropping && imageItem.cropStart && imageItem.cropEnd) {
                const cropRect = imageItem.getCropRect();

                // Draw semi-transparent overlay
                mainCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                mainCtx.fillRect(imageItem.x, imageItem.y, imageItem.width, imageItem.height);

                // Clear crop area
                mainCtx.clearRect(
                    imageItem.x + cropRect.x,
                    imageItem.y + cropRect.y,
                    cropRect.width,
                    cropRect.height
                );

                // Draw crop rectangle
                mainCtx.strokeStyle = '#ffffff';
                mainCtx.strokeRect(
                    imageItem.x + cropRect.x,
                    imageItem.y + cropRect.y,
                    cropRect.width,
                    cropRect.height
                );
            }

            if (!imageItem.isCropping) {
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
        }
    });

    drawGuides();
}

function applyCrop() {
    if (activeImageIndex === -1) return;

    const activeImage = loadedImages[activeImageIndex];
    if (!activeImage.isCropping || !activeImage.cropStart || !activeImage.cropEnd) return;

    const cropRect = activeImage.getCropRect();
    if (cropRect.width < 10 || cropRect.height < 10) {
        alert('Crop area is too small');
        return;
    }

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');

    tempCanvas.width = cropRect.width;
    tempCanvas.height = cropRect.height;

    tempCtx.drawImage(
        activeImage.img,
        cropRect.x / activeImage.width * activeImage.img.width,
        cropRect.y / activeImage.height * activeImage.img.height,
        cropRect.width / activeImage.width * activeImage.img.width,
        cropRect.height / activeImage.height * activeImage.img.height,
        0, 0, cropRect.width, cropRect.height
    );

    const croppedImage = new Image();
    croppedImage.src = tempCanvas.toDataURL();

    croppedImage.onload = () => {
        activeImage.img = croppedImage;
        activeImage.width = cropRect.width;
        activeImage.height = cropRect.height;

        activeImage.isCropping = false;
        activeImage.cropStart = null;
        activeImage.cropEnd = null;

        document.getElementById('cropButton').textContent = 'Toggle Crop Mode';
        document.getElementById('applyCropButton').style.display = 'none';

        redrawCanvas();
    };
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
    const quality = 1;
    const imageData = mainCtx.getImageData(0, 0, mainCanvas.width, mainCanvas.height);

    try {
        await compress_image(
            mainCtx,
            mainCanvas.width,
            mainCanvas.height,
            new Uint8Array(imageData.data),
            .85
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