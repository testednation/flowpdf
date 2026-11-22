import JSZip from 'jszip';
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import type { OcrChapterContent, ReflowedPage, ReflowSettings } from './types';

const MM_TO_PT = 72 / 25.4;

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] || '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Normalizes OCR-extracted Unicode punctuation & typographic ligatures into clean
 * WinAnsi-compatible characters so pdf-lib standard vector fonts render reliably.
 */
function sanitizeForWinAnsi(input: string): string {
  return input
    .replace(/\uFB00/g, 'ff')
    .replace(/\uFB01/g, 'fi')
    .replace(/\uFB02/g, 'fl')
    .replace(/\uFB03/g, 'ffi')
    .replace(/\uFB04/g, 'ffl')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isHeadingParagraph(text: string): boolean {
  if (text.length < 4 || text.length > 82) return false;
  if (/[.?!]$/.test(text)) return false;
  const upperLetters = (text.match(/[A-Z]/g) || []).length;
  const allLetters = (text.match(/[A-Za-z]/g) || []).length;
  if (allLetters > 0 && upperLetters / allLetters >= 0.72) return true;
  if (/^(chapter|section|part|appendix)\s+[ivxlcdm0-9]+/i.test(text)) return true;
  return false;
}

function wrapTextToWidth(
  text: string,
  maxWidth: number,
  firstLineIndent: number,
  measure: (s: string) => number
): { text: string; indent: number }[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: { text: string; indent: number }[] = [];
  let current = '';
  let isFirst = true;

  for (const word of words) {
    const indent = isFirst ? firstLineIndent : 0;
    const avail = Math.max(24, maxWidth - indent);
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate) <= avail || !current) {
      current = candidate;
    } else {
      lines.push({ text: current, indent });
      current = word;
      isFirst = false;
    }
  }
  if (current) {
    lines.push({ text: current, indent: isFirst ? firstLineIndent : 0 });
  }
  return lines;
}

/**
 * Builds a true selectable, searchable Reflowable Vector-Text PDF from OCR-extracted
 * paragraphs and preserved raster figures, sized precisely to the target e-reader screen.
 */
export async function buildOcrReflowPdfBlob(
  chapters: OcrChapterContent[],
  settings: ReflowSettings,
  onProgress?: (current: number, total: number) => void
): Promise<{ blob: Blob; outputPageCount: number }> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(settings.bookTitle || 'Reflowed OCR Document');
  if (settings.bookAuthor) pdfDoc.setAuthor(settings.bookAuthor);
  pdfDoc.setCreator('FolioReflow (Offline OCR Engine)');
  pdfDoc.setProducer('FolioReflow Vector PDF Builder');

  const bodyFont: PDFFont = await pdfDoc.embedFont(
    settings.ocrFontFamily === 'sans' ? StandardFonts.Helvetica : StandardFonts.TimesRoman
  );
  const boldFont: PDFFont = await pdfDoc.embedFont(
    settings.ocrFontFamily === 'sans' ? StandardFonts.HelveticaBold : StandardFonts.TimesRomanBold
  );

  const pageW = Math.round(settings.targetWidthMm * MM_TO_PT * 100) / 100;
  const pageH = Math.round(settings.targetHeightMm * MM_TO_PT * 100) / 100;
  const marginPt = Math.max(12, settings.pageMarginMm * MM_TO_PT);
  const footerReserve = 16;
  const contentW = Math.max(60, pageW - marginPt * 2);

  const bodySize = Math.max(7.5, Math.min(18, settings.ocrFontSizePt));
  const headingSize = Math.round(bodySize * 1.24 * 10) / 10;
  const lineH = bodySize * settings.lineSpacing;
  const headingLineH = headingSize * 1.3;
  const paraGap = bodySize * 0.55;
  const paraIndent = settings.preserveParagraphIndent ? bodySize * 1.35 : 0;

  let currentPage = pdfDoc.addPage([pageW, pageH]);
  let cursorY = pageH - marginPt;
  let pageCount = 1;

  const drawFooter = (page: typeof currentPage, num: number) => {
    const label = `${num}`;
    const lw = bodyFont.widthOfTextAtSize(label, 8);
    page.drawText(label, {
      x: (pageW - lw) / 2,
      y: Math.max(8, marginPt * 0.45),
      size: 8,
      font: bodyFont,
      color: rgb(0.45, 0.48, 0.54),
    });
  };

  drawFooter(currentPage, pageCount);

  const startNewPage = () => {
    currentPage = pdfDoc.addPage([pageW, pageH]);
    pageCount++;
    cursorY = pageH - marginPt;
    drawFooter(currentPage, pageCount);
  };

  const bottomLimit = marginPt + footerReserve;

  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];

    for (let pIdx = 0; pIdx < ch.paragraphs.length; pIdx++) {
      const clean = sanitizeForWinAnsi(ch.paragraphs[pIdx]);
      if (!clean) continue;

      const heading = isHeadingParagraph(clean);
      const font = heading ? boldFont : bodyFont;
      const size = heading ? headingSize : bodySize;
      const advance = heading ? headingLineH : lineH;
      const indent = heading || pIdx === 0 ? 0 : paraIndent;

      if (heading && cursorY < pageH - marginPt - 4) {
        cursorY -= bodySize * 0.4;
      }

      const lines = wrapTextToWidth(clean, contentW, indent, (s) => font.widthOfTextAtSize(s, size));

      // Prevent orphaned heading at bottom of page
      if (heading && cursorY - advance * 2.2 < bottomLimit) {
        startNewPage();
      }

      for (const line of lines) {
        if (cursorY - advance < bottomLimit) {
          startNewPage();
        }
        cursorY -= size;
        currentPage.drawText(line.text, {
          x: marginPt + line.indent,
          y: cursorY,
          size,
          font,
          color: rgb(0.08, 0.09, 0.11),
        });
        cursorY -= advance - size;
      }

      cursorY -= heading ? paraGap * 0.75 : paraGap;
    }

    // Embed extracted scan figures cleanly inside the text flow
    for (const fig of ch.figures) {
      try {
        const pngBytes = dataUrlToUint8Array(fig.dataUrl);
        const embedded = await pdfDoc.embedPng(pngBytes);
        const maxFigH = (pageH - marginPt * 2 - footerReserve) * 0.75;
        const scale = Math.min(contentW / Math.max(1, fig.width), maxFigH / Math.max(1, fig.height), 1);
        const drawW = Math.max(24, fig.width * scale);
        const drawH = Math.max(24, fig.height * scale);

        if (cursorY - drawH < bottomLimit && cursorY < pageH - marginPt - 8) {
          startNewPage();
        }
        const drawX = marginPt + (contentW - drawW) / 2;
        cursorY -= drawH;
        currentPage.drawImage(embedded, {
          x: drawX,
          y: cursorY,
          width: drawW,
          height: drawH,
        });
        cursorY -= paraGap * 1.4;
      } catch {
        // Skip invalid figure buffer
      }
    }

    if (onProgress) onProgress(i + 1, chapters.length);
  }

  const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
  return {
    blob: new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' }),
    outputPageCount: pageCount,
  };
}

export interface OcrPreviewPage {
  index: number;
  dataUrl: string;
  width: number;
  height: number;
}

/**
 * Renders an exact paginated preview of how the OCR-extracted text & figures will
 * reflow onto the target e-reader PDF page dimensions, font family, and font size.
 */
export async function renderOcrPdfPreviewPages(
  chapter: OcrChapterContent,
  settings: ReflowSettings,
  previewWidthPx = 480
): Promise<OcrPreviewPage[]> {
  const aspect = settings.targetHeightMm / Math.max(20, settings.targetWidthMm);
  const pageW = Math.max(300, Math.round(previewWidthPx));
  const pageH = Math.max(380, Math.round(pageW * aspect));
  const pageWpt = settings.targetWidthMm * MM_TO_PT;
  const ptToPx = pageW / Math.max(60, pageWpt);

  const marginPx = Math.max(12, Math.round(settings.pageMarginMm * MM_TO_PT * ptToPx));
  const footerReserve = Math.round(16 * ptToPx);
  const contentW = Math.max(80, pageW - marginPx * 2);
  const bottomLimit = pageH - marginPx - footerReserve;

  const fontStack =
    settings.ocrFontFamily === 'sans'
      ? '"Public Sans", -apple-system, Helvetica, Arial, sans-serif'
      : 'Georgia, "Times New Roman", serif';
  const bodySizePx = Math.max(9, settings.ocrFontSizePt * ptToPx);
  const headingSizePx = bodySizePx * 1.24;
  const lineHPx = bodySizePx * settings.lineSpacing;
  const headingLineHPx = headingSizePx * 1.3;
  const paraGapPx = bodySizePx * 0.55;
  const paraIndentPx = settings.preserveParagraphIndent ? bodySizePx * 1.35 : 0;

  const pages: OcrPreviewPage[] = [];

  const createPage = () => {
    const c = document.createElement('canvas');
    c.width = pageW;
    c.height = pageH;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, pageW, pageH);
    return { canvas: c, ctx };
  };

  let active = createPage();
  let cursorY = marginPx;

  const commitPage = () => {
    const idx = pages.length + 1;
    active.ctx.fillStyle = '#64748B';
    active.ctx.font = `400 ${Math.max(9, Math.round(8 * ptToPx))}px ${fontStack}`;
    active.ctx.textAlign = 'center';
    active.ctx.fillText(`${idx}`, pageW / 2, pageH - Math.max(8, Math.round(marginPx * 0.45)));
    active.ctx.textAlign = 'left';

    pages.push({
      index: idx,
      dataUrl: active.canvas.toDataURL('image/png'),
      width: pageW,
      height: pageH,
    });
    active = createPage();
    cursorY = marginPx;
  };

  for (let pIdx = 0; pIdx < chapter.paragraphs.length; pIdx++) {
    const clean = sanitizeForWinAnsi(chapter.paragraphs[pIdx]);
    if (!clean) continue;

    const heading = isHeadingParagraph(clean);
    const size = heading ? headingSizePx : bodySizePx;
    const advance = heading ? headingLineHPx : lineHPx;
    const indent = heading || pIdx === 0 ? 0 : paraIndentPx;
    const fontCss = `${heading ? 700 : 400} ${size.toFixed(1)}px ${fontStack}`;
    active.ctx.font = fontCss;

    if (heading && cursorY > marginPx + 4) {
      cursorY += bodySizePx * 0.4;
    }

    const lines = wrapTextToWidth(clean, contentW, indent, (s) => active.ctx.measureText(s).width);
    if (heading && cursorY + advance * 2.2 > bottomLimit) {
      commitPage();
      active.ctx.font = fontCss;
    }

    active.ctx.fillStyle = '#111827';
    for (const line of lines) {
      if (cursorY + advance > bottomLimit) {
        commitPage();
        active.ctx.font = fontCss;
        active.ctx.fillStyle = '#111827';
      }
      cursorY += size;
      active.ctx.fillText(line.text, marginPx + line.indent, cursorY);
      cursorY += advance - size;
    }

    cursorY += heading ? paraGapPx * 0.75 : paraGapPx;
  }

  for (const fig of chapter.figures) {
    const img = await loadImageElement(fig.dataUrl);
    if (!img) continue;
    const maxFigH = (pageH - marginPx * 2 - footerReserve) * 0.75;
    const scale = Math.min(contentW / Math.max(1, img.width), maxFigH / Math.max(1, img.height), 1);
    const drawW = Math.max(24, Math.round(img.width * scale));
    const drawH = Math.max(24, Math.round(img.height * scale));
    if (cursorY + drawH > bottomLimit && cursorY > marginPx + 8) {
      commitPage();
    }
    const drawX = marginPx + Math.round((contentW - drawW) / 2);
    active.ctx.drawImage(img, drawX, cursorY, drawW, drawH);
    cursorY += drawH + paraGapPx * 1.4;
  }

  if (cursorY > marginPx + 2 || pages.length === 0) {
    commitPage();
  }

  return pages;
}

function loadImageElement(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Builds a clean, compact reflowed PDF sized to the selected e-reader screen
 * dimensions (equivalent to k2pdfopt's output PDF).
 */
export async function buildReflowedPdfBlob(
  reflowPages: ReflowedPage[],
  settings: ReflowSettings,
  onProgress?: (current: number, total: number) => void
): Promise<Blob> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(settings.bookTitle || 'Reflowed Document');
  if (settings.bookAuthor) pdfDoc.setAuthor(settings.bookAuthor);
  pdfDoc.setCreator('FolioReflow (Offline)');
  pdfDoc.setProducer('FolioReflow PDF Engine');

  const pageWpt = Math.round(settings.targetWidthMm * MM_TO_PT * 100) / 100;
  const pageHpt = Math.round(settings.targetHeightMm * MM_TO_PT * 100) / 100;

  for (let i = 0; i < reflowPages.length; i++) {
    const rp = reflowPages[i];
    const page = pdfDoc.addPage([pageWpt, pageHpt]);
    const pngBytes = dataUrlToUint8Array(rp.dataUrl);
    const embedded = await pdfDoc.embedPng(pngBytes);
    page.drawImage(embedded, {
      x: 0,
      y: 0,
      width: pageWpt,
      height: pageHpt,
    });
    if (onProgress) onProgress(i + 1, reflowPages.length);
  }

  const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
  return new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
}

/**
 * Builds a standards-compliant EPUB 3.0 package (with EPUB 2 NCX fallback)
 * containing reflowed bitmap line strips & figures. Works 100% offline with zero OCR needed.
 */
export async function buildBitmapEpubBlob(
  reflowPages: ReflowedPage[],
  settings: ReflowSettings,
  onProgress?: (current: number, total: number) => void
): Promise<Blob> {
  const zip = new JSZip();
  const bookId = `urn:uuid:${generateUuid()}`;
  const title = settings.bookTitle.trim() || 'Reflowed Document';
  const author = settings.bookAuthor.trim() || 'Unknown Author';
  const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

  // EPUB spec requires uncompressed mimetype as first entry
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', buildContainerXml());
  zip.file('OEBPS/styles.css', buildEpubStylesCss(true));

  const manifestItems: string[] = [
    `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
    `<item id="css" href="styles.css" media-type="text/css"/>`,
  ];
  const spineItems: string[] = [];
  const navEntries: { id: string; href: string; label: string }[] = [];

  let imgCounter = 0;

  for (let i = 0; i < reflowPages.length; i++) {
    const rp = reflowPages[i];
    const chapId = `page_${String(i + 1).padStart(4, '0')}`;
    const chapHref = `${chapId}.xhtml`;
    const sourceLabel =
      rp.sourcePages.length > 0
        ? `Page ${rp.index} (Source p.${rp.sourcePages[0]})`
        : `Page ${rp.index}`;

    const bodyParts: string[] = [];

    if (rp.lineStrips.length > 0) {
      for (const strip of rp.lineStrips) {
        imgCounter++;
        const imgId = `img_${String(imgCounter).padStart(5, '0')}`;
        const imgHref = `images/${imgId}.png`;
        zip.file(`OEBPS/${imgHref}`, dataUrlToUint8Array(strip.dataUrl), { binary: true });
        manifestItems.push(`<item id="${imgId}" href="${imgHref}" media-type="image/png"/>`);

        if (strip.isFigure) {
          bodyParts.push(
            `<figure class="scanned-figure"><img src="${imgHref}" alt="Extracted figure" /></figure>`
          );
        } else {
          const cls = strip.paragraphBreakBefore ? 'line-strip para-start' : 'line-strip';
          bodyParts.push(
            `<div class="${cls}"><img src="${imgHref}" alt="Reflowed text line" /></div>`
          );
        }
      }
    } else {
      // Fallback full reflowed page image
      imgCounter++;
      const imgId = `img_${String(imgCounter).padStart(5, '0')}`;
      const imgHref = `images/${imgId}.png`;
      zip.file(`OEBPS/${imgHref}`, dataUrlToUint8Array(rp.dataUrl), { binary: true });
      manifestItems.push(`<item id="${imgId}" href="${imgHref}" media-type="image/png"/>`);
      bodyParts.push(
        `<figure class="full-page"><img src="${imgHref}" alt="${escapeXml(sourceLabel)}" /></figure>`
      );
    }

    const xhtml = buildChapterXhtml(sourceLabel, bodyParts.join('\n      '));
    zip.file(`OEBPS/${chapHref}`, xhtml);

    manifestItems.push(
      `<item id="${chapId}" href="${chapHref}" media-type="application/xhtml+xml"/>`
    );
    spineItems.push(`<itemref idref="${chapId}"/>`);
    navEntries.push({ id: chapId, href: chapHref, label: sourceLabel });

    if (onProgress) onProgress(i + 1, reflowPages.length);
  }

  zip.file('OEBPS/nav.xhtml', buildNavXhtml(title, navEntries));
  zip.file('OEBPS/toc.ncx', buildTocNcx(bookId, title, navEntries));
  zip.file(
    'OEBPS/content.opf',
    buildContentOpf(bookId, title, author, modified, manifestItems, spineItems)
  );

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/epub+zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

/**
 * Builds a truly reflowable semantic text EPUB 3.0 from extracted OCR / embedded text
 * plus preserved raster figures, allowing full e-reader font resizing and highlights.
 */
export async function buildTextEpubBlob(
  chapters: OcrChapterContent[],
  settings: ReflowSettings,
  onProgress?: (current: number, total: number) => void
): Promise<Blob> {
  const zip = new JSZip();
  const bookId = `urn:uuid:${generateUuid()}`;
  const title = settings.bookTitle.trim() || 'Reflowed Document';
  const author = settings.bookAuthor.trim() || 'Unknown Author';
  const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', buildContainerXml());
  zip.file('OEBPS/styles.css', buildEpubStylesCss(false));

  const manifestItems: string[] = [
    `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
    `<item id="css" href="styles.css" media-type="text/css"/>`,
  ];
  const spineItems: string[] = [];
  const navEntries: { id: string; href: string; label: string }[] = [];

  let figCounter = 0;

  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    const chapId = `sec_${String(ch.sourcePage).padStart(4, '0')}`;
    const chapHref = `${chapId}.xhtml`;
    const label = `Source Page ${ch.sourcePage}`;

    const parts: string[] = [`<h2 class="page-marker">Page ${ch.sourcePage}</h2>`];

    if (ch.paragraphs.length === 0 && ch.figures.length === 0) {
      parts.push(`<p class="empty-note">[No readable text detected on page ${ch.sourcePage}]</p>`);
    } else {
      for (const p of ch.paragraphs) {
        // Short uppercase or chapter-like standalone lines become subheadings
        if (p.length < 72 && !p.endsWith('.') && /^[A-Z0-9\s:–—-]+$/.test(p)) {
          parts.push(`<h3>${escapeXml(p)}</h3>`);
        } else {
          parts.push(`<p>${escapeXml(p)}</p>`);
        }
      }

      for (const fig of ch.figures) {
        figCounter++;
        const imgId = `fig_${String(figCounter).padStart(4, '0')}`;
        const imgHref = `images/${imgId}.png`;
        zip.file(`OEBPS/${imgHref}`, dataUrlToUint8Array(fig.dataUrl), { binary: true });
        manifestItems.push(`<item id="${imgId}" href="${imgHref}" media-type="image/png"/>`);
        parts.push(
          `<figure class="scanned-figure"><img src="${imgHref}" alt="Diagram from page ${ch.sourcePage}" /></figure>`
        );
      }
    }

    zip.file(`OEBPS/${chapHref}`, buildChapterXhtml(label, parts.join('\n      ')));
    manifestItems.push(
      `<item id="${chapId}" href="${chapHref}" media-type="application/xhtml+xml"/>`
    );
    spineItems.push(`<itemref idref="${chapId}"/>`);
    navEntries.push({ id: chapId, href: chapHref, label });

    if (onProgress) onProgress(i + 1, chapters.length);
  }

  zip.file('OEBPS/nav.xhtml', buildNavXhtml(title, navEntries));
  zip.file('OEBPS/toc.ncx', buildTocNcx(bookId, title, navEntries));
  zip.file(
    'OEBPS/content.opf',
    buildContentOpf(bookId, title, author, modified, manifestItems, spineItems)
  );

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/epub+zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

function buildContainerXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
}

function buildEpubStylesCss(isBitmapMode: boolean): string {
  if (isBitmapMode) {
    return `body {
  margin: 0.6em;
  padding: 0;
  background-color: #ffffff;
}
.line-strip {
  margin: 0 0 0.18em 0;
  padding: 0;
  line-height: 0;
}
.line-strip.para-start {
  margin-top: 0.65em;
}
.line-strip img {
  display: block;
  width: 100%;
  height: auto;
}
.scanned-figure, .full-page {
  margin: 0.9em auto;
  text-align: center;
}
.scanned-figure img, .full-page img {
  max-width: 100%;
  height: auto;
}`;
  }

  return `body {
  font-family: Georgia, "Times New Roman", serif;
  line-height: 1.55;
  margin: 1em 1.2em;
}
h2.page-marker {
  font-family: sans-serif;
  font-size: 0.78em;
  letter-spacing: 0.04em;
  color: #64748b;
  border-bottom: 1px solid #cbd5e1;
  padding-bottom: 0.25em;
  margin: 1.4em 0 0.8em 0;
}
h3 {
  font-size: 1.15em;
  margin: 1.2em 0 0.5em 0;
}
p {
  margin: 0 0 0.75em 0;
  text-indent: 1.2em;
  text-align: justify;
}
p:first-of-type {
  text-indent: 0;
}
.scanned-figure {
  margin: 1.2em auto;
  text-align: center;
}
.scanned-figure img {
  max-width: 100%;
  height: auto;
}`;
}

function buildChapterXhtml(title: string, innerHtml: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeXml(title)}</title>
    <link rel="stylesheet" type="text/css" href="styles.css" />
  </head>
  <body>
    <section>
      ${innerHtml}
    </section>
  </body>
</html>`;
}

function buildNavXhtml(
  title: string,
  entries: { id: string; href: string; label: string }[]
): string {
  const listItems = entries
    .map((e) => `        <li><a href="${e.href}">${escapeXml(e.label)}</a></li>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeXml(title)} — Contents</title>
  </head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>Contents</h1>
      <ol>
${listItems}
      </ol>
    </nav>
  </body>
</html>`;
}

function buildTocNcx(
  bookId: string,
  title: string,
  entries: { id: string; href: string; label: string }[]
): string {
  const navPoints = entries
    .map(
      (e, idx) => `    <navPoint id="navPoint-${idx + 1}" playOrder="${idx + 1}">
      <navLabel><text>${escapeXml(e.label)}</text></navLabel>
      <content src="${e.href}"/>
    </navPoint>`
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${escapeXml(bookId)}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeXml(title)}</text></docTitle>
  <navMap>
${navPoints}
  </navMap>
</ncx>`;
}

function buildContentOpf(
  bookId: string,
  title: string,
  author: string,
  modified: string,
  manifestItems: string[],
  spineItems: string[]
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">${escapeXml(bookId)}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:creator>${escapeXml(author)}</dc:creator>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
    ${manifestItems.join('\n    ')}
  </manifest>
  <spine toc="ncx">
    ${spineItems.join('\n    ')}
  </spine>
</package>`;
}

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
