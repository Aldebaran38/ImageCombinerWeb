/**
 * ImageCombiner Web - Mathematical Grid Layout Engine
 * 
 * Computes optimal row and column arrangements for any number of images,
 * targeting aspect ratios as close to 1:1 (square) as possible, while cleanly
 * distributing pixel remainders to prevent any gaps or seams.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ImageCombinerLayout = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Calculates target canvas width and height from an aspect ratio value and megapixel target.
   */
  function calculateCanvasSize(ratioValue, megapixels) {
    const mp = Math.max(0.1, Number(megapixels) || 2.0);
    const totalPixels = mp * 1000000;
    const ratio = Math.max(0.1, Number(ratioValue) || 1.0);

    const height = Math.round(Math.sqrt(totalPixels / ratio));
    const width = Math.round(height * ratio);

    return {
      width: Math.max(1, width),
      height: Math.max(1, height)
    };
  }

  /**
   * Generates all balanced partitions of N items into R rows.
   */
  function getBalancedRowPartitions(n, r) {
    if (r <= 1) return [[n]];
    if (r >= n) return [new Array(n).fill(1)];

    const base = Math.floor(n / r);
    const remainder = n % r;

    if (remainder === 0) {
      return [new Array(r).fill(base)];
    }

    const partitions = [];

    // 1. Top-heavy: remainder rows at start get base + 1
    const topHeavy = [];
    for (let i = 0; i < r; i++) {
      topHeavy.push(i < remainder ? base + 1 : base);
    }
    partitions.push(topHeavy);

    // 2. Bottom-heavy: remainder rows at end get base + 1
    const bottomHeavy = [];
    for (let i = 0; i < r; i++) {
      bottomHeavy.push(i >= (r - remainder) ? base + 1 : base);
    }

    if (JSON.stringify(topHeavy) !== JSON.stringify(bottomHeavy)) {
      partitions.push(bottomHeavy);
    }

    return partitions;
  }

  /**
   * Evaluates penalty for a specific row distribution.
   */
  function scoreDistribution(distribution, canvasWidth, canvasHeight, gapSize) {
    const numRows = distribution.length;
    const availHeight = canvasHeight - (numRows - 1) * gapSize;
    if (availHeight <= 0) return Infinity;

    const nominalRowHeight = availHeight / numRows;
    let totalScore = 0;
    let totalCells = 0;

    for (let r = 0; r < numRows; r++) {
      const cols = distribution[r];
      const availWidth = canvasWidth - (cols - 1) * gapSize;
      if (availWidth <= 0) return Infinity;

      const nominalCellWidth = availWidth / cols;
      const ratio = nominalCellWidth / nominalRowHeight;

      // Log penalty: |ln(ratio)|
      const penalty = Math.abs(Math.log(ratio));
      totalScore += penalty * cols;
      totalCells += cols;
    }

    const isUniform = distribution.every(c => c === distribution[0]);
    if (!isUniform) {
      totalScore += 0.05 * totalCells;
    }

    return totalScore / totalCells;
  }

  /**
   * Finds the optimal row distribution for N images to fit inside canvasWidth x canvasHeight.
   */
  function findOptimalDistribution(numImages, canvasWidth, canvasHeight, gapSize = 0) {
    if (numImages <= 0) return [];
    if (numImages === 1) return [1];

    let bestDistribution = [numImages];
    let lowestScore = Infinity;

    for (let r = 1; r <= numImages; r++) {
      const candidatePartitions = getBalancedRowPartitions(numImages, r);

      for (const partition of candidatePartitions) {
        const score = scoreDistribution(partition, canvasWidth, canvasHeight, gapSize);
        if (score < lowestScore) {
          lowestScore = score;
          bestDistribution = partition;
        }
      }
    }

    return bestDistribution;
  }

  /**
   * Computes exact integer pixel rectangles for each cell.
   */
  function calculateCellRectangles(distribution, canvasWidth, canvasHeight, gapSize = 0) {
    const rects = [];
    const numRows = distribution.length;
    if (numRows === 0) return rects;

    const safeGap = Math.max(0, Math.floor(gapSize));
    const availHeight = Math.max(numRows, canvasHeight - (numRows - 1) * safeGap);
    const baseRowHeight = Math.floor(availHeight / numRows);
    const remainderHeight = availHeight % numRows;

    let currentY = 0;

    for (let r = 0; r < numRows; r++) {
      const rowHeight = baseRowHeight + (r < remainderHeight ? 1 : 0);
      const cols = distribution[r];

      const availWidth = Math.max(cols, canvasWidth - (cols - 1) * safeGap);
      const baseColWidth = Math.floor(availWidth / cols);
      const remainderWidth = availWidth % cols;

      let currentX = 0;

      for (let c = 0; c < cols; c++) {
        const cellWidth = baseColWidth + (c < remainderWidth ? 1 : 0);

        rects.push({
          x: currentX,
          y: currentY,
          width: cellWidth,
          height: rowHeight,
          row: r,
          col: c
        });

        currentX += cellWidth + safeGap;
      }

      currentY += rowHeight + safeGap;
    }

    return rects;
  }

  return {
    calculateCanvasSize,
    getBalancedRowPartitions,
    scoreDistribution,
    findOptimalDistribution,
    calculateCellRectangles
  };
});
