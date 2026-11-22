import React, { useState } from 'react';
import { Check, Compass, Eye, Loader2, RotateCw } from 'lucide-react';
import type { LoadedDocument } from '../engine/types';

interface PagesViewProps {
  doc: LoadedDocument;
  onTogglePage: (pageNumber: number) => void;
  onSetIncludedPages: (includedSet: Set<number>) => void;
  onInspectPage: (pageNumber: number) => void;
  onRotatePage90: (pageNumber: number) => void;
  onSmartRotateAll: () => void;
  isSmartRotatingAll: boolean;
}

export const PagesView: React.FC<PagesViewProps> = ({
  doc,
  onTogglePage,
  onSetIncludedPages,
  onInspectPage,
  onRotatePage90,
  onSmartRotateAll,
  isSmartRotatingAll,
}) => {
  const [rangeInput, setRangeInput] = useState(`1-${doc.pageCount}`);
  const [rangeError, setRangeError] = useState('');

  const includedCount = doc.pages.filter((p) => p.included).length;

  const applyRangeString = () => {
    setRangeError('');
    const trimmed = rangeInput.trim().toLowerCase();
    if (!trimmed || trimmed === 'all') {
      onSetIncludedPages(new Set(doc.pages.map((p) => p.pageNumber)));
      return;
    }

    const next = new Set<number>();
    const tokens = trimmed.split(',').map((t) => t.trim()).filter(Boolean);
    for (const token of tokens) {
      if (token.includes('-')) {
        const [startStr, endStr] = token.split('-').map((s) => s.trim());
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (isNaN(start) || isNaN(end) || start < 1 || end > doc.pageCount || start > end) {
          setRangeError(`Invalid range "${token}". Valid pages: 1 to ${doc.pageCount}.`);
          return;
        }
        for (let p = start; p <= end; p++) next.add(p);
      } else {
        const p = parseInt(token, 10);
        if (isNaN(p) || p < 1 || p > doc.pageCount) {
          setRangeError(`Invalid page "${token}". Valid pages: 1 to ${doc.pageCount}.`);
          return;
        }
        next.add(p);
      }
    }
    onSetIncludedPages(next);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto w-full space-y-5 sm:space-y-6">
      {/* Header & Quick Selection Controls */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3.5 sm:gap-4 pb-4 sm:pb-5 border-b border-slate-200 dark:border-slate-800">
        <div className="space-y-1">
          <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
            Page Selection
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {includedCount} of {doc.pageCount} pages included · Tap any page to toggle
          </p>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5 sm:pb-0 sm:flex-wrap">
          <button
            type="button"
            onClick={() => onSetIncludedPages(new Set(doc.pages.map((p) => p.pageNumber)))}
            className="min-h-[38px] sm:min-h-0 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={() => onSetIncludedPages(new Set())}
            className="min-h-[38px] sm:min-h-0 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            Clear All
          </button>
          <button
            type="button"
            onClick={() =>
              onSetIncludedPages(
                new Set(doc.pages.filter((p) => p.pageNumber % 2 === 1).map((p) => p.pageNumber))
              )
            }
            className="min-h-[38px] sm:min-h-0 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            Odd Only
          </button>
          <button
            type="button"
            onClick={() =>
              onSetIncludedPages(
                new Set(doc.pages.filter((p) => p.pageNumber % 2 === 0).map((p) => p.pageNumber))
              )
            }
            className="min-h-[38px] sm:min-h-0 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            Even Only
          </button>
          <button
            type="button"
            disabled={isSmartRotatingAll}
            onClick={onSmartRotateAll}
            className="inline-flex min-h-[38px] sm:min-h-0 items-center gap-1.5 rounded-md border border-blue-600/70 bg-blue-50 dark:bg-blue-950/40 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950/70 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
          >
            {isSmartRotatingAll ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Compass className="w-3.5 h-3.5" />
            )}
            {isSmartRotatingAll ? 'Analyzing…' : 'Smart Rotate All'}
          </button>
        </div>
      </div>

      {/* Range Parser Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3">
        <label
          htmlFor="page-range-input"
          className="text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap"
        >
          Apply Range
        </label>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <input
            id="page-range-input"
            type="text"
            value={rangeInput}
            onChange={(e) => setRangeInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyRangeString();
            }}
            placeholder="e.g. 1-5, 8, 12-20"
            className="flex-1 sm:flex-none sm:w-64 min-h-[40px] sm:min-h-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 font-mono text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/40"
          />
          <button
            type="button"
            onClick={applyRangeString}
            className="min-h-[40px] sm:min-h-0 rounded-lg bg-slate-900 dark:bg-slate-100 px-4 py-1.5 text-xs font-semibold text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
          >
            Apply
          </button>
        </div>
        {rangeError && <span className="text-xs text-red-600 dark:text-red-400">{rangeError}</span>}
      </div>

      {/* Page Thumbnail Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
        {doc.pages.map((page) => (
          <div
            key={page.pageNumber}
            className={`group rounded-lg border transition-colors bg-white dark:bg-slate-900 overflow-hidden flex flex-col ${
              page.included
                ? 'border-blue-600/70 dark:border-blue-500/70'
                : 'border-slate-200 dark:border-slate-800 opacity-60'
            }`}
          >
            <button
              type="button"
              onClick={() => onTogglePage(page.pageNumber)}
              className="relative aspect-[3/4] w-full bg-slate-100 dark:bg-slate-950 overflow-hidden text-left"
            >
              {page.thumbnailUrl ? (
                <img
                  src={page.thumbnailUrl}
                  alt={`Page ${page.pageNumber}`}
                  style={
                    page.rotationDeg !== 0
                      ? {
                          transform: `rotate(${page.rotationDeg}deg) scale(${
                            page.rotationDeg === 90 || page.rotationDeg === 270 ? 0.76 : 1
                          })`,
                        }
                      : undefined
                  }
                  className="w-full h-full object-contain p-2 transition-transform"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center font-mono text-xs text-slate-400">
                  p.{page.pageNumber}
                </div>
              )}

              <span
                className={`absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-md border text-white transition-colors ${
                  page.included
                    ? 'border-blue-600 bg-blue-600'
                    : 'border-slate-300 dark:border-slate-600 bg-white/90 dark:bg-slate-900/90 text-transparent'
                }`}
              >
                <Check className="w-3.5 h-3.5" />
              </span>
            </button>

            <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-1.5">
              <div className="min-w-0">
                <div className="font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  Page {page.pageNumber}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate font-mono tabular-nums">
                  {page.hasEmbeddedText ? 'Text layer' : 'Image scan'}
                  {page.rotationDeg !== 0 ? ` · ${page.rotationDeg}°` : ''}
                </div>
              </div>

              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onRotatePage90(page.pageNumber)}
                  title={`Rotate page ${page.pageNumber} 90° clockwise`}
                  className="inline-flex h-9 w-9 sm:h-7 sm:w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-blue-700 dark:hover:text-blue-400 transition-colors shrink-0"
                >
                  <RotateCw className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onInspectPage(page.pageNumber)}
                  title={`Inspect page ${page.pageNumber} in Workbench`}
                  className="inline-flex h-9 w-9 sm:h-7 sm:w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-blue-700 dark:hover:text-blue-400 transition-colors shrink-0"
                >
                  <Eye className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
