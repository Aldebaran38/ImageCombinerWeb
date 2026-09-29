/**
 * ImageCombiner Web - Image Compositing & Rendering Engine
 * 
 * Handles center-crop scaling math, canvas rendering, and high-resolution exporting.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['./layout.js'], factory);
  } else if (typeof module === 'object' && module.exports) {
    const layout = require('./layout.js');
    module.exports = factory(layout);
  } else {
    root.ImageCombinerCompositor = factory(root.ImageCombinerLayout);
  }
})(typeof self !== 'undefined' ? self : this, function (layout) {
  'use strict';

  const calculateCellRectangles = layout
    ? layout.calculateCellRectangles
    : (typeof window !== 'undefined' && window.ImageCombinerLayout ? window.ImageCombinerLayout.calculateCellRectangles : null);

  /**
   * Calculates center-crop source rectangle coordinates.
   */
  function calculateCenterCrop(imgWidth, imgHeight, targetWidth, targetHeight) {
    const imgRatio = imgWidth / imgHeight;
    const targetRatio = targetWidth / targetHeight;

    let sWidth = imgWidth;
    let sHeight = imgHeight;
    let sx = 0;
    let sy = 0;

    if (imgRatio > targetRatio) {
      sHeight = imgHeight;
      sWidth = imgHeight * targetRatio;
      sx = (imgWidth - sWidth) / 2;
      sy = 0;
    } else {
      sWidth = imgWidth;
      sHeight = imgWidth / targetRatio;
      sx = 0;
      sy = (imgHeight - sHeight) / 2;
    }

    return { sx, sy, sWidth, sHeight };
  }

  /**
   * Loads a File object into an HTMLImageElement using an object URL.
   */
  function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) {
        reject(new Error(`File "${file.name}" is not an image.`));
        return;
      }

      const objectUrl = URL.createObjectURL(file);
      const img = new Image();

      img.onload = () => {
        resolve({
          id: 'img_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now(),
          name: file.name,
          size: file.size,
          type: file.type,
          url: objectUrl,
          img: img,
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height
        });
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error(`Failed to load image "${file.name}".`));
      };

      img.src = objectUrl;
    });
  }

  /**
   * Renders the combined collage onto a target HTML5 canvas element.
   */
  function renderCollage(canvas, imageItems, distribution, canvasWidth, canvasHeight, options) {
    options = options || {};
    const gapSize = options.gapSize !== undefined ? options.gapSize : 0;
    const outerBorderSize = options.outerBorderSize !== undefined ? options.outerBorderSize : 0;
    const bgColor = options.bgColor || '#18181b';
    const isTransparent = Boolean(options.isTransparent);

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    if (!isTransparent) {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    if (!imageItems || imageItems.length === 0 || !distribution || distribution.length === 0) {
      return;
    }

    const rects = calculateCellRectangles(distribution, canvasWidth, canvasHeight, gapSize, outerBorderSize);

    const count = Math.min(imageItems.length, rects.length);
    for (let i = 0; i < count; i++) {
      const item = imageItems[i];
      const rect = rects[i];
      const img = item.img;

      if (!img) continue;

      const imgWidth = img.naturalWidth || img.width;
      const imgHeight = img.naturalHeight || img.height;

      if (!imgWidth || !imgHeight) continue;

      const crop = calculateCenterCrop(imgWidth, imgHeight, rect.width, rect.height);

      ctx.drawImage(
        img,
        crop.sx,
        crop.sy,
        crop.sWidth,
        crop.sHeight,
        rect.x,
        rect.y,
        rect.width,
        rect.height
      );
    }
  }

  /**
   * Exports the canvas content as a downloadable image file.
   */
  function exportCanvas(canvas, format, quality, filename) {
    format = format || 'image/png';
    quality = quality !== undefined ? quality : 0.92;
    filename = filename || 'combined-image.png';

    return new Promise((resolve, reject) => {
      try {
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('Failed to generate image file.'));
            return;
          }

          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          setTimeout(() => URL.revokeObjectURL(url), 1000);
          resolve();
        }, format, quality);
      } catch (err) {
        reject(err);
      }
    });
  }

  return {
    calculateCenterCrop,
    loadImageFromFile,
    renderCollage,
    exportCanvas
  };
});
