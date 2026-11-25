export type OutputFormat = 'pdf-ocr' | 'pdf' | 'epub-ocr' | 'epub-bitmap';
export type ColumnMode = 'auto' | 1 | 2 | 3;
export type ThresholdMode = 'grayscale' | 'adaptive' | 'otsu';
export type OcrLanguage = 'eng' | 'deu' | 'fra' | 'spa' | 'ita';
export type OcrFontFamily = 'serif' | 'sans';
export type RotationAngle = 0 | 90 | 180 | 270;

export interface OrientationAnalysis {
  suggestedRotationDeg: RotationAngle;
  confidence: number;
  axis: 'horizontal' | 'vertical';
  reason: string;
}

export interface DevicePreset {
  id: string;
  name: string;
  category: string;
  widthMm: number;
  heightMm: number;
  dpi: number;
}

export const DEVICE_PRESETS: DevicePreset[] = [
  {
    id: 'kindle-pw',
    name: 'Kindle Paperwhite 6.8"',
    category: 'E-Ink 6.8"',
    widthMm: 105,
    heightMm: 140,
    dpi: 300,
  },
  {
    id: 'kindle-basic',
    name: 'Kindle Basic 6"',
    category: 'E-Ink 6"',
    widthMm: 91,
    heightMm: 122,
    dpi: 300,
  },
  {
    id: 'kobo-libra',
    name: 'Kobo Libra 7"',
    category: 'E-Ink 7"',
    widthMm: 107,
    heightMm: 143,
    dpi: 300,
  },
  {
    id: 'phone-6',
    name: 'Smartphone 6.1"',
    category: 'Mobile',
    widthMm: 68,
    heightMm: 138,
    dpi: 240,
  },
  {
    id: 'tablet-10',
    name: 'Tablet 10"',
    category: 'Tablet',
    widthMm: 150,
    heightMm: 205,
    dpi: 220,
  },
  {
    id: 'custom',
    name: 'Custom Dimensions',
    category: 'Custom',
    widthMm: 105,
    heightMm: 140,
    dpi: 260,
  },
];

export interface MarginTrimPct {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface ReflowSettings {
  presetId: string;
  targetWidthMm: number;
  targetHeightMm: number;
  targetDpi: number;
  outputFormat: OutputFormat;
  columns: ColumnMode;
  autoCrop: boolean;
  marginTrimPct: MarginTrimPct;
  deskew: boolean;
  autoSmartRotate: boolean;
  contrast: number;
  thresholdMode: ThresholdMode;
  fontScale: number;
  lineSpacing: number;
  wordGapMultiplier: number;
  pageMarginMm: number;
  preserveFigures: boolean;
  preserveParagraphIndent: boolean;
  ocrLanguage: OcrLanguage;
  ocrFontFamily: OcrFontFamily;
  ocrFontSizePt: number;
  preferEmbeddedText: boolean;
  exportQualityDpi: number;
  bookTitle: string;
  bookAuthor: string;
  customNamingEnabled: boolean;
  namingPattern: string;
  namingPrefix: string;
  namingStartIndex: number;
  namingIndexPadding: number;
  epubContinuousFlow: boolean;
  epubShowPageMarkers: boolean;
}

export const DEFAULT_SETTINGS: ReflowSettings = {
  presetId: 'kindle-pw',
  targetWidthMm: 105,
  targetHeightMm: 140,
  targetDpi: 300,
  outputFormat: 'pdf-ocr',
  columns: 'auto',
  autoCrop: true,
  marginTrimPct: {
    top: 4,
    bottom: 4,
    left: 2,
    right: 2,
  },
  deskew: true,
  autoSmartRotate: false,
  contrast: 1.35,
  thresholdMode: 'grayscale',
  fontScale: 1.25,
  lineSpacing: 1.36,
  wordGapMultiplier: 1.0,
  pageMarginMm: 6,
  preserveFigures: true,
  preserveParagraphIndent: true,
  ocrLanguage: 'eng',
  ocrFontFamily: 'serif',
  ocrFontSizePt: 10.5,
  preferEmbeddedText: true,
  exportQualityDpi: 220,
  bookTitle: '',
  bookAuthor: '',
  customNamingEnabled: false,
  namingPattern: '{prefix}{title}_{date}_{index}',
  namingPrefix: '',
  namingStartIndex: 1,
  namingIndexPadding: 2,
  epubContinuousFlow: true,
  epubShowPageMarkers: false,
};

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WordToken {
  x: number;
  y: number;
  w: number;
  h: number;
  lineTop: number;
  lineHeight: number;
  columnIndex: number;
}

export interface SegmentedBlock {
  type: 'line' | 'figure';
  rect: Rect;
  columnIndex: number;
  paragraphBreakBefore: boolean;
  words: WordToken[];
}

export interface PageAnalysis {
  sourcePage: number;
  width: number;
  height: number;
  sourceWidthMm: number;
  sourceHeightMm: number;
  skewDeg: number;
  orientation: OrientationAnalysis;
  cropBox: Rect;
  columns: Rect[];
  blocks: SegmentedBlock[];
  wordCount: number;
  figureCount: number;
  enhancedCanvas: HTMLCanvasElement;
}

export interface ReflowLineStrip {
  dataUrl: string;
  width: number;
  height: number;
  isFigure: boolean;
  paragraphBreakBefore: boolean;
}

export interface ReflowedPage {
  index: number;
  sourcePages: number[];
  canvas: HTMLCanvasElement;
  dataUrl: string;
  width: number;
  height: number;
  wordCount: number;
  figureCount: number;
  lineStrips: ReflowLineStrip[];
}

export interface SourcePageMeta {
  pageNumber: number;
  widthPt: number;
  heightPt: number;
  widthMm: number;
  heightMm: number;
  rotationDeg: RotationAngle;
  included: boolean;
  hasEmbeddedText: boolean;
  embeddedTextPreview: string;
  thumbnailUrl: string | null;
}

export interface LoadedDocument {
  fileName: string;
  fileSizeBytes: number;
  pageCount: number;
  pages: SourcePageMeta[];
  isSample: boolean;
}

export interface ExportBatchStats {
  totalWords: number;
  estimatedReadingMinutes: number;
  figuresExtracted: number;
  elapsedMs: number;
  wordCountBasis: 'ocr-text' | 'bitmap-tokens';
  meanOcrConfidence?: number;
}

export interface ExportHistoryItem {
  id: string;
  fileName: string;
  format: OutputFormat;
  createdAt: string;
  createdAtIso?: string;
  sourcePagesProcessed: number;
  outputPages: number;
  fileSizeBytes: number;
  downloadUrl: string;
  stats: ExportBatchStats;
}

export interface ConversionProgress {
  phase: 'idle' | 'rendering' | 'reflowing' | 'ocr' | 'packaging' | 'done' | 'error';
  currentPage: number;
  totalPages: number;
  percent: number;
  detail: string;
}

export interface OcrWordBox {
  text: string;
  confidence: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OcrChapterContent {
  sourcePage: number;
  paragraphs: string[];
  figures: { dataUrl: string; width: number; height: number }[];
  usedEmbeddedText: boolean;
  meanConfidence: number;
  wordCount: number;
  words: OcrWordBox[];
  isEdited?: boolean;
}
