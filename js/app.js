/**
 * ImageCombiner Web - Application Controller & State Management
 * 
 * Orchestrates user interactions, image queue management, live preview updates,
 * and high-resolution exports.
 */

(function () {
  'use strict';

  const Layout = window.ImageCombinerLayout;
  const Compositor = window.ImageCombinerCompositor;

  if (!Layout || !Compositor) {
    console.error('ImageCombiner dependencies could not be loaded.');
    return;
  }

  const { calculateCanvasSize, findOptimalDistribution } = Layout;
  const { loadImageFromFile, renderCollage, exportCanvas } = Compositor;

  // Pre-defined aspect ratios
  const ASPECT_RATIOS = {
    '1:1': 1.0,
    '2:3': 2 / 3,
    '3:2': 3 / 2,
    '3:4': 3 / 4,
    '4:3': 4 / 3,
    '16:9': 16 / 9,
    '9:16': 9 / 16,
    '21:9': 21 / 9,
    '9:21': 9 / 21
  };

  // Application State
  const state = {
    images: [],             // Array of loaded image objects
    aspectRatioKey: '1:1',  // '1:1', '16:9', etc., or 'custom'
    megapixels: 2.0,        // Megapixels target
    customWidth: 1920,
    customHeight: 1080,
    gapSize: 8,             // Gap in pixels
    bgColor: '#18181b',     // Background color
    isTransparent: false,   // Transparent gap/background toggle
    layoutMode: 'auto',     // 'auto', '1', '2', '3', '4', 'single-row'
    exportFormat: 'image/png', // 'image/png', 'image/jpeg', 'image/webp'
    exportQuality: 0.92,    // 0.3 to 1.0
    draggedIndex: null      // Index of card currently being dragged
  };

  // DOM Elements Cache
  const DOM = {
    // Navigation & Modal
    aboutBtn: document.getElementById('about-btn'),
    aboutModal: document.getElementById('about-modal'),
    closeModalBtn: document.getElementById('close-modal-btn'),
    modalOkBtn: document.getElementById('modal-ok-btn'),

    // Upload & Queue
    dropZone: document.getElementById('drop-zone'),
    fileInput: document.getElementById('file-input'),
    photoCountBadge: document.getElementById('photo-count-badge'),
    clearAllBtn: document.getElementById('clear-all-btn'),
    photoQueueContainer: document.getElementById('photo-queue-container'),
    photoQueueList: document.getElementById('photo-queue-list'),
    addMoreBtn: document.getElementById('add-more-btn'),
    emptyBrowseBtn: document.getElementById('empty-browse-btn'),

    // Canvas Dimensions
    aspectRatioSelect: document.getElementById('aspect-ratio-select'),
    mpControlContainer: document.getElementById('mp-control-container'),
    mpRange: document.getElementById('mp-range'),
    mpInput: document.getElementById('mp-input'),
    mpDisplay: document.getElementById('mp-display'),
    presetBtns: document.querySelectorAll('.preset-btn'),
    customDimsContainer: document.getElementById('custom-dims-container'),
    customWidthInput: document.getElementById('custom-width-input'),
    customHeightInput: document.getElementById('custom-height-input'),
    resolutionText: document.getElementById('resolution-text'),

    // Spacing & Color
    gapRange: document.getElementById('gap-range'),
    gapNumber: document.getElementById('gap-number'),
    gapDisplay: document.getElementById('gap-display'),
    bgColorPicker: document.getElementById('bg-color-picker'),
    bgColorHex: document.getElementById('bg-color-hex'),
    transparentCheckbox: document.getElementById('transparent-checkbox'),
    colorPickerWrapper: document.getElementById('color-picker-wrapper'),
    colorSwatches: document.getElementById('color-swatches'),
    layoutModeSelect: document.getElementById('layout-mode-select'),
    layoutDistributionInfo: document.getElementById('layout-distribution-info'),

    // Export
    exportFormatSelect: document.getElementById('export-format-select'),
    qualityControlGroup: document.getElementById('quality-control-group'),
    exportQualityRange: document.getElementById('export-quality-range'),
    exportQualityDisplay: document.getElementById('export-quality-display'),
    downloadBtn: document.getElementById('download-btn'),

    // Preview Area
    previewCanvas: document.getElementById('preview-canvas'),
    canvasWrapper: document.getElementById('canvas-wrapper'),
    emptyState: document.getElementById('empty-state'),
    previewMetaTag: document.getElementById('preview-meta-tag'),
    previewRenderTime: document.getElementById('preview-render-time')
  };

  /**
   * Calculates current canvas target dimensions based on state.
   */
  function getCanvasDimensions() {
    if (state.aspectRatioKey === 'custom') {
      const w = Math.max(50, Math.min(10000, parseInt(state.customWidth, 10) || 1920));
      const h = Math.max(50, Math.min(10000, parseInt(state.customHeight, 10) || 1080));
      return { width: w, height: h };
    }

    const ratio = ASPECT_RATIOS[state.aspectRatioKey] || 1.0;
    return calculateCanvasSize(ratio, state.megapixels);
  }

  /**
   * Determines the row distribution array for current images and settings.
   */
  function getDistribution(width, height) {
    const count = state.images.length;
    if (count <= 0) return [];
    if (count === 1) return [1];

    if (state.layoutMode === 'single-row') {
      return [count];
    }

    if (state.layoutMode === '1') {
      return new Array(count).fill(1);
    }

    if (state.layoutMode === '2' || state.layoutMode === '3' || state.layoutMode === '4') {
      const targetCols = parseInt(state.layoutMode, 10);
      const rows = Math.ceil(count / targetCols);
      const dist = [];
      let remaining = count;

      for (let r = 0; r < rows; r++) {
        const take = Math.min(targetCols, remaining);
        dist.push(take);
        remaining -= take;
      }
      return dist;
    }

    // Default: Auto best fit layout
    return findOptimalDistribution(count, width, height, state.gapSize);
  }

  /**
   * Updates UI labels and triggers canvas re-render.
   */
  function updateCanvas() {
    const { width, height } = getCanvasDimensions();
    const mpActual = ((width * height) / 1000000).toFixed(2);

    // Update resolution summary text
    DOM.resolutionText.textContent = `${width} × ${height} px (${mpActual} MP)`;

    // If no photos uploaded, display empty state
    if (state.images.length === 0) {
      DOM.emptyState.style.display = 'flex';
      DOM.canvasWrapper.style.display = 'none';
      DOM.downloadBtn.disabled = true;
      DOM.previewMetaTag.textContent = 'No photos added';
      DOM.previewRenderTime.textContent = '';
      DOM.layoutDistributionInfo.textContent = 'Auto';
      return;
    }

    DOM.emptyState.style.display = 'none';
    DOM.canvasWrapper.style.display = 'flex';
    DOM.downloadBtn.disabled = false;

    // Compute layout distribution
    const distribution = getDistribution(width, height);

    // Update layout badge description
    if (distribution.length > 0) {
      if (distribution.length === 1) {
        DOM.layoutDistributionInfo.textContent = `1 row (${distribution[0]} photos)`;
      } else {
        const parts = distribution.join(' + ');
        DOM.layoutDistributionInfo.textContent = `${distribution.length} rows (${parts})`;
      }
    }

    // Render on preview canvas
    const startTime = performance.now();

    renderCollage(DOM.previewCanvas, state.images, distribution, width, height, {
      gapSize: state.gapSize,
      bgColor: state.bgColor,
      isTransparent: state.isTransparent
    });

    const duration = Math.round(performance.now() - startTime);

    // Update preview meta info
    const countLabel = state.images.length === 1 ? '1 photo' : `${state.images.length} photos`;
    DOM.previewMetaTag.textContent = `${width} × ${height} px • ${countLabel}`;
    DOM.previewRenderTime.textContent = `Rendered in ${duration}ms`;
  }

  /**
   * Renders the uploaded photos queue list.
   */
  function renderPhotoQueue() {
    const count = state.images.length;
    DOM.photoCountBadge.textContent = count === 1 ? '1 photo' : `${count} photos`;

    if (count === 0) {
      DOM.photoQueueContainer.style.display = 'none';
      DOM.dropZone.style.display = 'block';
      DOM.clearAllBtn.style.display = 'none';
      DOM.photoQueueList.innerHTML = '';
      return;
    }

    DOM.dropZone.style.display = 'none';
    DOM.photoQueueContainer.style.display = 'flex';
    DOM.clearAllBtn.style.display = 'inline-block';

    DOM.photoQueueList.innerHTML = '';

    state.images.forEach((item, index) => {
      const li = document.createElement('li');
      li.className = 'queue-card';
      li.draggable = true;
      li.dataset.index = index;

      // Format file size
      let sizeStr = '';
      if (item.size) {
        sizeStr = item.size > 1024 * 1024
          ? `${(item.size / (1024 * 1024)).toFixed(1)} MB`
          : `${Math.round(item.size / 1024)} KB`;
      }

      li.innerHTML = `
        <span class="queue-card-index">${index + 1}</span>
        <div class="queue-card-thumb-wrap">
          <img class="queue-card-thumb" src="${item.url}" alt="${item.name}" loading="lazy">
        </div>
        <div class="queue-card-info">
          <span class="queue-card-name" title="${item.name}">${item.name}</span>
          <span class="queue-card-meta">${item.width}×${item.height} px${sizeStr ? ' • ' + sizeStr : ''}</span>
        </div>
        <div class="queue-card-actions">
          <button type="button" class="queue-btn move-up-btn" title="Move Up" ${index === 0 ? 'disabled' : ''} aria-label="Move photo up">
            ▲
          </button>
          <button type="button" class="queue-btn move-down-btn" title="Move Down" ${index === count - 1 ? 'disabled' : ''} aria-label="Move photo down">
            ▼
          </button>
          <button type="button" class="queue-btn remove-btn" title="Remove" aria-label="Remove photo">
            &times;
          </button>
        </div>
      `;

      // Move Up Action
      li.querySelector('.move-up-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        if (index > 0) {
          const temp = state.images[index];
          state.images[index] = state.images[index - 1];
          state.images[index - 1] = temp;
          renderPhotoQueue();
          updateCanvas();
        }
      });

      // Move Down Action
      li.querySelector('.move-down-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        if (index < state.images.length - 1) {
          const temp = state.images[index];
          state.images[index] = state.images[index + 1];
          state.images[index + 1] = temp;
          renderPhotoQueue();
          updateCanvas();
        }
      });

      // Remove Action
      li.querySelector('.remove-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        URL.revokeObjectURL(item.url);
        state.images.splice(index, 1);
        renderPhotoQueue();
        updateCanvas();
      });

      // Drag and Drop Sorting Listeners
      li.addEventListener('dragstart', (e) => {
        state.draggedIndex = index;
        li.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', index);
      });

      li.addEventListener('dragend', () => {
        li.classList.remove('dragging');
        state.draggedIndex = null;
        document.querySelectorAll('.queue-card').forEach(c => c.classList.remove('drag-over'));
      });

      li.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (state.draggedIndex !== null && state.draggedIndex !== index) {
          li.classList.add('drag-over');
        }
      });

      li.addEventListener('dragleave', () => {
        li.classList.remove('drag-over');
      });

      li.addEventListener('drop', (e) => {
        e.preventDefault();
        li.classList.remove('drag-over');
        const fromIndex = state.draggedIndex;
        const toIndex = index;

        if (fromIndex !== null && fromIndex !== toIndex) {
          const [movedItem] = state.images.splice(fromIndex, 1);
          state.images.splice(toIndex, 0, movedItem);
          renderPhotoQueue();
          updateCanvas();
        }
      });

      DOM.photoQueueList.appendChild(li);
    });
  }

  /**
   * Processes a list of File objects and adds them to state.
   */
  async function handleFiles(files) {
    const fileArray = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (fileArray.length === 0) return;

    const loadPromises = fileArray.map(file => loadImageFromFile(file).catch(err => {
      console.warn(`Could not load image ${file.name}:`, err);
      return null;
    }));

    const loadedResults = await Promise.all(loadPromises);
    const validImages = loadedResults.filter(Boolean);

    if (validImages.length > 0) {
      state.images.push(...validImages);
      renderPhotoQueue();
      updateCanvas();
    }
  }

  /**
   * Initializes all user interface event listeners.
   */
  function setupEventListeners() {
    // File Picker Triggers
    DOM.dropZone.addEventListener('click', (e) => {
      if (e.target !== DOM.fileInput) {
        DOM.fileInput.click();
      }
    });
    DOM.dropZone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        DOM.fileInput.click();
      }
    });
    DOM.emptyBrowseBtn.addEventListener('click', () => DOM.fileInput.click());
    DOM.addMoreBtn.addEventListener('click', () => DOM.fileInput.click());

    DOM.fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFiles(e.target.files);
        DOM.fileInput.value = '';
      }
    });

    // Drag and Drop into Dropzone
    DOM.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      DOM.dropZone.classList.add('drag-active');
    });

    DOM.dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      DOM.dropZone.classList.remove('drag-active');
    });

    DOM.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      DOM.dropZone.classList.remove('drag-active');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    });

    // Global window drop to accept images anywhere
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      // Ignore if dropped on drop-zone (handled above) or during queue card reorder
      if (e.target.closest('#drop-zone') || state.draggedIndex !== null) {
        return;
      }
      e.preventDefault();
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    });

    // Paste from clipboard support (Ctrl+V)
    window.addEventListener('paste', (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles = [];
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }

      if (imageFiles.length > 0) {
        handleFiles(imageFiles);
      }
    });

    // Clear All Photos
    DOM.clearAllBtn.addEventListener('click', () => {
      state.images.forEach(img => URL.revokeObjectURL(img.url));
      state.images = [];
      renderPhotoQueue();
      updateCanvas();
    });

    // Aspect Ratio Selection
    DOM.aspectRatioSelect.addEventListener('change', (e) => {
      state.aspectRatioKey = e.target.value;

      if (state.aspectRatioKey === 'custom') {
        DOM.mpControlContainer.style.display = 'none';
        DOM.customDimsContainer.style.display = 'block';
      } else {
        DOM.mpControlContainer.style.display = 'flex';
        DOM.customDimsContainer.style.display = 'none';
      }

      updateCanvas();
    });

    // Megapixel Controls (Slider & Number Input)
    const syncMegapixels = (value) => {
      const mp = Math.max(0.1, Math.min(50, parseFloat(value) || 2.0));
      state.megapixels = mp;
      DOM.mpRange.value = mp;
      DOM.mpInput.value = mp;
      DOM.mpDisplay.textContent = `${mp.toFixed(1)} MP`;

      // Highlight preset button if match
      DOM.presetBtns.forEach(btn => {
        btn.classList.toggle('active', parseFloat(btn.dataset.mp) === mp);
      });

      updateCanvas();
    };

    DOM.mpRange.addEventListener('input', (e) => syncMegapixels(e.target.value));
    DOM.mpInput.addEventListener('change', (e) => syncMegapixels(e.target.value));

    DOM.presetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        syncMegapixels(btn.dataset.mp);
      });
    });

    // Custom Dimensions Inputs
    DOM.customWidthInput.addEventListener('change', (e) => {
      state.customWidth = parseInt(e.target.value, 10) || 1920;
      updateCanvas();
    });

    DOM.customHeightInput.addEventListener('change', (e) => {
      state.customHeight = parseInt(e.target.value, 10) || 1080;
      updateCanvas();
    });

    // Gap Size Controls
    const syncGap = (val) => {
      const gap = Math.max(0, Math.min(150, parseInt(val, 10) || 0));
      state.gapSize = gap;
      DOM.gapRange.value = gap;
      DOM.gapNumber.value = gap;
      DOM.gapDisplay.textContent = `${gap} px`;
      updateCanvas();
    };

    DOM.gapRange.addEventListener('input', (e) => syncGap(e.target.value));
    DOM.gapNumber.addEventListener('change', (e) => syncGap(e.target.value));

    // Background Color Picker & Swatches
    DOM.bgColorPicker.addEventListener('input', (e) => {
      state.bgColor = e.target.value;
      DOM.bgColorHex.textContent = e.target.value;
      if (state.isTransparent) {
        state.isTransparent = false;
        DOM.transparentCheckbox.checked = false;
        DOM.colorPickerWrapper.style.opacity = '1';
      }
      updateCanvas();
    });

    DOM.colorSwatches.addEventListener('click', (e) => {
      const swatch = e.target.closest('.swatch-btn');
      if (!swatch) return;
      const color = swatch.dataset.color;
      state.bgColor = color;
      DOM.bgColorPicker.value = color;
      DOM.bgColorHex.textContent = color;
      if (state.isTransparent) {
        state.isTransparent = false;
        DOM.transparentCheckbox.checked = false;
        DOM.colorPickerWrapper.style.opacity = '1';
      }
      updateCanvas();
    });

    // Transparent Toggle
    DOM.transparentCheckbox.addEventListener('change', (e) => {
      state.isTransparent = e.target.checked;
      DOM.colorPickerWrapper.style.opacity = state.isTransparent ? '0.4' : '1';
      updateCanvas();
    });

    // Layout Mode Select
    DOM.layoutModeSelect.addEventListener('change', (e) => {
      state.layoutMode = e.target.value;
      updateCanvas();
    });

    // Export Format & Quality Controls
    DOM.exportFormatSelect.addEventListener('change', (e) => {
      state.exportFormat = e.target.value;
      const isCompressed = (state.exportFormat === 'image/jpeg' || state.exportFormat === 'image/webp');
      DOM.qualityControlGroup.style.display = isCompressed ? 'flex' : 'none';
    });

    DOM.exportQualityRange.addEventListener('input', (e) => {
      const percent = parseInt(e.target.value, 10);
      state.exportQuality = percent / 100;
      DOM.exportQualityDisplay.textContent = `${percent}%`;
    });

    // Download Button Handler
    DOM.downloadBtn.addEventListener('click', async () => {
      if (state.images.length === 0) return;

      const originalBtnHtml = DOM.downloadBtn.innerHTML;
      DOM.downloadBtn.disabled = true;
      DOM.downloadBtn.innerHTML = `
        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;">
          <line x1="12" y1="2" x2="12" y2="6"/>
          <line x1="12" y1="18" x2="12" y2="22"/>
          <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/>
          <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/>
          <line x1="2" y1="12" x2="6" y2="12"/>
          <line x1="18" y1="12" x2="22" y2="12"/>
          <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/>
          <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
        </svg>
        <span>Preparing Image...</span>
      `;

      try {
        const { width, height } = getCanvasDimensions();
        let ext = 'png';
        if (state.exportFormat === 'image/jpeg') ext = 'jpg';
        if (state.exportFormat === 'image/webp') ext = 'webp';

        const filename = `combined-${width}x${height}.${ext}`;
        await exportCanvas(DOM.previewCanvas, state.exportFormat, state.exportQuality, filename);
      } catch (err) {
        alert(`Export error: ${err.message || err}`);
      } finally {
        DOM.downloadBtn.disabled = false;
        DOM.downloadBtn.innerHTML = originalBtnHtml;
      }
    });

    // About Modal Handlers
    const openModal = () => {
      DOM.aboutModal.style.display = 'flex';
    };

    const closeModal = () => {
      DOM.aboutModal.style.display = 'none';
    };

    DOM.aboutBtn.addEventListener('click', openModal);
    DOM.closeModalBtn.addEventListener('click', closeModal);
    DOM.modalOkBtn.addEventListener('click', closeModal);

    DOM.aboutModal.addEventListener('click', (e) => {
      if (e.target === DOM.aboutModal) closeModal();
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && DOM.aboutModal.style.display === 'flex') {
        closeModal();
      }
    });
  }

  // Initial Boot
  setupEventListeners();
  updateCanvas();
})();
