import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Download,
  FileJson,
  FolderOpen,
  HardDriveDownload,
  Loader2,
  Play,
  RotateCcw,
  Settings2,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import {
  NAMING_PATTERN_PRESETS,
  NAMING_TOKENS,
  resolveExportFileName,
} from '../engine/fileNaming';
import {
  OCR_LANGUAGE_LABELS,
  type LocalTrainedDataPack,
} from '../engine/ocrEngine';
import type {
  ConversionProgress,
  ExportHistoryItem,
  LoadedDocument,
  OcrLanguage,
  OutputFormat,
  ReflowSettings,
} from '../engine/types';

interface ExportViewProps {
  doc: LoadedDocument;
  settings: ReflowSettings;
  onChangeSettings: (patch: Partial<ReflowSettings>) => void;
  progress: ConversionProgress;
  onStartExport: () => void;
  onCancelExport: () => void;
  history: ExportHistoryItem[];
  onClearHistory: () => void;
  activeSummaryId: string | null;
  onSelectSummary: (id: string) => void;
  onDismissSummary: () => void;
  cachedOcrLangs: OcrLanguage[];
  isCachingOcr: boolean;
  ocrCacheStatus: string;
  onPrecacheOcr: (lang: OcrLanguage) => void;
  localTrainedData: LocalTrainedDataPack | null;
  onUploadLocalTrainedData: (file: File) => void;
  onClearLocalTrainedData: () => void;
  reviewedOcrCount: number;
  onOpenMobileSettings?: () => void;
}

const FORMAT_LABELS: Record<OutputFormat, string> = {
  'pdf-ocr': 'Reflowable PDF (OCR Text)',
  'epub-ocr': 'Reflowable EPUB 3 (OCR Text)',
  pdf: 'Bitmap Reflow PDF (k2pdfopt)',
  'epub-bitmap': 'Offline Bitmap EPUB 3',
};

const FORMAT_OPTIONS: {
  id: OutputFormat;
  title: string;
  subtitle: string;
}[] = [
  {
    id: 'epub-ocr',
    title: 'Reflowable EPUB 3',
    subtitle: 'Dynamic fonts, chapters & figures for Kindle, Kobo, Apple Books',
  },
  {
    id: 'pdf-ocr',
    title: 'Reflowable PDF',
    subtitle: 'Selectable vector text sized to your e-reader screen',
  },
  {
    id: 'epub-bitmap',
    title: 'Bitmap EPUB 3',
    subtitle: '100% instant offline word strips, zero OCR typos',
  },
  {
    id: 'pdf',
    title: 'Bitmap Reflow PDF',
    subtitle: 'k2pdfopt-style reflowed page bitmaps for math & scans',
  },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatReadingTime(totalWords: number): string {
  if (totalWords <= 0) return '0 min';
  const exactMinutes = totalWords / 238;
  if (exactMinutes < 1) return '< 1 min';
  const roundedMinutes = Math.round(exactMinutes);
  if (roundedMinutes < 60) return `${roundedMinutes} min`;
  const hours = Math.floor(roundedMinutes / 60);
  const mins = roundedMinutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}

export const ExportView: React.FC<ExportViewProps> = ({
  doc,
  settings,
  onChangeSettings,
  progress,
  onStartExport,
  onCancelExport,
  history,
  onClearHistory,
  activeSummaryId,
  onSelectSummary,
  onDismissSummary,
  cachedOcrLangs,
  isCachingOcr,
  ocrCacheStatus,
  onPrecacheOcr,
  localTrainedData,
  onUploadLocalTrainedData,
  onClearLocalTrainedData,
  reviewedOcrCount,
  onOpenMobileSettings,
}) => {
  const trainedDataInputRef = useRef<HTMLInputElement>(null);
  const patternInputRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const jsonFeedbackTimerRef = useRef<number | null>(null);
  const [jsonExported, setJsonExported] = useState(false);
  const includedCount = doc.pages.filter((p) => p.included).length;
  const embeddedTextPages = doc.pages.filter((p) => p.included && p.hasEmbeddedText).length;
  const isOcrMode = settings.outputFormat === 'pdf-ocr' || settings.outputFormat === 'epub-ocr';
  const isBusy =
    progress.phase === 'rendering' ||
    progress.phase === 'reflowing' ||
    progress.phase === 'ocr' ||
    progress.phase === 'packaging';

  const isSelectedLangCached = cachedOcrLangs.includes(settings.ocrLanguage);

  const activeSummary = useMemo(
    () => (activeSummaryId ? history.find((item) => item.id === activeSummaryId) ?? null : null),
    [activeSummaryId, history]
  );

  const isLatestSummary = Boolean(activeSummary && history[0]?.id === activeSummary.id);

  useEffect(() => {
    if (!activeSummaryId || !summaryRef.current) return;
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    summaryRef.current.scrollIntoView({
      behavior: prefersReduced ? 'auto' : 'smooth',
      block: 'nearest',
    });
  }, [activeSummaryId]);

  useEffect(() => {
    return () => {
      if (jsonFeedbackTimerRef.current) {
        window.clearTimeout(jsonFeedbackTimerRef.current);
      }
    };
  }, []);

  const previewFileName = useMemo(
    () =>
      resolveExportFileName({
        settings,
        sourceFileName: doc.fileName,
        selectedPageCount: includedCount,
      }),
    [settings, doc.fileName, includedCount]
  );

  const handleInsertToken = (token: string) => {
    const input = patternInputRef.current;
    const current = settings.namingPattern;
    if (!input) {
      onChangeSettings({ namingPattern: `${current}${token}` });
      return;
    }
    const start = input.selectionStart ?? current.length;
    const end = input.selectionEnd ?? current.length;
    const next = current.slice(0, start) + token + current.slice(end);
    onChangeSettings({ namingPattern: next });
    window.requestAnimationFrame(() => {
      input.focus();
      const caret = start + token.length;
      input.setSelectionRange(caret, caret);
    });
  };

  const handleExportHistoryJson = () => {
    if (history.length === 0) return;

    const now = new Date();
    const totalWords = history.reduce((sum, item) => sum + item.stats.totalWords, 0);
    const archivePayload = {
      schemaVersion: 1,
      exportedAt: now.toISOString(),
      sourceDocument: {
        fileName: doc.fileName,
        fileSizeBytes: doc.fileSizeBytes,
        pageCount: doc.pageCount,
        isSample: doc.isSample,
      },
      totals: {
        exportsCount: history.length,
        totalSourcePagesProcessed: history.reduce((sum, item) => sum + item.sourcePagesProcessed, 0),
        totalOutputPages: history.reduce((sum, item) => sum + item.outputPages, 0),
        totalWords,
        estimatedReadingMinutes: Number((totalWords / 238).toFixed(2)),
        totalFiguresExtracted: history.reduce((sum, item) => sum + item.stats.figuresExtracted, 0),
        totalFileSizeBytes: history.reduce((sum, item) => sum + item.fileSizeBytes, 0),
      },
      history: history.map(({ downloadUrl: _blobUrl, ...entry }) => ({
        ...entry,
        formatLabel: FORMAT_LABELS[entry.format],
        stats: {
          ...entry.stats,
          formattedReadingTime: formatReadingTime(entry.stats.totalWords),
        },
      })),
    };

    const baseName =
      doc.fileName
        .replace(/\.pdf$/i, '')
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'document';
    const dateStamp = now.toISOString().slice(0, 10);
    const jsonFileName = `${baseName}-export-history-${dateStamp}.json`;

    const blob = new Blob([JSON.stringify(archivePayload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = jsonFileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);

    setJsonExported(true);
    if (jsonFeedbackTimerRef.current) {
      window.clearTimeout(jsonFeedbackTimerRef.current);
    }
    jsonFeedbackTimerRef.current = window.setTimeout(() => {
      setJsonExported(false);
    }, 1800);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto w-full space-y-6 sm:space-y-8">
      <div className="pb-4 sm:pb-5 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
            Batch Convert &amp; Export
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            {doc.fileName} · {includedCount} selected pages · {FORMAT_LABELS[settings.outputFormat]}
            {isOcrMode && reviewedOcrCount > 0 ? ` · ${reviewedOcrCount} page OCR cached from Workbench` : ''}
          </p>
        </div>
        {onOpenMobileSettings && (
          <button
            type="button"
            onClick={onOpenMobileSettings}
            className="lg:hidden inline-flex min-h-[38px] items-center gap-1.5 rounded-md border border-blue-600/60 bg-blue-50 dark:bg-blue-950/40 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950/70 transition-colors whitespace-nowrap shrink-0"
          >
            <Settings2 className="w-3.5 h-3.5" />
            Tune
          </button>
        )}
      </div>

      {/* Export Completion Summary View */}
      {activeSummary && (
        <section
          ref={summaryRef}
          aria-label="Export completion summary"
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
        >
          <div className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  {isLatestSummary ? 'Export Complete' : 'Export Summary'}
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-mono text-slate-800 dark:text-slate-200 break-all">
                  {activeSummary.fileName}
                </span>
                <span aria-hidden="true">·</span>
                <span>{FORMAT_LABELS[activeSummary.format]}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {activeSummary.sourcePagesProcessed}→{activeSummary.outputPages}{' '}
                  {activeSummary.format === 'epub-ocr' || activeSummary.format === 'epub-bitmap'
                    ? 'sections'
                    : 'pages'}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {formatBytes(activeSummary.fileSizeBytes)}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {formatDuration(activeSummary.stats.elapsedMs)}
                </span>
                {activeSummary.stats.meanOcrConfidence !== undefined && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {activeSummary.stats.meanOcrConfidence}% avg OCR conf
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <a
                href={activeSummary.downloadUrl}
                download={activeSummary.fileName}
                className="inline-flex min-h-[40px] sm:min-h-0 items-center justify-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Download{' '}
                {activeSummary.format === 'epub-ocr' || activeSummary.format === 'epub-bitmap'
                  ? 'EPUB'
                  : 'PDF'}
              </a>
              <button
                type="button"
                onClick={onDismissSummary}
                aria-label="Dismiss export summary"
                className="inline-flex min-h-[40px] min-w-[40px] sm:min-h-0 sm:min-w-0 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 3-Column Batch Metrics Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30">
            <div className="px-4 sm:px-6 py-4 space-y-1">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Total Words Processed
              </div>
              <div className="font-mono text-2xl sm:text-3xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-slate-100">
                {activeSummary.stats.totalWords.toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {activeSummary.sourcePagesProcessed > 0
                  ? `~${Math.round(
                      activeSummary.stats.totalWords / activeSummary.sourcePagesProcessed
                    ).toLocaleString()} words/page · `
                  : ''}
                {activeSummary.stats.wordCountBasis === 'ocr-text'
                  ? 'Extracted text'
                  : 'Segmented tokens'}
              </div>
            </div>

            <div className="px-4 sm:px-6 py-4 space-y-1">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Estimated Reading Time
              </div>
              <div className="font-mono text-2xl sm:text-3xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-slate-100">
                {formatReadingTime(activeSummary.stats.totalWords)}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                For generated{' '}
                {activeSummary.format === 'epub-ocr' || activeSummary.format === 'epub-bitmap'
                  ? 'EPUB 3'
                  : 'PDF'}{' '}
                · 238 wpm average
              </div>
            </div>

            <div className="px-4 sm:px-6 py-4 space-y-1">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Figures Extracted
              </div>
              <div className="font-mono text-2xl sm:text-3xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-slate-100">
                {activeSummary.stats.figuresExtracted.toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Across {activeSummary.sourcePagesProcessed} source{' '}
                {activeSummary.sourcePagesProcessed === 1 ? 'page' : 'pages'} in batch
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Output Format, Metadata, Quality, Offline OCR Pack & Run Button */}
        <div className="lg:col-span-6 space-y-6">
          {/* Output Format Selector */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              01. Output Format
            </h2>
            <div
              role="radiogroup"
              aria-label="Export output format"
              className="grid grid-cols-1 sm:grid-cols-2 gap-2"
            >
              {FORMAT_OPTIONS.map((opt) => {
                const active = settings.outputFormat === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onChangeSettings({ outputFormat: opt.id })}
                    className={`text-left rounded-lg border px-3.5 py-2.5 transition-colors ${
                      active
                        ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div
                      className={`text-xs font-semibold ${
                        active
                          ? 'text-blue-800 dark:text-blue-300'
                          : 'text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      {opt.title}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
                      {opt.subtitle}
                    </div>
                  </button>
                );
              })}
            </div>

            {settings.outputFormat === 'epub-ocr' && (
              <div className="pt-1 space-y-2">
                <label className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={settings.epubContinuousFlow}
                    onChange={(e) => onChangeSettings({ epubContinuousFlow: e.target.checked })}
                    className="mt-0.5 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                  />
                  <span>
                    Continuous flowing text (merges scanned pages and splits chapters at detected
                    headings)
                  </span>
                </label>
                <label className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={settings.epubShowPageMarkers}
                    onChange={(e) => onChangeSettings({ epubShowPageMarkers: e.target.checked })}
                    className="mt-0.5 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                  />
                  <span>Include visible source page headings (e.g. Page 1, Page 2)</span>
                </label>
              </div>
            )}
          </section>

          {/* Book Metadata & Naming */}
          <section className="pt-5 border-t border-slate-200 dark:border-slate-800 space-y-3.5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              02. Document Metadata &amp; Naming
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="book-title"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                >
                  Book Title
                </label>
                <input
                  id="book-title"
                  type="text"
                  value={settings.bookTitle}
                  onChange={(e) => onChangeSettings({ bookTitle: e.target.value })}
                  placeholder={doc.fileName.replace(/\.pdf$/i, '')}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/40"
                />
              </div>
              <div>
                <label
                  htmlFor="book-author"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                >
                  Author
                </label>
                <input
                  id="book-author"
                  type="text"
                  value={settings.bookAuthor}
                  onChange={(e) => onChangeSettings({ bookAuthor: e.target.value })}
                  placeholder="Optional"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/40"
                />
              </div>
            </div>

            {/* Resolution Selector */}
            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Scan Render Resolution
              </span>
              <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                {[
                  { dpi: 160, short: '160 DPI', note: 'Fast' },
                  { dpi: 220, short: '220 DPI', note: 'Balanced' },
                  { dpi: 300, short: '300 DPI', note: 'Archival' },
                ].map((opt) => {
                  const active = settings.exportQualityDpi === opt.dpi;
                  return (
                    <button
                      key={opt.dpi}
                      type="button"
                      onClick={() => onChangeSettings({ exportQualityDpi: opt.dpi })}
                      className={`py-2.5 sm:py-1.5 px-2 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap truncate ${
                        active
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      {opt.short}
                      <span className="hidden sm:inline"> · {opt.note}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Batch File Naming Pattern */}
            <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800/80 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Output File Naming
                </span>
                <div
                  role="radiogroup"
                  aria-label="Output file naming mode"
                  className="grid grid-cols-2 gap-0.5 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!settings.customNamingEnabled}
                    onClick={() => onChangeSettings({ customNamingEnabled: false })}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                      !settings.customNamingEnabled
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    Automatic
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={settings.customNamingEnabled}
                    onClick={() => onChangeSettings({ customNamingEnabled: true })}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                      settings.customNamingEnabled
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    Custom Pattern
                  </button>
                </div>
              </div>

              {settings.customNamingEnabled && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor="naming-pattern"
                        className="text-[11px] font-medium text-slate-600 dark:text-slate-400"
                      >
                        Filename Pattern
                      </label>
                      <select
                        aria-label="Apply naming preset"
                        value=""
                        onChange={(e) => {
                          if (e.target.value) {
                            onChangeSettings({ namingPattern: e.target.value });
                          }
                        }}
                        className="text-[11px] text-blue-700 dark:text-blue-400 bg-transparent font-medium focus:outline-none cursor-pointer"
                      >
                        <option value="" disabled>
                          Load preset…
                        </option>
                        {NAMING_PATTERN_PRESETS.map((preset) => (
                          <option
                            key={preset.pattern}
                            value={preset.pattern}
                            className="text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900"
                          >
                            {preset.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <input
                      ref={patternInputRef}
                      id="naming-pattern"
                      type="text"
                      value={settings.namingPattern}
                      onChange={(e) => onChangeSettings({ namingPattern: e.target.value })}
                      placeholder="{prefix}{title}_{date}_{index}"
                      className="w-full min-h-[40px] sm:min-h-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/40"
                    />
                  </div>

                  {/* Interactive Token Insertion Bar */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {NAMING_TOKENS.map((item) => (
                      <button
                        key={item.token}
                        type="button"
                        title={`${item.description} — click to insert ${item.token}`}
                        onClick={() => handleInsertToken(item.token)}
                        className="inline-flex min-h-[30px] sm:min-h-0 items-center rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1 font-mono text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:border-blue-600/60 hover:text-blue-700 dark:hover:text-blue-400 transition-colors whitespace-nowrap"
                      >
                        +{item.token}
                      </button>
                    ))}
                  </div>

                  {/* Prefix, Next Index & Padding Controls */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label
                        htmlFor="naming-prefix"
                        className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
                      >
                        Prefix
                      </label>
                      <input
                        id="naming-prefix"
                        type="text"
                        value={settings.namingPrefix}
                        onChange={(e) => onChangeSettings({ namingPrefix: e.target.value })}
                        placeholder="e.g. Archive_"
                        className="w-full min-h-[38px] sm:min-h-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 font-mono text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/40"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label
                          htmlFor="naming-index"
                          className="text-[11px] font-medium text-slate-600 dark:text-slate-400"
                        >
                          Next Index
                        </label>
                        {settings.namingStartIndex !== 1 && (
                          <button
                            type="button"
                            onClick={() => onChangeSettings({ namingStartIndex: 1 })}
                            title="Reset batch counter to 1"
                            className="inline-flex items-center gap-0.5 text-[10px] font-medium text-slate-500 hover:text-blue-700 dark:hover:text-blue-400"
                          >
                            <RotateCcw className="w-2.5 h-2.5" />
                            Reset
                          </button>
                        )}
                      </div>
                      <input
                        id="naming-index"
                        type="number"
                        min={0}
                        max={99999}
                        value={settings.namingStartIndex}
                        onChange={(e) =>
                          onChangeSettings({
                            namingStartIndex: Math.max(0, parseInt(e.target.value, 10) || 0),
                          })
                        }
                        className="w-full min-h-[38px] sm:min-h-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 font-mono text-xs tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/40"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="naming-padding"
                        className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
                      >
                        Index Digits
                      </label>
                      <select
                        id="naming-padding"
                        value={settings.namingIndexPadding}
                        onChange={(e) =>
                          onChangeSettings({ namingIndexPadding: Number(e.target.value) })
                        }
                        className="w-full min-h-[38px] sm:min-h-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 font-mono text-xs tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/40"
                      >
                        <option value={1}>1 (1, 2, 3)</option>
                        <option value={2}>2 (01, 02, 03)</option>
                        <option value={3}>3 (001, 002, 003)</option>
                        <option value={4}>4 (0001, 0002)</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Live Resolved Filename Preview (clean unboxed monospace readout) */}
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="font-medium shrink-0">Next file:</span>
                <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100 break-all">
                  {previewFileName}
                </span>
                {settings.customNamingEnabled && settings.namingPattern.includes('{index}') && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Index auto-increments after each export</span>
                  </>
                )}
              </div>
            </div>
          </section>

          {/* Offline OCR Pack Section */}
          <section className="pt-5 border-t border-slate-200 dark:border-slate-800 space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                03. Offline OCR Engine &amp; Language Pack
              </h2>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {isOcrMode ? 'Active for current format' : 'Optional for Bitmap modes'}
              </span>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              OCR extracts selectable text column-by-column using local WebAssembly Tesseract to
              build reflowable vector PDFs and EPUB 3 files. Cache a language pack once below, or
              load a local <span className="font-mono text-[11px]">.traineddata</span> file from
              disk for air-gapped OCR.
            </p>

            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2.5">
              <select
                aria-label="OCR Language"
                value={settings.ocrLanguage}
                onChange={(e) =>
                  onChangeSettings({ ocrLanguage: e.target.value as OcrLanguage })
                }
                className="w-full sm:w-auto min-h-[42px] sm:min-h-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100"
              >
                {(Object.keys(OCR_LANGUAGE_LABELS) as OcrLanguage[]).map((code) => (
                  <option key={code} value={code}>
                    {OCR_LANGUAGE_LABELS[code]}
                    {cachedOcrLangs.includes(code) ? ' — Cached Offline' : ''}
                  </option>
                ))}
              </select>

              <button
                type="button"
                disabled={isCachingOcr || isBusy}
                onClick={() => onPrecacheOcr(settings.ocrLanguage)}
                className="w-full sm:w-auto min-h-[42px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {isCachingOcr ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : isSelectedLangCached ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <HardDriveDownload className="w-3.5 h-3.5" />
                )}
                {isCachingOcr
                  ? ocrCacheStatus || 'Caching…'
                  : isSelectedLangCached
                    ? 'Cached Offline'
                    : 'Pre-Cache Model'}
              </button>

              <input
                ref={trainedDataInputRef}
                type="file"
                accept=".traineddata,.gz"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onUploadLocalTrainedData(file);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                disabled={isBusy}
                onClick={() => trainedDataInputRef.current?.click()}
                className="w-full sm:w-auto min-h-[42px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                Load Local .traineddata
              </button>
            </div>

            {localTrainedData && (
              <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs">
                <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300 truncate">
                  Local pack loaded: {localTrainedData.fileName} ({formatBytes(localTrainedData.data.byteLength)})
                </span>
                <button
                  type="button"
                  onClick={onClearLocalTrainedData}
                  className="text-slate-500 hover:text-red-600 text-xs font-medium ml-3 whitespace-nowrap"
                >
                  Remove
                </button>
              </div>
            )}

            <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings.preferEmbeddedText}
                onChange={(e) => onChangeSettings({ preferEmbeddedText: e.target.checked })}
                className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
              />
              <span>
                Use existing PDF text layer when available ({embeddedTextPages} of {includedCount}{' '}
                selected pages have embedded text)
              </span>
            </label>
          </section>

          {/* Primary Batch Execution Area */}
          <section className="pt-5 border-t border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center gap-3">
              {!isBusy ? (
                <button
                  type="button"
                  disabled={includedCount === 0}
                  onClick={onStartExport}
                  className="w-full sm:w-auto min-h-[48px] sm:min-h-0 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  <Play className="w-4 h-4" />
                  Build &amp; Download{' '}
                  {settings.outputFormat === 'epub-ocr'
                    ? 'Reflowable EPUB 3'
                    : settings.outputFormat === 'pdf-ocr'
                      ? 'Reflowable PDF'
                      : settings.outputFormat === 'epub-bitmap'
                        ? 'Bitmap EPUB 3'
                        : 'Bitmap Reflow PDF'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onCancelExport}
                  className="w-full sm:w-auto min-h-[48px] sm:min-h-0 inline-flex items-center justify-center gap-2 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-5 py-2.5 text-sm font-semibold text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950/60 transition-colors whitespace-nowrap"
                >
                  <Square className="w-4 h-4" />
                  Cancel Conversion
                </button>
              )}
            </div>

            {/* Live Conversion Progress Bar */}
            {progress.phase !== 'idle' && (
              <div className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <div className="flex items-center justify-between text-xs">
                  <span
                    className={`font-medium ${
                      progress.phase === 'error'
                        ? 'text-red-600 dark:text-red-400'
                        : progress.phase === 'done'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {progress.detail}
                  </span>
                  <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {progress.percent}%
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-150 ${
                      progress.phase === 'error'
                        ? 'bg-red-600'
                        : progress.phase === 'done'
                          ? 'bg-emerald-600'
                          : 'bg-blue-700'
                    }`}
                    style={{ width: `${Math.max(2, progress.percent)}%` }}
                  />
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Export History Table */}
        <div className="lg:col-span-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Session Exports
            </h2>
            {history.length > 0 && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleExportHistoryJson}
                  title="Download session export history, metadata, and stats as JSON"
                  className="inline-flex min-h-[34px] sm:min-h-0 items-center gap-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                >
                  {jsonExported ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <FileJson className="w-3.5 h-3.5" />
                  )}
                  {jsonExported ? 'Exported JSON' : 'Export JSON'}
                </button>
                <button
                  type="button"
                  onClick={onClearHistory}
                  className="inline-flex min-h-[34px] sm:min-h-0 items-center gap-1 px-1.5 py-1 text-xs text-slate-500 hover:text-red-600 dark:hover:text-red-400 transition-colors whitespace-nowrap shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear
                </button>
              </div>
            )}
          </div>

          {history.length === 0 ? (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-2">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                No exports generated in this session
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto leading-relaxed">
                Converted PDFs and EPUBs appear here with file sizes and instant download links.
                Files are assembled locally in memory and never leave your computer.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              {/* Mobile Stacked Export List */}
              <div className="sm:hidden divide-y divide-slate-200 dark:divide-slate-800">
                {history.map((item) => {
                  const isSelected = activeSummaryId === item.id;
                  return (
                    <div
                      key={item.id}
                      className={`p-3.5 flex items-center justify-between gap-3 ${
                        isSelected ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectSummary(item.id)}
                        className="min-w-0 flex-1 text-left space-y-0.5"
                      >
                        <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {item.fileName}
                        </div>
                        <div className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                          {item.sourcePagesProcessed}→{item.outputPages} pgs ·{' '}
                          {formatBytes(item.fileSizeBytes)} · {item.createdAt}
                        </div>
                        <div className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                          {item.stats.totalWords.toLocaleString()} words ·{' '}
                          {formatReadingTime(item.stats.totalWords)} ·{' '}
                          {item.stats.figuresExtracted}{' '}
                          {item.stats.figuresExtracted === 1 ? 'fig' : 'figs'}
                        </div>
                      </button>
                      <a
                        href={item.downloadUrl}
                        download={item.fileName}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Save
                      </a>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Tabular Export History */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 px-3.5">Output File</th>
                      <th className="py-2.5 px-3 text-right">Pages</th>
                      <th className="py-2.5 px-3 text-right">Size</th>
                      <th className="py-2.5 px-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                    {history.map((item) => {
                      const isSelected = activeSummaryId === item.id;
                      return (
                        <tr
                          key={item.id}
                          className={`transition-colors ${
                            isSelected
                              ? 'bg-blue-50/40 dark:bg-blue-950/20'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="py-3 px-3.5">
                            <button
                              type="button"
                              onClick={() => onSelectSummary(item.id)}
                              className="text-left group block max-w-[230px]"
                              title="View batch summary"
                            >
                              <div className="font-medium text-slate-900 dark:text-slate-100 group-hover:text-blue-700 dark:group-hover:text-blue-400 truncate transition-colors">
                                {item.fileName}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                                {item.stats.totalWords.toLocaleString()} words ·{' '}
                                {formatReadingTime(item.stats.totalWords)} ·{' '}
                                {item.stats.figuresExtracted}{' '}
                                {item.stats.figuresExtracted === 1 ? 'fig' : 'figs'} ·{' '}
                                {item.createdAt}
                              </div>
                            </button>
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {item.sourcePagesProcessed}→{item.outputPages}
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {formatBytes(item.fileSizeBytes)}
                          </td>
                          <td className="py-3 px-3.5 text-right">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => onSelectSummary(item.id)}
                                className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                                  isSelected
                                    ? 'text-blue-700 dark:text-blue-400'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                                }`}
                              >
                                Summary
                              </button>
                              <a
                                href={item.downloadUrl}
                                download={item.fileName}
                                className="inline-flex items-center gap-1 rounded-md border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
                              >
                                <Download className="w-3 h-3" />
                                Save
                              </a>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
