import type {
  ColumnMode,
  MarginTrimPct,
  OrientationAnalysis,
  Rect,
  RotationAngle,
  SegmentedBlock,
  ThresholdMode,
  WordToken,
} from './types';

export interface EnhancedImageResult {
  canvas: HTMLCanvasElement;
  binary: Uint8Array;
  width: number;
  height: number;
}

/**
 * Enhances a scanned PDF page canvas: removes aged/yellowed paper cast via white-point
 * normalization, boosts ink contrast, and produces both a crisp rendered canvas and a
 * binary ink mask (1 = ink, 0 = paper) for downstream layout segmentation.
 */
export function enhanceScannedCanvas(
  sourceCanvas: HTMLCanvasElement,
  contrast: number,
  thresholdMode: ThresholdMode
): EnhancedImageResult {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const outCanvas = document.createElement('canvas');
  outCanvas.width = width;
  outCanvas.height = height;
  const ctx = outCanvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(sourceCanvas, 0, 0);

  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const pixelCount = width * height;
  const gray = new Uint8Array(pixelCount);
  const hist = new Uint32Array(256);

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const lum = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
    gray[p] = lum;
    hist[lum]++;
  }

  // Find white point (88th percentile paper luminance) and ink floor (2nd percentile)
  let acc = 0;
  let inkFloor = 0;
  let paperWhite = 250;
  const p02 = pixelCount * 0.02;
  const p88 = pixelCount * 0.88;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= p02 && inkFloor === 0) inkFloor = v;
    if (acc >= p88) {
      paperWhite = Math.max(v, 140);
      break;
    }
  }
  const range = Math.max(24, paperWhite - inkFloor);

  // Build normalized luminance lookup table with gamma contrast
  const gamma = Math.max(0.45, Math.min(2.8, contrast));
  const lut = new Uint8Array(256);
  for (let v = 0; v < 256; v++) {
    let norm = (v - inkFloor) / range;
    if (norm < 0) norm = 0;
    if (norm > 1) norm = 1;
    // Push near-paper shades cleanly to pure white to eliminate scan grain
    if (norm > 0.91) {
      lut[v] = 255;
    } else {
      const curved = Math.pow(norm / 0.91, gamma);
      lut[v] = Math.max(0, Math.min(255, Math.round(curved * 255)));
    }
  }

  const normalized = new Uint8Array(pixelCount);
  const normHist = new Uint32Array(256);
  for (let p = 0; p < pixelCount; p++) {
    const nv = lut[gray[p]];
    normalized[p] = nv;
    normHist[nv]++;
  }

  const otsuThreshold = computeOtsuThreshold(normHist, pixelCount);
  const binary = new Uint8Array(pixelCount);

  if (thresholdMode === 'adaptive') {
    // Fast integral image adaptive threshold (handles uneven spine shadows & water stains)
    const stride = width + 1;
    const integral = new Float64Array(stride * (height + 1));
    for (let y = 0; y < height; y++) {
      let rowSum = 0;
      const rowOff = y * width;
      const intRow = (y + 1) * stride;
      const prevRow = y * stride;
      for (let x = 0; x < width; x++) {
        rowSum += gray[rowOff + x];
        integral[intRow + x + 1] = integral[prevRow + x + 1] + rowSum;
      }
    }

    const radius = Math.max(10, Math.min(36, Math.round(width / 48)));
    const bias = Math.max(6, Math.min(24, Math.round(18 - (gamma - 1) * 5)));

    for (let y = 0; y < height; y++) {
      const y1 = Math.max(0, y - radius);
      const y2 = Math.min(height, y + radius + 1);
      const r1 = y1 * stride;
      const r2 = y2 * stride;
      for (let x = 0; x < width; x++) {
        const x1 = Math.max(0, x - radius);
        const x2 = Math.min(width, x + radius + 1);
        const area = (x2 - x1) * (y2 - y1);
        const localMean =
          (integral[r2 + x2] - integral[r1 + x2] - integral[r2 + x1] + integral[r1 + x1]) /
          area;
        const p = y * width + x;
        const val = gray[p];
        const diff = localMean - bias - val;
        // Soft 16-level anti-aliased edge around adaptive threshold
        let outVal: number;
        if (diff <= 0) {
          outVal = 255;
          binary[p] = 0;
        } else if (diff >= 18) {
          outVal = 0;
          binary[p] = 1;
        } else {
          outVal = Math.round(255 * (1 - diff / 18));
          binary[p] = diff > 6 ? 1 : 0;
        }
        const di = p * 4;
        data[di] = outVal;
        data[di + 1] = outVal;
        data[di + 2] = outVal;
        data[di + 3] = 255;
      }
    }
  } else if (thresholdMode === 'otsu') {
    const t = Math.min(235, Math.max(70, otsuThreshold));
    for (let p = 0; p < pixelCount; p++) {
      const nv = normalized[p];
      const diff = t - nv;
      let outVal: number;
      if (diff <= -8) {
        outVal = 255;
        binary[p] = 0;
      } else if (diff >= 12) {
        outVal = 0;
        binary[p] = 1;
      } else {
        outVal = Math.round(255 * (1 - (diff + 8) / 20));
        binary[p] = diff >= 0 ? 1 : 0;
      }
      const di = p * 4;
      data[di] = outVal;
      data[di + 1] = outVal;
      data[di + 2] = outVal;
      data[di + 3] = 255;
    }
  } else {
    // Grayscale mode (k2pdfopt-style crisp anti-aliased 8-bit grayscale on pure white paper)
    const binCutoff = Math.min(220, Math.max(90, otsuThreshold + 12));
    for (let p = 0; p < pixelCount; p++) {
      const nv = normalized[p];
      binary[p] = nv < binCutoff ? 1 : 0;
      const di = p * 4;
      data[di] = nv;
      data[di + 1] = nv;
      data[di + 2] = nv;
      data[di + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return { canvas: outCanvas, binary, width, height };
}

function computeOtsuThreshold(hist: Uint32Array, total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let maxVar = -1;
  let threshold = 160;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const betweenVar = wB * wF * (mB - mF) * (mB - mF);
    if (betweenVar > maxVar) {
      maxVar = betweenVar;
      threshold = t;
    }
  }
  return threshold;
}

/**
 * Estimates page skew angle in degrees (-4.5° to +4.5°) using horizontal projection
 * profile variance maximization on downsampled ink pixels.
 */
export function detectSkewAngle(binary: Uint8Array, width: number, height: number): number {
  const step = Math.max(1, Math.floor(width / 320));
  const cx = width * 0.5;
  const cy = height * 0.5;
  // Collect sampled ink coordinates inside the central 85% region (avoid scanner borders)
  const xMin = Math.floor(width * 0.08);
  const xMax = Math.floor(width * 0.92);
  const yMin = Math.floor(height * 0.08);
  const yMax = Math.floor(height * 0.92);

  const ptsX: number[] = [];
  const ptsY: number[] = [];
  for (let y = yMin; y < yMax; y += step) {
    const rowOff = y * width;
    for (let x = xMin; x < xMax; x += step) {
      if (binary[rowOff + x] === 1) {
        ptsX.push(x - cx);
        ptsY.push(y - cy);
      }
    }
  }

  if (ptsX.length < 120) return 0;

  const projLen = Math.ceil(Math.hypot(width, height) / step) + 4;
  const projOffset = Math.floor(projLen / 2);
  const buckets = new Uint32Array(projLen);

  const scoreAngle = (deg: number): number => {
    buckets.fill(0);
    const rad = (deg * Math.PI) / 180;
    const sinA = Math.sin(rad);
    const cosA = Math.cos(rad);
    const invStep = 1 / step;
    for (let i = 0; i < ptsX.length; i++) {
      const ry = Math.round((ptsX[i] * sinA + ptsY[i] * cosA) * invStep) + projOffset;
      if (ry >= 0 && ry < projLen) {
        buckets[ry]++;
      }
    }
    let variance = 0;
    for (let i = 0; i < projLen; i++) {
      const c = buckets[i];
      variance += c * c;
    }
    return variance;
  };

  let bestAngle = 0;
  let bestScore = -1;
  // Coarse sweep
  for (let deg = -4.2; deg <= 4.21; deg += 0.35) {
    const s = scoreAngle(deg);
    if (s > bestScore) {
      bestScore = s;
      bestAngle = deg;
    }
  }
  // Fine sweep around peak
  const coarseBest = bestAngle;
  for (let deg = coarseBest - 0.35; deg <= coarseBest + 0.36; deg += 0.08) {
    const s = scoreAngle(deg);
    if (s > bestScore) {
      bestScore = s;
      bestAngle = deg;
    }
  }

  return Math.abs(bestAngle) < 0.2 ? 0 : Math.round(bestAngle * 100) / 100;
}

/**
 * Rotates a canvas by `angleDeg` around its center with pure white fill,
 * and returns the rotated canvas plus freshly extracted binary ink mask.
 */
export function rotateAndRebuildMask(
  canvas: HTMLCanvasElement,
  angleDeg: number
): { canvas: HTMLCanvasElement; binary: Uint8Array } {
  const width = canvas.width;
  const height = canvas.height;
  const rotated = document.createElement('canvas');
  rotated.width = width;
  rotated.height = height;
  const ctx = rotated.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  ctx.translate(width / 2, height / 2);
  ctx.rotate((angleDeg * Math.PI) / 180);
  ctx.drawImage(canvas, -width / 2, -height / 2);

  const imgData = ctx.getImageData(0, 0, width, height).data;
  const binary = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < imgData.length; i += 4, p++) {
    binary[p] = imgData[i] < 210 ? 1 : 0;
  }
  return { canvas: rotated, binary };
}

/**
 * Rotates a canvas cleanly in exact 90-degree clockwise increments, swapping
 * width and height for 90° and 270° rotations without blurring.
 */
export function rotateCanvas90(
  source: HTMLCanvasElement,
  angleDeg: RotationAngle
): HTMLCanvasElement {
  const normalized = (((angleDeg % 360) + 360) % 360) as RotationAngle;
  if (normalized === 0) return source;

  const swap = normalized === 90 || normalized === 270;
  const out = document.createElement('canvas');
  out.width = swap ? source.height : source.width;
  out.height = swap ? source.width : source.height;

  const ctx = out.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((normalized * Math.PI) / 180);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return out;
}

/**
 * Analyzes page layout structure (horizontal vs. vertical projection line banding,
 * left-margin alignment vs. raggedness, and ascender/descender ink asymmetry) to
 * detect whether a scanned page is rotated 90°, 180°, or 270° and suggest the exact
 * clockwise rotation required to make it upright.
 */
export function detectSmartPageOrientation(
  binary: Uint8Array,
  width: number,
  height: number
): OrientationAnalysis {
  // Inspect central 84% region to avoid dark scanner borders
  const x0 = Math.floor(width * 0.08);
  const x1 = Math.floor(width * 0.92);
  const y0 = Math.floor(height * 0.08);
  const y1 = Math.floor(height * 0.92);
  const rw = Math.max(1, x1 - x0);
  const rh = Math.max(1, y1 - y0);

  const rowProj = new Float32Array(rh);
  const colProj = new Float32Array(rw);
  let totalInk = 0;

  for (let y = 0; y < rh; y++) {
    const off = (y0 + y) * width + x0;
    let rSum = 0;
    for (let x = 0; x < rw; x++) {
      if (binary[off + x]) {
        rSum++;
        colProj[x]++;
      }
    }
    rowProj[y] = rSum;
    totalInk += rSum;
  }

  if (totalInk < 150) {
    return {
      suggestedRotationDeg: 0,
      confidence: 0,
      axis: 'horizontal',
      reason: 'Not enough ink detected to determine orientation.',
    };
  }

  const measureAxisBanding = (proj: Float32Array, crossSpan: number) => {
    const n = proj.length;
    const minInk = Math.max(2, crossSpan * 0.008);
    let sum = 0;
    let sumSq = 0;
    let bandCount = 0;
    let inBand = false;
    let bandLen = 0;
    const bandThicknesses: number[] = [];

    for (let i = 0; i < n; i++) {
      const norm = proj[i] / crossSpan;
      sum += norm;
      sumSq += norm * norm;
      if (proj[i] >= minInk) {
        if (!inBand) {
          inBand = true;
          bandLen = 1;
        } else {
          bandLen++;
        }
      } else if (inBand) {
        if (bandLen >= 4 && bandLen <= n * 0.12) {
          bandCount++;
          bandThicknesses.push(bandLen);
        }
        inBand = false;
      }
    }
    if (inBand && bandLen >= 4 && bandLen <= n * 0.12) {
      bandCount++;
      bandThicknesses.push(bandLen);
    }

    const mean = sum / n;
    const variance = Math.max(0, sumSq / n - mean * mean);
    // Relative dispersion * periodic line count rewards genuine text-line striping
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
    const score = cv * Math.sqrt(Math.max(1, bandCount));
    return { score, bandCount, cv };
  };

  const horiz = measureAxisBanding(rowProj, rw);
  const vert = measureAxisBanding(colProj, rh);

  // Determine whether text lines run horizontally (0°/180°) or vertically (90°/270°)
  const isVerticalText = vert.score > horiz.score * 1.24 && vert.bandCount >= 6;

  if (isVerticalText) {
    // Analyze vertical text strips to distinguish 90° CW vs 270° CW
    // If text was rotated 90° CCW (landscape top-left), lines read bottom-to-top:
    // left side of each vertical strip has ascenders & flush-bottom starts -> needs +90° CW.
    // If text was rotated 90° CW, lines read top-to-bottom -> needs +270° CW.
    let topStartBias = 0;
    let bottomStartBias = 0;
    let leftHalfInk = 0;
    let rightHalfInk = 0;

    const minColInk = Math.max(2, rh * 0.008);
    let inStrip = false;
    let s0 = 0;
    const topEdges: number[] = [];
    const bottomEdges: number[] = [];

    for (let x = 0; x < rw; x++) {
      if (colProj[x] >= minColInk) {
        if (!inStrip) {
          inStrip = true;
          s0 = x;
        }
      } else if (inStrip) {
        const s1 = x - 1;
        const sw = s1 - s0 + 1;
        if (sw >= 6 && sw <= rw * 0.12) {
          const mid = s0 + sw / 2;
          let minY = rh;
          let maxY = -1;
          for (let y = 0; y < rh; y++) {
            const off = (y0 + y) * width + x0;
            for (let sx = s0; sx <= s1; sx++) {
              if (binary[off + sx]) {
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
                if (sx < mid) leftHalfInk++;
                else rightHalfInk++;
              }
            }
          }
          if (maxY > minY) {
            topEdges.push(minY);
            bottomEdges.push(maxY);
          }
        }
        inStrip = false;
      }
    }

    // Flush-aligned start edge has much lower standard deviation than ragged line end edge
    const topStd = computeStdDev(topEdges);
    const botStd = computeStdDev(bottomEdges);
    if (topStd < botStd * 0.85) topStartBias += 1;
    else if (botStd < topStd * 0.85) bottomStartBias += 1;

    if (rightHalfInk > leftHalfInk * 1.06) topStartBias += 1;
    else if (leftHalfInk > rightHalfInk * 1.06) bottomStartBias += 1;

    // Lines starting at bottom & ascending upward (top of glyphs on left) need +90° CW;
    // lines starting at top & descending downward (top of glyphs on right) need +270° CW.
    const suggested: RotationAngle = bottomStartBias >= topStartBias ? 90 : 270;
    const ratio = vert.score / Math.max(0.001, horiz.score);
    const confidence = Math.max(60, Math.min(97, Math.round(55 + (ratio - 1.2) * 38)));

    return {
      suggestedRotationDeg: suggested,
      confidence,
      axis: 'vertical',
      reason: `Vertical text lines detected (${vert.bandCount} bands); suggest +${suggested}° clockwise.`,
    };
  }

  // Horizontal text lines: check if page appears upside-down (180°) via line-edge alignment
  // & ascender/descender asymmetry (conservative threshold to avoid false 180° flips).
  const minRowInk = Math.max(2, rw * 0.008);
  let inBand = false;
  let b0 = 0;
  const leftEdges: number[] = [];
  const rightEdges: number[] = [];
  let upperHalfInk = 0;
  let lowerHalfInk = 0;

  for (let y = 0; y < rh; y++) {
    if (rowProj[y] >= minRowInk) {
      if (!inBand) {
        inBand = true;
        b0 = y;
      }
    } else if (inBand) {
      const b1 = y - 1;
      const bh = b1 - b0 + 1;
      if (bh >= 6 && bh <= rh * 0.12) {
        let minX = rw;
        let maxX = -1;
        const midY = b0 + bh / 2;
        for (let sy = b0; sy <= b1; sy++) {
          const off = (y0 + sy) * width + x0;
          for (let x = 0; x < rw; x++) {
            if (binary[off + x]) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (sy < midY) upperHalfInk++;
              else lowerHalfInk++;
            }
          }
        }
        if (maxX > minX && maxX - minX > rw * 0.12) {
          leftEdges.push(minX);
          rightEdges.push(rw - 1 - maxX);
        }
      }
      inBand = false;
    }
  }

  const leftStd = computeStdDev(leftEdges);
  const rightStd = computeStdDev(rightEdges);
  // Upside-down prose has flush-right margins (much smaller rightStd) AND heavier bottom ascenders
  const clearlyUpsideDown =
    leftEdges.length >= 8 &&
    rightStd < leftStd * 0.55 &&
    lowerHalfInk > upperHalfInk * 1.12;

  if (clearlyUpsideDown) {
    return {
      suggestedRotationDeg: 180,
      confidence: 78,
      axis: 'horizontal',
      reason: 'Right-aligned line starts and inverted glyph balance suggest 180° rotation.',
    };
  }

  const ratio = horiz.score / Math.max(0.001, vert.score);
  const confidence = Math.max(65, Math.min(98, Math.round(62 + Math.min(ratio, 2.5) * 14)));
  return {
    suggestedRotationDeg: 0,
    confidence,
    axis: 'horizontal',
    reason: `Upright horizontal layout confirmed (${horiz.bandCount} text bands).`,
  };
}

function computeStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  const mean = sum / values.length;
  let sq = 0;
  for (const v of values) sq += (v - mean) * (v - mean);
  return Math.sqrt(sq / values.length);
}

/**
 * Computes the active content crop box after applying manual percentage trims
 * and optional auto-cropping of scanner borders & outer whitespace.
 */
export function computeCropBox(
  binary: Uint8Array,
  width: number,
  height: number,
  autoCrop: boolean,
  trim: MarginTrimPct
): Rect {
  const leftStart = Math.min(Math.floor((trim.left / 100) * width), Math.floor(width * 0.4));
  const rightEnd = Math.max(
    leftStart + 32,
    width - Math.min(Math.floor((trim.right / 100) * width), Math.floor(width * 0.4))
  );
  const topStart = Math.min(Math.floor((trim.top / 100) * height), Math.floor(height * 0.4));
  const bottomEnd = Math.max(
    topStart + 32,
    height - Math.min(Math.floor((trim.bottom / 100) * height), Math.floor(height * 0.4))
  );

  if (!autoCrop) {
    return {
      x: leftStart,
      y: topStart,
      w: rightEnd - leftStart,
      h: bottomEnd - topStart,
    };
  }

  const regionW = rightEnd - leftStart;
  const regionH = bottomEnd - topStart;
  const rowCounts = new Uint32Array(regionH);
  const colCounts = new Uint32Array(regionW);

  for (let y = 0; y < regionH; y++) {
    const rowOff = (topStart + y) * width + leftStart;
    let rSum = 0;
    for (let x = 0; x < regionW; x++) {
      if (binary[rowOff + x]) {
        rSum++;
        colCounts[x]++;
      }
    }
    rowCounts[y] = rSum;
  }

  // Strip solid dark scanner border bars touching edges (density > 65% in outer 4%)
  const borderLimitY = Math.floor(regionH * 0.05);
  const borderLimitX = Math.floor(regionW * 0.05);

  let y0 = 0;
  while (y0 < borderLimitY && rowCounts[y0] > regionW * 0.65) y0++;
  let y1 = regionH - 1;
  while (y1 > regionH - 1 - borderLimitY && rowCounts[y1] > regionW * 0.65) y1--;
  let x0 = 0;
  while (x0 < borderLimitX && colCounts[x0] > regionH * 0.65) x0++;
  let x1 = regionW - 1;
  while (x1 > regionW - 1 - borderLimitX && colCounts[x1] > regionH * 0.65) x1--;

  // Ignore stray dust pixels (need at least 3 ink pixels in a row/col)
  const minInkRow = Math.max(2, Math.floor(regionW * 0.002));
  const minInkCol = Math.max(2, Math.floor(regionH * 0.002));

  while (y0 < y1 && rowCounts[y0] < minInkRow) y0++;
  while (y1 > y0 && rowCounts[y1] < minInkRow) y1--;
  while (x0 < x1 && colCounts[x0] < minInkCol) x0++;
  while (x1 > x0 && colCounts[x1] < minInkCol) x1--;

  if (x1 - x0 < 24 || y1 - y0 < 24) {
    return { x: leftStart, y: topStart, w: regionW, h: regionH };
  }

  const pad = Math.max(4, Math.round(Math.min(width, height) * 0.005));
  const cx = Math.max(leftStart, leftStart + x0 - pad);
  const cy = Math.max(topStart, topStart + y0 - pad);
  const cx2 = Math.min(rightEnd, leftStart + x1 + pad + 1);
  const cy2 = Math.min(bottomEnd, topStart + y1 + pad + 1);

  return {
    x: cx,
    y: cy,
    w: Math.max(24, cx2 - cx),
    h: Math.max(24, cy2 - cy),
  };
}

/**
 * Detects column boundaries inside the cropped page area using vertical ink
 * projection valleys (column gutters).
 */
export function detectColumns(
  binary: Uint8Array,
  width: number,
  crop: Rect,
  mode: ColumnMode
): Rect[] {
  if (mode === 1 || crop.w < 120) {
    return [{ ...crop }];
  }

  // Skip the top 10% when checking column gutters in case of a full-width chapter title
  const sampleTop = crop.y + Math.floor(crop.h * 0.12);
  const sampleBottom = crop.y + Math.floor(crop.h * 0.94);
  const sampleH = Math.max(1, sampleBottom - sampleTop);

  const proj = new Float32Array(crop.w);
  let totalInk = 0;
  for (let y = sampleTop; y < sampleBottom; y++) {
    const rowOff = y * width + crop.x;
    for (let x = 0; x < crop.w; x++) {
      if (binary[rowOff + x]) {
        proj[x]++;
        totalInk++;
      }
    }
  }

  if (totalInk < 80) {
    return [{ ...crop }];
  }

  const avgColInk = totalInk / crop.w;

  // Helper to locate best gutter valley inside normalized [minFrac, maxFrac] range
  const findBestValley = (
    minFrac: number,
    maxFrac: number
  ): { center: number; width: number; minVal: number } | null => {
    const startX = Math.floor(crop.w * minFrac);
    const endX = Math.floor(crop.w * maxFrac);
    const threshold = Math.max(1.5, Math.min(avgColInk * 0.1, sampleH * 0.012));

    let bestStart = -1;
    let bestWidth = 0;
    let runStart = -1;

    for (let x = startX; x <= endX; x++) {
      if (proj[x] <= threshold) {
        if (runStart === -1) runStart = x;
      } else {
        if (runStart !== -1) {
          const runW = x - runStart;
          if (runW > bestWidth) {
            bestWidth = runW;
            bestStart = runStart;
          }
          runStart = -1;
        }
      }
    }
    if (runStart !== -1) {
      const runW = endX - runStart + 1;
      if (runW > bestWidth) {
        bestWidth = runW;
        bestStart = runStart;
      }
    }

    if (bestStart !== -1 && bestWidth >= Math.max(4, Math.floor(crop.w * 0.013))) {
      return {
        center: Math.round(bestStart + bestWidth / 2),
        width: bestWidth,
        minVal: 0,
      };
    }

    // Fallback: minimum-ink 5px moving window (used for explicit 2 or 3 column overrides)
    let minSum = Infinity;
    let minIdx = Math.round((startX + endX) / 2);
    for (let x = startX + 2; x <= endX - 2; x++) {
      const s = proj[x - 2] + proj[x - 1] + proj[x] + proj[x + 1] + proj[x + 2];
      if (s < minSum) {
        minSum = s;
        minIdx = x;
      }
    }
    return { center: minIdx, width: 0, minVal: minSum / 5 };
  };

  const makeColumnsWithBannerCheck = (splits: number[]): Rect[] => {
    // Check if top rows (up to 28% of crop height) span across the first gutter split
    const primarySplit = splits[0];
    const gutterHalf = Math.max(4, Math.floor(crop.w * 0.012));
    const gx0 = Math.max(0, primarySplit - gutterHalf);
    const gx1 = Math.min(crop.w - 1, primarySplit + gutterHalf);
    const maxCheckY = Math.floor(crop.h * 0.28);

    let lastSpanningY = -1;
    for (let y = 0; y < maxCheckY; y++) {
      const off = (crop.y + y) * width + crop.x;
      let gutterInk = 0;
      for (let x = gx0; x <= gx1; x++) {
        gutterInk += binary[off + x];
      }
      if (gutterInk >= 2) {
        lastSpanningY = y;
      }
    }

    let colStartY = crop.y;
    const regions: Rect[] = [];

    if (lastSpanningY >= 8) {
      // Advance to the next clean horizontal whitespace gap below the spanning title
      let cutY = lastSpanningY + 1;
      const limitY = Math.min(crop.h - 20, lastSpanningY + Math.floor(crop.h * 0.06));
      while (cutY < limitY) {
        const off = (crop.y + cutY) * width + crop.x;
        let rowSum = 0;
        for (let x = 0; x < crop.w; x++) rowSum += binary[off + x];
        if (rowSum <= 2) break;
        cutY++;
      }
      if (cutY < crop.h * 0.35) {
        regions.push({ x: crop.x, y: crop.y, w: crop.w, h: cutY });
        colStartY = crop.y + cutY;
      }
    }

    const colH = crop.y + crop.h - colStartY;
    let prevX = 0;
    for (const s of splits) {
      regions.push({ x: crop.x + prevX, y: colStartY, w: s - prevX, h: colH });
      prevX = s;
    }
    regions.push({ x: crop.x + prevX, y: colStartY, w: crop.w - prevX, h: colH });
    return regions;
  };

  if (mode === 2) {
    const v = findBestValley(0.35, 0.65);
    const split = v ? v.center : Math.round(crop.w / 2);
    return makeColumnsWithBannerCheck([split]);
  }

  if (mode === 3) {
    const v1 = findBestValley(0.24, 0.42);
    const v2 = findBestValley(0.58, 0.76);
    const s1 = v1 ? v1.center : Math.round(crop.w / 3);
    const s2 = v2 ? v2.center : Math.round((crop.w * 2) / 3);
    return makeColumnsWithBannerCheck([s1, s2]);
  }

  // Auto mode: check 2-column center valley first, then 3-column twin valleys
  const centerValley = findBestValley(0.36, 0.64);
  if (centerValley && centerValley.width >= Math.max(5, Math.floor(crop.w * 0.015))) {
    // Verify both left and right sides have real content
    let leftInk = 0;
    let rightInk = 0;
    for (let x = 0; x < centerValley.center; x++) leftInk += proj[x];
    for (let x = centerValley.center; x < crop.w; x++) rightInk += proj[x];
    if (leftInk > totalInk * 0.16 && rightInk > totalInk * 0.16) {
      return makeColumnsWithBannerCheck([centerValley.center]);
    }
  }

  // Check 3-column layout
  const leftValley = findBestValley(0.26, 0.4);
  const rightValley = findBestValley(0.6, 0.74);
  const minGutter = Math.max(4, Math.floor(crop.w * 0.013));
  if (
    leftValley &&
    rightValley &&
    leftValley.width >= minGutter &&
    rightValley.width >= minGutter
  ) {
    let i1 = 0;
    let i2 = 0;
    let i3 = 0;
    for (let x = 0; x < leftValley.center; x++) i1 += proj[x];
    for (let x = leftValley.center; x < rightValley.center; x++) i2 += proj[x];
    for (let x = rightValley.center; x < crop.w; x++) i3 += proj[x];
    if (i1 > totalInk * 0.12 && i2 > totalInk * 0.12 && i3 > totalInk * 0.12) {
      return makeColumnsWithBannerCheck([leftValley.center, rightValley.center]);
    }
  }

  return [{ ...crop }];
}

/**
 * Segments a single column into text lines (with word bounding boxes) and intact
 * figure/diagram regions, preserving paragraph breaks and baseline metrics.
 */
export function segmentColumn(
  binary: Uint8Array,
  pageWidth: number,
  col: Rect,
  columnIndex: number,
  preserveFigures: boolean,
  wordGapMultiplier: number
): SegmentedBlock[] {
  const rowInk = new Uint32Array(col.h);
  for (let y = 0; y < col.h; y++) {
    const off = (col.y + y) * pageWidth + col.x;
    let sum = 0;
    for (let x = 0; x < col.w; x++) {
      sum += binary[off + x];
    }
    rowInk[y] = sum;
  }

  // Extract raw horizontal ink bands
  const minRowInk = Math.max(2, Math.floor(col.w * 0.004));
  const rawBands: { y0: number; y1: number; ink: number }[] = [];
  let inBand = false;
  let bStart = 0;
  let bInk = 0;

  for (let y = 0; y < col.h; y++) {
    if (rowInk[y] >= minRowInk) {
      if (!inBand) {
        inBand = true;
        bStart = y;
        bInk = 0;
      }
      bInk += rowInk[y];
    } else if (inBand) {
      rawBands.push({ y0: bStart, y1: y - 1, ink: bInk });
      inBand = false;
    }
  }
  if (inBand) {
    rawBands.push({ y0: bStart, y1: col.h - 1, ink: bInk });
  }

  // Merge tiny vertical gaps (e.g., dots on 'i', diacritics, broken serif tops)
  const mergedBands: { y0: number; y1: number; ink: number }[] = [];
  for (const band of rawBands) {
    const h = band.y1 - band.y0 + 1;
    if (mergedBands.length > 0) {
      const prev = mergedBands[mergedBands.length - 1];
      const gap = band.y0 - prev.y1 - 1;
      const prevH = prev.y1 - prev.y0 + 1;
      if (gap <= 2 || (gap <= 4 && (h <= 4 || prevH <= 4))) {
        prev.y1 = band.y1;
        prev.ink += band.ink;
        continue;
      }
    }
    mergedBands.push({ ...band });
  }

  // Filter out micro-noise specks
  const cleanBands = mergedBands.filter((b) => b.y1 - b.y0 + 1 >= 5 && b.ink >= 10);
  if (cleanBands.length === 0) return [];

  // Estimate median line height (typical text line height in this column)
  const heights = cleanBands
    .map((b) => b.y1 - b.y0 + 1)
    .filter((h) => h >= 7 && h <= col.h * 0.18)
    .sort((a, b) => a - b);
  const medianH =
    heights.length > 0
      ? heights[Math.floor(heights.length * 0.45)]
      : Math.max(12, Math.round(col.h * 0.02));

  // If a band is very tall, decide whether it is a genuine figure/diagram or merged text lines
  const finalBands: { y0: number; y1: number; isFigure: boolean }[] = [];
  const figureHeightThreshold = Math.max(medianH * 2.55, 40);

  for (const band of cleanBands) {
    const bh = band.y1 - band.y0 + 1;
    if (bh > figureHeightThreshold) {
      // Check if we can split at deep horizontal projection valleys (touching lines)
      const subSlices = trySplitTouchingLines(rowInk, band.y0, band.y1, medianH);
      if (subSlices.length > 1) {
        for (const s of subSlices) {
          const sh = s.y1 - s.y0 + 1;
          finalBands.push({
            y0: s.y0,
            y1: s.y1,
            isFigure: preserveFigures && sh > figureHeightThreshold,
          });
        }
      } else {
        finalBands.push({
          y0: band.y0,
          y1: band.y1,
          isFigure: preserveFigures,
        });
      }
    } else {
      finalBands.push({ y0: band.y0, y1: band.y1, isFigure: false });
    }
  }

  // Compute inter-line gaps for paragraph break detection
  const gaps: number[] = [];
  for (let i = 1; i < finalBands.length; i++) {
    if (!finalBands[i].isFigure && !finalBands[i - 1].isFigure) {
      const g = finalBands[i].y0 - finalBands[i - 1].y1;
      if (g > 0 && g < medianH * 4) gaps.push(g);
    }
  }
  gaps.sort((a, b) => a - b);
  const medianGap = gaps.length > 0 ? gaps[Math.floor(gaps.length * 0.5)] : medianH * 0.4;

  // Measure horizontal bounds for each band
  const bandMeta = finalBands.map((b) => {
    const bounds = measureHorizontalBounds(binary, pageWidth, col.x, col.w, col.y + b.y0, b.y1 - b.y0 + 1);
    return { ...b, ...bounds };
  });

  // Typical left margin inside column (15th percentile of line left offsets)
  const leftStarts = bandMeta
    .filter((b) => !b.isFigure && b.w > col.w * 0.25)
    .map((b) => b.localX0)
    .sort((a, b) => a - b);
  const colLeftEdge =
    leftStarts.length > 0 ? leftStarts[Math.floor(leftStarts.length * 0.15)] : 0;

  const blocks: SegmentedBlock[] = [];

  for (let i = 0; i < bandMeta.length; i++) {
    const b = bandMeta[i];
    if (b.w < 3) continue;

    const absY = col.y + b.y0;
    const bandH = b.y1 - b.y0 + 1;

    let paragraphBreakBefore = false;
    if (i > 0) {
      const prev = bandMeta[i - 1];
      const vGap = b.y0 - prev.y1;
      const isLargeGap = vGap > Math.max(medianGap * 1.55, medianH * 0.72);
      const isIndented =
        !b.isFigure && b.localX0 - colLeftEdge > Math.max(medianH * 0.95, 10);
      const prevEndedShort =
        !prev.isFigure &&
        prev.localX1 < colLeftEdge + (col.w - colLeftEdge) * 0.78 &&
        b.localX0 <= colLeftEdge + medianH * 0.6;
      const isHeadingShift = bandH > medianH * 1.38 || (prev.y1 - prev.y0 + 1) > medianH * 1.38;

      if (b.isFigure || prev.isFigure || isLargeGap || isIndented || prevEndedShort || isHeadingShift) {
        paragraphBreakBefore = true;
      }
    }

    if (b.isFigure) {
      blocks.push({
        type: 'figure',
        rect: {
          x: col.x + b.localX0,
          y: absY,
          w: b.w,
          h: bandH,
        },
        columnIndex,
        paragraphBreakBefore: true,
        words: [],
      });
    } else {
      const words = segmentLineIntoWords(
        binary,
        pageWidth,
        col.x + b.localX0,
        absY,
        b.w,
        bandH,
        columnIndex,
        wordGapMultiplier
      );
      if (words.length > 0) {
        blocks.push({
          type: 'line',
          rect: {
            x: col.x + b.localX0,
            y: absY,
            w: b.w,
            h: bandH,
          },
          columnIndex,
          paragraphBreakBefore,
          words,
        });
      }
    }
  }

  return blocks;
}

function trySplitTouchingLines(
  rowInk: Uint32Array,
  y0: number,
  y1: number,
  medianH: number
): { y0: number; y1: number }[] {
  const bh = y1 - y0 + 1;
  let peak = 0;
  for (let y = y0; y <= y1; y++) {
    if (rowInk[y] > peak) peak = rowInk[y];
  }
  if (peak < 8) return [{ y0, y1 }];

  // Look for periodic deep minima (< 8% of peak) spaced by at least 0.75 * medianH
  const cutThreshold = Math.max(2, peak * 0.08);
  const minSpacing = Math.max(8, Math.round(medianH * 0.75));
  const cuts: number[] = [];

  for (let y = y0 + minSpacing; y <= y1 - minSpacing; y++) {
    if (rowInk[y] <= cutThreshold && rowInk[y] <= rowInk[y - 1] && rowInk[y] <= rowInk[y + 1]) {
      if (cuts.length === 0 || y - cuts[cuts.length - 1] >= minSpacing) {
        cuts.push(y);
      }
    }
  }

  if (cuts.length === 0) return [{ y0, y1 }];

  // Only accept splitting if the resulting pieces look roughly line-sized
  const slices: { y0: number; y1: number }[] = [];
  let start = y0;
  for (const c of cuts) {
    if (c - start >= 5) slices.push({ y0: start, y1: c - 1 });
    start = c + 1;
  }
  if (y1 - start >= 5) slices.push({ y0: start, y1 });

  // Verify majority of slices aren't still huge graphic chunks
  const normalCount = slices.filter((s) => s.y1 - s.y0 + 1 <= medianH * 2.2).length;
  if (normalCount < Math.ceil(slices.length * 0.6) || bh < medianH * 2.2) {
    return [{ y0, y1 }];
  }
  return slices;
}

function measureHorizontalBounds(
  binary: Uint8Array,
  pageWidth: number,
  colX: number,
  colW: number,
  absY: number,
  bandH: number
): { localX0: number; localX1: number; w: number } {
  let minX = colW;
  let maxX = -1;
  for (let dy = 0; dy < bandH; dy++) {
    const off = (absY + dy) * pageWidth + colX;
    for (let x = 0; x < colW; x++) {
      if (binary[off + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }
  if (maxX < minX) return { localX0: 0, localX1: 0, w: 0 };
  return { localX0: minX, localX1: maxX, w: maxX - minX + 1 };
}

function segmentLineIntoWords(
  binary: Uint8Array,
  pageWidth: number,
  lineX: number,
  lineY: number,
  lineW: number,
  lineH: number,
  columnIndex: number,
  wordGapMultiplier: number
): WordToken[] {
  const xInk = new Uint32Array(lineW);
  for (let dy = 0; dy < lineH; dy++) {
    const off = (lineY + dy) * pageWidth + lineX;
    for (let x = 0; x < lineW; x++) {
      xInk[x] += binary[off + x];
    }
  }

  // Raw connected horizontal ink spans (glyph clusters)
  const spans: { x0: number; x1: number }[] = [];
  let inSpan = false;
  let start = 0;
  for (let x = 0; x < lineW; x++) {
    if (xInk[x] > 0) {
      if (!inSpan) {
        inSpan = true;
        start = x;
      }
    } else if (inSpan) {
      spans.push({ x0: start, x1: x - 1 });
      inSpan = false;
    }
  }
  if (inSpan) spans.push({ x0: start, x1: lineW - 1 });

  if (spans.length === 0) return [];

  // Inter-word space threshold scales cleanly with line height (~0.24 * lineH)
  const wordGapThreshold = Math.max(
    2.5,
    lineH * 0.255 * Math.max(0.65, Math.min(1.6, wordGapMultiplier))
  );

  const mergedWords: { x0: number; x1: number }[] = [spans[0]];
  for (let i = 1; i < spans.length; i++) {
    const gap = spans[i].x0 - mergedWords[mergedWords.length - 1].x1 - 1;
    if (gap <= wordGapThreshold) {
      mergedWords[mergedWords.length - 1].x1 = spans[i].x1;
    } else {
      mergedWords.push({ ...spans[i] });
    }
  }

  // Tightly compute vertical bounds of each word while storing parent lineTop/lineHeight
  // so words sit on an exact, uniform typographic baseline when reflowed.
  const words: WordToken[] = [];
  for (const w of mergedWords) {
    const ww = w.x1 - w.x0 + 1;
    if (ww < 1) continue;

    let wy0 = lineH;
    let wy1 = -1;
    for (let dy = 0; dy < lineH; dy++) {
      const off = (lineY + dy) * pageWidth + lineX + w.x0;
      for (let dx = 0; dx < ww; dx++) {
        if (binary[off + dx]) {
          if (dy < wy0) wy0 = dy;
          if (dy > wy1) wy1 = dy;
          break;
        }
      }
    }
    if (wy1 < wy0) continue;

    words.push({
      x: lineX + w.x0,
      y: lineY + wy0,
      w: ww,
      h: wy1 - wy0 + 1,
      lineTop: lineY,
      lineHeight: lineH,
      columnIndex,
    });
  }

  return words;
}
