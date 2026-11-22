import React, { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Compass,
  Edit3,
  Eye,
  FileUp,
  Loader2,
  RefreshCw,
  RotateCw,
  ScanText,
  Settings2,
  SlidersHorizontal,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { OcrPreviewPage } from '../engine/exporters';
import type {
  LoadedDocument,
  OcrChapterContent,
  PageAnalysis,
  ReflowedPage,
  ReflowSettings,
  RotationAngle,
} from '../engine/types';
import { isTypingTarget } from '../hooks/useKeyboardShortcuts';

export type InspectionMode = 'raw' | 'layout' | 'words';
type PreviewLayoutMode = 'split' | 'reader' | 'compare';
type ReaderLighting = 'paper' | 'sepia' | 'night';

interface WorkbenchViewProps {
  doc: LoadedDocument;
  settings: ReflowSettings;
  activeSourcePage: number;
  onChangeSourcePage: (page: number) => void;
  rawPageUrl: string | null;
  enhancedPageUrl: string | null;
  overlayPageUrl: string | null;
  inspectionMode: InspectionMode;
  onChangeInspectionMode: (mode: InspectionMode) => void;
  analysis: PageAnalysis | null;
  previewPages: ReflowedPage[];
  ocrPdfPreviewPages: OcrPreviewPage[];
  isProcessingPreview: boolean;
  onOpenNewPdf: () => void;
  onGoToExport: () => void;
  ocrPreview: OcrChapterContent | null;
  isRunningOcrPreview: boolean;
  ocrPreviewStatus: string;
  ocrOfflineNotice: string | null;
  autoLiveOcr: boolean;
  onToggleAutoLiveOcr: (enabled: boolean) => void;
  onRunOcrPreview: () => void;
  onEditOcrText: (pageNumber: number, nextParagraphs: string[]) => void;
  shortcutsOpen: boolean;
  onShortcutFeedback: (message: string) => void;
  pageRotationDeg: RotationAngle;
  onRotatePage90: () => void;
  onSmartRotatePage: () => void;
  onOpenMobileSettings?: () => void;
}

export const WorkbenchView: React.FC<WorkbenchViewProps> = ({
  doc,
  settings,
  activeSourcePage,
  onChangeSourcePage,
  rawPageUrl,
  enhancedPageUrl,
  overlayPageUrl,
  inspectionMode,
  onChangeInspectionMode,
  analysis,
  previewPages,
  ocrPdfPreviewPages,
  isProcessingPreview,
  onOpenNewPdf,
  onGoToExport,
  ocrPreview,
  isRunningOcrPreview,
  ocrPreviewStatus,
  ocrOfflineNotice,
  autoLiveOcr,
  onToggleAutoLiveOcr,
  onRunOcrPreview,
  onEditOcrText,
  shortcutsOpen,
  onShortcutFeedback,
  pageRotationDeg,
  onRotatePage90,
  onSmartRotatePage,
  onOpenMobileSettings,
}) => {
  const [activeOutputIdx, setActiveOutputIdx] = useState(0);
  const [zoomPct, setZoomPct] = useState(100);
  const [ocrPaneTab, setOcrPaneTab] = useState<'preview' | 'edit'>('preview');
  const [layoutMode, setLayoutMode] = useState<PreviewLayoutMode>('split');
  const [mobileSplitPane, setMobileSplitPane] = useState<'preview' | 'source'>('preview');
  const [readerLighting, setReaderLighting] = useState<ReaderLighting>('paper');
  const [compareSplitPct, setCompareSplitPct] = useState(50);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);

  // Reset output page index when source page changes
  useEffect(() => {
    setActiveOutputIdx(0);
  }, [activeSourcePage, settings.outputFormat]);

  const isOcrFormat = settings.outputFormat === 'pdf-ocr' || settings.outputFormat === 'epub-ocr';
  const hasOcrPdfPages = settings.outputFormat === 'pdf-ocr' && ocrPdfPreviewPages.length > 0;
  // Fall back to instant live bitmap reflow preview while OCR is running or offline-uncached
  const showingBitmapFallback = isOcrFormat && !ocrPreview && previewPages.length > 0;

  const activePaginatedList: { index: number; dataUrl: string }[] = hasOcrPdfPages
    ? ocrPdfPreviewPages
    : previewPages;
  const clampedOutputIdx = Math.min(activeOutputIdx, Math.max(0, activePaginatedList.length - 1));
  const currentOutputPage = activePaginatedList[clampedOutputIdx] || null;
  const sourceMeta = doc.pages[activeSourcePage - 1];
  const includedCount = doc.pages.filter((p) => p.included).length;
  const isQuarterTurn = pageRotationDeg === 90 || pageRotationDeg === 270;
  const displayWidthMm = sourceMeta
    ? isQuarterTurn
      ? sourceMeta.heightMm
      : sourceMeta.widthMm
    : 0;
  const displayHeightMm = sourceMeta
    ? isQuarterTurn
      ? sourceMeta.widthMm
      : sourceMeta.heightMm
    : 0;
  const suggestedRotationDeg = analysis?.orientation.suggestedRotationDeg ?? 0;

  // Workbench-scoped keyboard shortcuts (view modes, output screens, zoom, overlays, lighting, text editor)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (shortcutsOpen) return;

      // Allow Esc to exit the OCR text editor even while textarea is focused
      if (e.key === 'Escape' && ocrPaneTab === 'edit') {
        e.preventDefault();
        setOcrPaneTab('preview');
        onShortcutFeedback('Reflow preview');
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      // Shift + Left/Right or [ / ] steps reflowed e-reader screens
      if (
        (e.shiftKey && e.key === 'ArrowLeft') ||
        (!e.shiftKey && e.key === '[')
      ) {
        if (activePaginatedList.length > 1) {
          e.preventDefault();
          const next = Math.max(0, clampedOutputIdx - 1);
          setActiveOutputIdx(next);
          onShortcutFeedback(`Screen ${next + 1} / ${activePaginatedList.length}`);
        }
        return;
      }
      if (
        (e.shiftKey && e.key === 'ArrowRight') ||
        (!e.shiftKey && e.key === ']')
      ) {
        if (activePaginatedList.length > 1) {
          e.preventDefault();
          const next = Math.min(activePaginatedList.length - 1, clampedOutputIdx + 1);
          setActiveOutputIdx(next);
          onShortcutFeedback(`Screen ${next + 1} / ${activePaginatedList.length}`);
        }
        return;
      }

      if (e.shiftKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        onRotatePage90();
        return;
      }

      if (e.shiftKey) return;

      const key = e.key.toLowerCase();
      if (key === 'a') {
        e.preventDefault();
        onSmartRotatePage();
      } else if (key === '1') {
        e.preventDefault();
        setLayoutMode('split');
        onShortcutFeedback('Split view');
      } else if (key === '2') {
        e.preventDefault();
        setLayoutMode('reader');
        onShortcutFeedback('Reader spread');
      } else if (key === '3') {
        e.preventDefault();
        setLayoutMode('compare');
        onShortcutFeedback('Before/After compare');
      } else if (key === 'v') {
        e.preventDefault();
        const order: InspectionMode[] = ['raw', 'layout', 'words'];
        const labels: Record<InspectionMode, string> = {
          raw: 'Raw scan',
          layout: 'Columns & crop overlay',
          words: 'Word / OCR boxes',
        };
        const next = order[(order.indexOf(inspectionMode) + 1) % order.length];
        onChangeInspectionMode(next);
        onShortcutFeedback(labels[next]);
      } else if (key === 'l') {
        e.preventDefault();
        const order: ReaderLighting[] = ['paper', 'sepia', 'night'];
        const labels: Record<ReaderLighting, string> = {
          paper: 'Paper screen',
          sepia: 'Sepia screen',
          night: 'Night e-ink',
        };
        const next = order[(order.indexOf(readerLighting) + 1) % order.length];
        setReaderLighting(next);
        onShortcutFeedback(labels[next]);
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        const next = Math.min(160, zoomPct + 15);
        setZoomPct(next);
        onShortcutFeedback(`Zoom ${next}%`);
      } else if (e.key === '-') {
        e.preventDefault();
        const next = Math.max(60, zoomPct - 15);
        setZoomPct(next);
        onShortcutFeedback(`Zoom ${next}%`);
      } else if (key === '0') {
        e.preventDefault();
        setZoomPct(100);
        onShortcutFeedback('Zoom 100%');
      } else if (key === 't' && isOcrFormat && ocrPreview) {
        e.preventDefault();
        const next = ocrPaneTab === 'preview' ? 'edit' : 'preview';
        setOcrPaneTab(next);
        onShortcutFeedback(next === 'edit' ? 'Edit OCR text' : 'Reflow preview');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    shortcutsOpen,
    ocrPaneTab,
    activePaginatedList.length,
    clampedOutputIdx,
    inspectionMode,
    readerLighting,
    zoomPct,
    isOcrFormat,
    ocrPreview,
    onChangeInspectionMode,
    onShortcutFeedback,
    onRotatePage90,
    onSmartRotatePage,
  ]);

  const sourceImgSrc = inspectionMode === 'raw' ? rawPageUrl : overlayPageUrl || rawPageUrl;
  const hasOcrWordOverlay = Boolean(ocrPreview && ocrPreview.words.length > 0);

  // Visual filter classes for realistic e-reader lighting preview
  const readerFilterStyle: React.CSSProperties =
    readerLighting === 'sepia'
      ? { filter: 'sepia(0.28) brightness(0.97) contrast(1.02)' }
      : readerLighting === 'night'
        ? { filter: 'invert(0.92) hue-rotate(180deg)' }
        : {};

  // Horizontal swipe gesture on touchscreens to flip output screens or source pages
  const handlePreviewTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1 || ocrPaneTab === 'edit') return;
    swipeStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handlePreviewTouchEnd = (e: React.TouchEvent) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.4) return;

    if (dx < 0) {
      // Swipe left -> next reflow screen, or next source page at end
      if (activePaginatedList.length > 1 && clampedOutputIdx < activePaginatedList.length - 1) {
        const next = clampedOutputIdx + 1;
        setActiveOutputIdx(next);
        onShortcutFeedback(`Screen ${next + 1} / ${activePaginatedList.length}`);
      } else if (activeSourcePage < doc.pageCount) {
        const nextPage = activeSourcePage + 1;
        onChangeSourcePage(nextPage);
        onShortcutFeedback(`Source page ${nextPage} / ${doc.pageCount}`);
      }
    } else {
      // Swipe right -> previous reflow screen, or previous source page at start
      if (activePaginatedList.length > 1 && clampedOutputIdx > 0) {
        const prev = clampedOutputIdx - 1;
        setActiveOutputIdx(prev);
        onShortcutFeedback(`Screen ${prev + 1} / ${activePaginatedList.length}`);
      } else if (activeSourcePage > 1) {
        const prevPage = activeSourcePage - 1;
        onChangeSourcePage(prevPage);
        onShortcutFeedback(`Source page ${prevPage} / ${doc.pageCount}`);
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-slate-950">
      {/* Contextual Workspace Utility Bar */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 sm:px-4 lg:px-6 py-2.5 flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2.5 sm:gap-3">
        <div className="flex items-center justify-between sm:justify-start gap-2 sm:gap-3 min-w-0">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[155px] sm:max-w-[260px]">
                {doc.fileName}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums whitespace-nowrap">
                {sourceMeta ? `${displayWidthMm}×${displayHeightMm} mm` : ''}
              </span>
              <span aria-hidden="true" className="hidden md:inline">
                ·
              </span>
              <span className="font-mono tabular-nums whitespace-nowrap hidden md:inline">
                {includedCount}/{doc.pageCount} pages
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {onOpenMobileSettings && (
              <button
                type="button"
                onClick={onOpenMobileSettings}
                className="lg:hidden inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-blue-600/60 bg-blue-50 dark:bg-blue-950/40 px-2.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950/70 transition-colors whitespace-nowrap shrink-0"
              >
                <Settings2 className="w-3.5 h-3.5" />
                Tune
              </button>
            )}
            <button
              type="button"
              onClick={onOpenNewPdf}
              className="inline-flex min-h-[36px] sm:min-h-0 items-center gap-1.5 rounded-md border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <FileUp className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Replace PDF</span>
              <span className="sm:hidden">Open</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto no-scrollbar pb-0.5 sm:pb-0 sm:flex-wrap">
          {/* Source Page Stepper */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              disabled={activeSourcePage <= 1}
              onClick={() => onChangeSourcePage(activeSourcePage - 1)}
              aria-label="Previous source page"
              title="Previous source page (←)"
              className="inline-flex min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0 items-center justify-center rounded-md border border-slate-300 dark:border-slate-700 p-1.5 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            </button>
            <span className="px-1.5 sm:px-2 font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
              <span className="hidden sm:inline">Source </span>
              {activeSourcePage} / {doc.pageCount}
            </span>
            <button
              type="button"
              disabled={activeSourcePage >= doc.pageCount}
              onClick={() => onChangeSourcePage(activeSourcePage + 1)}
              aria-label="Next source page"
              title="Next source page (→)"
              className="inline-flex min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0 items-center justify-center rounded-md border border-slate-300 dark:border-slate-700 p-1.5 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
            >
              <ChevronRight className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            </button>
          </div>

          {/* 90° Rotation & Smart Rotate Controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onRotatePage90}
              title="Rotate active page 90° clockwise (Shift+R)"
              className="inline-flex min-h-[36px] sm:min-h-0 items-center gap-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCw className="w-3.5 h-3.5" />
              {pageRotationDeg === 0 ? '90°' : `${pageRotationDeg}°`}
            </button>
            <button
              type="button"
              onClick={onSmartRotatePage}
              title={
                analysis?.orientation.reason
                  ? `${analysis.orientation.reason} (A)`
                  : 'Detect page orientation via layout analysis (A)'
              }
              className={`inline-flex min-h-[36px] sm:min-h-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                suggestedRotationDeg !== 0
                  ? 'border-blue-600/70 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950/80'
                  : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              Smart Rotate
            </button>
          </div>

          {/* Preview Layout Switcher: Split / Reader Spread / Before-After Compare */}
          <div
            role="radiogroup"
            aria-label="Live preview layout"
            className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 shrink-0"
          >
            {(
              [
                { id: 'split', label: 'Split', mobileLabel: 'Single', icon: Columns2, keyHint: '1' },
                { id: 'reader', label: 'Reader', mobileLabel: 'Spread', icon: BookOpen, keyHint: '2' },
                { id: 'compare', label: 'Compare', mobileLabel: 'Compare', icon: SlidersHorizontal, keyHint: '3' },
              ] as const
            ).map((m) => {
              const Icon = m.icon;
              const active = layoutMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  title={`${m.label} layout (${m.keyHint})`}
                  onClick={() => setLayoutMode(m.id)}
                  className={`inline-flex min-h-[32px] sm:min-h-0 items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  <span className="hidden xl:inline">{m.label}</span>
                  <span className="xl:hidden">{m.mobileLabel}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Live Analysis & Preview Controls Strip (unboxed tabular metadata) */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 sm:px-4 lg:px-6 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[11px] tabular-nums">
          <span>
            Deskew:{' '}
            <strong className="font-semibold text-slate-900 dark:text-slate-200">
              {analysis
                ? `${analysis.skewDeg >= 0 ? '+' : ''}${analysis.skewDeg.toFixed(2)}°`
                : '—'}
            </strong>
          </span>
          {pageRotationDeg !== 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span>
                Rotation:{' '}
                <strong className="font-semibold text-slate-900 dark:text-slate-200">
                  {pageRotationDeg}°
                </strong>
              </span>
            </>
          )}
          {suggestedRotationDeg !== 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1.5">
                Orientation:{' '}
                <strong className="font-semibold text-blue-700 dark:text-blue-400">
                  Suggest +{suggestedRotationDeg}°
                </strong>
                <button
                  type="button"
                  onClick={onSmartRotatePage}
                  className="font-sans text-[11px] font-semibold text-blue-700 dark:text-blue-400 hover:underline whitespace-nowrap"
                >
                  Apply
                </button>
              </span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span>
            Regions:{' '}
            <strong className="font-semibold text-slate-900 dark:text-slate-200">
              {analysis ? analysis.columns.length : '—'}
            </strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Figures:{' '}
            <strong className="font-semibold text-slate-900 dark:text-slate-200">
              {analysis ? analysis.figureCount : '—'}
            </strong>
          </span>
          {ocrPreview ? (
            <>
              <span aria-hidden="true">·</span>
              <span>
                OCR:{' '}
                <strong className="font-semibold text-emerald-700 dark:text-emerald-400">
                  {ocrPreview.wordCount} words
                  {!ocrPreview.usedEmbeddedText && ocrPreview.meanConfidence > 0
                    ? ` (${ocrPreview.meanConfidence}%)`
                    : ''}
                  {ocrPreview.isEdited ? ' · Edited' : ''}
                </strong>
              </span>
            </>
          ) : (
            <>
              <span aria-hidden="true">·</span>
              <span>
                Words:{' '}
                <strong className="font-semibold text-slate-900 dark:text-slate-200">
                  {analysis ? analysis.wordCount : '—'}
                </strong>
              </span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span>
            Screens:{' '}
            <strong className="font-semibold text-blue-700 dark:text-blue-400">
              {activePaginatedList.length}
            </strong>
          </span>
        </div>

        {/* Right Controls: Reader Lighting + Auto Live OCR + Zoom */}
        <div className="flex flex-wrap items-center gap-3">
          {layoutMode !== 'compare' && (
            <div className="flex items-center gap-1 text-[11px]">
              <span className="text-slate-500 dark:text-slate-400 hidden sm:inline">Screen:</span>
              <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-slate-200/70 dark:bg-slate-800">
                {(
                  [
                    { id: 'paper', label: 'Paper' },
                    { id: 'sepia', label: 'Sepia' },
                    { id: 'night', label: 'Night' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setReaderLighting(t.id)}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
                      readerLighting === t.id
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isOcrFormat && (
            <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none whitespace-nowrap">
              <input
                type="checkbox"
                checked={autoLiveOcr}
                onChange={(e) => onToggleAutoLiveOcr(e.target.checked)}
                className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
              />
              Auto Live OCR
            </label>
          )}

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setZoomPct((z) => Math.max(60, z - 15))}
              aria-label="Zoom out preview"
              className="rounded p-1 text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono text-[11px] tabular-nums w-9 text-center">{zoomPct}%</span>
            <button
              type="button"
              onClick={() => setZoomPct((z) => Math.min(160, z + 15))}
              aria-label="Zoom in preview"
              className="rounded p-1 text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile/Tablet Single-Pane Switcher when in Split Mode (< xl) */}
      {layoutMode === 'split' && (
        <div className="xl:hidden border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2">
          <div
            role="tablist"
            aria-label="Inspect source or live preview"
            className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mobileSplitPane === 'preview'}
              onClick={() => setMobileSplitPane('preview')}
              className={`min-h-[36px] rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                mobileSplitPane === 'preview'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Live Reflow Preview
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mobileSplitPane === 'source'}
              onClick={() => setMobileSplitPane('source')}
              className={`min-h-[36px] rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                mobileSplitPane === 'source'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Source Scan &amp; Overlay
            </button>
          </div>
        </div>
      )}

      {/* Main Viewport: Split / Reader Spread / Before-After Compare */}
      {layoutMode === 'compare' ? (
        <BeforeAfterComparePane
          pageNumber={activeSourcePage}
          rawUrl={rawPageUrl}
          cleanedUrl={enhancedPageUrl}
          splitPct={compareSplitPct}
          onChangeSplitPct={setCompareSplitPct}
          zoomPct={zoomPct}
          isProcessing={isProcessingPreview}
        />
      ) : (
        <div
          className={`flex-1 grid min-h-[420px] xl:min-h-[540px] ${
            layoutMode === 'split'
              ? 'grid-cols-1 xl:grid-cols-2 xl:divide-x divide-slate-200 dark:divide-slate-800'
              : 'grid-cols-1'
          }`}
        >
          {/* Left Pane: Source Scan Inspection (visible side-by-side on xl, or via mobile tab) */}
          {layoutMode === 'split' && (
            <div
              className={`${
                mobileSplitPane === 'source' ? 'flex' : 'hidden xl:flex'
              } flex-col min-h-[400px]`}
            >
              <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/70 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-slate-500" />
                  Source Page {activeSourcePage}
                </span>

                <div
                  role="radiogroup"
                  aria-label="Source inspection overlay"
                  className="flex items-center gap-0.5 p-0.5 rounded-md bg-slate-100 dark:bg-slate-800"
                >
                  {(
                    [
                      { id: 'raw', label: 'Raw Scan' },
                      { id: 'layout', label: 'Columns & Crop' },
                      { id: 'words', label: hasOcrWordOverlay ? 'OCR Boxes' : 'Word Boxes' },
                    ] as const
                  ).map((m) => {
                    const active = inspectionMode === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => onChangeInspectionMode(m.id)}
                        className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                          active
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex-1 overflow-auto workbench-grid p-3 sm:p-6 flex items-start justify-center">
                {sourceImgSrc ? (
                  <div
                    style={{ width: `${Math.round(460 * (zoomPct / 100))}px` }}
                    className="max-w-full bg-white shadow-md border border-slate-300/80 dark:border-slate-700"
                  >
                    <img
                      src={sourceImgSrc}
                      alt={`Source PDF page ${activeSourcePage}`}
                      className="w-full h-auto block"
                    />
                  </div>
                ) : (
                  <div className="my-auto flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Rendering source scan…
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Right Pane (or Full-Width in Reader Mode): Always-Live E-Reader Reflow Preview */}
          <div
            className={`${
              layoutMode === 'split' && mobileSplitPane === 'source' ? 'hidden xl:flex' : 'flex'
            } flex-col min-h-[400px]`}
          >
            <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/70 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {settings.outputFormat === 'pdf-ocr'
                    ? 'Live OCR Reflow PDF'
                    : settings.outputFormat === 'epub-ocr'
                      ? 'Live OCR EPUB 3'
                      : settings.outputFormat === 'epub-bitmap'
                        ? 'Live Bitmap EPUB 3'
                        : 'Live Bitmap Reflow PDF'}
                </span>
                {isProcessingPreview && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {isOcrFormat && ocrPreview && (
                  <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-slate-100 dark:bg-slate-800">
                    <button
                      type="button"
                      onClick={() => setOcrPaneTab('preview')}
                      className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                        ocrPaneTab === 'preview'
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                      }`}
                    >
                      Reflow Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => setOcrPaneTab('edit')}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                        ocrPaneTab === 'edit'
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                      }`}
                    >
                      <Edit3 className="w-3 h-3" />
                      Edit Text
                    </button>
                  </div>
                )}

                {isOcrFormat && (
                  <button
                    type="button"
                    disabled={isRunningOcrPreview}
                    onClick={onRunOcrPreview}
                    className="inline-flex items-center gap-1.5 rounded-md bg-blue-700 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-blue-800 disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    {isRunningOcrPreview ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : ocrPreview ? (
                      <RefreshCw className="w-3 h-3" />
                    ) : (
                      <ScanText className="w-3 h-3" />
                    )}
                    {isRunningOcrPreview
                      ? ocrPreviewStatus || 'Extracting…'
                      : ocrPreview
                        ? 'Re-run OCR'
                        : 'Run OCR'}
                  </button>
                )}

                {(!isOcrFormat || settings.outputFormat === 'pdf-ocr' || showingBitmapFallback) &&
                  ocrPaneTab === 'preview' &&
                  activePaginatedList.length > 0 && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={clampedOutputIdx <= 0}
                        onClick={() => setActiveOutputIdx((i) => Math.max(0, i - 1))}
                        aria-label="Previous reflowed screen"
                        className="rounded border border-slate-300 dark:border-slate-700 p-1 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
                      >
                        <ChevronLeft className="w-3 h-3" />
                      </button>
                      <span className="font-mono text-[11px] tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap px-1">
                        {clampedOutputIdx + 1} / {activePaginatedList.length}
                      </span>
                      <button
                        type="button"
                        disabled={clampedOutputIdx >= activePaginatedList.length - 1}
                        onClick={() =>
                          setActiveOutputIdx((i) => Math.min(activePaginatedList.length - 1, i + 1))
                        }
                        aria-label="Next reflowed screen"
                        className="rounded border border-slate-300 dark:border-slate-700 p-1 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
                      >
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  )}
              </div>
            </div>

            {/* Live OCR Status / Offline Fallback Notice Bar */}
            {(isRunningOcrPreview || ocrOfflineNotice) && (
              <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-1.5 flex items-center justify-between gap-2 text-[11px]">
                {isRunningOcrPreview ? (
                  <span className="flex items-center gap-2 text-blue-700 dark:text-blue-400 font-medium">
                    <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                    <span>
                      Live OCR running on Page {activeSourcePage}:{' '}
                      {ocrPreviewStatus || 'analyzing text…'} (showing instant bitmap preview)
                    </span>
                  </span>
                ) : (
                  <span className="text-amber-700 dark:text-amber-400">{ocrOfflineNotice}</span>
                )}
              </div>
            )}

            <div
              onTouchStart={handlePreviewTouchStart}
              onTouchEnd={handlePreviewTouchEnd}
              className="flex-1 overflow-auto workbench-grid p-3 sm:p-6 flex flex-col items-center justify-start gap-4 sm:gap-5"
            >
              {isOcrFormat && ocrPreview && ocrPaneTab === 'edit' ? (
                /* Editable OCR Text Review Pane */
                <div className="w-full max-w-xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      Extracted Text · Page {activeSourcePage}
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                      Blank line separates paragraphs
                    </span>
                  </div>
                  <textarea
                    value={ocrPreview.paragraphs.join('\n\n')}
                    onChange={(e) => {
                      const paras = e.target.value
                        .split(/\n{2,}/)
                        .map((p) => p.replace(/\n/g, ' ').trim())
                        .filter(Boolean);
                      onEditOcrText(activeSourcePage, paras);
                    }}
                    rows={18}
                    className="w-full p-4 font-sans text-sm leading-relaxed text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 focus:outline-none resize-y"
                  />
                  <div className="px-4 py-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span>Changes reflow live into Preview and carry into Export.</span>
                    <button
                      type="button"
                      onClick={() => setOcrPaneTab('preview')}
                      className="font-semibold text-blue-700 dark:text-blue-400 hover:underline whitespace-nowrap ml-3"
                    >
                      Back to Live Preview →
                    </button>
                  </div>
                </div>
              ) : settings.outputFormat === 'epub-ocr' && ocrPreview ? (
                /* Live Reflowable OCR EPUB Reader Frame */
                <div
                  style={{ width: `${Math.round(410 * (zoomPct / 100))}px` }}
                  className={`max-w-full rounded-[20px] border-[11px] border-slate-800 dark:border-slate-700 shadow-lg overflow-hidden transition-colors ${
                    readerLighting === 'night'
                      ? 'bg-slate-950 text-slate-100'
                      : readerLighting === 'sepia'
                        ? 'bg-[#F5EEDB] text-stone-900'
                        : 'bg-[#FBFBF9] text-slate-900'
                  }`}
                >
                  <div
                    className="px-6 py-6 min-h-[480px] space-y-3.5"
                    style={{
                      fontFamily:
                        settings.ocrFontFamily === 'sans'
                          ? 'var(--font-sans)'
                          : 'Georgia, "Times New Roman", serif',
                      fontSize: `${Math.max(12, Math.round(settings.ocrFontSizePt * 1.35))}px`,
                      lineHeight: settings.lineSpacing,
                    }}
                  >
                    <div className="flex items-center justify-between border-b border-current/15 pb-2 font-sans text-[11px] opacity-60">
                      <span>Source Page {ocrPreview.sourcePage}</span>
                      <span>
                        {ocrPreview.usedEmbeddedText
                          ? 'Embedded Text'
                          : `OCR · ${ocrPreview.meanConfidence}% conf`}
                      </span>
                    </div>
                    {ocrPreview.paragraphs.length > 0 ? (
                      ocrPreview.paragraphs.map((p, idx) => (
                        <p
                          key={idx}
                          className={
                            settings.preserveParagraphIndent && idx > 0 ? 'indent-5' : ''
                          }
                        >
                          {p}
                        </p>
                      ))
                    ) : (
                      <p className="text-xs font-sans opacity-60">
                        No readable text found on this page.
                      </p>
                    )}
                    {ocrPreview.figures.map((fig, idx) => (
                      <figure key={idx} className="my-4 border border-current/15 p-2 bg-white">
                        <img
                          src={fig.dataUrl}
                          alt={`Extracted figure ${idx + 1}`}
                          className="max-w-full h-auto mx-auto"
                        />
                      </figure>
                    ))}
                  </div>
                </div>
              ) : currentOutputPage ? (
                /* Live Paginated E-Reader Preview (OCR Vector PDF or Bitmap Reflow) */
                <>
                  {layoutMode === 'reader' && activePaginatedList.length > 1 ? (
                    /* Multi-Page Live Spread View in Reader Mode */
                    <div className="flex flex-wrap items-start justify-center gap-6 w-full">
                      {activePaginatedList.map((pg, idx) => (
                        <div
                          key={pg.index}
                          onClick={() => setActiveOutputIdx(idx)}
                          style={{ width: `${Math.round(350 * (zoomPct / 100))}px` }}
                          className={`max-w-full rounded-[20px] border-[10px] bg-white shadow-lg overflow-hidden cursor-pointer transition-all ${
                            idx === clampedOutputIdx
                              ? 'border-blue-700 dark:border-blue-500'
                              : 'border-slate-800 dark:border-slate-700'
                          }`}
                        >
                          <img
                            src={pg.dataUrl}
                            alt={`Reflowed output page ${pg.index}`}
                            style={readerFilterStyle}
                            className="w-full h-auto block"
                          />
                          <div className="border-t border-slate-200 bg-slate-50 px-3 py-1.5 flex items-center justify-between font-mono text-[10px] tabular-nums text-slate-500">
                            <span>
                              {hasOcrPdfPages
                                ? `Vector OCR · ${settings.ocrFontSizePt}pt`
                                : showingBitmapFallback
                                  ? 'Instant Bitmap Preview'
                                  : `${settings.targetWidthMm}×${settings.targetHeightMm} mm`}
                            </span>
                            <span>
                              Page {pg.index} / {activePaginatedList.length}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* Focused Single E-Reader Bezel Frame */
                    <div
                      style={{ width: `${Math.round(375 * (zoomPct / 100))}px` }}
                      className="max-w-full rounded-[20px] border-[11px] border-slate-800 dark:border-slate-700 bg-white shadow-lg overflow-hidden"
                    >
                      <img
                        src={currentOutputPage.dataUrl}
                        alt={`Reflowed output page ${currentOutputPage.index}`}
                        style={readerFilterStyle}
                        className="w-full h-auto block"
                      />
                      <div className="border-t border-slate-200 bg-slate-50 px-3 py-1.5 flex items-center justify-between font-mono text-[10px] tabular-nums text-slate-500">
                        <span>
                          {hasOcrPdfPages
                            ? `${settings.targetWidthMm}×${settings.targetHeightMm} mm · ${settings.ocrFontSizePt}pt ${settings.ocrFontFamily}`
                            : showingBitmapFallback
                              ? 'Instant Bitmap Preview (OCR pending)'
                              : `${settings.targetWidthMm}×${settings.targetHeightMm} mm`}
                        </span>
                        <span>
                          Screen {currentOutputPage.index} / {activePaginatedList.length}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Interactive Output Page Thumbnail Filmstrip */}
                  {layoutMode === 'split' && activePaginatedList.length > 1 && (
                    <div className="flex items-center gap-2.5 flex-wrap justify-center">
                      {activePaginatedList.map((pg, idx) => (
                        <button
                          key={pg.index}
                          type="button"
                          onClick={() => setActiveOutputIdx(idx)}
                          className={`group flex flex-col items-center gap-1 rounded-lg border p-1 bg-white dark:bg-slate-900 transition-colors ${
                            idx === clampedOutputIdx
                              ? 'border-blue-600 ring-1 ring-blue-600/30'
                              : 'border-slate-200 dark:border-slate-700 hover:border-slate-400'
                          }`}
                        >
                          <img
                            src={pg.dataUrl}
                            alt={`Thumbnail page ${pg.index}`}
                            style={readerFilterStyle}
                            className="h-14 w-auto object-contain rounded-xs"
                          />
                          <span className="font-mono text-[10px] tabular-nums text-slate-600 dark:text-slate-400">
                            {pg.index}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={onGoToExport}
                      className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline"
                    >
                      Ready to export? Convert all {includedCount} selected pages in Export →
                    </button>
                  </div>
                </>
              ) : (
                <div className="my-auto flex items-center gap-2 text-xs text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating live reflow preview…
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface BeforeAfterComparePaneProps {
  pageNumber: number;
  rawUrl: string | null;
  cleanedUrl: string | null;
  splitPct: number;
  onChangeSplitPct: (pct: number) => void;
  zoomPct: number;
  isProcessing: boolean;
}

const BeforeAfterComparePane: React.FC<BeforeAfterComparePaneProps> = ({
  pageNumber,
  rawUrl,
  cleanedUrl,
  splitPct,
  onChangeSplitPct,
  zoomPct,
  isProcessing,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const updateFromPointer = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const pct = Math.max(2, Math.min(98, Math.round(((clientX - rect.left) / rect.width) * 100)));
    onChangeSplitPct(pct);
  };

  return (
    <div className="flex-1 flex flex-col min-h-[540px]">
      <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/70 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-slate-800 dark:text-slate-200">
          Live Cleanup Compare · Page {pageNumber}
        </span>
        <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
          <span>Left: Original Scan</span>
          <span aria-hidden="true">·</span>
          <span>Right: Deskewed &amp; Enhanced</span>
          <input
            type="range"
            min={2}
            max={98}
            value={splitPct}
            onChange={(e) => onChangeSplitPct(Number(e.target.value))}
            aria-label="Compare split position"
            className="studio-slider w-24"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto workbench-grid p-3 sm:p-6 flex items-start justify-center">
        {rawUrl && cleanedUrl ? (
          <div
            ref={containerRef}
            onPointerDown={(e) => {
              draggingRef.current = true;
              (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
              updateFromPointer(e.clientX);
            }}
            onPointerMove={(e) => {
              if (draggingRef.current) updateFromPointer(e.clientX);
            }}
            onPointerUp={() => {
              draggingRef.current = false;
            }}
            onPointerCancel={() => {
              draggingRef.current = false;
            }}
            style={{ width: `${Math.round(560 * (zoomPct / 100))}px` }}
            className="relative max-w-full bg-white shadow-lg border border-slate-300 dark:border-slate-700 select-none touch-none cursor-ew-resize overflow-hidden"
          >
            {/* Base layer: Cleaned & Deskewed scan */}
            <img
              src={cleanedUrl}
              alt={`Cleaned page ${pageNumber}`}
              className="w-full h-auto block pointer-events-none"
            />
            {/* Top clipped layer: Original Raw scan */}
            <img
              src={rawUrl}
              alt={`Original raw scan page ${pageNumber}`}
              style={{ clipPath: `inset(0 ${100 - splitPct}% 0 0)` }}
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            />
            {/* Divider Hairline & Drag Handle */}
            <div
              style={{ left: `${splitPct}%` }}
              className="absolute inset-y-0 w-0.5 bg-blue-600 pointer-events-none"
            >
              <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-8 rounded-full border-2 border-white bg-blue-700 text-white shadow-md flex items-center justify-center">
                <SlidersHorizontal className="w-3.5 h-3.5" />
              </div>
            </div>
            {/* Quiet corner labels */}
            <span className="absolute top-2.5 left-2.5 bg-slate-900/75 text-white text-[10px] font-medium px-2 py-0.5 rounded pointer-events-none">
              Original Scan
            </span>
            <span className="absolute top-2.5 right-2.5 bg-blue-700/85 text-white text-[10px] font-medium px-2 py-0.5 rounded pointer-events-none">
              Cleaned &amp; Deskewed
            </span>
            {isProcessing && (
              <div className="absolute bottom-2.5 right-2.5 bg-white/90 text-slate-700 text-[11px] px-2 py-1 rounded shadow flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" />
                Updating…
              </div>
            )}
          </div>
        ) : (
          <div className="my-auto flex items-center gap-2 text-xs text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            Preparing live comparison…
          </div>
        )}
      </div>
    </div>
  );
};
