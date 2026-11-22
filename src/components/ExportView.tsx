import React, { useRef } from 'react';
import {
  CheckCircle2,
  Download,
  FolderOpen,
  HardDriveDownload,
  Loader2,
  Play,
  Settings2,
  Square,
  Trash2,
} from 'lucide-react';
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
  'pdf-ocr': 'OCR Reflowable PDF (Selectable Text)',
  pdf: 'Bitmap Reflow PDF (k2pdfopt)',
  'epub-ocr': 'OCR Reflowable EPUB 3',
  'epub-bitmap': 'Offline Bitmap EPUB 3',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
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
  const includedCount = doc.pages.filter((p) => p.included).length;
  const embeddedTextPages = doc.pages.filter((p) => p.included && p.hasEmbeddedText).length;
  const isOcrMode = settings.outputFormat === 'pdf-ocr' || settings.outputFormat === 'epub-ocr';
  const isBusy =
    progress.phase === 'rendering' ||
    progress.phase === 'reflowing' ||
    progress.phase === 'ocr' ||
    progress.phase === 'packaging';

  const isSelectedLangCached = cachedOcrLangs.includes(settings.ocrLanguage);

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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Metadata, Quality, Offline OCR Pack & Run Button */}
        <div className="lg:col-span-6 space-y-6">
          {/* Book Metadata */}
          <section className="space-y-3.5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              01. Document Metadata &amp; Quality
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
          </section>

          {/* Offline OCR Pack Section */}
          <section className="pt-5 border-t border-slate-200 dark:border-slate-800 space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                02. Offline OCR Engine &amp; Language Pack
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
                  {settings.outputFormat === 'pdf-ocr'
                    ? 'OCR Reflow PDF'
                    : settings.outputFormat === 'pdf'
                      ? 'Bitmap Reflow PDF'
                      : 'EPUB 3'}
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
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Session Exports
            </h2>
            {history.length > 0 && (
              <button
                type="button"
                onClick={onClearHistory}
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear
              </button>
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
                {history.map((item) => (
                  <div key={item.id} className="p-3.5 flex items-center justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {item.fileName}
                      </div>
                      <div className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                        {item.sourcePagesProcessed}→{item.outputPages} pgs ·{' '}
                        {formatBytes(item.fileSizeBytes)} · {item.createdAt}
                      </div>
                    </div>
                    <a
                      href={item.downloadUrl}
                      download={item.fileName}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Save
                    </a>
                  </div>
                ))}
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
                    {history.map((item) => (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-3 px-3.5">
                          <div className="font-medium text-slate-900 dark:text-slate-100 truncate max-w-[200px]">
                            {item.fileName}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {FORMAT_LABELS[item.format]} · {item.createdAt}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {item.sourcePagesProcessed}→{item.outputPages}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {formatBytes(item.fileSizeBytes)}
                        </td>
                        <td className="py-3 px-3.5 text-right">
                          <a
                            href={item.downloadUrl}
                            download={item.fileName}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
                          >
                            <Download className="w-3 h-3" />
                            Save
                          </a>
                        </td>
                      </tr>
                    ))}
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
