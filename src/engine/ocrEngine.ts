import { createWorker, type Worker } from 'tesseract.js';
import type { OcrLanguage, OcrWordBox, PageAnalysis } from './types';

export const OCR_LANGUAGE_LABELS: Record<OcrLanguage, string> = {
  eng: 'English (eng)',
  deu: 'German (deu)',
  fra: 'French (fra)',
  spa: 'Spanish (spa)',
  ita: 'Italian (ita)',
};

const CACHED_LANGS_KEY = 'folioreflow_cached_ocr_langs_v1';

export function getCachedOcrLanguages(): OcrLanguage[] {
  try {
    const raw = localStorage.getItem(CACHED_LANGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OcrLanguage[]) : [];
  } catch {
    return [];
  }
}

export function markOcrLanguageCached(lang: OcrLanguage): OcrLanguage[] {
  const current = new Set(getCachedOcrLanguages());
  current.add(lang);
  const list = Array.from(current);
  try {
    localStorage.setItem(CACHED_LANGS_KEY, JSON.stringify(list));
  } catch {
    // Ignore storage quota errors
  }
  return list;
}

export interface LocalTrainedDataPack {
  code: string;
  data: Uint8Array;
  fileName: string;
}

export class OfflineOcrEngine {
  private worker: Worker | null = null;
  private activeLang: string | null = null;

  /**
   * Initializes Tesseract WASM worker. Supports either:
   * 1. A user-supplied local `.traineddata` / `.traineddata.gz` file (100% air-gapped offline), or
   * 2. Standard language code cached permanently in IndexedDB + Service Worker cache after first fetch.
   */
  async ensureWorker(
    lang: OcrLanguage,
    localPack: LocalTrainedDataPack | null,
    onStatus?: (message: string, progress: number) => void
  ): Promise<Worker> {
    const targetKey = localPack ? `local:${localPack.code}:${localPack.fileName}` : lang;
    if (this.worker && this.activeLang === targetKey) {
      return this.worker;
    }

    await this.terminate();

    const logger = (msg: { status: string; progress: number }) => {
      if (onStatus) {
        onStatus(msg.status, Math.round((msg.progress || 0) * 100));
      }
    };

    if (localPack) {
      const worker = await createWorker(
        [{ code: localPack.code, data: localPack.data }],
        undefined,
        {
          cacheMethod: 'write',
          logger,
        }
      );
      this.worker = worker;
      this.activeLang = targetKey;
      return worker;
    }

    const worker = await createWorker(lang, undefined, {
      cacheMethod: 'write',
      logger,
    });
    this.worker = worker;
    this.activeLang = targetKey;
    markOcrLanguageCached(lang);
    return worker;
  }

  /**
   * Pre-downloads and caches a language model into browser storage so future
   * sessions can run OCR completely offline.
   */
  async precacheLanguage(
    lang: OcrLanguage,
    onStatus?: (message: string, progress: number) => void
  ): Promise<void> {
    await this.ensureWorker(lang, null, onStatus);
  }

  /**
   * Runs column-ordered OCR on a cleaned, deskewed PageAnalysis, keeping
   * detected figures separate as extracted images and returning clean paragraphs,
   * word-level bounding boxes mapped to source coordinates, and mean OCR confidence.
   */
  async recognizeAnalyzedPage(
    analysis: PageAnalysis,
    lang: OcrLanguage,
    localPack: LocalTrainedDataPack | null,
    onStatus?: (message: string, progress: number) => void
  ): Promise<{
    paragraphs: string[];
    figures: { dataUrl: string; width: number; height: number }[];
    words: OcrWordBox[];
    meanConfidence: number;
    wordCount: number;
  }> {
    const worker = await this.ensureWorker(lang, localPack, onStatus);
    const paragraphs: string[] = [];
    const figures: { dataUrl: string; width: number; height: number }[] = [];
    const words: OcrWordBox[] = [];
    let confSum = 0;
    let confCount = 0;

    // Extract preserved figure regions directly as crisp PNGs
    for (const block of analysis.blocks) {
      if (block.type === 'figure') {
        const figCanvas = document.createElement('canvas');
        figCanvas.width = block.rect.w;
        figCanvas.height = block.rect.h;
        const fCtx = figCanvas.getContext('2d')!;
        fCtx.fillStyle = '#FFFFFF';
        fCtx.fillRect(0, 0, figCanvas.width, figCanvas.height);
        fCtx.drawImage(
          analysis.enhancedCanvas,
          block.rect.x,
          block.rect.y,
          block.rect.w,
          block.rect.h,
          0,
          0,
          block.rect.w,
          block.rect.h
        );
        figures.push({
          dataUrl: figCanvas.toDataURL('image/png'),
          width: block.rect.w,
          height: block.rect.h,
        });
      }
    }

    const PAD = 16;

    // OCR each detected column sequentially in natural reading order
    for (let ci = 0; ci < analysis.columns.length; ci++) {
      const col = analysis.columns[ci];
      const colCanvas = document.createElement('canvas');
      colCanvas.width = col.w + PAD * 2;
      colCanvas.height = col.h + PAD * 2;
      const ctx = colCanvas.getContext('2d')!;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, colCanvas.width, colCanvas.height);
      ctx.drawImage(
        analysis.enhancedCanvas,
        col.x,
        col.y,
        col.w,
        col.h,
        PAD,
        PAD,
        col.w,
        col.h
      );

      // Mask out figure blocks inside this column so OCR skips diagram linework
      ctx.fillStyle = '#FFFFFF';
      for (const block of analysis.blocks) {
        if (block.type === 'figure' && block.columnIndex === ci) {
          ctx.fillRect(
            block.rect.x - col.x + PAD,
            block.rect.y - col.y + PAD,
            block.rect.w,
            block.rect.h
          );
        }
      }

      const result = await worker.recognize(colCanvas, {}, { text: true, blocks: true });
      const rawText = (result.data.text || '').trim();
      if (rawText) {
        const splitParas = cleanOcrTextToParagraphs(rawText);
        paragraphs.push(...splitParas);
      }

      // Extract word bounding boxes & confidence from Tesseract v7 block hierarchy
      if (result.data.blocks) {
        for (const blk of result.data.blocks) {
          for (const para of blk.paragraphs || []) {
            for (const line of para.lines || []) {
              for (const w of line.words || []) {
                const txt = (w.text || '').trim();
                if (!txt) continue;
                const x = col.x + Math.max(0, w.bbox.x0 - PAD);
                const y = col.y + Math.max(0, w.bbox.y0 - PAD);
                const bw = Math.max(2, w.bbox.x1 - w.bbox.x0);
                const bh = Math.max(2, w.bbox.y1 - w.bbox.y0);
                words.push({
                  text: txt,
                  confidence: Math.round(w.confidence || 0),
                  x,
                  y,
                  w: bw,
                  h: bh,
                });
                confSum += w.confidence || 0;
                confCount++;
              }
            }
          }
        }
      } else if (typeof result.data.confidence === 'number' && rawText) {
        confSum += result.data.confidence;
        confCount++;
      }
    }

    const totalWords =
      words.length > 0
        ? words.length
        : paragraphs.join(' ').split(/\s+/).filter(Boolean).length;
    const meanConfidence = confCount > 0 ? Math.round(confSum / confCount) : 0;

    return {
      paragraphs,
      figures,
      words,
      meanConfidence,
      wordCount: totalWords,
    };
  }

  async terminate(): Promise<void> {
    if (this.worker) {
      try {
        await this.worker.terminate();
      } catch {
        // Ignore termination cleanup errors
      }
      this.worker = null;
      this.activeLang = null;
    }
  }
}

function cleanOcrTextToParagraphs(raw: string): string[] {
  // Split on blank lines first
  const blocks = raw
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((chunk) => {
      // De-hyphenate line-end word breaks and join wrapped lines inside each paragraph
      const joined = chunk
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .reduce((acc, line) => {
          if (!acc) return line;
          if (acc.endsWith('-') && !acc.endsWith('--')) {
            return acc.slice(0, -1) + line;
          }
          return `${acc} ${line}`;
        }, '');
      return joined.replace(/\s+/g, ' ').trim();
    })
    .filter((p) => p.length > 0);

  return blocks;
}
