export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent);
}

export function getModKeyLabel(): string {
  return isMacPlatform() ? '⌘' : 'Ctrl';
}

/**
 * Returns true when focus is inside an editable form field so single-key
 * and arrow shortcuts never hijack user typing.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const input = target as HTMLInputElement;
    // Allow global shortcuts if focus is only on a checkbox/radio/button/range
    const nonTypingTypes = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range']);
    return !nonTypingTypes.has(input.type);
  }
  return false;
}

export interface ShortcutEntry {
  keys: string[];
  description: string;
  category: 'Navigation' | 'Workbench Preview' | 'OCR & Export';
}

export function getShortcutReference(): ShortcutEntry[] {
  const mod = getModKeyLabel();
  return [
    { category: 'Navigation', keys: ['←', '→'], description: 'Previous / next source PDF page' },
    {
      category: 'Navigation',
      keys: ['Shift + ←', 'Shift + →'],
      description: 'Previous / next reflowed e-reader screen',
    },
    { category: 'Navigation', keys: ['Alt + 1–4'], description: 'Switch Workbench, Pages, Export, Guide' },
    { category: 'Navigation', keys: [`${mod} + O`], description: 'Open a scanned PDF from disk' },
    { category: 'Navigation', keys: ['?'], description: 'Show or hide keyboard shortcuts' },

    { category: 'Workbench Preview', keys: ['1', '2', '3'], description: 'Switch Split, Reader, or Compare layout' },
    { category: 'Workbench Preview', keys: ['V'], description: 'Cycle Raw, Columns & Crop, OCR/Word boxes' },
    { category: 'Workbench Preview', keys: ['L'], description: 'Cycle Paper, Sepia, and Night screen themes' },
    { category: 'Workbench Preview', keys: ['Shift + R'], description: 'Rotate active page 90° clockwise' },
    { category: 'Workbench Preview', keys: ['A'], description: 'Run Smart Rotate on active page' },
    { category: 'Workbench Preview', keys: ['+', '-', '0'], description: 'Zoom in, zoom out, or reset preview zoom' },

    { category: 'OCR & Export', keys: [`${mod} + E`], description: 'Open Export view (or run export if open)' },
    { category: 'OCR & Export', keys: ['R'], description: 'Run or re-run offline OCR on active page' },
    { category: 'OCR & Export', keys: ['T'], description: 'Toggle Reflow Preview / Edit OCR Text' },
    { category: 'OCR & Export', keys: ['Esc'], description: 'Close modal or return from OCR text editor' },
  ];
}
