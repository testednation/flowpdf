import React, { useEffect } from 'react';
import { Keyboard, Moon, RotateCcw, Sun, X } from 'lucide-react';
import { OCR_LANGUAGE_LABELS } from '../engine/ocrEngine';
import {
  DEVICE_PRESETS,
  type ColumnMode,
  type OcrFontFamily,
  type OcrLanguage,
  type OutputFormat,
  type ReflowSettings,
  type ThresholdMode,
} from '../engine/types';
import { PWAInstallButton } from './PWAInstallButton';

interface ConfigSidebarProps {
  settings: ReflowSettings;
  onChange: (patch: Partial<ReflowSettings>) => void;
  onReset: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
  onOpenShortcuts: () => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const ConfigSidebar: React.FC<ConfigSidebarProps> = ({
  settings,
  onChange,
  onReset,
  isDark,
  onToggleTheme,
  onOpenShortcuts,
  mobileOpen = false,
  onCloseMobile,
}) => {
  // Lock background page scroll & allow Escape close when mobile settings sheet is open
  useEffect(() => {
    if (!mobileOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseMobile?.();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [mobileOpen, onCloseMobile]);
  const handlePresetChange = (presetId: string) => {
    const preset = DEVICE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    onChange({
      presetId: preset.id,
      targetWidthMm: preset.widthMm,
      targetHeightMm: preset.heightMm,
      targetDpi: preset.dpi,
    });
  };

  const updateTrim = (edge: keyof ReflowSettings['marginTrimPct'], value: number) => {
    onChange({
      marginTrimPct: {
        ...settings.marginTrimPct,
        [edge]: value,
      },
    });
  };

  const formats: { id: OutputFormat; label: string }[] = [
    { id: 'pdf-ocr', label: 'OCR Reflow PDF' },
    { id: 'pdf', label: 'Bitmap PDF' },
    { id: 'epub-ocr', label: 'OCR EPUB' },
    { id: 'epub-bitmap', label: 'Bitmap EPUB' },
  ];

  const isOcrMode = settings.outputFormat === 'pdf-ocr' || settings.outputFormat === 'epub-ocr';

  const columnOptions: { id: ColumnMode; label: string }[] = [
    { id: 'auto', label: 'Auto' },
    { id: 1, label: '1' },
    { id: 2, label: '2' },
    { id: 3, label: '3' },
  ];

  const thresholdOptions: { id: ThresholdMode; label: string }[] = [
    { id: 'grayscale', label: 'Grayscale' },
    { id: 'adaptive', label: 'Adaptive' },
    { id: 'otsu', label: 'Mono' },
  ];

  const sidebarSections = (
    <div className="flex-1 overflow-y-auto overscroll-contain divide-y divide-slate-200 dark:divide-slate-800">
      {/* Section 1: Output Format & Target Device */}
      <section className="p-4 space-y-3.5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              Output &amp; Target Screen
            </h2>
            <span className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
              {settings.targetWidthMm}×{settings.targetHeightMm} mm
            </span>
          </div>

          {/* Format Segmented Control (2x2 clean grid) */}
          <div
            role="radiogroup"
            aria-label="Output format"
            className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800"
          >
            {formats.map((f) => {
              const active = settings.outputFormat === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onChange({ outputFormat: f.id })}
                  className={`px-2 py-2.5 lg:py-1.5 text-xs lg:text-[11px] font-medium rounded-md transition-colors whitespace-nowrap truncate ${
                    active
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {/* OCR Language Picker when OCR mode is selected */}
          {isOcrMode && (
            <div className="space-y-1.5">
              <label
                htmlFor="sidebar-ocr-lang"
                className="block text-xs font-medium text-slate-600 dark:text-slate-400"
              >
                OCR Language
              </label>
              <select
                id="sidebar-ocr-lang"
                value={settings.ocrLanguage}
                onChange={(e) => onChange({ ocrLanguage: e.target.value as OcrLanguage })}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/40"
              >
                {(Object.keys(OCR_LANGUAGE_LABELS) as OcrLanguage[]).map((code) => (
                  <option key={code} value={code}>
                    {OCR_LANGUAGE_LABELS[code]}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Target Device Preset */}
          <div className="space-y-1.5">
            <label
              htmlFor="device-preset"
              className="block text-xs font-medium text-slate-600 dark:text-slate-400"
            >
              Reader Preset
            </label>
            <select
              id="device-preset"
              value={settings.presetId}
              onChange={(e) => handlePresetChange(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/40"
            >
              {DEVICE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.widthMm}×{p.heightMm} mm)
                </option>
              ))}
            </select>
          </div>

          {settings.presetId === 'custom' && (
            <div className="grid grid-cols-2 gap-2.5 pt-0.5">
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  Width (mm)
                </label>
                <input
                  type="number"
                  min={50}
                  max={250}
                  value={settings.targetWidthMm}
                  onChange={(e) =>
                    onChange({ targetWidthMm: Math.max(50, Math.min(250, Number(e.target.value) || 105)) })
                  }
                  className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 font-mono text-xs tabular-nums text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  Height (mm)
                </label>
                <input
                  type="number"
                  min={70}
                  max={350}
                  value={settings.targetHeightMm}
                  onChange={(e) =>
                    onChange({ targetHeightMm: Math.max(70, Math.min(350, Number(e.target.value) || 140)) })
                  }
                  className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 font-mono text-xs tabular-nums text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
          )}
        </section>

        {/* Section 2: Scan Cleanup & Column Layout */}
        <section className="p-4 space-y-3.5">
          <h2 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            Scan Geometry &amp; Columns
          </h2>

          {/* Columns */}
          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Source Columns
            </span>
            <div className="grid grid-cols-4 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
              {columnOptions.map((opt) => {
                const active = settings.columns === opt.id;
                return (
                  <button
                    key={String(opt.id)}
                    type="button"
                    onClick={() => onChange({ columns: opt.id })}
                    className={`py-2.5 lg:py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-2.5 pt-0.5">
            <ToggleRow
              label="Auto Smart Rotate"
              description="Auto-correct sideways scans on export"
              checked={settings.autoSmartRotate}
              onChange={(v) => onChange({ autoSmartRotate: v })}
            />
            <ToggleRow
              label="Auto-Deskew Scan"
              description="Straightens tilted page scans"
              checked={settings.deskew}
              onChange={(v) => onChange({ deskew: v })}
            />
            <ToggleRow
              label="Auto-Crop Borders"
              description="Trims dark scanner edges & margins"
              checked={settings.autoCrop}
              onChange={(v) => onChange({ autoCrop: v })}
            />
            <ToggleRow
              label="Preserve Figures"
              description="Keeps diagrams & plates intact"
              checked={settings.preserveFigures}
              onChange={(v) => onChange({ preserveFigures: v })}
            />
            <ToggleRow
              label="Paragraph Indents"
              description="Adds subtle first-line indentation"
              checked={settings.preserveParagraphIndent}
              onChange={(v) => onChange({ preserveParagraphIndent: v })}
            />
          </div>

          {/* Manual Margin Trim (strips running headers / footers) */}
          <div className="pt-1 space-y-2.5">
            <span className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Header &amp; Edge Trim (%)
            </span>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              <CompactSlider
                label="Top"
                value={settings.marginTrimPct.top}
                min={0}
                max={20}
                step={1}
                suffix="%"
                onChange={(v) => updateTrim('top', v)}
              />
              <CompactSlider
                label="Bottom"
                value={settings.marginTrimPct.bottom}
                min={0}
                max={20}
                step={1}
                suffix="%"
                onChange={(v) => updateTrim('bottom', v)}
              />
              <CompactSlider
                label="Left"
                value={settings.marginTrimPct.left}
                min={0}
                max={20}
                step={1}
                suffix="%"
                onChange={(v) => updateTrim('left', v)}
              />
              <CompactSlider
                label="Right"
                value={settings.marginTrimPct.right}
                min={0}
                max={20}
                step={1}
                suffix="%"
                onChange={(v) => updateTrim('right', v)}
              />
            </div>
          </div>
        </section>

        {/* Section 3: Ink Enhancement & Reflow Typography */}
        <section className="p-4 space-y-3.5">
          <h2 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            Ink &amp; Reflow Metrics
          </h2>

          {/* Threshold Mode */}
          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Paper &amp; Ink Filter
            </span>
            <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
              {thresholdOptions.map((opt) => {
                const active = settings.thresholdMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChange({ thresholdMode: opt.id })}
                    className={`py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <SliderRow
              label="Ink Contrast"
              value={settings.contrast}
              min={0.6}
              max={2.4}
              step={0.05}
              display={`${settings.contrast.toFixed(2)}×`}
              onChange={(v) => onChange({ contrast: v })}
            />
            {settings.outputFormat === 'pdf-ocr' ? (
              <>
                <div className="space-y-1.5">
                  <span className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                    Reflow Typeface
                  </span>
                  <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                    {(
                      [
                        { id: 'serif', label: 'Times Serif' },
                        { id: 'sans', label: 'Helvetica Sans' },
                      ] as { id: OcrFontFamily; label: string }[]
                    ).map((opt) => {
                      const active = settings.ocrFontFamily === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => onChange({ ocrFontFamily: opt.id })}
                          className={`py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                            active
                              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <SliderRow
                  label="Reflow Text Size"
                  value={settings.ocrFontSizePt}
                  min={8}
                  max={16}
                  step={0.5}
                  display={`${settings.ocrFontSizePt.toFixed(1)} pt`}
                  onChange={(v) => onChange({ ocrFontSizePt: v })}
                />
              </>
            ) : (
              <>
                <SliderRow
                  label="Font Magnification"
                  value={settings.fontScale}
                  min={0.65}
                  max={2.1}
                  step={0.05}
                  display={`${Math.round(settings.fontScale * 100)}%`}
                  onChange={(v) => onChange({ fontScale: v })}
                />
                <SliderRow
                  label="Word Split Gap"
                  value={settings.wordGapMultiplier}
                  min={0.7}
                  max={1.55}
                  step={0.05}
                  display={`${settings.wordGapMultiplier.toFixed(2)}×`}
                  onChange={(v) => onChange({ wordGapMultiplier: v })}
                />
              </>
            )}
            <SliderRow
              label="Line Spacing"
              value={settings.lineSpacing}
              min={1.08}
              max={1.85}
              step={0.04}
              display={`${settings.lineSpacing.toFixed(2)}×`}
              onChange={(v) => onChange({ lineSpacing: v })}
            />
            <SliderRow
              label="Reader Margin"
              value={settings.pageMarginMm}
              min={2}
              max={14}
              step={1}
              display={`${settings.pageMarginMm} mm`}
              onChange={(v) => onChange({ pageMarginMm: v })}
            />
          </div>
        </section>
      </div>
  );

  const sidebarFooter = (
    <div className="p-3.5 border-t border-slate-200 dark:border-slate-800 space-y-2 bg-slate-50/70 dark:bg-slate-950/50 pb-safe">
      <PWAInstallButton />
      <div className="flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={onReset}
          className="flex items-center justify-center gap-1.5 rounded-md px-2.5 py-2.5 lg:py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset
        </button>
        <button
          type="button"
          onClick={onOpenShortcuts}
          title="Keyboard shortcuts (?)"
          className="hidden lg:flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap"
        >
          <Keyboard className="w-3.5 h-3.5" />
          Keys
        </button>
        <button
          type="button"
          onClick={onToggleTheme}
          className="flex items-center justify-center gap-1.5 rounded-md px-2.5 py-2.5 lg:py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap"
        >
          {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          {isDark ? 'Light' : 'Dark'}
        </button>
        {onCloseMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            className="lg:hidden rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 transition-colors whitespace-nowrap"
          >
            Done
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Docked Studio Sidebar */}
      <aside className="hidden lg:flex lg:w-[308px] lg:shrink-0 lg:border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex-col">
        {sidebarSections}
        {sidebarFooter}
      </aside>

      {/* Mobile & Tablet Slide-Up Settings Sheet */}
      {mobileOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Reflow and OCR Settings"
          className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end"
        >
          <div
            onClick={onCloseMobile}
            className="absolute inset-0 bg-slate-950/55 backdrop-blur-xs"
            aria-hidden="true"
          />
          <aside className="relative z-10 w-full max-h-[86dvh] rounded-t-2xl border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl flex flex-col overflow-hidden">
            {/* Drag Handle & Sheet Header */}
            <div className="pt-2.5 pb-2 px-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <div
                aria-hidden="true"
                className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700 mx-auto mb-2.5"
              />
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                    Reflow &amp; Scan Settings
                  </h2>
                  <p className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                    {settings.targetWidthMm}×{settings.targetHeightMm} mm · Live updates preview
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onCloseMobile}
                  aria-label="Close settings"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {sidebarSections}
            {sidebarFooter}
          </aside>
        </div>
      )}
    </>
  );
};

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const ToggleRow: React.FC<ToggleRowProps> = ({ label, description, checked, onChange }) => (
  <label className="flex items-start justify-between gap-3 cursor-pointer select-none">
    <span className="min-w-0">
      <span className="block text-xs font-medium text-slate-800 dark:text-slate-200 leading-tight">
        {label}
      </span>
      <span className="block text-[11px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
        {description}
      </span>
    </span>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
        checked ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform mt-0.5 ${
          checked ? 'translate-x-4.5' : 'translate-x-0.5'
        }`}
      />
    </button>
  </label>
);

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}

const SliderRow: React.FC<SliderRowProps> = ({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between text-xs">
      <span className="font-medium text-slate-700 dark:text-slate-300">{label}</span>
      <span className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
        {display}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="studio-slider w-full"
    />
  </div>
);

interface CompactSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
}

const CompactSlider: React.FC<CompactSliderProps> = ({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-slate-600 dark:text-slate-400">{label}</span>
      <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
        {value}
        {suffix}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="studio-slider w-full"
    />
  </div>
);
