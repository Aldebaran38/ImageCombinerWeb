/**
 * ImageCombiner Web - Image Compositing & Rendering Engine
 * 
 * Handles center-crop scaling math, canvas rendering, animated GIF decoding,
 * playback timeline interpolation, and multi-frame GIF / WebP exporting.
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
   * Calculates center-crop source rectangle coordinates with offset and zoom support.
   * Ensures the cropped window never exceeds the image boundaries (no empty gaps).
   */
  function calculateCenterCrop(imgWidth, imgHeight, targetWidth, targetHeight, offsetX, offsetY, scale) {
    scale = Math.max(1.0, Math.min(3.0, Number(scale) || 1.0));
    offsetX = Math.max(-1.0, Math.min(1.0, Number(offsetX) || 0));
    offsetY = Math.max(-1.0, Math.min(1.0, Number(offsetY) || 0));

    const imgRatio = imgWidth / imgHeight;
    const targetRatio = targetWidth / targetHeight;

    let baseSWidth;
    let baseSHeight;

    if (imgRatio > targetRatio) {
      baseSHeight = imgHeight;
      baseSWidth = imgHeight * targetRatio;
    } else {
      baseSWidth = imgWidth;
      baseSHeight = imgWidth / targetRatio;
    }

    // Applying scale zooms into the image (smaller source rectangle)
    const sWidth = baseSWidth / scale;
    const sHeight = baseSHeight / scale;

    const maxShiftX = Math.max(0, (imgWidth - sWidth) / 2);
    const maxShiftY = Math.max(0, (imgHeight - sHeight) / 2);

    const baseSx = (imgWidth - sWidth) / 2;
    const baseSy = (imgHeight - sHeight) / 2;

    let sx = baseSx + (offsetX * maxShiftX);
    let sy = baseSy + (offsetY * maxShiftY);

    // Strictly clamp within image boundary
    sx = Math.max(0, Math.min(imgWidth - sWidth, sx));
    sy = Math.max(0, Math.min(imgHeight - sHeight, sy));

    return { sx, sy, sWidth, sHeight, maxShiftX, maxShiftY };
  }

  /**
   * Decodes an animated GIF ArrayBuffer into pre-rendered frame canvases and delays.
   */
  function decodeGifFrames(arrayBuffer) {
    const GifReaderClass = typeof window !== 'undefined' ? (window.GifReader || (typeof GifReader !== 'undefined' ? GifReader : null)) : null;
    if (!GifReaderClass) {
      throw new Error('GIF reader library (omggif) is not loaded.');
    }

    const bytes = new Uint8Array(arrayBuffer);
    const reader = new GifReaderClass(bytes);
    const numFrames = reader.numFrames();
    const width = reader.width;
    const height = reader.height;

    const frames = [];
    let cumulativeTime = 0;

    const currentPixels = new Uint8ClampedArray(width * height * 4);
    let backupPixels = null;

    for (let i = 0; i < numFrames; i++) {
      const frameInfo = reader.frameInfo(i);

      if (frameInfo.disposal === 3) {
        backupPixels = new Uint8ClampedArray(currentPixels);
      }

      reader.decodeAndBlitFrameRGBA(i, currentPixels);

      const frameCanvas = document.createElement('canvas');
      frameCanvas.width = width;
      frameCanvas.height = height;
      const ctx = frameCanvas.getContext('2d', { willReadFrequently: true });
      const imgData = new ImageData(new Uint8ClampedArray(currentPixels), width, height);
      ctx.putImageData(imgData, 0, 0);

      // Delay in GIF is 1/100 s; if <= 1 or invalid, default to 10 (100ms)
      const delayHundredths = frameInfo.delay > 1 ? frameInfo.delay : 10;
      const delayMs = delayHundredths * 10;
      const delaySec = delayMs / 1000;

      frames.push({
        canvas: frameCanvas,
        delayMs: delayMs,
        delaySec: delaySec,
        startTime: cumulativeTime,
        endTime: cumulativeTime + delaySec
      });

      cumulativeTime += delaySec;

      if (frameInfo.disposal === 2) {
        // Clear sub-rect to transparent
        for (let row = 0; row < frameInfo.height; row++) {
          const start = ((frameInfo.y + row) * width + frameInfo.x) * 4;
          currentPixels.fill(0, start, start + frameInfo.width * 4);
        }
      } else if (frameInfo.disposal === 3 && backupPixels) {
        currentPixels.set(backupPixels);
      }
    }

    return {
      frames: frames,
      totalDuration: Math.max(0.1, cumulativeTime),
      width: width,
      height: height,
      fps: frames.length > 0 ? Math.round(frames.length / cumulativeTime) : 15
    };
  }

  /**
   * Attempts to decode animated WebP using modern browser ImageDecoder API.
   */
  async function decodeWebpFrames(file) {
    if (typeof ImageDecoder === 'undefined') return null;

    try {
      const decoder = new ImageDecoder({ data: file.stream(), type: 'image/webp' });
      await decoder.tracks.ready;
      const track = decoder.tracks.selectedTrack;
      if (!track || track.frameCount <= 1) {
        return null; // Not animated
      }

      const frames = [];
      let cumulativeTime = 0;
      let width = 0;
      let height = 0;

      for (let i = 0; i < track.frameCount; i++) {
        const result = await decoder.decode({ frameIndex: i });
        const videoFrame = result.image;
        width = videoFrame.displayWidth;
        height = videoFrame.displayHeight;

        const frameCanvas = document.createElement('canvas');
        frameCanvas.width = width;
        frameCanvas.height = height;
        const ctx = frameCanvas.getContext('2d');
        ctx.drawImage(videoFrame, 0, 0);

        const durationMicro = videoFrame.duration || 100000;
        const durationSec = durationMicro / 1000000;
        const durationMs = durationSec * 1000;

        frames.push({
          canvas: frameCanvas,
          delayMs: durationMs,
          delaySec: durationSec,
          startTime: cumulativeTime,
          endTime: cumulativeTime + durationSec
        });

        cumulativeTime += durationSec;
        videoFrame.close();
      }

      return {
        frames: frames,
        totalDuration: Math.max(0.1, cumulativeTime),
        width: width,
        height: height,
        fps: frames.length > 0 ? Math.round(frames.length / cumulativeTime) : 15
      };
    } catch (e) {
      console.warn('ImageDecoder animated WebP parsing skipped or failed:', e);
      return null;
    }
  }

  /**
   * Loads a File object into an image representation.
   * If the file is an animated GIF (or animated WebP), parses all frames and timings.
   */
  async function loadImageFromFile(file) {
    if (!file.type.startsWith('image/')) {
      throw new Error(`File "${file.name}" is not an image.`);
    }

    const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
    const isWebp = file.type === 'image/webp' || file.name.toLowerCase().endsWith('.webp');

    // 1. Check for animated GIF
    if (isGif) {
      try {
        const buffer = await file.arrayBuffer();
        const animation = decodeGifFrames(buffer);

        if (animation.frames.length > 1) {
          const firstCanvas = animation.frames[0].canvas;
          const objectUrl = URL.createObjectURL(file);

          return {
            id: 'img_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now(),
            name: file.name,
            size: file.size,
            type: file.type,
            url: objectUrl,
            img: firstCanvas,
            width: animation.width,
            height: animation.height,
            isAnimated: true,
            animation: animation,
            startOffset: 0,
            offsetX: 0,
            offsetY: 0,
            scale: 1.0
          };
        }
      } catch (err) {
        console.warn('GIF multi-frame parse failed, falling back to static loader:', err);
      }
    }

    // 2. Check for animated WebP
    if (isWebp) {
      try {
        const animation = await decodeWebpFrames(file);
        if (animation && animation.frames.length > 1) {
          const firstCanvas = animation.frames[0].canvas;
          const objectUrl = URL.createObjectURL(file);

          return {
            id: 'img_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now(),
            name: file.name,
            size: file.size,
            type: file.type,
            url: objectUrl,
            img: firstCanvas,
            width: animation.width,
            height: animation.height,
            isAnimated: true,
            animation: animation,
            startOffset: 0,
            offsetX: 0,
            offsetY: 0,
            scale: 1.0
          };
        }
      } catch (err) {
        console.warn('WebP multi-frame parse failed, falling back to static loader:', err);
      }
    }

    // 3. Standard static image loading
    return new Promise((resolve, reject) => {
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
          height: img.naturalHeight || img.height,
          isAnimated: false,
          animation: null,
          startOffset: 0,
          offsetX: 0,
          offsetY: 0,
          scale: 1.0
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
   * Retrieves the corresponding frame canvas for an animated image at a specific time.
   */
  function getFrameImageAtTime(item, currentTime) {
    if (!item.isAnimated || !item.animation || !item.animation.frames || item.animation.frames.length === 0) {
      return item.img;
    }

    const { frames, totalDuration } = item.animation;
    const offset = item.startOffset || 0;

    let t = (currentTime - offset) % totalDuration;
    if (t < 0) t += totalDuration;

    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      if (t >= f.startTime && t < f.endTime) {
        return f.canvas;
      }
    }

    return frames[frames.length - 1].canvas;
  }

  /**
   * Renders the combined collage onto a target HTML5 canvas element.
   * If options.time is supplied, renders the corresponding animation frame for any animated images.
   */
  function renderCollage(canvas, imageItems, distribution, canvasWidth, canvasHeight, options) {
    options = options || {};
    const gapSize = options.gapSize !== undefined ? options.gapSize : 0;
    const outerBorderSize = options.outerBorderSize !== undefined ? options.outerBorderSize : 0;
    const bgColor = options.bgColor || '#18181b';
    const isTransparent = Boolean(options.isTransparent);
    const currentTime = options.time !== undefined ? options.time : 0;

    if (canvas.width !== canvasWidth) canvas.width = canvasWidth;
    if (canvas.height !== canvasHeight) canvas.height = canvasHeight;

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

      const img = item.isAnimated ? getFrameImageAtTime(item, currentTime) : item.img;
      if (!img) continue;

      const imgWidth = img.naturalWidth || img.width;
      const imgHeight = img.naturalHeight || img.height;

      const crop = calculateCenterCrop(
        imgWidth,
        imgHeight,
        rect.width,
        rect.height,
        item.offsetX,
        item.offsetY,
        item.scale
      );

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

    // Active cell highlight for canvas hover / drag interactivity
    if (
      options.activeCellIndex !== undefined &&
      options.activeCellIndex !== null &&
      options.activeCellIndex >= 0 &&
      options.activeCellIndex < count
    ) {
      const activeRect = rects[options.activeCellIndex];
      ctx.save();
      ctx.strokeStyle = '#3b82f6';
      const lw = Math.max(2, Math.min(6, Math.round(canvasWidth / 350)));
      ctx.lineWidth = lw;
      ctx.strokeRect(activeRect.x + lw / 2, activeRect.y + lw / 2, activeRect.width - lw, activeRect.height - lw);
      ctx.restore();
    }
  }

  /**
   * Exports the canvas content as a static downloadable image file.
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

  /**
   * Exports a multi-frame animation as an animated GIF or animated WebP file.
   * Processes frames non-blockingly with live progress reporting and cancellation support.
   */
  async function exportAnimation(exportOptions) {
    const {
      imageItems,
      distribution,
      canvasWidth,
      canvasHeight,
      collageOptions,
      duration = 3.0,
      fps = 15,
      format = 'image/gif',
      quality = 0.9,
      filename = 'combined-animation.gif',
      onProgress,
      abortSignal
    } = exportOptions;

    const totalFrames = Math.max(1, Math.round(duration * fps));
    const frameDelayMs = Math.round(1000 / fps);

    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = canvasWidth;
    offscreenCanvas.height = canvasHeight;
    const offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });

    let finalBlob = null;

    if (format === 'image/webp' || format === 'image/webp-anim') {
      // Animated WebP Export
      if (typeof window.WebPMuxer === 'undefined') {
        throw new Error('WebPMuxer library is not loaded.');
      }

      const webpFrames = [];

      for (let f = 0; f < totalFrames; f++) {
        if (abortSignal && abortSignal.aborted) {
          throw new Error('Export cancelled by user.');
        }

        const time = f / fps;
        renderCollage(offscreenCanvas, imageItems, distribution, canvasWidth, canvasHeight, {
          ...collageOptions,
          time: time
        });

        const frameBlob = await new Promise((res, rej) => {
          offscreenCanvas.toBlob((b) => {
            if (b) res(b);
            else rej(new Error('Failed to encode frame into WebP.'));
          }, 'image/webp', quality);
        });

        const buf = await frameBlob.arrayBuffer();
        webpFrames.push({
          buffer: buf,
          duration: frameDelayMs
        });

        if (onProgress) {
          onProgress(f + 1, totalFrames, (f + 1) / totalFrames);
        }

        // Breathe main thread
        await new Promise((r) => setTimeout(r, 0));
      }

      const webpBytes = window.WebPMuxer.createAnimatedWebP(webpFrames, canvasWidth, canvasHeight, 0);
      finalBlob = new Blob([webpBytes], { type: 'image/webp' });

    } else {
      // Animated GIF Export using gifenc
      const gifenc = typeof window !== 'undefined' ? (window.gifenc || (typeof gifenc !== 'undefined' ? gifenc : null)) : null;
      if (!gifenc || !gifenc.GIFEncoder) {
        throw new Error('GIF encoder library (gifenc) is not loaded.');
      }

      const { GIFEncoder, quantize, applyPalette } = gifenc;
      const gif = GIFEncoder();

      for (let f = 0; f < totalFrames; f++) {
        if (abortSignal && abortSignal.aborted) {
          throw new Error('Export cancelled by user.');
        }

        const time = f / fps;
        renderCollage(offscreenCanvas, imageItems, distribution, canvasWidth, canvasHeight, {
          ...collageOptions,
          time: time
        });

        const imgData = offscreenCtx.getImageData(0, 0, canvasWidth, canvasHeight);
        const isTransparent = Boolean(collageOptions.isTransparent);
        const quantFormat = isTransparent ? 'rgba4444' : 'rgb565';

        const palette = quantize(imgData.data, 256, {
          format: quantFormat,
          clearAlpha: isTransparent,
          oneBitAlpha: isTransparent
        });

        const index = applyPalette(imgData.data, palette, quantFormat);

        gif.writeFrame(index, canvasWidth, canvasHeight, {
          palette: palette,
          delay: frameDelayMs,
          transparent: isTransparent,
          transparentIndex: isTransparent ? palette.length - 1 : undefined,
          dispose: 2
        });

        if (onProgress) {
          onProgress(f + 1, totalFrames, (f + 1) / totalFrames);
        }

        await new Promise((r) => setTimeout(r, 0));
      }

      gif.finish();
      const gifBytes = gif.bytes();
      finalBlob = new Blob([gifBytes], { type: 'image/gif' });
    }

    // Trigger download of the completed animation
    const downloadUrl = URL.createObjectURL(finalBlob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  }

  return {
    calculateCenterCrop,
    decodeGifFrames,
    decodeWebpFrames,
    loadImageFromFile,
    getFrameImageAtTime,
    renderCollage,
    exportCanvas,
    exportAnimation
  };
});
