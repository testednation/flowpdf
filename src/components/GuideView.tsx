import React from 'react';

const FORMAT_GUIDE_ITEMS = [
  {
    mode: 'OCR Reflow PDF',
    offline: 'Offline after 1-time model cache or local .traineddata file',
    how: 'Detects and extracts text column-by-column via local WASM Tesseract OCR (editable in Workbench) and reflows crisp vector typography plus extracted diagrams into a compact, selectable e-reader PDF.',
    bestFor: 'Selectable/searchable text, razor-sharp typography at any zoom, tiny file sizes.',
  },
  {
    mode: 'Bitmap PDF (k2pdfopt)',
    offline: '100% instant offline',
    how: 'Crops, deskews, splits columns, isolates word bitmaps, and re-wraps lines to your exact e-reader page dimensions.',
    bestFor: 'Math papers, antique fonts, dense 2-column scans, zero-typo archival fidelity.',
  },
  {
    mode: 'Bitmap EPUB 3',
    offline: '100% instant offline',
    how: 'Packages reflowed word-line strips and preserved figures into a standard EPUB 3 archive that flows naturally on Kindle, Kobo, and Apple Books.',
    bestFor: 'E-readers that prefer EPUB over PDF, or degraded scans where OCR struggles.',
  },
  {
    mode: 'OCR Text EPUB 3',
    offline: 'Offline after 1-time model cache or local .traineddata file',
    how: 'Uses embedded PDF text if present, or runs local WebAssembly Tesseract OCR column-by-column while keeping diagrams intact.',
    bestFor: 'Full font switching, dictionary lookup, highlights, and dark-mode reading.',
  },
];

export const GuideView: React.FC = () => {
  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-10 max-w-4xl mx-auto w-full space-y-8 sm:space-y-10">
      <div className="space-y-2 pb-5 sm:pb-6 border-b border-slate-200 dark:border-slate-800">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
          Offline Conversion Guide
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-2xl">
          FolioReflow runs its PDF renderer, image filters, column/word segmentation, PDF builder,
          and EPUB packager entirely inside your browser. Once loaded or installed as a PWA, you can
          disconnect from the internet completely.
        </p>
      </div>

      {/* Mode Comparison: Stacked Cards on Mobile, Table on Desktop */}
      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
          01. Choosing the Right Output Format
        </h2>

        <div className="md:hidden divide-y divide-slate-200 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          {FORMAT_GUIDE_ITEMS.map((item) => (
            <div key={item.mode} className="p-4 space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {item.mode}
                </h3>
                <span className="text-[11px] text-blue-700 dark:text-blue-400 font-medium">
                  {item.offline}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {item.how}
              </p>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                <strong className="font-medium text-slate-900 dark:text-slate-100">Best for:</strong>{' '}
                {item.bestFor}
              </p>
            </div>
          ))}
        </div>

        <div className="hidden md:block overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4 font-medium">Mode</th>
                <th className="py-3 px-4 font-medium">How It Works</th>
                <th className="py-3 px-4 font-medium">Offline Readiness</th>
                <th className="py-3 px-4 font-medium">Best For</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {FORMAT_GUIDE_ITEMS.map((item) => (
                <tr key={item.mode}>
                  <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                    {item.mode}
                  </td>
                  <td className="py-3 px-4 leading-relaxed">{item.how}</td>
                  <td className="py-3 px-4 leading-relaxed">{item.offline}</td>
                  <td className="py-3 px-4 leading-relaxed">{item.bestFor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Practical Scan Tuning Recipes */}
      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
          02. Tuning Difficult Vintage Scans
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1.5 border-t border-slate-200 dark:border-slate-800 pt-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Dark book-spine shadows or uneven lighting
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Switch <strong>Paper &amp; Ink Filter</strong> from <em>Grayscale</em> to{' '}
              <em>Adaptive</em>. Adaptive thresholding measures local brightness around every word,
              lifting ink cleanly out of shadowed inner binding gutters.
            </p>
          </div>

          <div className="space-y-1.5 border-t border-slate-200 dark:border-slate-800 pt-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Repeated headers or page numbers interrupting text
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Increase <strong>Top</strong> and <strong>Bottom</strong> under{' '}
              <em>Header &amp; Edge Trim (%)</em> while watching the blue dashed crop box in{' '}
              <em>Columns &amp; Crop</em> mode until headers sit outside the frame.
            </p>
          </div>

          <div className="space-y-1.5 border-t border-slate-200 dark:border-slate-800 pt-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Words merging together or splitting mid-letter
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Switch the source preview to <strong>Word Boxes</strong> and adjust{' '}
              <strong>Word Split Gap</strong>. Lower values split tightly tracked words; higher
              values keep loose letter-spaced serif fonts intact.
            </p>
          </div>

          <div className="space-y-1.5 border-t border-slate-200 dark:border-slate-800 pt-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              100% air-gapped OCR without internet access
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Either click <strong>Pre-Cache Model</strong> in the Export tab while online, or click{' '}
              <strong>Load Local .traineddata</strong> to feed any standard Tesseract 4/5 language
              file directly from your hard drive.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
