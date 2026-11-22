import React, { useRef, useState } from 'react';
import { BookOpen, FileUp, Layers, ScanText } from 'lucide-react';

interface EmptyDropzoneProps {
  onFileSelected: (file: File) => void;
  onLoadSample: () => void;
  isLoading: boolean;
  loadingLabel: string;
}

export const EmptyDropzone: React.FC<EmptyDropzoneProps> = ({
  onFileSelected,
  onLoadSample,
  isLoading,
  loadingLabel,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))) {
      onFileSelected(file);
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-between p-4 sm:p-6 lg:p-10 max-w-5xl mx-auto w-full">
      <div className="space-y-6 sm:space-y-8 my-auto">
        {/* Editorial Header */}
        <div className="space-y-2.5 sm:space-y-3 max-w-2xl">
          <p className="text-xs font-medium text-blue-700 dark:text-blue-400">
            Local Browser Engine · Zero Server Uploads
          </p>
          <h1
            className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100 leading-tight"
            style={{ textWrap: 'balance' }}
          >
            Turn old scanned PDFs into readable e-reader books offline.
          </h1>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
            Deskew tilted pages, split multi-column journal layouts, clean yellowed paper, and
            reflow individual words into crisp k2pdfopt-style PDFs or EPUB 3 files right on your
            device.
          </p>
        </div>

        {/* Architectural Dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`relative rounded-xl border-2 border-dashed p-5 sm:p-10 lg:p-12 transition-colors ${
            isDragging
              ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/30'
              : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-400 dark:hover:border-slate-600'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFileSelected(file);
              e.target.value = '';
            }}
          />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="space-y-2 max-w-md">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200">
                <FileUp className="w-5 h-5" />
              </div>
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                {isLoading ? loadingLabel : 'Drop a scanned PDF here to begin'}
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                Supports image-only scans, multi-column academic papers, and vintage books. All
                processing stays strictly inside browser memory.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 shrink-0">
              <button
                type="button"
                disabled={isLoading}
                onClick={() => inputRef.current?.click()}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                Select Scanned PDF
              </button>
              <button
                type="button"
                disabled={isLoading}
                onClick={onLoadSample}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                Load 1894 Sample Scan
              </button>
            </div>
          </div>
        </div>

        {/* 3-Step Pipeline Summary (Clean hairline divider grid, no nested card clutter) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-slate-200 dark:border-slate-800">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
              <Layers className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" />
              <h3 className="text-sm font-semibold">01. Optical Cleanup &amp; Deskew</h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Removes yellowed paper backgrounds and gutter shadows using adaptive or grayscale
              filtering, then straightens skewed scans automatically.
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
              <BookOpen className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" />
              <h3 className="text-sm font-semibold">02. Bitmap Word Reflow</h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Detects multi-column gutters and diagrams, isolates every word bitmap, and re-wraps
              lines to your Kindle, Kobo, or phone width with zero OCR typos.
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
              <ScanText className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" />
              <h3 className="text-sm font-semibold">03. Reflow PDF &amp; EPUB 3</h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Export compact reflowed PDFs, instant offline bitmap EPUBs, or full semantic text
              EPUBs using locally cached WebAssembly OCR.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
