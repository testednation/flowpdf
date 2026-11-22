import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import type { LoadedDocument, SourcePageMeta } from './types';

// Local bundled worker ensures 100% offline PDF rendering with zero CDN dependencies
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const PT_TO_MM = 25.4 / 72;

export class OfflinePdfSession {
  private loadingTask: PDFDocumentLoadingTask | null = null;
  private pdfDoc: PDFDocumentProxy | null = null;

  async loadFromBytes(
    bytes: Uint8Array,
    fileName: string,
    isSample = false
  ): Promise<LoadedDocument> {
    await this.dispose();

    // Copy buffer so pdfjs worker transfer does not detach caller's array
    const dataCopy = new Uint8Array(bytes.byteLength);
    dataCopy.set(bytes);

    const loadingTask = pdfjsLib.getDocument({
      data: dataCopy,
      useWorkerFetch: false,
    });
    this.loadingTask = loadingTask;
    const doc = await loadingTask.promise;
    this.pdfDoc = doc;

    const pages: SourcePageMeta[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();
      const rawText = textContent.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      pages.push({
        pageNumber: i,
        widthPt: viewport.width,
        heightPt: viewport.height,
        widthMm: Math.round(viewport.width * PT_TO_MM * 10) / 10,
        heightMm: Math.round(viewport.height * PT_TO_MM * 10) / 10,
        rotationDeg: 0,
        included: true,
        hasEmbeddedText: rawText.length >= 24,
        embeddedTextPreview: rawText.slice(0, 160),
        thumbnailUrl: null,
      });
    }

    return {
      fileName,
      fileSizeBytes: bytes.byteLength,
      pageCount: doc.numPages,
      pages,
      isSample,
    };
  }

  async renderPageToCanvas(pageNumber: number, dpi: number): Promise<HTMLCanvasElement> {
    if (!this.pdfDoc) {
      throw new Error('No PDF document is currently loaded.');
    }
    const page = await this.pdfDoc.getPage(pageNumber);
    const scale = Math.max(0.5, dpi / 72);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvas,
      canvasContext: ctx,
      viewport,
    }).promise;

    return canvas;
  }

  async renderThumbnail(pageNumber: number, maxWidth = 180): Promise<string> {
    if (!this.pdfDoc) return '';
    const page = await this.pdfDoc.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(1, maxWidth / Math.max(1, base.width));
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL('image/jpeg', 0.72);
  }

  async extractEmbeddedParagraphs(pageNumber: number): Promise<string[]> {
    if (!this.pdfDoc) return [];
    const page = await this.pdfDoc.getPage(pageNumber);
    const content = await page.getTextContent();

    // Reconstruct lines by Y coordinate and join into clean paragraphs
    interface LineBucket {
      y: number;
      text: string;
    }
    const lines: LineBucket[] = [];

    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const y = Array.isArray(item.transform) ? Math.round(item.transform[5]) : 0;
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.y - y) <= 5) {
        last.text += (last.text.endsWith('-') ? '' : ' ') + item.str.trim();
      } else {
        lines.push({ y, text: item.str.trim() });
      }
    }

    if (lines.length === 0) return [];

    const paragraphs: string[] = [];
    let current = lines[0].text;
    for (let i = 1; i < lines.length; i++) {
      const gap = Math.abs(lines[i - 1].y - lines[i].y);
      if (gap > 20 || current.endsWith('.') && lines[i].text.length < 48) {
        paragraphs.push(current.replace(/\s+/g, ' ').trim());
        current = lines[i].text;
      } else {
        if (current.endsWith('-')) {
          current = current.slice(0, -1) + lines[i].text;
        } else {
          current += ' ' + lines[i].text;
        }
      }
    }
    if (current.trim()) {
      paragraphs.push(current.replace(/\s+/g, ' ').trim());
    }

    return paragraphs;
  }

  async dispose(): Promise<void> {
    if (this.pdfDoc) {
      try {
        await this.pdfDoc.cleanup();
      } catch {
        // Ignore cleanup errors
      }
      this.pdfDoc = null;
    }
    if (this.loadingTask) {
      try {
        await this.loadingTask.destroy();
      } catch {
        // Ignore destroy errors
      }
      this.loadingTask = null;
    }
  }
}
