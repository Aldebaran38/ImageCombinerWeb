/**
 * Minimal In-Browser Animated WebP Muxer
 * 
 * Assembles multiple WebP frame ArrayBuffers (from HTML5 Canvas)
 * into a valid, standard-compliant animated WebP file (RIFF container).
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.WebPMuxer = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function writeUint24LE(view, offset, value) {
    view.setUint8(offset, value & 0xff);
    view.setUint8(offset + 1, (value >> 8) & 0xff);
    view.setUint8(offset + 2, (value >> 16) & 0xff);
  }

  function writeFourCC(uint8Arr, offset, fourCC) {
    for (let i = 0; i < 4; i++) {
      uint8Arr[offset + i] = fourCC.charCodeAt(i);
    }
  }

  /**
   * Extracts the payload chunks (ALPH, VP8, VP8L) from a single-frame WebP buffer.
   */
  function extractFrameSubChunks(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    // Verify RIFF header
    const riff = String.fromCharCode(...bytes.subarray(0, 4));
    const webp = String.fromCharCode(...bytes.subarray(8, 12));
    if (riff !== 'RIFF' || webp !== 'WEBP') {
      throw new Error('Invalid WebP buffer: missing RIFF/WEBP signature.');
    }

    let offset = 12;
    const keptChunks = [];
    let hasAlpha = false;

    while (offset + 8 <= bytes.length) {
      const fourCC = String.fromCharCode(...bytes.subarray(offset, offset + 4));
      const chunkSize = view.getUint32(offset + 4, true);
      const totalChunkLength = 8 + chunkSize + (chunkSize % 2 !== 0 ? 1 : 0);

      if (fourCC === 'VP8X') {
        // Read alpha flag from source VP8X chunk if present (bit 4 = 0x10)
        if (offset + 8 < bytes.length && (bytes[offset + 8] & 0x10) !== 0) {
          hasAlpha = true;
        }
      } else if (fourCC === 'ALPH') {
        hasAlpha = true;
        keptChunks.push(bytes.subarray(offset, offset + totalChunkLength));
      } else if (fourCC === 'VP8 ') {
        keptChunks.push(bytes.subarray(offset, offset + totalChunkLength));
      } else if (fourCC === 'VP8L') {
        keptChunks.push(bytes.subarray(offset, offset + totalChunkLength));
      }

      offset += totalChunkLength;
    }

    // Merge kept sub-chunks into a single Uint8Array
    const totalSubLen = keptChunks.reduce((acc, c) => acc + c.length, 0);
    const result = new Uint8Array(totalSubLen);
    let p = 0;
    for (const chunk of keptChunks) {
      result.set(chunk, p);
      p += chunk.length;
    }

    return { frameData: result, hasAlpha };
  }

  /**
   * Muxes multiple WebP frames into an animated WebP Uint8Array.
   * 
   * @param {Array<{ buffer: ArrayBuffer, duration: number }>} frames Array of frames with duration in ms
   * @param {number} width Canvas width in pixels
   * @param {number} height Canvas height in pixels
   * @param {number} [loopCount=0] 0 for infinite loop
   * @returns {Uint8Array} Animated WebP binary data
   */
  function createAnimatedWebP(frames, width, height, loopCount = 0) {
    if (!frames || frames.length === 0) {
      throw new Error('At least one frame is required to create animated WebP.');
    }

    // Process all frames and extract their bitstream sub-chunks
    const processedFrames = [];
    let globalHasAlpha = false;

    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      const { frameData, hasAlpha } = extractFrameSubChunks(f.buffer);
      if (hasAlpha) globalHasAlpha = true;
      processedFrames.push({
        data: frameData,
        duration: Math.max(10, Math.round(f.duration || 100))
      });
    }

    // Calculate total file size
    // 12 bytes (RIFF header)
    // + 18 bytes (VP8X chunk: 8 header + 10 payload)
    // + 14 bytes (ANIM chunk: 8 header + 6 payload)
    let totalSize = 12 + 18 + 14;

    for (const pf of processedFrames) {
      const anmfPayloadSize = 16 + pf.data.length;
      const anmfTotalChunkSize = 8 + anmfPayloadSize + (anmfPayloadSize % 2 !== 0 ? 1 : 0);
      totalSize += anmfTotalChunkSize;
    }

    const output = new Uint8Array(totalSize);
    const view = new DataView(output.buffer);

    // 1. RIFF Header
    writeFourCC(output, 0, 'RIFF');
    view.setUint32(4, totalSize - 8, true);
    writeFourCC(output, 8, 'WEBP');

    let offset = 12;

    // 2. VP8X Chunk (Extended header)
    writeFourCC(output, offset, 'VP8X');
    view.setUint32(offset + 4, 10, true);
    // Flags: bit 1 = Animation (0x02), bit 4 = Alpha (0x10)
    let vp8xFlags = 0x02;
    if (globalHasAlpha) vp8xFlags |= 0x10;
    output[offset + 8] = vp8xFlags;
    output[offset + 9] = 0;
    output[offset + 10] = 0;
    output[offset + 11] = 0;
    writeUint24LE(view, offset + 12, width - 1);
    writeUint24LE(view, offset + 15, height - 1);
    offset += 18;

    // 3. ANIM Chunk (Animation parameters)
    writeFourCC(output, offset, 'ANIM');
    view.setUint32(offset + 4, 6, true);
    // Background color: [Blue, Green, Red, Alpha]
    // If alpha is present, transparent black (0x00000000). If opaque, opaque black (0xFF000000)
    if (globalHasAlpha) {
      view.setUint32(offset + 8, 0x00000000, true);
    } else {
      output[offset + 8] = 0x00; // Blue
      output[offset + 9] = 0x00; // Green
      output[offset + 10] = 0x00; // Red
      output[offset + 11] = 0xff; // Alpha
    }
    view.setUint16(offset + 12, loopCount, true); // 0 = loop infinitely
    offset += 14;

    // 4. ANMF Chunks (Frames)
    for (const pf of processedFrames) {
      const anmfPayloadSize = 16 + pf.data.length;
      const pad = anmfPayloadSize % 2 !== 0 ? 1 : 0;

      writeFourCC(output, offset, 'ANMF');
      view.setUint32(offset + 4, anmfPayloadSize, true);

      // Frame X (24 bits) = 0
      writeUint24LE(view, offset + 8, 0);
      // Frame Y (24 bits) = 0
      writeUint24LE(view, offset + 11, 0);
      // Frame Width - 1 (24 bits)
      writeUint24LE(view, offset + 14, width - 1);
      // Frame Height - 1 (24 bits)
      writeUint24LE(view, offset + 17, height - 1);
      // Frame Duration in ms (24 bits)
      writeUint24LE(view, offset + 20, pf.duration);
      // Flags (8 bits):
      // bit 0 = disposal method (0 = do not dispose, 1 = dispose to background)
      // bit 1 = blending method (0 = alpha blend, 1 = do not blend / overwrite)
      // Full frame updates use 0x02 (NO_BLEND = 1, DISPOSE = 0)
      output[offset + 23] = 0x02;

      // Copy frame bitstream data
      output.set(pf.data, offset + 24);

      offset += 8 + anmfPayloadSize;
      if (pad) {
        output[offset] = 0;
        offset += 1;
      }
    }

    return output;
  }

  return {
    createAnimatedWebP,
    extractFrameSubChunks
  };
});
