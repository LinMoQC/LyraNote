import type { CSSProperties } from "react";

export const NOTEBOOK_APPEARANCE_CONFIG_KEY = "notebook_appearance_defaults";

export const NOTEBOOK_FONT_FAMILIES = ["sans", "serif", "mono"] as const;
export const NOTEBOOK_ARTICLE_THEME_IDS = [
  "lyra-default",
  "typora-clean",
  "paper-serif",
  "sepia-reader",
  "mono-draft",
] as const;
export const NOTEBOOK_FONT_SIZES = ["sm", "md", "lg"] as const;
export const NOTEBOOK_CONTENT_WIDTHS = ["narrow", "standard", "wide"] as const;
export const NOTEBOOK_LINE_HEIGHTS = ["compact", "relaxed", "airy"] as const;
export const NOTEBOOK_PARAGRAPH_SPACINGS = ["tight", "normal", "loose"] as const;
export const NOTEBOOK_HEADING_SCALES = ["compact", "balanced", "dramatic"] as const;
export const NOTEBOOK_RIGHT_PANELS = ["copilot", "artifacts"] as const;

export type NotebookFontFamily = (typeof NOTEBOOK_FONT_FAMILIES)[number];
export type NotebookArticleThemeId = (typeof NOTEBOOK_ARTICLE_THEME_IDS)[number];
export type NotebookFontSizeId = (typeof NOTEBOOK_FONT_SIZES)[number];
export type NotebookContentWidthId = (typeof NOTEBOOK_CONTENT_WIDTHS)[number];
export type NotebookLineHeightId = (typeof NOTEBOOK_LINE_HEIGHTS)[number];
export type NotebookParagraphSpacingId = (typeof NOTEBOOK_PARAGRAPH_SPACINGS)[number];
export type NotebookHeadingScaleId = (typeof NOTEBOOK_HEADING_SCALES)[number];
export type NotebookRightPanelId = (typeof NOTEBOOK_RIGHT_PANELS)[number];

export type NotebookAppearanceSettings = {
  fontFamily?: NotebookFontFamily;
  themeId?: NotebookArticleThemeId;
  fontSize?: NotebookFontSizeId;
  contentWidth?: NotebookContentWidthId;
  lineHeight?: NotebookLineHeightId;
  paragraphSpacing?: NotebookParagraphSpacingId;
  headingScale?: NotebookHeadingScaleId;
  emphasizeTitle?: boolean;
  autoSave?: boolean;
  focusModeDefault?: boolean;
  defaultRightPanel?: NotebookRightPanelId;
};

export type ResolvedNotebookAppearance = Required<NotebookAppearanceSettings> & {
  fontFamilyValue: string;
  fontSizeValue: string;
  contentWidthValue: string;
  lineHeightValue: string;
  paragraphSpacingValue: string;
  headingScaleValue: string;
  titleSizeValue: string;
};

export const DEFAULT_NOTEBOOK_APPEARANCE: ResolvedNotebookAppearance = {
  fontFamily: "sans",
  themeId: "lyra-default",
  fontSize: "md",
  contentWidth: "standard",
  lineHeight: "relaxed",
  paragraphSpacing: "normal",
  headingScale: "balanced",
  emphasizeTitle: true,
  autoSave: true,
  focusModeDefault: false,
  defaultRightPanel: "copilot",
  fontFamilyValue:
    '"SF Pro Display", "PingFang SC", "Segoe UI Variable", "Helvetica Neue", sans-serif',
  fontSizeValue: "16px",
  contentWidthValue: "48rem",
  lineHeightValue: "1.85",
  paragraphSpacingValue: "0.92em",
  headingScaleValue: "1.12",
  titleSizeValue: "3rem",
};

const FONT_FAMILY_VALUES: Record<NotebookFontFamily, string> = {
  sans: DEFAULT_NOTEBOOK_APPEARANCE.fontFamilyValue,
  serif:
    '"Iowan Old Style", "Source Han Serif SC", "Noto Serif SC", "Songti SC", Georgia, serif',
  mono:
    '"JetBrains Mono", "SFMono-Regular", "SF Mono", "IBM Plex Mono", "Fira Code", monospace',
};

const FONT_SIZE_VALUES: Record<NotebookFontSizeId, string> = {
  sm: "14px",
  md: "16px",
  lg: "18px",
};

const CONTENT_WIDTH_VALUES: Record<NotebookContentWidthId, string> = {
  narrow: "42rem",
  standard: "48rem",
  wide: "58rem",
};

const LINE_HEIGHT_VALUES: Record<NotebookLineHeightId, string> = {
  compact: "1.72",
  relaxed: "1.85",
  airy: "2",
};

const PARAGRAPH_SPACING_VALUES: Record<NotebookParagraphSpacingId, string> = {
  tight: "0.66em",
  normal: "0.92em",
  loose: "1.18em",
};

const HEADING_SCALE_VALUES: Record<NotebookHeadingScaleId, string> = {
  compact: "1.05",
  balanced: "1.12",
  dramatic: "1.2",
};

const TITLE_SIZE_VALUES: Record<NotebookFontSizeId, string> = {
  sm: "2.5rem",
  md: "2.5rem",
  lg: "2.5rem",
};

export function isNotebookAppearanceSettings(value: unknown): value is NotebookAppearanceSettings {
  return typeof value === "object" && value !== null;
}

export function sanitizeNotebookAppearanceSettings(value: unknown): NotebookAppearanceSettings {
  if (!isNotebookAppearanceSettings(value)) {
    return {};
  }

  const candidate = value as Record<string, unknown>;
  const appearance: NotebookAppearanceSettings = {};

  if (NOTEBOOK_FONT_FAMILIES.includes(candidate.fontFamily as NotebookFontFamily)) {
    appearance.fontFamily = candidate.fontFamily as NotebookFontFamily;
  }
  if (NOTEBOOK_ARTICLE_THEME_IDS.includes(candidate.themeId as NotebookArticleThemeId)) {
    appearance.themeId = candidate.themeId as NotebookArticleThemeId;
  }
  if (NOTEBOOK_FONT_SIZES.includes(candidate.fontSize as NotebookFontSizeId)) {
    appearance.fontSize = candidate.fontSize as NotebookFontSizeId;
  }
  if (NOTEBOOK_CONTENT_WIDTHS.includes(candidate.contentWidth as NotebookContentWidthId)) {
    appearance.contentWidth = candidate.contentWidth as NotebookContentWidthId;
  }
  if (NOTEBOOK_LINE_HEIGHTS.includes(candidate.lineHeight as NotebookLineHeightId)) {
    appearance.lineHeight = candidate.lineHeight as NotebookLineHeightId;
  }
  if (NOTEBOOK_PARAGRAPH_SPACINGS.includes(candidate.paragraphSpacing as NotebookParagraphSpacingId)) {
    appearance.paragraphSpacing = candidate.paragraphSpacing as NotebookParagraphSpacingId;
  }
  if (NOTEBOOK_HEADING_SCALES.includes(candidate.headingScale as NotebookHeadingScaleId)) {
    appearance.headingScale = candidate.headingScale as NotebookHeadingScaleId;
  }
  if (typeof candidate.emphasizeTitle === "boolean") {
    appearance.emphasizeTitle = candidate.emphasizeTitle;
  }
  if (typeof candidate.autoSave === "boolean") {
    appearance.autoSave = candidate.autoSave;
  }
  if (typeof candidate.focusModeDefault === "boolean") {
    appearance.focusModeDefault = candidate.focusModeDefault;
  }
  if (NOTEBOOK_RIGHT_PANELS.includes(candidate.defaultRightPanel as NotebookRightPanelId)) {
    appearance.defaultRightPanel = candidate.defaultRightPanel as NotebookRightPanelId;
  }

  return appearance;
}

export function sanitizeNotebookAppearanceSettingsFromApi(value: unknown): NotebookAppearanceSettings {
  if (!value || typeof value !== "object") {
    return {};
  }
  const raw = value as Record<string, unknown>;
  return sanitizeNotebookAppearanceSettings({
    fontFamily: raw.font_family ?? raw.fontFamily,
    themeId: raw.theme_id ?? raw.themeId,
    fontSize: raw.font_size ?? raw.fontSize,
    contentWidth: raw.content_width ?? raw.contentWidth,
    lineHeight: raw.line_height ?? raw.lineHeight,
    paragraphSpacing: raw.paragraph_spacing ?? raw.paragraphSpacing,
    headingScale: raw.heading_scale ?? raw.headingScale,
    emphasizeTitle: raw.emphasize_title ?? raw.emphasizeTitle,
    autoSave: raw.auto_save ?? raw.autoSave,
    focusModeDefault: raw.focus_mode_default ?? raw.focusModeDefault,
    defaultRightPanel: raw.default_right_panel ?? raw.defaultRightPanel,
  });
}

export function toNotebookAppearanceApiPayload(
  value: NotebookAppearanceSettings,
): Record<string, unknown> {
  const clean = sanitizeNotebookAppearanceSettings(value);
  const payload: Record<string, unknown> = {};
  if (clean.fontFamily) payload.font_family = clean.fontFamily;
  if (clean.themeId) payload.theme_id = clean.themeId;
  if (clean.fontSize) payload.font_size = clean.fontSize;
  if (clean.contentWidth) payload.content_width = clean.contentWidth;
  if (clean.lineHeight) payload.line_height = clean.lineHeight;
  if (clean.paragraphSpacing) payload.paragraph_spacing = clean.paragraphSpacing;
  if (clean.headingScale) payload.heading_scale = clean.headingScale;
  if (typeof clean.emphasizeTitle === "boolean") payload.emphasize_title = clean.emphasizeTitle;
  if (typeof clean.autoSave === "boolean") payload.auto_save = clean.autoSave;
  if (typeof clean.focusModeDefault === "boolean") payload.focus_mode_default = clean.focusModeDefault;
  if (clean.defaultRightPanel) payload.default_right_panel = clean.defaultRightPanel;
  return payload;
}

export function resolveNotebookAppearance(
  globalDefaults?: NotebookAppearanceSettings,
  notebookOverrides?: NotebookAppearanceSettings,
): ResolvedNotebookAppearance {
  const merged = {
    ...DEFAULT_NOTEBOOK_APPEARANCE,
    ...sanitizeNotebookAppearanceSettings(globalDefaults),
    ...sanitizeNotebookAppearanceSettings(notebookOverrides),
  };

  return {
    ...merged,
    fontFamilyValue: FONT_FAMILY_VALUES[merged.fontFamily],
    fontSizeValue: FONT_SIZE_VALUES[merged.fontSize],
    contentWidthValue: CONTENT_WIDTH_VALUES[merged.contentWidth],
    lineHeightValue: LINE_HEIGHT_VALUES[merged.lineHeight],
    paragraphSpacingValue: PARAGRAPH_SPACING_VALUES[merged.paragraphSpacing],
    headingScaleValue: HEADING_SCALE_VALUES[merged.headingScale],
    titleSizeValue: TITLE_SIZE_VALUES[merged.fontSize],
  };
}

export function serializeNotebookAppearanceSettings(value: NotebookAppearanceSettings): string {
  return JSON.stringify(sanitizeNotebookAppearanceSettings(value));
}

export function toNotebookAppearanceSettings(
  value: NotebookAppearanceSettings,
): NotebookAppearanceSettings {
  return sanitizeNotebookAppearanceSettings(value);
}

export function parseNotebookAppearanceSettings(value?: string | null): NotebookAppearanceSettings {
  if (!value) {
    return {};
  }
  try {
    return sanitizeNotebookAppearanceSettings(JSON.parse(value));
  } catch {
    return {};
  }
}

export function buildNotebookAppearanceStyle(
  appearance: ResolvedNotebookAppearance,
): CSSProperties {
  return {
    "--editor-font-family": appearance.fontFamilyValue,
    "--editor-font-size": appearance.fontSizeValue,
    "--editor-content-width": appearance.contentWidthValue,
    "--editor-line-height": appearance.lineHeightValue,
    "--editor-paragraph-spacing": appearance.paragraphSpacingValue,
    "--editor-heading-scale": appearance.headingScaleValue,
    "--editor-title-size": appearance.titleSizeValue,
  } as CSSProperties;
}
