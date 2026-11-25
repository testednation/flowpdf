import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookMarked,
  BookOpen,
  Download,
  LayoutGrid,
  SlidersHorizontal,
} from 'lucide-react';
import { ConfigSidebar } from './components/ConfigSidebar';
import { EmptyDropzone } from './components/EmptyDropzone';
import { ExportView } from './components/ExportView';
import { GuideView } from './components/GuideView';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PagesView } from './components/PagesView';
import { ShortcutsModal } from './components/ShortcutsModal';
import { type InspectionMode, WorkbenchView } from './components/WorkbenchView';
import { getModKeyLabel, isTypingTarget } from './hooks/useKeyboardShortcuts';
import {
  buildBitmapEpubBlob,
  buildOcrReflowPdfBlob,
  buildReflowedPdfBlob,
  buildTextEpubBlob,
  type OcrPreviewPage,
  renderOcrPdfPreviewPages,
} from './engine/exporters';
import { resolveExportFileName } from './engine/fileNaming';
import {
  detectSmartPageOrientation,
  enhanceScannedCanvas,
  rotateCanvas90,
} from './engine/imageProcessing';
import {
  getCachedOcrLanguages,
  type LocalTrainedDataPack,
  OfflineOcrEngine,
} from './engine/ocrEngine';
import { OfflinePdfSession } from './engine/pdfLoader';
import {
  analyzeScannedPage,
  reflowAnalyzedPages,
  renderInspectionCanvas,
} from './engine/reflowEngine';
import { generateSampleScannedPdf } from './engine/samplePdfGenerator';
import {
  type ConversionProgress,
  DEFAULT_SETTINGS,
  type ExportBatchStats,
  type ExportHistoryItem,
  type LoadedDocument,
  type OcrChapterContent,
  type OcrLanguage,
  type PageAnalysis,
  type ReflowedPage,
  type ReflowSettings,
  type RotationAngle,
} from './engine/types';

type ActiveTab = 'workbench' | 'pages' | 'export' | 'guide';

const SETTINGS_STORAGE_KEY = 'folioreflow_settings_v2';
const THEME_STORAGE_KEY = 'folioreflow_theme_v1';

function loadSavedSettings(): ReflowSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      marginTrimPct: {
        ...DEFAULT_SETTINGS.marginTrimPct,
        ...(parsed.marginTrimPct || {}),
      },
      bookTitle: '',
      bookAuthor: '',
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function loadInitialDark(): boolean {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark') return true;
    if (saved === 'light') return false;
  } catch {
    // Ignore storage read failure
  }
  return false;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('workbench');
  const [isDark, setIsDark] = useState<boolean>(loadInitialDark);
  const [settings, setSettings] = useState<ReflowSettings>(loadSavedSettings);

  // Document & preview state
  const [doc, setDoc] = useState<LoadedDocument | null>(null);
  const [isLoadingDoc, setIsLoadingDoc] = useState(false);
  const [loadingDocLabel, setLoadingDocLabel] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeSourcePage, setActiveSourcePage] = useState(1);
  const [inspectionMode, setInspectionMode] = useState<InspectionMode>('layout');
  const [rawPageUrl, setRawPageUrl] = useState<string | null>(null);
  const [enhancedPageUrl, setEnhancedPageUrl] = useState<string | null>(null);
  const [overlayPageUrl, setOverlayPageUrl] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<PageAnalysis | null>(null);
  const [previewPages, setPreviewPages] = useState<ReflowedPage[]>([]);
  const [isProcessingPreview, setIsProcessingPreview] = useState(false);

  // Per-page OCR results (reused between Workbench live preview, editing, and Export)
  const [ocrChaptersByPage, setOcrChaptersByPage] = useState<Record<number, OcrChapterContent>>({});
  const [ocrPdfPreviewPages, setOcrPdfPreviewPages] = useState<OcrPreviewPage[]>([]);
  const [isRunningOcrPreview, setIsRunningOcrPreview] = useState(false);
  const [ocrPreviewStatus, setOcrPreviewStatus] = useState('');
  const [ocrOfflineNotice, setOcrOfflineNotice] = useState<string | null>(null);
  const [autoLiveOcr, setAutoLiveOcr] = useState(true);
  const [cachedOcrLangs, setCachedOcrLangs] = useState<OcrLanguage[]>(getCachedOcrLanguages);
  const [isCachingOcr, setIsCachingOcr] = useState(false);
  const [ocrCacheStatus, setOcrCacheStatus] = useState('');
  const [localTrainedData, setLocalTrainedData] = useState<LocalTrainedDataPack | null>(null);

  // Batch export state
  const [progress, setProgress] = useState<ConversionProgress>({
    phase: 'idle',
    currentPage: 0,
    totalPages: 0,
    percent: 0,
    detail: '',
  });
  const [history, setHistory] = useState<ExportHistoryItem[]>([]);
  const [activeSummaryId, setActiveSummaryId] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [shortcutFeedback, setShortcutFeedback] = useState<string | null>(null);
  const [isSmartRotatingAll, setIsSmartRotatingAll] = useState(false);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);

  // Mutable engine refs
  const pdfSessionRef = useRef<OfflinePdfSession>(new OfflinePdfSession());
  const ocrEngineRef = useRef<OfflineOcrEngine>(new OfflineOcrEngine());
  const rawCanvasCacheRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const docVersionRef = useRef(0);
  const abortExportRef = useRef(false);
  const ocrInFlightRef = useRef(false);
  const feedbackTimerRef = useRef<number | null>(null);
  const globalFileInputRef = useRef<HTMLInputElement>(null);

  const showFeedback = useCallback((message: string) => {
    setShortcutFeedback(message);
    if (feedbackTimerRef.current) {
      window.clearTimeout(feedbackTimerRef.current);
    }
    feedbackTimerRef.current = window.setTimeout(() => {
      setShortcutFeedback(null);
    }, 1500);
  }, []);

  const activeOcrChapter = ocrChaptersByPage[activeSourcePage] || null;
  const activePageRotation: RotationAngle = doc?.pages[activeSourcePage - 1]?.rotationDeg ?? 0;

  // Sync dark mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) root.classList.add('dark');
    else root.classList.remove('dark');
    try {
      localStorage.setItem(THEME_STORAGE_KEY, isDark ? 'dark' : 'light');
    } catch {
      // Ignore storage errors
    }
  }, [isDark]);

  // Persist user settings offline
  useEffect(() => {
    try {
      const { bookTitle: _t, bookAuthor: _a, ...persistable } = settings;
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(persistable));
    } catch {
      // Ignore storage errors
    }
  }, [settings]);

  // Cleanup engine resources on unmount
  useEffect(() => {
    const pdfSession = pdfSessionRef.current;
    const ocrEngine = ocrEngineRef.current;
    return () => {
      void pdfSession.dispose();
      void ocrEngine.terminate();
    };
  }, []);

  const updateSettings = useCallback((patch: Partial<ReflowSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings((prev) => ({
      ...DEFAULT_SETTINGS,
      bookTitle: prev.bookTitle,
      bookAuthor: prev.bookAuthor,
    }));
  }, []);

  // Load any PDF from bytes (uploaded file or generated sample)
  const loadPdfBytes = useCallback(async (bytes: Uint8Array, fileName: string, isSample: boolean) => {
    setIsLoadingDoc(true);
    setLoadError(null);
    setLoadingDocLabel(`Parsing ${fileName}…`);
    try {
      const loaded = await pdfSessionRef.current.loadFromBytes(bytes, fileName, isSample);
      docVersionRef.current += 1;
      const version = docVersionRef.current;
      rawCanvasCacheRef.current.clear();

      setDoc(loaded);
      setActiveSourcePage(1);
      setOcrChaptersByPage({});
      setOcrPdfPreviewPages([]);
      setOcrOfflineNotice(null);
      setActiveTab('workbench');
      setSettings((prev) => ({
        ...prev,
        bookTitle: fileName.replace(/\.pdf$/i, ''),
      }));
      setProgress({ phase: 'idle', currentPage: 0, totalPages: 0, percent: 0, detail: '' });
      setActiveSummaryId(null);

      // Lazily render page thumbnails in the background without blocking preview
      void (async () => {
        for (let p = 1; p <= loaded.pageCount; p++) {
          if (docVersionRef.current !== version) return;
          try {
            const thumb = await pdfSessionRef.current.renderThumbnail(p, 160);
            if (docVersionRef.current !== version) return;
            setDoc((curr) => {
              if (!curr) return curr;
              const nextPages = curr.pages.map((meta) =>
                meta.pageNumber === p ? { ...meta, thumbnailUrl: thumb } : meta
              );
              return { ...curr, pages: nextPages };
            });
          } catch {
            // Skip thumbnail error on malformed page
          }
          await new Promise((r) => setTimeout(r, 12));
        }
      })();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to parse PDF file.';
      setLoadError(msg);
    } finally {
      setIsLoadingDoc(false);
      setLoadingDocLabel('');
    }
  }, []);

  const handleFileSelected = useCallback(
    async (file: File) => {
      setIsLoadingDoc(true);
      setLoadingDocLabel(`Reading ${file.name}…`);
      try {
        const buffer = await file.arrayBuffer();
        await loadPdfBytes(new Uint8Array(buffer), file.name, false);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to read file.');
        setIsLoadingDoc(false);
      }
    },
    [loadPdfBytes]
  );

  const handleLoadSample = useCallback(async () => {
    setIsLoadingDoc(true);
    setLoadingDocLabel('Synthesizing 1894 2-column archival scan…');
    try {
      const sampleBytes = await generateSampleScannedPdf();
      await loadPdfBytes(sampleBytes, 'Optical_Surveying_1894_Scan.pdf', true);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to create sample PDF.');
      setIsLoadingDoc(false);
    }
  }, [loadPdfBytes]);

  // Live Source Analysis & Bitmap Reflow Preview Pipeline
  useEffect(() => {
    if (!doc) {
      setRawPageUrl(null);
      setOverlayPageUrl(null);
      setAnalysis(null);
      setPreviewPages([]);
      return;
    }

    let cancelled = false;
    const version = docVersionRef.current;
    const pageMeta = doc.pages[activeSourcePage - 1];
    if (!pageMeta) return;

    const timer = window.setTimeout(async () => {
      setIsProcessingPreview(true);
      try {
        const cacheKey = `${version}:${activeSourcePage}`;
        let rawCanvas = rawCanvasCacheRef.current.get(cacheKey);
        if (!rawCanvas) {
          rawCanvas = await pdfSessionRef.current.renderPageToCanvas(activeSourcePage, 150);
          if (cancelled) return;
          if (rawCanvasCacheRef.current.size > 8) {
            const firstKey = rawCanvasCacheRef.current.keys().next().value;
            if (firstKey) rawCanvasCacheRef.current.delete(firstKey);
          }
          rawCanvasCacheRef.current.set(cacheKey, rawCanvas);
        }

        if (cancelled) return;
        const orientedCanvas = rotateCanvas90(rawCanvas, activePageRotation);
        const swapDims = activePageRotation === 90 || activePageRotation === 270;
        const effectiveWidthMm = swapDims ? pageMeta.heightMm : pageMeta.widthMm;
        const effectiveHeightMm = swapDims ? pageMeta.widthMm : pageMeta.heightMm;

        setRawPageUrl(orientedCanvas.toDataURL('image/jpeg', 0.85));

        const analyzed = analyzeScannedPage(
          orientedCanvas,
          activeSourcePage,
          effectiveWidthMm,
          effectiveHeightMm,
          settings
        );
        if (cancelled) return;

        setAnalysis(analyzed);

        const reflowed = reflowAnalyzedPages([analyzed], settings, 620, false);
        if (cancelled) return;
        setPreviewPages(reflowed);
      } catch (err) {
        console.error('Preview error:', err);
      } finally {
        if (!cancelled) setIsProcessingPreview(false);
      }
    }, 90);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    doc,
    activeSourcePage,
    activePageRotation,
    settings.targetWidthMm,
    settings.targetHeightMm,
    settings.columns,
    settings.autoCrop,
    settings.marginTrimPct,
    settings.deskew,
    settings.contrast,
    settings.thresholdMode,
    settings.fontScale,
    settings.lineSpacing,
    settings.wordGapMultiplier,
    settings.pageMarginMm,
    settings.preserveFigures,
    settings.preserveParagraphIndent,
  ]);

  // Keep source inspection overlay & cleaned compare image synced with analysis
  useEffect(() => {
    if (!analysis) {
      setEnhancedPageUrl(null);
      setOverlayPageUrl(null);
      return;
    }
    setEnhancedPageUrl(analysis.enhancedCanvas.toDataURL('image/jpeg', 0.86));
    setOverlayPageUrl(
      renderInspectionCanvas(
        analysis,
        inspectionMode === 'words',
        activeOcrChapter?.words
      )
    );
  }, [analysis, inspectionMode, activeOcrChapter]);

  // Live Paginated Preview for OCR Reflowable PDF whenever OCR text or typography settings change
  useEffect(() => {
    if (settings.outputFormat !== 'pdf-ocr' || !activeOcrChapter) {
      setOcrPdfPreviewPages([]);
      return;
    }

    let cancelled = false;
    void (async () => {
      const rendered = await renderOcrPdfPreviewPages(activeOcrChapter, settings, 500);
      if (!cancelled) setOcrPdfPreviewPages(rendered);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activeOcrChapter,
    settings.outputFormat,
    settings.targetWidthMm,
    settings.targetHeightMm,
    settings.ocrFontFamily,
    settings.ocrFontSizePt,
    settings.lineSpacing,
    settings.pageMarginMm,
    settings.preserveParagraphIndent,
  ]);

  // Single-page OCR extraction handler (used both manually and by Auto Live OCR)
  const handleRunOcrPreview = useCallback(async () => {
    if (!doc || !analysis || ocrInFlightRef.current) return;
    const pageNum = analysis.sourcePage;
    const pageMeta = doc.pages[pageNum - 1];
    if (!pageMeta) return;

    ocrInFlightRef.current = true;
    setIsRunningOcrPreview(true);
    setOcrOfflineNotice(null);
    setOcrPreviewStatus('Initializing OCR…');
    try {
      if (settings.preferEmbeddedText && pageMeta.hasEmbeddedText) {
        const embedded = await pdfSessionRef.current.extractEmbeddedParagraphs(pageNum);
        const wc = embedded.join(' ').split(/\s+/).filter(Boolean).length;
        setOcrChaptersByPage((prev) => ({
          ...prev,
          [pageNum]: {
            sourcePage: pageNum,
            paragraphs: embedded,
            figures: [],
            usedEmbeddedText: true,
            meanConfidence: 100,
            wordCount: wc,
            words: [],
          },
        }));
      } else {
        const res = await ocrEngineRef.current.recognizeAnalyzedPage(
          analysis,
          settings.ocrLanguage,
          localTrainedData,
          (status, pct) => setOcrPreviewStatus(`${status} (${pct}%)`)
        );
        setCachedOcrLangs(getCachedOcrLanguages());
        setOcrChaptersByPage((prev) => ({
          ...prev,
          [pageNum]: {
            sourcePage: pageNum,
            paragraphs: res.paragraphs,
            figures: res.figures,
            usedEmbeddedText: false,
            meanConfidence: res.meanConfidence,
            wordCount: res.wordCount,
            words: res.words,
          },
        }));
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'OCR model unavailable offline';
      setOcrOfflineNotice(
        `Offline OCR model not cached yet (${detail}). Showing instant bitmap preview — pre-cache or load a local .traineddata file in Export.`
      );
    } finally {
      ocrInFlightRef.current = false;
      setIsRunningOcrPreview(false);
      setOcrPreviewStatus('');
    }
  }, [
    doc,
    analysis,
    settings.preferEmbeddedText,
    settings.ocrLanguage,
    localTrainedData,
  ]);

  // Auto Live OCR: automatically extracts text for the active page in OCR modes
  useEffect(() => {
    const isOcrFormat = settings.outputFormat === 'pdf-ocr' || settings.outputFormat === 'epub-ocr';
    if (
      !autoLiveOcr ||
      !isOcrFormat ||
      activeTab !== 'workbench' ||
      !doc ||
      !analysis ||
      analysis.sourcePage !== activeSourcePage ||
      activeOcrChapter ||
      ocrInFlightRef.current ||
      ocrOfflineNotice
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      void handleRunOcrPreview();
    }, 320);

    return () => window.clearTimeout(timer);
  }, [
    autoLiveOcr,
    settings.outputFormat,
    activeTab,
    doc,
    analysis,
    activeSourcePage,
    activeOcrChapter,
    ocrOfflineNotice,
    isRunningOcrPreview,
    handleRunOcrPreview,
  ]);

  // Allow user to refine OCR paragraphs directly in Workbench (reused in preview & export)
  const handleEditOcrText = useCallback((pageNumber: number, nextParagraphs: string[]) => {
    const wc = nextParagraphs.join(' ').split(/\s+/).filter(Boolean).length;
    setOcrChaptersByPage((prev) => {
      const existing = prev[pageNumber];
      if (!existing) return prev;
      return {
        ...prev,
        [pageNumber]: {
          ...existing,
          paragraphs: nextParagraphs,
          wordCount: wc,
          isEdited: true,
        },
      };
    });
  }, []);

  // Pre-cache OCR model for offline usage
  const handlePrecacheOcr = useCallback(async (lang: OcrLanguage) => {
    setIsCachingOcr(true);
    setOcrCacheStatus('Fetching model…');
    try {
      await ocrEngineRef.current.precacheLanguage(lang, (status, pct) => {
        setOcrCacheStatus(`${status} ${pct}%`);
      });
      setCachedOcrLangs(getCachedOcrLanguages());
    } catch (err) {
      setLoadError(
        `Could not download OCR model "${lang}". Connect once to cache it, or load a local .traineddata file. (${err instanceof Error ? err.message : 'Network error'})`
      );
    } finally {
      setIsCachingOcr(false);
      setOcrCacheStatus('');
    }
  }, []);

  const handleUploadLocalTrainedData = useCallback(async (file: File) => {
    const buf = await file.arrayBuffer();
    const baseCode = file.name.split('.')[0] || 'custom';
    setLocalTrainedData({
      code: baseCode,
      data: new Uint8Array(buf),
      fileName: file.name,
    });
  }, []);

  // Page selection handlers
  const handleTogglePage = useCallback((pageNumber: number) => {
    setDoc((curr) => {
      if (!curr) return curr;
      return {
        ...curr,
        pages: curr.pages.map((p) =>
          p.pageNumber === pageNumber ? { ...p, included: !p.included } : p
        ),
      };
    });
  }, []);

  const handleSetIncludedPages = useCallback((includedSet: Set<number>) => {
    setDoc((curr) => {
      if (!curr) return curr;
      return {
        ...curr,
        pages: curr.pages.map((p) => ({ ...p, included: includedSet.has(p.pageNumber) })),
      };
    });
  }, []);

  // Rotate a single page 90° clockwise and invalidate its cached OCR text
  const handleRotatePage90 = useCallback(
    (pageNumber: number) => {
      const currentDeg = doc?.pages[pageNumber - 1]?.rotationDeg ?? 0;
      const nextAngle = (((currentDeg + 90) % 360) as RotationAngle);
      setDoc((curr) => {
        if (!curr) return curr;
        return {
          ...curr,
          pages: curr.pages.map((p) =>
            p.pageNumber === pageNumber ? { ...p, rotationDeg: nextAngle } : p
          ),
        };
      });
      setOcrChaptersByPage((prev) => {
        if (!prev[pageNumber]) return prev;
        const copy = { ...prev };
        delete copy[pageNumber];
        return copy;
      });
      showFeedback(`Rotated page ${pageNumber} to ${nextAngle}°`);
    },
    [doc, showFeedback]
  );

  // Detect page orientation via layout analysis and apply the suggested rotation
  const handleSmartRotatePage = useCallback(
    async (pageNumber: number) => {
      if (!doc) return;
      const meta = doc.pages[pageNumber - 1];
      if (!meta) return;

      let orientation =
        analysis && analysis.sourcePage === pageNumber ? analysis.orientation : null;

      if (!orientation) {
        try {
          const rawCanvas = await pdfSessionRef.current.renderPageToCanvas(pageNumber, 120);
          const oriented = rotateCanvas90(rawCanvas, meta.rotationDeg);
          const enhanced = enhanceScannedCanvas(oriented, settings.contrast, 'grayscale');
          orientation = detectSmartPageOrientation(
            enhanced.binary,
            enhanced.width,
            enhanced.height
          );
        } catch {
          showFeedback('Unable to analyze page orientation');
          return;
        }
      }

      if (orientation.suggestedRotationDeg === 0) {
        showFeedback(`Page ${pageNumber} already upright (${meta.rotationDeg}°)`);
        return;
      }

      const nextAngle = (((meta.rotationDeg + orientation.suggestedRotationDeg) % 360) as RotationAngle);
      setDoc((curr) => {
        if (!curr) return curr;
        return {
          ...curr,
          pages: curr.pages.map((p) =>
            p.pageNumber === pageNumber ? { ...p, rotationDeg: nextAngle } : p
          ),
        };
      });
      setOcrChaptersByPage((prev) => {
        if (!prev[pageNumber]) return prev;
        const copy = { ...prev };
        delete copy[pageNumber];
        return copy;
      });
      showFeedback(
        `Smart Rotate: +${orientation.suggestedRotationDeg}° applied (${orientation.confidence}% conf)`
      );
    },
    [doc, analysis, settings.contrast, showFeedback]
  );

  // Run Smart Rotate across all pages in the document from Pages view
  const handleSmartRotateAll = useCallback(async () => {
    if (!doc || isSmartRotatingAll) return;
    setIsSmartRotatingAll(true);
    const version = docVersionRef.current;
    const updates = new Map<number, RotationAngle>();

    try {
      for (const page of doc.pages) {
        if (docVersionRef.current !== version) return;
        const rawCanvas = await pdfSessionRef.current.renderPageToCanvas(page.pageNumber, 110);
        const oriented = rotateCanvas90(rawCanvas, page.rotationDeg);
        const enhanced = enhanceScannedCanvas(oriented, settings.contrast, 'grayscale');
        const orientation = detectSmartPageOrientation(
          enhanced.binary,
          enhanced.width,
          enhanced.height
        );
        if (orientation.suggestedRotationDeg !== 0) {
          const nextAngle = (((page.rotationDeg + orientation.suggestedRotationDeg) % 360) as RotationAngle);
          updates.set(page.pageNumber, nextAngle);
        }
        await new Promise((r) => setTimeout(r, 0));
      }

      if (docVersionRef.current !== version) return;

      if (updates.size > 0) {
        setDoc((curr) => {
          if (!curr) return curr;
          return {
            ...curr,
            pages: curr.pages.map((p) =>
              updates.has(p.pageNumber)
                ? { ...p, rotationDeg: updates.get(p.pageNumber)! }
                : p
            ),
          };
        });
        setOcrChaptersByPage((prev) => {
          const copy = { ...prev };
          for (const pageNum of updates.keys()) {
            delete copy[pageNum];
          }
          return copy;
        });
        showFeedback(`Smart Rotate: adjusted ${updates.size} of ${doc.pageCount} pages`);
      } else {
        showFeedback(`All ${doc.pageCount} pages already upright`);
      }
    } finally {
      setIsSmartRotatingAll(false);
    }
  }, [doc, isSmartRotatingAll, settings.contrast, showFeedback]);

  // Full Batch Conversion & Export Pipeline
  const handleStartExport = useCallback(async () => {
    if (!doc) return;
    const selectedPages = doc.pages.filter((p) => p.included);
    if (selectedPages.length === 0) return;

    abortExportRef.current = false;
    const exportStartTime = performance.now();
    const total = selectedPages.length;
    const exportDpi = settings.exportQualityDpi;
    const isOcrFormat = settings.outputFormat === 'pdf-ocr' || settings.outputFormat === 'epub-ocr';

    try {
      if (isOcrFormat) {
        const chapters: OcrChapterContent[] = [];

        for (let i = 0; i < total; i++) {
          if (abortExportRef.current) throw new Error('Conversion cancelled by user.');
          const meta = selectedPages[i];
          const basePct = Math.round((i / total) * 85);

          // Reuse edited or already-recognized OCR page from Workbench if available
          const cachedChapter = ocrChaptersByPage[meta.pageNumber];
          if (cachedChapter && (cachedChapter.isEdited || cachedChapter.paragraphs.length > 0)) {
            setProgress({
              phase: 'ocr',
              currentPage: i + 1,
              totalPages: total,
              percent: Math.min(86, basePct + Math.round(70 / total)),
              detail: `Using reviewed OCR text for page ${meta.pageNumber} (${i + 1}/${total})…`,
            });
            chapters.push(cachedChapter);
            await new Promise((r) => setTimeout(r, 0));
            continue;
          }

          if (settings.preferEmbeddedText && meta.hasEmbeddedText) {
            setProgress({
              phase: 'ocr',
              currentPage: i + 1,
              totalPages: total,
              percent: basePct,
              detail: `Extracting embedded text from page ${meta.pageNumber} (${i + 1}/${total})…`,
            });
            const paragraphs = await pdfSessionRef.current.extractEmbeddedParagraphs(
              meta.pageNumber
            );
            const wc = paragraphs.join(' ').split(/\s+/).filter(Boolean).length;
            const ch: OcrChapterContent = {
              sourcePage: meta.pageNumber,
              paragraphs,
              figures: [],
              usedEmbeddedText: true,
              meanConfidence: 100,
              wordCount: wc,
              words: [],
            };
            chapters.push(ch);
            setOcrChaptersByPage((prev) => ({ ...prev, [meta.pageNumber]: ch }));
          } else {
            setProgress({
              phase: 'rendering',
              currentPage: i + 1,
              totalPages: total,
              percent: basePct,
              detail: `Cleaning & deskewing page ${meta.pageNumber} (${i + 1}/${total})…`,
            });
            const rawCanvas = await pdfSessionRef.current.renderPageToCanvas(
              meta.pageNumber,
              exportDpi
            );
            if (abortExportRef.current) throw new Error('Conversion cancelled by user.');

            let effectiveRotation: RotationAngle = meta.rotationDeg;
            let orientedCanvas = rotateCanvas90(rawCanvas, effectiveRotation);
            if (settings.autoSmartRotate && effectiveRotation === 0) {
              const probe = enhanceScannedCanvas(orientedCanvas, settings.contrast, 'grayscale');
              const orient = detectSmartPageOrientation(probe.binary, probe.width, probe.height);
              if (orient.suggestedRotationDeg !== 0) {
                effectiveRotation = orient.suggestedRotationDeg;
                orientedCanvas = rotateCanvas90(rawCanvas, effectiveRotation);
              }
            }
            const swapDims = effectiveRotation === 90 || effectiveRotation === 270;

            const pageAnalysis = analyzeScannedPage(
              orientedCanvas,
              meta.pageNumber,
              swapDims ? meta.heightMm : meta.widthMm,
              swapDims ? meta.widthMm : meta.heightMm,
              settings
            );

            setProgress({
              phase: 'ocr',
              currentPage: i + 1,
              totalPages: total,
              percent: Math.min(86, basePct + Math.round(40 / total)),
              detail: `Running offline OCR on page ${meta.pageNumber} (${i + 1}/${total})…`,
            });

            const ocrRes = await ocrEngineRef.current.recognizeAnalyzedPage(
              pageAnalysis,
              settings.ocrLanguage,
              localTrainedData,
              (status, pct) => {
                setProgress({
                  phase: 'ocr',
                  currentPage: i + 1,
                  totalPages: total,
                  percent: Math.min(88, basePct + Math.round((pct / 100) * (85 / total))),
                  detail: `Page ${meta.pageNumber} (${i + 1}/${total}): ${status} ${pct}%`,
                });
              }
            );
            setCachedOcrLangs(getCachedOcrLanguages());
            const ch: OcrChapterContent = {
              sourcePage: meta.pageNumber,
              paragraphs: ocrRes.paragraphs,
              figures: ocrRes.figures,
              usedEmbeddedText: false,
              meanConfidence: ocrRes.meanConfidence,
              wordCount: ocrRes.wordCount,
              words: ocrRes.words,
            };
            chapters.push(ch);
            setOcrChaptersByPage((prev) => ({ ...prev, [meta.pageNumber]: ch }));
          }
          await new Promise((r) => setTimeout(r, 0));
        }

        const totalWords = chapters.reduce((sum, ch) => {
          const paraWords = ch.paragraphs
            .join(' ')
            .trim()
            .split(/\s+/)
            .filter(Boolean).length;
          return sum + (paraWords > 0 ? paraWords : ch.wordCount);
        }, 0);
        const figuresExtracted = chapters.reduce((sum, ch) => sum + ch.figures.length, 0);
        const ocrOnlyChapters = chapters.filter((ch) => !ch.usedEmbeddedText && ch.wordCount > 0);
        const meanOcrConfidence =
          ocrOnlyChapters.length > 0
            ? Math.round(
                ocrOnlyChapters.reduce((sum, ch) => sum + ch.meanConfidence, 0) /
                  ocrOnlyChapters.length
              )
            : undefined;
        const ocrStats: ExportBatchStats = {
          totalWords,
          estimatedReadingMinutes: Number((totalWords / 238).toFixed(2)),
          figuresExtracted,
          elapsedMs: Math.max(1, Math.round(performance.now() - exportStartTime)),
          wordCountBasis: 'ocr-text',
          meanOcrConfidence,
        };

        if (settings.outputFormat === 'pdf-ocr') {
          setProgress({
            phase: 'packaging',
            currentPage: total,
            totalPages: total,
            percent: 92,
            detail: `Typesetting reflowable vector PDF (${settings.targetWidthMm}×${settings.targetHeightMm} mm)…`,
          });
          const { blob, outputPageCount } = await buildOcrReflowPdfBlob(chapters, settings);
          ocrStats.elapsedMs = Math.max(1, Math.round(performance.now() - exportStartTime));
          finishExport(blob, 'pdf', total, outputPageCount, ocrStats);
        } else {
          setProgress({
            phase: 'packaging',
            currentPage: total,
            totalPages: total,
            percent: 92,
            detail: 'Packaging reflowable EPUB 3 archive…',
          });
          const blob = await buildTextEpubBlob(chapters, settings);
          ocrStats.elapsedMs = Math.max(1, Math.round(performance.now() - exportStartTime));
          finishExport(blob, 'epub', total, chapters.length, ocrStats);
        }
      } else {
        // Bitmap Reflow PDF or Offline Bitmap EPUB 3
        const analyses: PageAnalysis[] = [];
        for (let i = 0; i < total; i++) {
          if (abortExportRef.current) throw new Error('Conversion cancelled by user.');
          const meta = selectedPages[i];
          setProgress({
            phase: 'rendering',
            currentPage: i + 1,
            totalPages: total,
            percent: Math.round(((i + 0.5) / total) * 65),
            detail: `Cleaning, deskewing & segmenting page ${meta.pageNumber} (${i + 1}/${total})…`,
          });

          const rawCanvas = await pdfSessionRef.current.renderPageToCanvas(
            meta.pageNumber,
            exportDpi
          );
          if (abortExportRef.current) throw new Error('Conversion cancelled by user.');

          let effectiveRotation: RotationAngle = meta.rotationDeg;
          let orientedCanvas = rotateCanvas90(rawCanvas, effectiveRotation);
          if (settings.autoSmartRotate && effectiveRotation === 0) {
            const probe = enhanceScannedCanvas(orientedCanvas, settings.contrast, 'grayscale');
            const orient = detectSmartPageOrientation(probe.binary, probe.width, probe.height);
            if (orient.suggestedRotationDeg !== 0) {
              effectiveRotation = orient.suggestedRotationDeg;
              orientedCanvas = rotateCanvas90(rawCanvas, effectiveRotation);
            }
          }
          const swapDims = effectiveRotation === 90 || effectiveRotation === 270;

          const analyzed = analyzeScannedPage(
            orientedCanvas,
            meta.pageNumber,
            swapDims ? meta.heightMm : meta.widthMm,
            swapDims ? meta.widthMm : meta.heightMm,
            settings
          );
          analyses.push(analyzed);
          await new Promise((r) => setTimeout(r, 0));
        }

        setProgress({
          phase: 'reflowing',
          currentPage: total,
          totalPages: total,
          percent: 74,
          detail: `Reflowing words & figures onto ${settings.targetWidthMm}×${settings.targetHeightMm} mm screens…`,
        });
        await new Promise((r) => setTimeout(r, 10));

        const targetPxW = Math.max(
          720,
          Math.min(1400, Math.round((settings.targetWidthMm / 25.4) * exportDpi))
        );
        const needStrips = settings.outputFormat === 'epub-bitmap';
        const reflowedPages = reflowAnalyzedPages(analyses, settings, targetPxW, needStrips);

        if (abortExportRef.current) throw new Error('Conversion cancelled by user.');

        setProgress({
          phase: 'packaging',
          currentPage: total,
          totalPages: total,
          percent: 88,
          detail:
            settings.outputFormat === 'pdf'
              ? `Assembling ${reflowedPages.length}-page reflowed PDF…`
              : `Packaging ${reflowedPages.length}-screen offline EPUB 3…`,
        });

        const blob =
          settings.outputFormat === 'pdf'
            ? await buildReflowedPdfBlob(reflowedPages, settings, (c, t) => {
                setProgress({
                  phase: 'packaging',
                  currentPage: c,
                  totalPages: t,
                  percent: 88 + Math.round((c / Math.max(1, t)) * 11),
                  detail: `Embedding reflowed PDF page ${c} of ${t}…`,
                });
              })
            : await buildBitmapEpubBlob(reflowedPages, settings, (c, t) => {
                setProgress({
                  phase: 'packaging',
                  currentPage: c,
                  totalPages: t,
                  percent: 88 + Math.round((c / Math.max(1, t)) * 11),
                  detail: `Writing EPUB section ${c} of ${t}…`,
                });
              });

        const bitmapWords = reflowedPages.reduce((sum, p) => sum + p.wordCount, 0);
        const bitmapFigures = reflowedPages.reduce((sum, p) => sum + p.figureCount, 0);
        const bitmapStats: ExportBatchStats = {
          totalWords: bitmapWords,
          estimatedReadingMinutes: Number((bitmapWords / 238).toFixed(2)),
          figuresExtracted: bitmapFigures,
          elapsedMs: Math.max(1, Math.round(performance.now() - exportStartTime)),
          wordCountBasis: 'bitmap-tokens',
        };

        finishExport(
          blob,
          settings.outputFormat === 'pdf' ? 'pdf' : 'epub',
          total,
          reflowedPages.length,
          bitmapStats
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Conversion failed.';
      setProgress({
        phase: 'error',
        currentPage: 0,
        totalPages: total,
        percent: 0,
        detail: msg,
      });
    }
  }, [doc, settings, localTrainedData, ocrChaptersByPage]);

  const finishExport = (
    blob: Blob,
    ext: 'pdf' | 'epub',
    sourcePagesProcessed: number,
    outputPages: number,
    stats: ExportBatchStats
  ) => {
    const outFileName = resolveExportFileName({
      settings,
      sourceFileName: doc?.fileName || 'reflowed.pdf',
      selectedPageCount: sourcePagesProcessed,
    });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = outFileName;
    document.body.appendChild(a);
    a.click();
    a.remove();

    // Auto-increment the batch counter when custom naming uses {index}
    if (settings.customNamingEnabled && settings.namingPattern.includes('{index}')) {
      setSettings((prev) => ({
        ...prev,
        namingStartIndex: (prev.namingStartIndex ?? 1) + 1,
      }));
    }

    const now = new Date();
    const timeLabel = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const itemId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    setHistory((prev) => [
      {
        id: itemId,
        fileName: outFileName,
        format: settings.outputFormat,
        createdAt: timeLabel,
        createdAtIso: now.toISOString(),
        sourcePagesProcessed,
        outputPages,
        fileSizeBytes: blob.size,
        downloadUrl: url,
        stats,
      },
      ...prev,
    ]);
    setActiveSummaryId(itemId);

    setProgress({
      phase: 'done',
      currentPage: sourcePagesProcessed,
      totalPages: sourcePagesProcessed,
      percent: 100,
      detail: `Saved ${outFileName} (${outputPages} output ${ext === 'pdf' ? 'pages' : 'sections'})`,
    });
  };

  const handleClearHistory = useCallback(() => {
    setHistory((prev) => {
      prev.forEach((item) => URL.revokeObjectURL(item.downloadUrl));
      return [];
    });
    setActiveSummaryId(null);
  }, []);

  // Global keyboard shortcuts (arrows for page navigation, Ctrl/Cmd+E for export, Ctrl/Cmd+O for open, ? for help)
  useEffect(() => {
    const isExportBusy =
      progress.phase === 'rendering' ||
      progress.phase === 'reflowing' ||
      progress.phase === 'ocr' ||
      progress.phase === 'packaging';

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      if (e.key === 'Escape' && showShortcuts) {
        e.preventDefault();
        setShowShortcuts(false);
        return;
      }

      // Ctrl/Cmd + E -> Export view (or run export directly if already on Export tab)
      if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        if (!doc) {
          showFeedback('Open a PDF first');
          return;
        }
        if (activeTab === 'export') {
          if (!isExportBusy) {
            showFeedback('Building export…');
            void handleStartExport();
          }
        } else {
          setActiveTab('export');
          showFeedback('Export view');
        }
        return;
      }

      // Ctrl/Cmd + O -> Open PDF
      if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        globalFileInputRef.current?.click();
        return;
      }

      // Ctrl/Cmd + / -> Toggle keyboard shortcuts help
      if (mod && e.key === '/') {
        e.preventDefault();
        setShowShortcuts((open) => !open);
        return;
      }

      if (showShortcuts) return;
      if (isTypingTarget(e.target)) return;

      // ? -> Toggle keyboard shortcuts reference modal
      if (!mod && !e.altKey && e.key === '?') {
        e.preventDefault();
        setShowShortcuts((open) => !open);
        return;
      }

      // Alt + 1..4 -> Switch top-level workspace tabs
      if (e.altKey && !mod && !e.shiftKey) {
        if (e.key === '1') {
          e.preventDefault();
          setActiveTab('workbench');
          showFeedback('Workbench');
        } else if (e.key === '2' && doc) {
          e.preventDefault();
          setActiveTab('pages');
          showFeedback('Pages');
        } else if (e.key === '3' && doc) {
          e.preventDefault();
          setActiveTab('export');
          showFeedback('Export');
        } else if (e.key === '4') {
          e.preventDefault();
          setActiveTab('guide');
          showFeedback('Guide');
        }
        return;
      }

      // Workbench-level navigation & OCR shortcuts (plain keys, no modifiers)
      if (!mod && !e.altKey && !e.shiftKey && doc && activeTab === 'workbench') {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          if (activeSourcePage > 1) {
            const prev = activeSourcePage - 1;
            setActiveSourcePage(prev);
            showFeedback(`Source page ${prev} / ${doc.pageCount}`);
          }
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          if (activeSourcePage < doc.pageCount) {
            const next = activeSourcePage + 1;
            setActiveSourcePage(next);
            showFeedback(`Source page ${next} / ${doc.pageCount}`);
          }
        } else if (e.key.toLowerCase() === 'r') {
          const isOcrFormat =
            settings.outputFormat === 'pdf-ocr' || settings.outputFormat === 'epub-ocr';
          if (isOcrFormat) {
            e.preventDefault();
            showFeedback(`Running OCR on page ${activeSourcePage}`);
            void handleRunOcrPreview();
          }
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [
    doc,
    activeTab,
    activeSourcePage,
    showShortcuts,
    progress.phase,
    settings.outputFormat,
    handleStartExport,
    handleRunOcrPreview,
    showFeedback,
  ]);

  const modKey = getModKeyLabel();

  const navItems: { id: ActiveTab; label: string; requiresDoc?: boolean }[] = [
    { id: 'workbench', label: 'Workbench' },
    { id: 'pages', label: 'Pages', requiresDoc: true },
    { id: 'export', label: 'Export', requiresDoc: true },
    { id: 'guide', label: 'Guide' },
  ];

  const reviewedOcrCount = Object.keys(ocrChaptersByPage).length;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <input
        ref={globalFileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFileSelected(file);
          e.target.value = '';
        }}
      />

      {/* Strict 3-Zone Top Bar Contract (compact non-sticky on mobile so only bottom tab bar is fixed) */}
      <header className="md:sticky md:top-0 z-30 h-12 md:h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 lg:px-6 flex items-center justify-between gap-4 md:gap-8">
        <button
          type="button"
          onClick={() => setActiveTab('workbench')}
          className="font-display text-base md:text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0 cursor-pointer"
        >
          FolioReflow
        </button>

        <nav
          aria-label="Primary"
          className="hidden md:flex items-center gap-6 overflow-x-auto no-scrollbar"
        >
          {navItems.map((item) => {
            const disabled = Boolean(item.requiresDoc && !doc);
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={disabled}
                onClick={() => setActiveTab(item.id)}
                className={`relative py-4 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'text-slate-900 dark:text-slate-100'
                    : disabled
                      ? 'text-slate-400 dark:text-slate-600 cursor-not-allowed'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {item.label}
                {active && (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-700 dark:bg-blue-500" />
                )}
              </button>
            );
          })}
        </nav>

        <div className="shrink-0">
          {doc ? (
            <button
              type="button"
              onClick={() => setActiveTab('export')}
              title={`Export Book (${modKey}+E)`}
              className="rounded-lg bg-blue-700 px-3.5 md:px-4 py-1.5 md:py-2 text-xs font-semibold text-white hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
            >
              Export Book
            </button>
          ) : (
            <button
              type="button"
              onClick={() => globalFileInputRef.current?.click()}
              title={`Open PDF (${modKey}+O)`}
              className="rounded-lg bg-blue-700 px-3.5 md:px-4 py-1.5 md:py-2 text-xs font-semibold text-white hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
            >
              Open PDF
            </button>
          )}
        </div>
      </header>

      {loadError && (
        <div
          role="alert"
          className="border-b border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50 px-4 md:px-6 py-2.5 flex items-center justify-between gap-4 text-xs text-red-800 dark:text-red-300"
        >
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => setLoadError(null)}
            className="font-semibold underline whitespace-nowrap"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {(activeTab !== 'guide' || mobileSettingsOpen) && (
          <ConfigSidebar
            settings={settings}
            onChange={updateSettings}
            onReset={resetSettings}
            isDark={isDark}
            onToggleTheme={() => setIsDark((d) => !d)}
            onOpenShortcuts={() => setShowShortcuts(true)}
            mobileOpen={mobileSettingsOpen}
            onCloseMobile={() => setMobileSettingsOpen(false)}
          />
        )}

        <main className="flex-1 flex flex-col min-w-0 pb-20 md:pb-0">
          {activeTab === 'guide' ? (
            <GuideView />
          ) : !doc ? (
            <EmptyDropzone
              onFileSelected={(file) => void handleFileSelected(file)}
              onLoadSample={() => void handleLoadSample()}
              isLoading={isLoadingDoc}
              loadingLabel={loadingDocLabel}
            />
          ) : activeTab === 'pages' ? (
            <PagesView
              doc={doc}
              onTogglePage={handleTogglePage}
              onSetIncludedPages={handleSetIncludedPages}
              onInspectPage={(pageNum) => {
                setActiveSourcePage(pageNum);
                setActiveTab('workbench');
              }}
              onRotatePage90={handleRotatePage90}
              onSmartRotateAll={() => void handleSmartRotateAll()}
              isSmartRotatingAll={isSmartRotatingAll}
            />
          ) : activeTab === 'export' ? (
            <ExportView
              doc={doc}
              settings={settings}
              onChangeSettings={updateSettings}
              progress={progress}
              onStartExport={() => void handleStartExport()}
              onCancelExport={() => {
                abortExportRef.current = true;
              }}
              history={history}
              onClearHistory={handleClearHistory}
              activeSummaryId={activeSummaryId}
              onSelectSummary={setActiveSummaryId}
              onDismissSummary={() => setActiveSummaryId(null)}
              cachedOcrLangs={cachedOcrLangs}
              isCachingOcr={isCachingOcr}
              ocrCacheStatus={ocrCacheStatus}
              onPrecacheOcr={(lang) => void handlePrecacheOcr(lang)}
              localTrainedData={localTrainedData}
              onUploadLocalTrainedData={(file) => void handleUploadLocalTrainedData(file)}
              onClearLocalTrainedData={() => setLocalTrainedData(null)}
              reviewedOcrCount={reviewedOcrCount}
              onOpenMobileSettings={() => setMobileSettingsOpen(true)}
            />
          ) : (
            <WorkbenchView
              doc={doc}
              settings={settings}
              activeSourcePage={activeSourcePage}
              onChangeSourcePage={setActiveSourcePage}
              rawPageUrl={rawPageUrl}
              enhancedPageUrl={enhancedPageUrl}
              overlayPageUrl={overlayPageUrl}
              inspectionMode={inspectionMode}
              onChangeInspectionMode={setInspectionMode}
              analysis={analysis}
              previewPages={previewPages}
              ocrPdfPreviewPages={ocrPdfPreviewPages}
              isProcessingPreview={isProcessingPreview}
              onOpenNewPdf={() => globalFileInputRef.current?.click()}
              onGoToExport={() => setActiveTab('export')}
              ocrPreview={activeOcrChapter}
              isRunningOcrPreview={isRunningOcrPreview}
              ocrPreviewStatus={ocrPreviewStatus}
              ocrOfflineNotice={ocrOfflineNotice}
              autoLiveOcr={autoLiveOcr}
              onToggleAutoLiveOcr={(enabled) => {
                setOcrOfflineNotice(null);
                setAutoLiveOcr(enabled);
              }}
              onRunOcrPreview={() => void handleRunOcrPreview()}
              onEditOcrText={handleEditOcrText}
              shortcutsOpen={showShortcuts}
              onShortcutFeedback={showFeedback}
              pageRotationDeg={activePageRotation}
              onRotatePage90={() => handleRotatePage90(activeSourcePage)}
              onSmartRotatePage={() => void handleSmartRotatePage(activeSourcePage)}
              onOpenMobileSettings={() => setMobileSettingsOpen(true)}
            />
          )}
        </main>
      </div>

      {/* Mobile Thumb-Zone Fixed Bottom Navigation Bar */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md pb-safe"
      >
        <div className="grid grid-cols-5 h-15">
          {(
            [
              { id: 'workbench', label: 'Studio', icon: BookOpen, disabled: false },
              { id: 'pages', label: 'Pages', icon: LayoutGrid, disabled: !doc },
              { id: 'settings', label: 'Settings', icon: SlidersHorizontal, disabled: false },
              { id: 'export', label: 'Export', icon: Download, disabled: !doc },
              { id: 'guide', label: 'Guide', icon: BookMarked, disabled: false },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const isActive =
              item.id === 'settings'
                ? mobileSettingsOpen
                : !mobileSettingsOpen && activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={item.disabled}
                onClick={() => {
                  if (item.id === 'settings') {
                    setMobileSettingsOpen((open) => !open);
                  } else {
                    setMobileSettingsOpen(false);
                    setActiveTab(item.id);
                  }
                }}
                className={`relative flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'text-blue-700 dark:text-blue-400'
                    : item.disabled
                      ? 'text-slate-300 dark:text-slate-700 cursor-not-allowed'
                      : 'text-slate-600 dark:text-slate-400 active:text-slate-900 dark:active:text-slate-100'
                }`}
              >
                {isActive && (
                  <span className="absolute top-0 inset-x-3 h-0.5 bg-blue-700 dark:bg-blue-400 rounded-b" />
                )}
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Transient Keyboard Shortcut / Swipe Feedback */}
      {shortcutFeedback && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 md:bottom-4 right-4 z-40 rounded-lg border border-slate-700/40 bg-slate-900/92 dark:bg-slate-100/95 px-3 py-1.5 font-mono text-xs font-medium text-white dark:text-slate-900 shadow-lg pointer-events-none"
        >
          {shortcutFeedback}
        </div>
      )}

      <ShortcutsModal isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />
      <OfflineIndicator />
    </div>
  );
}
