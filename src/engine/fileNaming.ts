import type { OutputFormat, ReflowSettings } from './types';

export interface NamingTokenInfo {
  token: string;
  label: string;
  description: string;
}

export const NAMING_TOKENS: NamingTokenInfo[] = [
  { token: '{prefix}', label: 'Prefix', description: 'Custom batch prefix' },
  { token: '{title}', label: 'Title', description: 'Book title or PDF name' },
  { token: '{date}', label: 'Date', description: 'YYYY-MM-DD' },
  { token: '{index}', label: 'Index', description: 'Auto-incrementing counter' },
  { token: '{format}', label: 'Format', description: 'ocr_reflow / bitmap_reflow / epub' },
  { token: '{preset}', label: 'Device', description: 'Target reader preset ID' },
  { token: '{pages}', label: 'Pages', description: 'Selected page count (e.g. 12p)' },
  { token: '{time}', label: 'Time', description: 'Local HHmm timestamp' },
];

export const NAMING_PATTERN_PRESETS: { label: string; pattern: string }[] = [
  { label: 'Prefix + Title + Date + Index', pattern: '{prefix}{title}_{date}_{index}' },
  { label: 'Index + Prefix + Title', pattern: '{index}_{prefix}{title}' },
  { label: 'Date + Title + Format', pattern: '{date}_{title}_{format}' },
  { label: 'Title + Device + Index', pattern: '{title}_{preset}_{index}' },
];

const FORMAT_SLUGS: Record<OutputFormat, string> = {
  'pdf-ocr': 'ocr_reflow',
  pdf: 'bitmap_reflow',
  'epub-ocr': 'ocr',
  'epub-bitmap': 'bitmap',
};

function sanitizeSegment(raw: string): string {
  return raw
    .replace(/[^a-z0-9\-_\s.]/gi, '')
    .trim()
    .replace(/\s+/g, '_');
}

function sanitizeFullFileNameBase(raw: string): string {
  return raw
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/-{2,}/g, '-')
    .replace(/^[_.\-\s]+|[_.\-\s]+$/g, '')
    .slice(0, 96);
}

function formatLocalDate(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatLocalTime(now: Date): string {
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}${mm}`;
}

export interface ResolveFileNameOptions {
  settings: ReflowSettings;
  sourceFileName: string;
  selectedPageCount: number;
  now?: Date;
}

/**
 * Resolves the final exported filename (with `.pdf` or `.epub` extension)
 * using either the default automatic convention or the user's custom batch
 * naming pattern (prefix, date, incrementing index, format, device, etc.).
 */
export function resolveExportFileName({
  settings,
  sourceFileName,
  selectedPageCount,
  now = new Date(),
}: ResolveFileNameOptions): string {
  const ext: 'pdf' | 'epub' =
    settings.outputFormat === 'pdf-ocr' || settings.outputFormat === 'pdf' ? 'pdf' : 'epub';
  const sourceBase = sanitizeSegment(sourceFileName.replace(/\.pdf$/i, '')) || 'document';
  const titleBase = sanitizeSegment(settings.bookTitle) || sourceBase;
  const formatSlug = FORMAT_SLUGS[settings.outputFormat];

  if (!settings.customNamingEnabled) {
    const base = sanitizeFullFileNameBase(`${titleBase}_${formatSlug}`) || 'document';
    return `${base}.${ext}`;
  }

  const padding = Math.max(1, Math.min(6, Math.round(settings.namingIndexPadding || 2)));
  const indexValue = Math.max(0, Math.round(settings.namingStartIndex ?? 1));
  const paddedIndex = String(indexValue).padStart(padding, '0');
  const prefixRaw = settings.namingPrefix.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, '_');

  const tokenValues: Record<string, string> = {
    '{prefix}': prefixRaw,
    '{title}': titleBase.slice(0, 56),
    '{source}': sourceBase.slice(0, 56),
    '{format}': formatSlug,
    '{preset}': sanitizeSegment(settings.presetId || 'custom'),
    '{date}': formatLocalDate(now),
    '{time}': formatLocalTime(now),
    '{index}': paddedIndex,
    '{pages}': `${Math.max(0, selectedPageCount)}p`,
  };

  const pattern = settings.namingPattern.trim() || '{title}_{format}';
  let rendered = pattern;
  for (const [token, val] of Object.entries(tokenValues)) {
    rendered = rendered.split(token).join(val);
  }

  // Strip accidental double extension if the user typed .pdf or .epub in the pattern
  rendered = rendered.replace(/\.(pdf|epub)$/i, '');

  const safeBase = sanitizeFullFileNameBase(rendered) || `${titleBase}_${paddedIndex}`;
  return `${safeBase}.${ext}`;
}
