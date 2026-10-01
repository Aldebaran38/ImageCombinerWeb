/**
 * ImageCombiner Web - Application Controller & State Management
 * 
 * Orchestrates user interactions, image queue management, live preview updates,
 * timeline playback loop, and high-resolution static & animated exports.
 */

(function () {
  'use strict';

  const Layout = window.ImageCombinerLayout;
  const Compositor = window.ImageCombinerCompositor;

  if (!Layout || !Compositor) {
    console.error('ImageCombiner dependencies could not be loaded.');
    return;
  }

  const { calculateCanvasSize, findOptimalDistribution, calculateCellRectangles } = Layout;
  const { loadImageFromFile, renderCollage, exportCanvas, exportAnimation, calculateCenterCrop } = Compositor;

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
    images: [],               // Array of loaded image objects (static or animated)
    aspectRatioKey: '1:1',    // '1:1', '16:9', etc., or 'custom'
    megapixels: 2.0,          // Megapixels target
    customWidth: 1920,
    customHeight: 1080,
    hasOuterBorder: true,     // Outer border enabled / disabled
    outerBorderSize: 8,       // Outer border in pixels
    matchGapSize: true,       // When true, outer border matches photo gap
    gapSize: 8,               // Gap between photos in pixels
    bgColor: '#18181b',       // Border & background color
    isTransparent: false,     // Transparent gap/background toggle
    layoutMode: 'auto',       // 'auto', '1', '2', '3', '4', 'single-row'
    exportFormat: 'image/png', // 'image/png', 'image/jpeg', 'image/gif', 'image/webp-anim', 'image/webp'
    exportQuality: 0.92,      // 0.3 to 1.0
    exportFps: 15,            // 10, 15, 24, 30
    animDuration: 3.0,        // Total animation output duration in seconds
    playbackSpeed: 1.0,       // 0.5, 1.0, 2.0
    isPlaying: true,          // Preview playback state
    currentTime: 0.0,         // Current preview timeline time in seconds
    isScrubbing: false,       // User currently dragging timeline scrubber
    animationLoopId: null,    // requestAnimationFrame handle
    lastPlaybackTimestamp: null,
    draggedIndex: null,       // Index of card currently being dragged
    canvasHoverIndex: -1,     // Index of cell currently hovered on canvas
    canvasDrag: null,         // Drag state: { index, startX, startY, origOffsetX, origOffsetY, lockedAxis, ... }
    expandedCardIds: new Set(), // Set of image item IDs whose adjustment dropdown is open
    textOverlay: {
      text: '',
      preset: 'bottom',
      offsetX: 0.0,
      offsetY: -0.85,
      fontSizeScale: 35,
      fontFamily: 'Impact'
    }
  };

  // DOM Elements Cache
  const DOM = {
    // Navigation & Modals
    aboutBtn: document.getElementById('about-btn'),
    aboutModal: document.getElementById('about-modal'),
    closeModalBtn: document.getElementById('close-modal-btn'),
    modalOkBtn: document.getElementById('modal-ok-btn'),

    // Advanced Animation Timing Modal
    animTimingModal: document.getElementById('anim-timing-modal'),
    closeTimingModalBtn: document.getElementById('close-timing-modal-btn'),
    timingModalDoneBtn: document.getElementById('timing-modal-done-btn'),
    animTimingList: document.getElementById('anim-timing-list'),
    toggleAnimTimingBtn: document.getElementById('toggle-anim-timing-btn'),

    // Export Progress Modal
    exportProgressModal: document.getElementById('export-progress-modal'),
    exportProgressText: document.getElementById('export-progress-text'),
    exportProgressFill: document.getElementById('export-progress-fill'),
    cancelExportBtn: document.getElementById('cancel-export-btn'),

    // Upload & Queue
    dropZone: document.getElementById('drop-zone'),
    fileInput: document.getElementById('file-input'),
    photoCountBadge: document.getElementById('photo-count-badge'),
    clearAllBtn: document.getElementById('clear-all-btn'),
    photoQueueContainer: document.getElementById('photo-queue-container'),
    photoQueueList: document.getElementById('photo-queue-list'),
    resetAllAdjustmentsBtn: document.getElementById('reset-all-adjustments-btn'),
    addMoreBtn: document.getElementById('add-more-btn'),
    emptyBrowseBtn: document.getElementById('empty-browse-btn'),

    // Text Overlay Controls
    overlayTextInput: document.getElementById('overlay-text-input'),
    overlayPositionSelect: document.getElementById('overlay-position-select'),
    overlaySettingsToggleBtn: document.getElementById('overlay-settings-toggle-btn'),
    overlaySettingsDrawer: document.getElementById('overlay-settings-drawer'),
    overlayFontFamilySelect: document.getElementById('overlay-font-family-select'),
    overlayFontSizeRange: document.getElementById('overlay-font-size-range'),
    overlayFontSizeDisplay: document.getElementById('overlay-font-size-display'),
    overlayOffsetXRange: document.getElementById('overlay-offset-x-range'),
    overlayOffsetXDisplay: document.getElementById('overlay-offset-x-display'),
    overlayOffsetYRange: document.getElementById('overlay-offset-y-range'),
    overlayOffsetYDisplay: document.getElementById('overlay-offset-y-display'),

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

    // Spacing & Borders
    outerBorderCheckbox: document.getElementById('outer-border-checkbox'),
    outerBorderDisplay: document.getElementById('outer-border-display'),
    outerBorderRow: document.getElementById('outer-border-row'),
    outerBorderRange: document.getElementById('outer-border-range'),
    outerBorderNumber: document.getElementById('outer-border-number'),
    matchGapCheckbox: document.getElementById('match-gap-checkbox'),
    matchGapContainer: document.getElementById('match-gap-container'),
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

    // Export Controls
    exportFormatSelect: document.getElementById('export-format-select'),
    qualityControlGroup: document.getElementById('quality-control-group'),
    exportQualityRange: document.getElementById('export-quality-range'),
    exportQualityDisplay: document.getElementById('export-quality-display'),
    fpsControlGroup: document.getElementById('fps-control-group'),
    exportFpsSelect: document.getElementById('export-fps-select'),
    exportFpsDisplay: document.getElementById('export-fps-display'),
    durationControlGroup: document.getElementById('duration-control-group'),
    animDurationRange: document.getElementById('anim-duration-range'),
    animDurationNumber: document.getElementById('anim-duration-number'),
    animDurationDisplay: document.getElementById('anim-duration-display'),
    downloadBtn: document.getElementById('download-btn'),

    // Preview Area & Playback Bar
    previewCanvas: document.getElementById('preview-canvas'),
    canvasWrapper: document.getElementById('canvas-wrapper'),
    emptyState: document.getElementById('empty-state'),
    previewMetaTag: document.getElementById('preview-meta-tag'),
    previewDragTip: document.getElementById('preview-drag-tip'),
    previewRenderTime: document.getElementById('preview-render-time'),
    playbackBar: document.getElementById('playback-bar'),
    playPauseBtn: document.getElementById('play-pause-btn'),
    playIcon: document.getElementById('play-icon'),
    pauseIcon: document.getElementById('pause-icon'),
    playbackScrubber: document.getElementById('playback-scrubber'),
    playbackTimeDisplay: document.getElementById('playback-time-display'),
    speedBtns: document.querySelectorAll('.speed-btn')
  };

  /**
   * Returns true if any image in the current queue is animated.
   */
  function hasAnimatedImages() {
    return state.images.some(img => img.isAnimated);
  }

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
   * Returns current effective outer border thickness in pixels.
   */
  function getEffectiveOuterBorder() {
    if (!state.hasOuterBorder) return 0;
    return state.matchGapSize ? state.gapSize : state.outerBorderSize;
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

    const fixedCols = parseInt(state.layoutMode, 10);
    if (!isNaN(fixedCols) && fixedCols >= 1 && fixedCols <= 4) {
      const fullRows = Math.floor(count / fixedCols);
      const remainder = count % fixedCols;
      const dist = [];
      for (let r = 0; r < fullRows; r++) {
        dist.push(fixedCols);
      }
      if (remainder > 0) {
        dist.push(remainder);
      }
      return dist;
    }

    return findOptimalDistribution(count, width, height);
  }

  /**
   * Updates visibility of export settings depending on selected format and presence of animations.
   */
  function syncAnimationControlsUI() {
    const isAnimatedFormat = (state.exportFormat === 'image/gif' || state.exportFormat === 'image/webp-anim');
    const hasAnim = hasAnimatedImages();

    // Show/hide FPS and Duration controls
    DOM.fpsControlGroup.style.display = isAnimatedFormat ? 'block' : 'none';
    DOM.durationControlGroup.style.display = isAnimatedFormat ? 'block' : 'none';

    // Advanced Timing button is shown whenever animated images are in queue
    DOM.toggleAnimTimingBtn.style.display = hasAnim ? 'flex' : 'none';

    // Playback bar in preview
    DOM.playbackBar.style.display = hasAnim ? 'flex' : 'none';

    // Quality slider for compressed formats
    const isQualityApplicable = (state.exportFormat === 'image/jpeg' || state.exportFormat === 'image/webp' || state.exportFormat === 'image/webp-anim');
    DOM.qualityControlGroup.style.display = isQualityApplicable ? 'flex' : 'none';

    // Download button text
    const downloadSpan = DOM.downloadBtn.querySelector('span');
    if (downloadSpan) {
      downloadSpan.textContent = isAnimatedFormat ? 'Download Combined Animation' : 'Download Combined Image';
    }
  }

  /**
   * Updates playback scrubber value and textual time display.
   */
  function updatePlaybackScrubberUI() {
    if (state.animDuration <= 0) return;
    const progressFraction = Math.max(0, Math.min(1, state.currentTime / state.animDuration));
    DOM.playbackScrubber.value = Math.round(progressFraction * 1000);
    DOM.playbackTimeDisplay.textContent = `${state.currentTime.toFixed(1)}s / ${state.animDuration.toFixed(1)}s`;
  }

  /**
   * Renders the single current frame on the preview canvas.
   */
  function renderCurrentCanvasFrame() {
    if (state.images.length === 0) return;

    const { width, height } = getCanvasDimensions();
    const effectiveOuter = getEffectiveOuterBorder();
    const distribution = getDistribution(width, height);

    const activeCell = state.canvasDrag
      ? state.canvasDrag.index
      : (state.canvasHoverIndex >= 0 ? state.canvasHoverIndex : null);

    renderCollage(DOM.previewCanvas, state.images, distribution, width, height, {
      gapSize: state.gapSize,
      outerBorderSize: effectiveOuter,
      bgColor: state.bgColor,
      isTransparent: state.isTransparent,
      time: state.currentTime,
      activeCellIndex: activeCell,
      textOverlay: state.textOverlay
    });
  }

  /**
   * Continuous requestAnimationFrame animation loop for live preview.
   */
  function animationTick(timestamp) {
    if (!hasAnimatedImages() || state.images.length === 0) {
      state.animationLoopId = null;
      return;
    }

    if (state.lastPlaybackTimestamp === null) {
      state.lastPlaybackTimestamp = timestamp;
    }

    const elapsed = (timestamp - state.lastPlaybackTimestamp) / 1000;
    state.lastPlaybackTimestamp = timestamp;

    if (state.isPlaying && !state.isScrubbing) {
      state.currentTime = (state.currentTime + elapsed * state.playbackSpeed) % state.animDuration;
      updatePlaybackScrubberUI();
    }

    renderCurrentCanvasFrame();

    state.animationLoopId = requestAnimationFrame(animationTick);
  }

  function startAnimationLoop() {
    if (state.animationLoopId !== null) return;
    state.lastPlaybackTimestamp = null;
    state.animationLoopId = requestAnimationFrame(animationTick);
  }

  function stopAnimationLoop() {
    if (state.animationLoopId !== null) {
      cancelAnimationFrame(state.animationLoopId);
      state.animationLoopId = null;
    }
    state.lastPlaybackTimestamp = null;
  }

  /**
   * Updates canvas dimension labels, distribution, and initiates rendering or playback.
   */
  function updateCanvas() {
    const { width, height } = getCanvasDimensions();
    const effectiveOuter = getEffectiveOuterBorder();

    // Update dimensions display string
    const mpValue = ((width * height) / 1000000).toFixed(2);
    DOM.resolutionText.textContent = `${width} × ${height} px (${mpValue} MP)`;

    // Handle empty state
    if (state.images.length === 0) {
      stopAnimationLoop();
      DOM.emptyState.style.display = 'flex';
      DOM.canvasWrapper.style.display = 'none';
      DOM.downloadBtn.disabled = true;
      DOM.previewMetaTag.textContent = 'No photos added';
      DOM.previewRenderTime.textContent = '';
      DOM.layoutDistributionInfo.textContent = 'Auto';
      if (DOM.previewDragTip) DOM.previewDragTip.style.display = 'none';
      syncAnimationControlsUI();
      return;
    }

    DOM.emptyState.style.display = 'none';
    DOM.canvasWrapper.style.display = 'flex';
    DOM.downloadBtn.disabled = false;
    if (DOM.previewDragTip) DOM.previewDragTip.style.display = 'inline-block';

    // Compute layout distribution
    const distribution = getDistribution(width, height);

    if (distribution.length > 0) {
      if (distribution.length === 1) {
        DOM.layoutDistributionInfo.textContent = `1 row (${distribution[0]} items)`;
      } else {
        const parts = distribution.join(' + ');
        DOM.layoutDistributionInfo.textContent = `${distribution.length} rows (${parts})`;
      }
    }

    // Update preview meta info
    const animCount = state.images.filter(i => i.isAnimated).length;
    let countLabel = state.images.length === 1 ? '1 item' : `${state.images.length} items`;
    if (animCount > 0) {
      countLabel += ` (${animCount} animated)`;
    }
    DOM.previewMetaTag.textContent = `${width} × ${height} px • ${countLabel}`;

    syncAnimationControlsUI();
    updatePlaybackScrubberUI();

    if (hasAnimatedImages()) {
      startAnimationLoop();
    } else {
      stopAnimationLoop();
      const startTime = performance.now();
      renderCurrentCanvasFrame();
      const duration = Math.round(performance.now() - startTime);
      DOM.previewRenderTime.textContent = `Rendered in ${duration}ms`;
    }
  }

  /**
   * Synchronizes adjustment sliders and values for a specific image in the queue list.
   */
  function syncQueueItemInputs(index) {
    const item = state.images[index];
    if (!item) return;

    const li = DOM.photoQueueList.querySelector(`li[data-index="${index}"]`);
    if (!li) return;

    const rangeX = li.querySelector('.adjust-x');
    const rangeY = li.querySelector('.adjust-y');
    const rangeScale = li.querySelector('.adjust-scale');
    const valX = li.querySelector('.adjust-val-x');
    const valY = li.querySelector('.adjust-val-y');
    const valScale = li.querySelector('.adjust-val-scale');

    const pctX = Math.round((item.offsetX || 0) * 100);
    const pctY = Math.round((item.offsetY || 0) * 100);
    const scaleStr = (item.scale !== undefined ? item.scale : 1.0).toFixed(2);

    if (rangeX && document.activeElement !== rangeX) rangeX.value = pctX;
    if (valX) valX.textContent = `${pctX}%`;
    if (rangeY && document.activeElement !== rangeY) rangeY.value = pctY;
    if (valY) valY.textContent = `${pctY}%`;
    if (rangeScale && document.activeElement !== rangeScale) rangeScale.value = scaleStr;
    if (valScale) valScale.textContent = `${scaleStr}x`;
  }

  /**
   * Renders the uploaded photos queue list with adjustment dropdowns.
   */
  function renderPhotoQueue() {
    const count = state.images.length;
    DOM.photoCountBadge.textContent = count === 1 ? '1 item' : `${count} items`;

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
      li.dataset.index = index;
      li.dataset.id = item.id;

      const isExpanded = state.expandedCardIds.has(item.id);

      let sizeStr = '';
      if (item.size) {
        sizeStr = item.size > 1024 * 1024
          ? `${(item.size / (1024 * 1024)).toFixed(1)} MB`
          : `${Math.round(item.size / 1024)} KB`;
      }

      const animBadge = item.isAnimated
        ? `<span class="badge-animated">GIF • ${item.animation.totalDuration.toFixed(1)}s</span>`
        : '';

      const pctX = Math.round((item.offsetX || 0) * 100);
      const pctY = Math.round((item.offsetY || 0) * 100);
      const scaleStr = (item.scale !== undefined ? item.scale : 1.0).toFixed(2);

      li.innerHTML = `
        <div class="queue-card-main" draggable="true">
          <span class="queue-card-index">${index + 1}</span>
          <div class="queue-card-thumb-wrap">
            <img class="queue-card-thumb" src="${item.url}" alt="${item.name}" loading="lazy">
          </div>
          <div class="queue-card-info">
            <div class="queue-card-name-row">
              <span class="queue-card-name" title="${item.name}">${item.name}</span>
              ${animBadge}
            </div>
            <div class="queue-card-actions">
              <button type="button" class="queue-btn adjust-btn ${isExpanded ? 'active' : ''}" title="Adjust Offset & Scale" aria-label="Adjust offset and scale">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
              <button type="button" class="queue-btn move-up-btn" title="Move Up" ${index === 0 ? 'disabled' : ''} aria-label="Move item up">
                ▲
              </button>
              <button type="button" class="queue-btn move-down-btn" title="Move Down" ${index === count - 1 ? 'disabled' : ''} aria-label="Move item down">
                ▼
              </button>
              <button type="button" class="queue-btn remove-btn" title="Remove" aria-label="Remove item">
                &times;
              </button>
            </div>
            <span class="queue-card-meta">${item.width}×${item.height} px${sizeStr ? ' • ' + sizeStr : ''}</span>
          </div>
        </div>
        <div class="queue-card-adjust-panel" style="${isExpanded ? 'display: flex;' : 'display: none;'}" draggable="false">
          <div class="adjust-row">
            <span class="adjust-label">Offset X</span>
            <input type="range" class="form-range adjust-range adjust-x" min="-100" max="100" step="1" value="${pctX}">
            <span class="adjust-val adjust-val-x">${pctX}%</span>
          </div>
          <div class="adjust-row">
            <span class="adjust-label">Offset Y</span>
            <input type="range" class="form-range adjust-range adjust-y" min="-100" max="100" step="1" value="${pctY}">
            <span class="adjust-val adjust-val-y">${pctY}%</span>
          </div>
          <div class="adjust-row">
            <span class="adjust-label">Scale</span>
            <input type="range" class="form-range adjust-range adjust-scale" min="1.0" max="3.0" step="0.05" value="${scaleStr}">
            <span class="adjust-val adjust-val-scale">${scaleStr}x</span>
          </div>
          <div class="adjust-actions-row">
            <button type="button" class="btn-text-reset adjust-reset-single-btn">Reset photo</button>
          </div>
        </div>
      `;

      const cardMain = li.querySelector('.queue-card-main');
      const adjustBtn = li.querySelector('.adjust-btn');
      const adjustPanel = li.querySelector('.queue-card-adjust-panel');
      const rangeX = li.querySelector('.adjust-x');
      const rangeY = li.querySelector('.adjust-y');
      const rangeScale = li.querySelector('.adjust-scale');
      const valX = li.querySelector('.adjust-val-x');
      const valY = li.querySelector('.adjust-val-y');
      const valScale = li.querySelector('.adjust-val-scale');
      const resetSingleBtn = li.querySelector('.adjust-reset-single-btn');

      // Prevent card dragging when interacting with sliders
      adjustPanel.addEventListener('mousedown', (e) => e.stopPropagation());
      adjustPanel.addEventListener('dragstart', (e) => e.preventDefault());

      // Toggle adjust dropdown panel
      adjustBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (state.expandedCardIds.has(item.id)) {
          state.expandedCardIds.delete(item.id);
          adjustPanel.style.display = 'none';
          adjustBtn.classList.remove('active');
        } else {
          state.expandedCardIds.add(item.id);
          adjustPanel.style.display = 'flex';
          adjustBtn.classList.add('active');
        }
      });

      // Offset X Slider
      rangeX.addEventListener('input', (e) => {
        item.offsetX = parseInt(e.target.value, 10) / 100;
        valX.textContent = `${e.target.value}%`;
        if (!hasAnimatedImages()) renderCurrentCanvasFrame();
      });

      // Offset Y Slider
      rangeY.addEventListener('input', (e) => {
        item.offsetY = parseInt(e.target.value, 10) / 100;
        valY.textContent = `${e.target.value}%`;
        if (!hasAnimatedImages()) renderCurrentCanvasFrame();
      });

      // Scale Slider
      rangeScale.addEventListener('input', (e) => {
        item.scale = parseFloat(e.target.value);
        valScale.textContent = `${item.scale.toFixed(2)}x`;
        if (!hasAnimatedImages()) renderCurrentCanvasFrame();
      });

      // Reset Single Photo
      resetSingleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        item.offsetX = 0;
        item.offsetY = 0;
        item.scale = 1.0;
        rangeX.value = 0;
        rangeY.value = 0;
        rangeScale.value = 1.0;
        valX.textContent = '0%';
        valY.textContent = '0%';
        valScale.textContent = '1.00x';
        if (!hasAnimatedImages()) renderCurrentCanvasFrame();
      });

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
        state.expandedCardIds.delete(item.id);
        state.images.splice(index, 1);
        renderPhotoQueue();
        updateCanvas();
      });

      // Drag and Drop Sorting Listeners (on cardMain)
      cardMain.addEventListener('dragstart', (e) => {
        if (e.target.closest('.queue-btn') || e.target.closest('input')) {
          e.preventDefault();
          return;
        }
        state.draggedIndex = index;
        li.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', index);
      });

      cardMain.addEventListener('dragend', () => {
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
   * Populates the Advanced Animation Timing modal list.
   */
  function renderTimingModalList() {
    DOM.animTimingList.innerHTML = '';
    const animatedItems = state.images.filter(img => img.isAnimated);

    if (animatedItems.length === 0) {
      DOM.animTimingList.innerHTML = '<p class="text-muted" style="text-align: center; padding: 20px;">No animated items in current collage.</p>';
      return;
    }

    animatedItems.forEach((item) => {
      const div = document.createElement('div');
      div.className = 'anim-timing-item';

      const offset = (item.startOffset || 0).toFixed(1);

      div.innerHTML = `
        <img class="anim-timing-thumb" src="${item.url}" alt="${item.name}">
        <div class="anim-timing-details">
          <div class="anim-timing-header">
            <span class="anim-timing-title" title="${item.name}">${item.name}</span>
            <span class="anim-timing-val">Start offset: ${offset}s</span>
          </div>
          <div class="anim-timing-slider-row">
            <input type="range" class="form-range anim-timing-slider" min="0" max="${state.animDuration}" step="0.1" value="${offset}">
            <button type="button" class="anim-timing-reset-btn" title="Reset offset to 0">Reset</button>
          </div>
        </div>
      `;

      const slider = div.querySelector('.anim-timing-slider');
      const valLabel = div.querySelector('.anim-timing-val');
      const resetBtn = div.querySelector('.anim-timing-reset-btn');

      slider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) || 0;
        item.startOffset = val;
        valLabel.textContent = `Start offset: ${val.toFixed(1)}s`;
        renderCurrentCanvasFrame();
      });

      resetBtn.addEventListener('click', () => {
        item.startOffset = 0;
        slider.value = 0;
        valLabel.textContent = 'Start offset: 0.0s';
        renderCurrentCanvasFrame();
      });

      DOM.animTimingList.appendChild(div);
    });
  }

  /**
   * Processes a list of File objects and adds them to state.
   */
  async function handleFiles(files) {
    const fileArray = Array.from(files).filter(f => f.type.startsWith('image/') || f.name.toLowerCase().endsWith('.gif') || f.name.toLowerCase().endsWith('.webp'));
    if (fileArray.length === 0) return;

    const previouslyHadAnimations = hasAnimatedImages();

    const loadPromises = fileArray.map(file => loadImageFromFile(file).catch(err => {
      console.warn(`Could not load image ${file.name}:`, err);
      return null;
    }));

    const loadedResults = await Promise.all(loadPromises);
    const validImages = loadedResults.filter(Boolean);

    if (validImages.length > 0) {
      state.images.push(...validImages);

      // Auto-switch to GIF and match duration if newly introduced animation
      if (!previouslyHadAnimations && hasAnimatedImages()) {
        const maxAnimDuration = Math.max(...state.images.filter(i => i.isAnimated).map(i => i.animation.totalDuration));
        state.animDuration = Math.max(1.0, Math.min(15.0, parseFloat(maxAnimDuration.toFixed(1))));
        DOM.animDurationRange.value = state.animDuration;
        DOM.animDurationNumber.value = state.animDuration;
        DOM.animDurationDisplay.textContent = `${state.animDuration.toFixed(1)} s`;

        state.exportFormat = 'image/gif';
        DOM.exportFormatSelect.value = 'image/gif';
      }

      renderPhotoQueue();
      updateCanvas();
    }
  }

  /**
   * Translates pointer coordinates to internal canvas pixel coordinates.
   */
  function getCanvasPointerPos(clientPos) {
    const rect = DOM.previewCanvas.getBoundingClientRect();
    const scaleX = DOM.previewCanvas.width / (rect.width || 1);
    const scaleY = DOM.previewCanvas.height / (rect.height || 1);
    return {
      x: (clientPos.clientX - rect.left) * scaleX,
      y: (clientPos.clientY - rect.top) * scaleY
    };
  }

  /**
   * Finds the image cell index at given canvas coordinates.
   */
  function getCellIndexAtPoint(canvasX, canvasY) {
    if (state.images.length === 0) return -1;
    const { width, height } = getCanvasDimensions();
    const effectiveOuter = getEffectiveOuterBorder();
    const distribution = getDistribution(width, height);
    if (!distribution || distribution.length === 0) return -1;

    const rects = calculateCellRectangles(distribution, width, height, state.gapSize, effectiveOuter);
    for (let i = 0; i < rects.length && i < state.images.length; i++) {
      const r = rects[i];
      if (canvasX >= r.x && canvasX <= r.x + r.width && canvasY >= r.y && canvasY <= r.y + r.height) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Canvas Pointer Down - Initiates image panning within its cell.
   */
  function handleCanvasPointerDown(e) {
    if (state.images.length === 0) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const pointer = getCanvasPointerPos({ clientX, clientY });
    const cellIndex = getCellIndexAtPoint(pointer.x, pointer.y);
    if (cellIndex === -1) return;

    const item = state.images[cellIndex];
    if (!item) return;

    const { width, height } = getCanvasDimensions();
    const effectiveOuter = getEffectiveOuterBorder();
    const distribution = getDistribution(width, height);
    const rects = calculateCellRectangles(distribution, width, height, state.gapSize, effectiveOuter);
    const cellRect = rects[cellIndex];

    const imgWidth = item.width;
    const imgHeight = item.height;
    const crop = calculateCenterCrop(
      imgWidth,
      imgHeight,
      cellRect.width,
      cellRect.height,
      item.offsetX,
      item.offsetY,
      item.scale
    );

    state.canvasDrag = {
      index: cellIndex,
      startX: clientX,
      startY: clientY,
      origOffsetX: item.offsetX || 0,
      origOffsetY: item.offsetY || 0,
      lockedAxis: null,
      cellRect: cellRect,
      sWidth: crop.sWidth,
      sHeight: crop.sHeight,
      maxShiftX: crop.maxShiftX,
      maxShiftY: crop.maxShiftY
    };

    DOM.previewCanvas.style.cursor = 'grabbing';
    if (!hasAnimatedImages()) {
      renderCurrentCanvasFrame();
    }
  }

  /**
   * Canvas Pointer Move - Performs gesture-locked axis snapping and direct panning.
   */
  function handleCanvasPointerMove(e) {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    if (state.canvasDrag) {
      if (e.touches && e.cancelable) e.preventDefault();

      const dx = clientX - state.canvasDrag.startX;
      const dy = clientY - state.canvasDrag.startY;

      // Detect initial gesture lock direction if not already locked
      if (state.canvasDrag.lockedAxis === null) {
        const dist = Math.hypot(dx, dy);
        if (dist >= 5) {
          const absDx = Math.abs(dx);
          const absDy = Math.abs(dy);
          // If diagonal (angle between ~26° and ~64°), unlock both axes for 2D movement
          if (absDy >= 0.5 * absDx && absDx >= 0.5 * absDy) {
            state.canvasDrag.lockedAxis = 'both';
          } else if (absDy > absDx) {
            state.canvasDrag.lockedAxis = 'y';
          } else {
            state.canvasDrag.lockedAxis = 'x';
          }
        }
      }

      const effDx = (state.canvasDrag.lockedAxis === 'y') ? 0 : dx;
      const effDy = (state.canvasDrag.lockedAxis === 'x') ? 0 : dy;

      const canvasBoundingRect = DOM.previewCanvas.getBoundingClientRect();
      const cssScaleX = canvasBoundingRect.width / (DOM.previewCanvas.width || 1);
      const cssScaleY = canvasBoundingRect.height / (DOM.previewCanvas.height || 1);

      const effCanvasDx = effDx / (cssScaleX || 1);
      const effCanvasDy = effDy / (cssScaleY || 1);

      // Convert canvas pixel delta to image pixel delta
      const imgDx = effCanvasDx * (state.canvasDrag.sWidth / (state.canvasDrag.cellRect.width || 1));
      const imgDy = effCanvasDy * (state.canvasDrag.sHeight / (state.canvasDrag.cellRect.height || 1));

      // Dragging mouse to the right shifts the crop window to the left
      const deltaOffsetX = state.canvasDrag.maxShiftX > 0 ? (-imgDx / state.canvasDrag.maxShiftX) : 0;
      const deltaOffsetY = state.canvasDrag.maxShiftY > 0 ? (-imgDy / state.canvasDrag.maxShiftY) : 0;

      const item = state.images[state.canvasDrag.index];
      if (item) {
        const newOffsetX = Math.max(-1.0, Math.min(1.0, state.canvasDrag.origOffsetX + deltaOffsetX));
        const newOffsetY = Math.max(-1.0, Math.min(1.0, state.canvasDrag.origOffsetY + deltaOffsetY));

        item.offsetX = Math.round(newOffsetX * 1000) / 1000;
        item.offsetY = Math.round(newOffsetY * 1000) / 1000;

        if (!hasAnimatedImages()) {
          renderCurrentCanvasFrame();
        }
        syncQueueItemInputs(state.canvasDrag.index);
      }
      return;
    }

    // Hover state updates when not actively dragging
    if (state.images.length > 0) {
      const pointer = getCanvasPointerPos({ clientX, clientY });
      const cellIdx = getCellIndexAtPoint(pointer.x, pointer.y);
      if (cellIdx !== state.canvasHoverIndex) {
        state.canvasHoverIndex = cellIdx;
        DOM.previewCanvas.style.cursor = cellIdx >= 0 ? 'grab' : 'default';
        if (!hasAnimatedImages()) {
          renderCurrentCanvasFrame();
        }
      }
    }
  }

  /**
   * Canvas Pointer Up - Releases active drag.
   */
  function handleCanvasPointerUp() {
    if (state.canvasDrag) {
      state.canvasDrag = null;
      DOM.previewCanvas.style.cursor = state.canvasHoverIndex >= 0 ? 'grab' : 'default';
      if (!hasAnimatedImages()) {
        renderCurrentCanvasFrame();
      }
    }
  }

  /**
   * Canvas Wheel - Shift + Scroll Wheel zooms the hovered cell between 1.0x and 3.0x.
   */
  function handleCanvasWheel(e) {
    if (!e.shiftKey) return;
    if (state.images.length === 0) return;

    const pointer = getCanvasPointerPos(e);
    const cellIdx = getCellIndexAtPoint(pointer.x, pointer.y);
    if (cellIdx === -1) return;

    e.preventDefault();
    const item = state.images[cellIdx];
    if (!item) return;

    const currentScale = item.scale !== undefined ? item.scale : 1.0;
    const zoomStep = 0.05;
    const delta = e.deltaY < 0 ? zoomStep : -zoomStep;
    const newScale = Math.max(1.0, Math.min(3.0, Math.round((currentScale + delta) * 100) / 100));

    if (newScale !== item.scale) {
      item.scale = newScale;
      if (!hasAnimatedImages()) {
        renderCurrentCanvasFrame();
      }
      syncQueueItemInputs(cellIdx);
    }
  }

  /**
   * Initializes all user interface event listeners.
   */
  function setupEventListeners() {
    // Canvas Pan & Zoom Interactivity
    DOM.previewCanvas.addEventListener('mousedown', handleCanvasPointerDown);
    window.addEventListener('mousemove', handleCanvasPointerMove);
    window.addEventListener('mouseup', handleCanvasPointerUp);

    DOM.previewCanvas.addEventListener('touchstart', handleCanvasPointerDown, { passive: true });
    window.addEventListener('touchmove', handleCanvasPointerMove, { passive: false });
    window.addEventListener('touchend', handleCanvasPointerUp, { passive: true });

    DOM.previewCanvas.addEventListener('mouseleave', () => {
      if (!state.canvasDrag && state.canvasHoverIndex !== -1) {
        state.canvasHoverIndex = -1;
        DOM.previewCanvas.style.cursor = 'default';
        if (!hasAnimatedImages()) {
          renderCurrentCanvasFrame();
        }
      }
    });

    DOM.previewCanvas.addEventListener('wheel', handleCanvasWheel, { passive: false });

    // Reset All Offsets & Scales Button
    if (DOM.resetAllAdjustmentsBtn) {
      DOM.resetAllAdjustmentsBtn.addEventListener('click', () => {
        state.images.forEach(img => {
          img.offsetX = 0;
          img.offsetY = 0;
          img.scale = 1.0;
        });
        renderPhotoQueue();
        updateCanvas();
      });
    }

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

    // Global window drop
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      if (e.target.closest('#drop-zone') || state.draggedIndex !== null) return;
      e.preventDefault();
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
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
      const isCustom = state.aspectRatioKey === 'custom';

      DOM.customDimsContainer.style.display = isCustom ? 'grid' : 'none';
      DOM.mpControlContainer.style.display = isCustom ? 'none' : 'block';

      updateCanvas();
    });

    // Megapixels Sync
    const syncMegapixels = (val) => {
      const mp = Math.max(0.5, Math.min(16.0, parseFloat(val) || 2.0));
      state.megapixels = mp;
      DOM.mpRange.value = mp;
      DOM.mpInput.value = mp;
      DOM.mpDisplay.textContent = `${mp.toFixed(1)} MP`;

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

    // Outer Border Controls
    const updateOuterBorderUI = () => {
      const isEnabled = state.hasOuterBorder;
      const isMatched = state.matchGapSize;

      DOM.outerBorderCheckbox.checked = isEnabled;
      DOM.matchGapCheckbox.checked = isMatched;

      if (!isEnabled) {
        DOM.outerBorderRow.classList.add('disabled');
        DOM.outerBorderRange.disabled = true;
        DOM.outerBorderNumber.disabled = true;
        DOM.matchGapContainer.classList.add('disabled');
        DOM.matchGapCheckbox.disabled = true;
        DOM.outerBorderDisplay.textContent = 'None (0 px)';
      } else {
        DOM.matchGapContainer.classList.remove('disabled');
        DOM.matchGapCheckbox.disabled = false;

        if (isMatched) {
          DOM.outerBorderRow.classList.add('disabled');
          DOM.outerBorderRange.disabled = true;
          DOM.outerBorderNumber.disabled = true;
          DOM.outerBorderRange.value = state.gapSize;
          DOM.outerBorderNumber.value = state.gapSize;
          DOM.outerBorderDisplay.textContent = `${state.gapSize} px`;
        } else {
          DOM.outerBorderRow.classList.remove('disabled');
          DOM.outerBorderRange.disabled = false;
          DOM.outerBorderNumber.disabled = false;
          DOM.outerBorderRange.value = state.outerBorderSize;
          DOM.outerBorderNumber.value = state.outerBorderSize;
          DOM.outerBorderDisplay.textContent = `${state.outerBorderSize} px`;
        }
      }
    };

    DOM.outerBorderCheckbox.addEventListener('change', (e) => {
      state.hasOuterBorder = e.target.checked;
      updateOuterBorderUI();
      updateCanvas();
    });

    DOM.matchGapCheckbox.addEventListener('change', (e) => {
      state.matchGapSize = e.target.checked;
      if (state.matchGapSize) {
        state.outerBorderSize = state.gapSize;
      }
      updateOuterBorderUI();
      updateCanvas();
    });

    const syncOuterBorder = (val) => {
      const border = Math.max(0, Math.min(150, parseInt(val, 10) || 0));
      state.outerBorderSize = border;
      DOM.outerBorderRange.value = border;
      DOM.outerBorderNumber.value = border;
      DOM.outerBorderDisplay.textContent = `${border} px`;
      updateCanvas();
    };

    DOM.outerBorderRange.addEventListener('input', (e) => syncOuterBorder(e.target.value));
    DOM.outerBorderNumber.addEventListener('change', (e) => syncOuterBorder(e.target.value));
    updateOuterBorderUI();

    // Gap Size Controls
    const syncGapSize = (val) => {
      const gap = Math.max(0, Math.min(150, parseInt(val, 10) || 0));
      state.gapSize = gap;
      DOM.gapRange.value = gap;
      DOM.gapNumber.value = gap;
      DOM.gapDisplay.textContent = `${gap} px`;

      if (state.matchGapSize && state.hasOuterBorder) {
        state.outerBorderSize = gap;
        DOM.outerBorderRange.value = gap;
        DOM.outerBorderNumber.value = gap;
        DOM.outerBorderDisplay.textContent = `${gap} px`;
      }

      updateCanvas();
    };

    DOM.gapRange.addEventListener('input', (e) => syncGapSize(e.target.value));
    DOM.gapNumber.addEventListener('change', (e) => syncGapSize(e.target.value));

    // Background & Border Color Controls
    const syncBgColor = (color) => {
      state.bgColor = color;
      DOM.bgColorPicker.value = color;
      DOM.bgColorHex.textContent = color.toUpperCase();
      DOM.colorPickerWrapper.style.backgroundColor = color;
      updateCanvas();
    };

    DOM.bgColorPicker.addEventListener('input', (e) => syncBgColor(e.target.value));

    DOM.colorSwatches.addEventListener('click', (e) => {
      const swatch = e.target.closest('.swatch-btn');
      if (swatch && swatch.dataset.color) {
        if (state.isTransparent) {
          state.isTransparent = false;
          DOM.transparentCheckbox.checked = false;
          DOM.colorPickerWrapper.classList.remove('disabled');
          DOM.bgColorPicker.disabled = false;
        }
        syncBgColor(swatch.dataset.color);
      }
    });

    DOM.transparentCheckbox.addEventListener('change', (e) => {
      state.isTransparent = e.target.checked;
      DOM.colorPickerWrapper.classList.toggle('disabled', state.isTransparent);
      DOM.bgColorPicker.disabled = state.isTransparent;
      updateCanvas();
    });

    // Grid Layout Mode Select
    DOM.layoutModeSelect.addEventListener('change', (e) => {
      state.layoutMode = e.target.value;
      updateCanvas();
    });

    // Text Overlay Event Handlers
    const adjustTextOverlayHeight = () => {
      if (!DOM.overlayTextInput) return;
      DOM.overlayTextInput.style.height = 'auto';
      const scrollH = DOM.overlayTextInput.scrollHeight;
      const maxH = Math.min(420, Math.floor(window.innerHeight * 0.45));
      if (scrollH > maxH) {
        DOM.overlayTextInput.style.height = `${maxH}px`;
        DOM.overlayTextInput.style.overflowY = 'auto';
      } else {
        DOM.overlayTextInput.style.height = `${Math.max(48, scrollH)}px`;
        DOM.overlayTextInput.style.overflowY = 'hidden';
      }
    };

    if (DOM.overlayTextInput) {
      DOM.overlayTextInput.addEventListener('input', (e) => {
        state.textOverlay.text = e.target.value;
        adjustTextOverlayHeight();
        renderCurrentCanvasFrame();
      });

      DOM.overlayTextInput.addEventListener('paste', () => {
        setTimeout(adjustTextOverlayHeight, 0);
      });

      window.addEventListener('resize', adjustTextOverlayHeight);
      adjustTextOverlayHeight();
    }

    if (DOM.overlayPositionSelect) {
      DOM.overlayPositionSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        state.textOverlay.preset = val;
        if (val === 'bottom') {
          state.textOverlay.offsetX = 0.0;
          state.textOverlay.offsetY = -0.85;
        } else if (val === 'top') {
          state.textOverlay.offsetX = 0.0;
          state.textOverlay.offsetY = 0.85;
        } else if (val === 'center') {
          state.textOverlay.offsetX = 0.0;
          state.textOverlay.offsetY = 0.0;
        } else if (val === 'custom') {
          if (DOM.overlaySettingsDrawer) {
            DOM.overlaySettingsDrawer.style.display = 'flex';
            if (DOM.overlaySettingsToggleBtn) {
              DOM.overlaySettingsToggleBtn.classList.add('active');
              DOM.overlaySettingsToggleBtn.setAttribute('aria-expanded', 'true');
            }
          }
        }

        if (DOM.overlayOffsetXRange) {
          DOM.overlayOffsetXRange.value = state.textOverlay.offsetX;
        }
        if (DOM.overlayOffsetXDisplay) {
          DOM.overlayOffsetXDisplay.textContent = state.textOverlay.offsetX.toFixed(2);
        }
        if (DOM.overlayOffsetYRange) {
          DOM.overlayOffsetYRange.value = state.textOverlay.offsetY;
        }
        if (DOM.overlayOffsetYDisplay) {
          DOM.overlayOffsetYDisplay.textContent = state.textOverlay.offsetY.toFixed(2);
        }

        renderCurrentCanvasFrame();
      });
    }

    if (DOM.overlaySettingsToggleBtn && DOM.overlaySettingsDrawer) {
      DOM.overlaySettingsToggleBtn.addEventListener('click', () => {
        const isHidden = DOM.overlaySettingsDrawer.style.display === 'none';
        DOM.overlaySettingsDrawer.style.display = isHidden ? 'flex' : 'none';
        DOM.overlaySettingsToggleBtn.classList.toggle('active', isHidden);
        DOM.overlaySettingsToggleBtn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
      });
    }

    if (DOM.overlayFontFamilySelect) {
      DOM.overlayFontFamilySelect.addEventListener('change', (e) => {
        state.textOverlay.fontFamily = e.target.value;
        renderCurrentCanvasFrame();
      });
    }

    if (DOM.overlayFontSizeRange) {
      DOM.overlayFontSizeRange.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10) || 35;
        state.textOverlay.fontSizeScale = val;
        if (DOM.overlayFontSizeDisplay) {
          DOM.overlayFontSizeDisplay.textContent = `${val}%`;
        }
        renderCurrentCanvasFrame();
      });
    }

    if (DOM.overlayOffsetXRange) {
      DOM.overlayOffsetXRange.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) || 0;
        state.textOverlay.offsetX = val;
        state.textOverlay.preset = 'custom';
        if (DOM.overlayPositionSelect) DOM.overlayPositionSelect.value = 'custom';
        if (DOM.overlayOffsetXDisplay) DOM.overlayOffsetXDisplay.textContent = val.toFixed(2);
        renderCurrentCanvasFrame();
      });
    }

    if (DOM.overlayOffsetYRange) {
      DOM.overlayOffsetYRange.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) || 0;
        state.textOverlay.offsetY = val;
        state.textOverlay.preset = 'custom';
        if (DOM.overlayPositionSelect) DOM.overlayPositionSelect.value = 'custom';
        if (DOM.overlayOffsetYDisplay) DOM.overlayOffsetYDisplay.textContent = val.toFixed(2);
        renderCurrentCanvasFrame();
      });
    }

    // Export Format & Quality Controls
    DOM.exportFormatSelect.addEventListener('change', (e) => {
      state.exportFormat = e.target.value;
      syncAnimationControlsUI();
    });

    DOM.exportQualityRange.addEventListener('input', (e) => {
      const percent = parseInt(e.target.value, 10);
      state.exportQuality = percent / 100;
      DOM.exportQualityDisplay.textContent = `${percent}%`;
    });

    // Frame Rate (FPS) Select
    DOM.exportFpsSelect.addEventListener('change', (e) => {
      const fps = parseInt(e.target.value, 10) || 15;
      state.exportFps = fps;
      DOM.exportFpsDisplay.textContent = `${fps} FPS`;
    });

    // Animation Duration Sliders
    const syncAnimDuration = (val) => {
      const dur = Math.max(0.5, Math.min(30.0, parseFloat(val) || 3.0));
      state.animDuration = parseFloat(dur.toFixed(1));
      DOM.animDurationRange.value = state.animDuration;
      DOM.animDurationNumber.value = state.animDuration;
      DOM.animDurationDisplay.textContent = `${state.animDuration.toFixed(1)} s`;
      updatePlaybackScrubberUI();
    };

    DOM.animDurationRange.addEventListener('input', (e) => syncAnimDuration(e.target.value));
    DOM.animDurationNumber.addEventListener('change', (e) => syncAnimDuration(e.target.value));

    // Playback Controls (Play/Pause, Scrubber, Speed)
    DOM.playPauseBtn.addEventListener('click', () => {
      state.isPlaying = !state.isPlaying;
      DOM.playIcon.style.display = state.isPlaying ? 'none' : 'block';
      DOM.pauseIcon.style.display = state.isPlaying ? 'block' : 'none';
      if (state.isPlaying) {
        state.lastPlaybackTimestamp = performance.now();
      }
    });

    DOM.playbackScrubber.addEventListener('input', (e) => {
      state.isScrubbing = true;
      const frac = parseInt(e.target.value, 10) / 1000;
      state.currentTime = frac * state.animDuration;
      DOM.playbackTimeDisplay.textContent = `${state.currentTime.toFixed(1)}s / ${state.animDuration.toFixed(1)}s`;
      renderCurrentCanvasFrame();
    });

    DOM.playbackScrubber.addEventListener('change', () => {
      state.isScrubbing = false;
      state.lastPlaybackTimestamp = performance.now();
    });

    DOM.speedBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        DOM.speedBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.playbackSpeed = parseFloat(btn.dataset.speed) || 1.0;
      });
    });

    // Advanced Timing Modal Triggers
    DOM.toggleAnimTimingBtn.addEventListener('click', () => {
      renderTimingModalList();
      DOM.animTimingModal.style.display = 'flex';
    });

    const closeTimingModal = () => {
      DOM.animTimingModal.style.display = 'none';
    };

    DOM.closeTimingModalBtn.addEventListener('click', closeTimingModal);
    DOM.timingModalDoneBtn.addEventListener('click', closeTimingModal);
    DOM.animTimingModal.addEventListener('click', (e) => {
      if (e.target === DOM.animTimingModal) closeTimingModal();
    });

    // Download Button Action
    let activeExportController = null;

    DOM.cancelExportBtn.addEventListener('click', () => {
      if (activeExportController) {
        activeExportController.abort();
      }
    });

    DOM.downloadBtn.addEventListener('click', async () => {
      if (state.images.length === 0) return;

      const { width, height } = getCanvasDimensions();
      const isAnimatedExport = (state.exportFormat === 'image/gif' || state.exportFormat === 'image/webp-anim');

      if (isAnimatedExport) {
        // Multi-frame animated export with progress modal
        activeExportController = new AbortController();
        DOM.exportProgressFill.style.width = '0%';
        DOM.exportProgressText.textContent = 'Preparing animation frames...';
        DOM.exportProgressModal.style.display = 'flex';
        DOM.downloadBtn.disabled = true;

        const isWebp = state.exportFormat === 'image/webp-anim';
        const filename = `combined-${width}x${height}.${isWebp ? 'webp' : 'gif'}`;

        try {
          await exportAnimation({
            imageItems: state.images,
            distribution: getDistribution(width, height),
            canvasWidth: width,
            canvasHeight: height,
            collageOptions: {
              gapSize: state.gapSize,
              outerBorderSize: getEffectiveOuterBorder(),
              bgColor: state.bgColor,
              isTransparent: state.isTransparent,
              textOverlay: state.textOverlay
            },
            duration: state.animDuration,
            fps: state.exportFps,
            format: isWebp ? 'image/webp' : 'image/gif',
            quality: state.exportQuality,
            filename: filename,
            onProgress: (current, total, fraction) => {
              const pct = Math.round(fraction * 100);
              DOM.exportProgressFill.style.width = `${pct}%`;
              DOM.exportProgressText.textContent = `Rendering frame ${current} of ${total} (${pct}%)...`;
            },
            abortSignal: activeExportController.signal
          });
        } catch (err) {
          if (!activeExportController.signal.aborted) {
            alert(`Animation export error: ${err.message || err}`);
          }
        } finally {
          DOM.exportProgressModal.style.display = 'none';
          DOM.downloadBtn.disabled = false;
          activeExportController = null;
        }

      } else {
        // Static Snapshot export
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
      }
    });

    // About Modal Handlers
    const openAboutModal = () => {
      DOM.aboutModal.style.display = 'flex';
    };

    const closeAboutModal = () => {
      DOM.aboutModal.style.display = 'none';
    };

    DOM.aboutBtn.addEventListener('click', openAboutModal);
    DOM.closeModalBtn.addEventListener('click', closeAboutModal);
    DOM.modalOkBtn.addEventListener('click', closeAboutModal);

    DOM.aboutModal.addEventListener('click', (e) => {
      if (e.target === DOM.aboutModal) closeAboutModal();
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (DOM.aboutModal.style.display === 'flex') closeAboutModal();
        if (DOM.animTimingModal.style.display === 'flex') closeTimingModal();
      }
    });
  }

  // Initial Boot
  setupEventListeners();
  updateCanvas();
})();
