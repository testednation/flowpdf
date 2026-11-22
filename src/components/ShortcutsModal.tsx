import React from 'react';
import { Keyboard, X } from 'lucide-react';
import { getShortcutReference, type ShortcutEntry } from '../hooks/useKeyboardShortcuts';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORIES: ShortcutEntry['category'][] = [
  'Navigation',
  'Workbench Preview',
  'OCR & Export',
];

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const entries = getShortcutReference();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-modal-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-blue-700 dark:text-blue-400" />
            <h2
              id="shortcuts-modal-title"
              className="font-display text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              Keyboard Shortcuts
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close shortcuts"
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 max-h-[70vh] overflow-y-auto space-y-5">
          {CATEGORIES.map((category) => (
            <section key={category} className="space-y-2">
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {category}
              </h3>
              <div className="divide-y divide-slate-200/80 dark:divide-slate-800 border-t border-slate-200/80 dark:border-slate-800">
                {entries
                  .filter((e) => e.category === category)
                  .map((entry) => (
                    <div
                      key={entry.description}
                      className="py-2 flex items-center justify-between gap-4 text-xs"
                    >
                      <span className="text-slate-700 dark:text-slate-300">
                        {entry.description}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        {entry.keys.map((keyLabel) => (
                          <kbd
                            key={keyLabel}
                            className="inline-flex items-center justify-center min-w-[24px] rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-1.5 py-0.5 font-mono text-[11px] font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap"
                          >
                            {keyLabel}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </section>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <span>Single-key shortcuts pause automatically while typing in text fields.</span>
          <button
            type="button"
            onClick={onClose}
            className="font-semibold text-slate-900 dark:text-slate-100 hover:underline whitespace-nowrap ml-3"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
