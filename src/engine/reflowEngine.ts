import {
  computeCropBox,
  detectColumns,
  detectSkewAngle,
  detectSmartPageOrientation,
  enhanceScannedCanvas,
  rotateAndRebuildMask,
  segmentColumn,
} from './imageProcessing';
import type {
  OcrWordBox,
  PageAnalysis,
  ReflowedPage,
  ReflowLineStrip,
  ReflowSettings,
  SegmentedBlock,
  WordToken,
} from './types';

/**
 * Runs the full offline analysis pipeline on a single rasterized PDF page:
 * Enhance -> Orientation Check -> Deskew -> Crop -> Detect Columns -> Segment Lines, Words & Figures.
 */
export function analyzeScannedPage(
  rawCanvas: HTMLCanvasElement,
  sourcePage: number,
  sourceWidthMm: number,
  sourceHeightMm: number,
  settings: ReflowSettings
): PageAnalysis {
  const enhanced = enhanceScannedCanvas(rawCanvas, settings.contrast, settings.thresholdMode);
  let activeCanvas = enhanced.canvas;
  let activeBinary = enhanced.binary;
  const orientation = detectSmartPageOrientation(activeBinary, enhanced.width, enhanced.height);
  let skewDeg = 0;

  if (settings.deskew) {
    skewDeg = detectSkewAngle(activeBinary, enhanced.width, enhanced.height);
    if (Math.abs(skewDeg) >= 0.2) {
      const rotated = rotateAndRebuildMask(activeCanvas, -skewDeg);
      activeCanvas = rotated.canvas;
      activeBinary = rotated.binary;
    }
  }

  const cropBox = computeCropBox(
    activeBinary,
    activeCanvas.width,
    activeCanvas.height,
    settings.autoCrop,
    settings.marginTrimPct
  );

  const columns = detectColumns(activeBinary, activeCanvas.width, cropBox, settings.columns);

  const blocks: SegmentedBlock[] = [];
  let wordCount = 0;
  let figureCount = 0;

  for (let ci = 0; ci < columns.length; ci++) {
    const colBlocks = segmentColumn(
      activeBinary,
      activeCanvas.width,
      columns[ci],
      ci,
      settings.preserveFigures,
      settings.wordGapMultiplier
    );
    for (const b of colBlocks) {
      blocks.push(b);
      if (b.type === 'figure') figureCount++;
      else wordCount += b.words.length;
    }
  }

  return {
    sourcePage,
    width: activeCanvas.width,
    height: activeCanvas.height,
    sourceWidthMm,
    sourceHeightMm,
    skewDeg,
    orientation,
    cropBox,
    columns,
    blocks,
    wordCount,
    figureCount,
    enhancedCanvas: activeCanvas,
  };
}

/**
 * Draws a crisp technical inspection overlay onto a copy of the source page canvas,
 * highlighting crop boundaries, column gutters, text words (or OCR-detected words with
 * confidence colors), and preserved figures.
 */
export function renderInspectionCanvas(
  analysis: PageAnalysis,
  showWords: boolean,
  ocrWords?: OcrWordBox[]
): string {
  const canvas = document.createElement('canvas');
  canvas.width = analysis.width;
  canvas.height = analysis.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(analysis.enhancedCanvas, 0, 0);

  // Dim cropped-out outer margins
  ctx.fillStyle = 'rgba(15, 23, 42, 0.14)';
  const { cropBox } = analysis;
  ctx.fillRect(0, 0, canvas.width, cropBox.y);
  ctx.fillRect(0, cropBox.y + cropBox.h, canvas.width, canvas.height - (cropBox.y + cropBox.h));
  ctx.fillRect(0, cropBox.y, cropBox.x, cropBox.h);
  ctx.fillRect(
    cropBox.x + cropBox.w,
    cropBox.y,
    canvas.width - (cropBox.x + cropBox.w),
    cropBox.h
  );

  // Crop frame
  ctx.strokeStyle = '#2563EB';
  ctx.lineWidth = Math.max(1.5, canvas.width / 520);
  ctx.setLineDash([8, 5]);
  ctx.strokeRect(cropBox.x, cropBox.y, cropBox.w, cropBox.h);
  ctx.setLineDash([]);

  // Column splits
  analysis.columns.forEach((col, idx) => {
    ctx.strokeStyle = idx % 2 === 0 ? 'rgba(37, 99, 235, 0.7)' : 'rgba(14, 165, 233, 0.75)';
    ctx.lineWidth = Math.max(1.5, canvas.width / 560);
    ctx.strokeRect(col.x + 1, col.y + 1, col.w - 2, col.h - 2);

    const tagSize = Math.max(18, Math.round(canvas.width * 0.024));
    ctx.fillStyle = '#1D4ED8';
    ctx.fillRect(col.x + 2, col.y + 2, tagSize * 1.4, tagSize);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `600 ${Math.round(tagSize * 0.62)}px "IBM Plex Mono", monospace`;
    ctx.fillText(`C${idx + 1}`, col.x + 6, col.y + Math.round(tagSize * 0.72));
  });

  // Figures & bitmap word boxes
  const useOcrBoxes = Boolean(showWords && ocrWords && ocrWords.length > 0);
  for (const block of analysis.blocks) {
    if (block.type === 'figure') {
      ctx.fillStyle = 'rgba(217, 119, 6, 0.12)';
      ctx.fillRect(block.rect.x, block.rect.y, block.rect.w, block.rect.h);
      ctx.strokeStyle = '#D97706';
      ctx.lineWidth = Math.max(1.5, canvas.width / 520);
      ctx.strokeRect(block.rect.x, block.rect.y, block.rect.w, block.rect.h);
    } else if (showWords && !useOcrBoxes) {
      ctx.strokeStyle = 'rgba(22, 163, 74, 0.45)';
      ctx.lineWidth = Math.max(1, canvas.width / 950);
      for (const w of block.words) {
        ctx.strokeRect(w.x, w.y, w.w, w.h);
      }
    }
  }

  // OCR word confidence overlay boxes when OCR has run on this page
  if (useOcrBoxes && ocrWords) {
    ctx.lineWidth = Math.max(1, canvas.width / 900);
    for (const w of ocrWords) {
      const highConf = w.confidence >= 75;
      ctx.fillStyle = highConf ? 'rgba(22, 163, 74, 0.08)' : 'rgba(217, 119, 6, 0.16)';
      ctx.strokeStyle = highConf ? 'rgba(22, 163, 74, 0.65)' : 'rgba(217, 119, 6, 0.85)';
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.strokeRect(w.x, w.y, w.w, w.h);
    }
  }

  return canvas.toDataURL('image/jpeg', 0.86);
}

interface PlacedWord {
  sourceCanvas: HTMLCanvasElement;
  token: WordToken;
  destX: number;
  destYOffset: number;
  destW: number;
  destH: number;
  scaledLineHeight: number;
}

/**
 * Reflows one or more analyzed source pages into e-reader sized output pages
 * (authentic k2pdfopt-style bitmap word wrapping + intact figure flow).
 */
export function reflowAnalyzedPages(
  analyses: PageAnalysis[],
  settings: ReflowSettings,
  outputWidthPx: number,
  generateStrips = false
): ReflowedPage[] {
  if (analyses.length === 0) return [];

  const aspect = settings.targetHeightMm / Math.max(20, settings.targetWidthMm);
  const pageW = Math.max(320, Math.round(outputWidthPx));
  const pageH = Math.max(400, Math.round(pageW * aspect));
  const pxPerMm = pageW / Math.max(20, settings.targetWidthMm);
  const marginPx = Math.max(10, Math.round(settings.pageMarginMm * pxPerMm));
  const contentW = Math.max(120, pageW - marginPx * 2);
  const contentBottom = pageH - marginPx;

  const pages: ReflowedPage[] = [];

  let activeCanvas = createBlankPage(pageW, pageH);
  let activeCtx = activeCanvas.getContext('2d')!;
  let cursorY = marginPx;
  let activeSourcePages = new Set<number>();
  let activeWordCount = 0;
  let activeFigureCount = 0;
  let activeStrips: ReflowLineStrip[] = [];

  const flushPage = () => {
    if (cursorY <= marginPx + 2 && activeWordCount === 0 && activeFigureCount === 0) return;
    pages.push({
      index: pages.length + 1,
      sourcePages: Array.from(activeSourcePages),
      canvas: activeCanvas,
      dataUrl: activeCanvas.toDataURL('image/png'),
      width: pageW,
      height: pageH,
      wordCount: activeWordCount,
      figureCount: activeFigureCount,
      lineStrips: activeStrips,
    });
    activeCanvas = createBlankPage(pageW, pageH);
    activeCtx = activeCanvas.getContext('2d')!;
    cursorY = marginPx;
    activeSourcePages = new Set<number>();
    activeWordCount = 0;
    activeFigureCount = 0;
    activeStrips = [];
  };

  let currentLineWords: PlacedWord[] = [];
  let currentLineX = 0;
  let currentLineMaxH = 0;
  let currentLineHasParaBreak = false;

  const flushLine = (addParaGapAfter = false) => {
    if (currentLineWords.length === 0) return;
    const lineH = Math.max(10, Math.ceil(currentLineMaxH));
    const lineAdvance = Math.ceil(lineH * settings.lineSpacing);

    if (cursorY + lineH > contentBottom && cursorY > marginPx + 4) {
      flushPage();
    }

    // Draw words onto active reflow page canvas
    activeCtx.imageSmoothingEnabled = true;
    activeCtx.imageSmoothingQuality = 'high';
    for (const pw of currentLineWords) {
      // Align all words along the bottom/baseline zone of the target line
      const baselineShift = lineH - pw.scaledLineHeight;
      activeCtx.drawImage(
        pw.sourceCanvas,
        pw.token.x,
        pw.token.y,
        pw.token.w,
        pw.token.h,
        marginPx + pw.destX,
        cursorY + baselineShift + pw.destYOffset,
        pw.destW,
        pw.destH
      );
    }

    if (generateStrips) {
      const stripCanvas = createBlankPage(contentW, lineH + 4);
      const sCtx = stripCanvas.getContext('2d')!;
      sCtx.imageSmoothingEnabled = true;
      sCtx.imageSmoothingQuality = 'high';
      for (const pw of currentLineWords) {
        const baselineShift = lineH - pw.scaledLineHeight;
        sCtx.drawImage(
          pw.sourceCanvas,
          pw.token.x,
          pw.token.y,
          pw.token.w,
          pw.token.h,
          pw.destX,
          2 + baselineShift + pw.destYOffset,
          pw.destW,
          pw.destH
        );
      }
      activeStrips.push({
        dataUrl: stripCanvas.toDataURL('image/png'),
        width: contentW,
        height: lineH + 4,
        isFigure: false,
        paragraphBreakBefore: currentLineHasParaBreak,
      });
    }

    cursorY += lineAdvance;
    if (addParaGapAfter) {
      cursorY += Math.round(lineH * 0.42);
    }

    currentLineWords = [];
    currentLineX = 0;
    currentLineMaxH = 0;
    currentLineHasParaBreak = false;
  };

  for (let aIdx = 0; aIdx < analyses.length; aIdx++) {
    const analysis = analyses[aIdx];
    // Physically accurate scaling: compares target e-reader px/mm against source PDF px/mm
    const sourcePxPerMm = analysis.width / Math.max(40, analysis.sourceWidthMm);
    const naturalScale = pxPerMm / sourcePxPerMm;
    const scale = Math.max(0.28, Math.min(3.5, naturalScale * settings.fontScale));

    // Estimate typical line height in output pixels for clean spaces & indents
    const lineHeights = analysis.blocks
      .filter((b) => b.type === 'line')
      .map((b) => b.rect.h * scale)
      .sort((a, b) => a - b);
    const typicalOutLineH =
      lineHeights.length > 0 ? lineHeights[Math.floor(lineHeights.length * 0.5)] : 18;
    const spaceW = Math.max(4, Math.round(typicalOutLineH * 0.34 * settings.wordGapMultiplier));
    const paraIndent = settings.preserveParagraphIndent
      ? Math.round(typicalOutLineH * 1.1)
      : 0;

    for (const block of analysis.blocks) {
      activeSourcePages.add(analysis.sourcePage);

      if (block.type === 'figure') {
        flushLine(true);

        const maxFigW = contentW;
        const maxFigH = Math.round((pageH - marginPx * 2) * 0.86);
        const figScale = Math.min(
          scale * 1.05,
          maxFigW / Math.max(1, block.rect.w),
          maxFigH / Math.max(1, block.rect.h)
        );
        const destW = Math.max(16, Math.round(block.rect.w * figScale));
        const destH = Math.max(16, Math.round(block.rect.h * figScale));

        if (cursorY + destH > contentBottom && cursorY > marginPx + 4) {
          flushPage();
          activeSourcePages.add(analysis.sourcePage);
        }

        const destX = marginPx + Math.round((contentW - destW) / 2);
        activeCtx.imageSmoothingEnabled = true;
        activeCtx.imageSmoothingQuality = 'high';
        activeCtx.drawImage(
          analysis.enhancedCanvas,
          block.rect.x,
          block.rect.y,
          block.rect.w,
          block.rect.h,
          destX,
          cursorY,
          destW,
          destH
        );

        if (generateStrips) {
          const figCanvas = createBlankPage(destW, destH);
          const fCtx = figCanvas.getContext('2d')!;
          fCtx.drawImage(
            analysis.enhancedCanvas,
            block.rect.x,
            block.rect.y,
            block.rect.w,
            block.rect.h,
            0,
            0,
            destW,
            destH
          );
          activeStrips.push({
            dataUrl: figCanvas.toDataURL('image/png'),
            width: destW,
            height: destH,
            isFigure: true,
            paragraphBreakBefore: true,
          });
        }

        activeFigureCount++;
        cursorY += destH + Math.round(typicalOutLineH * 0.85);
        continue;
      }

      // Text line block
      if (block.paragraphBreakBefore && currentLineWords.length > 0) {
        flushLine(true);
      }

      if (block.paragraphBreakBefore && currentLineWords.length === 0) {
        currentLineX = paraIndent;
        currentLineHasParaBreak = true;
      }

      for (const word of block.words) {
        let destW = Math.max(2, Math.round(word.w * scale));
        let destH = Math.max(2, Math.round(word.h * scale));
        let scaledLineH = Math.max(8, Math.round(word.lineHeight * scale));
        let destYOffset = Math.round((word.y - word.lineTop) * scale);

        // Clamp ultra-wide tokens (e.g. wide equations or unsplit tables) to contentW
        if (destW > contentW) {
          const shrink = contentW / destW;
          destW = contentW;
          destH = Math.max(2, Math.round(destH * shrink));
          scaledLineH = Math.max(8, Math.round(scaledLineH * shrink));
          destYOffset = Math.round(destYOffset * shrink);
        }

        // Wrap to next line if word overflows target e-reader width
        if (currentLineWords.length > 0 && currentLineX + spaceW + destW > contentW) {
          flushLine(false);
          activeSourcePages.add(analysis.sourcePage);
        }

        const placeX = currentLineWords.length === 0 ? currentLineX : currentLineX + spaceW;
        currentLineWords.push({
          sourceCanvas: analysis.enhancedCanvas,
          token: word,
          destX: placeX,
          destYOffset,
          destW,
          destH,
          scaledLineHeight: scaledLineH,
        });
        currentLineX = placeX + destW;
        if (scaledLineH > currentLineMaxH) currentLineMaxH = scaledLineH;
        activeWordCount++;
      }
    }

    // Flush trailing line at end of source page with paragraph spacing before next source page
    flushLine(true);
  }

  flushPage();
  return pages;
}

function createBlankPage(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  return c;
}
