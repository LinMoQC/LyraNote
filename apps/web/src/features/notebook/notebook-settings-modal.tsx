"use client";

import { AnimatePresence, m } from "framer-motion";
import { RotateCcw, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { CustomSelect, SettingRow, Toggle } from "@/components/settings/settings-primitives";
import {
  DEFAULT_NOTEBOOK_APPEARANCE,
  buildNotebookAppearanceStyle,
  resolveNotebookAppearance,
  toNotebookAppearanceSettings,
  type NotebookAppearanceSettings,
} from "@/features/notebook/notebook-appearance";
import { cn } from "@/lib/utils";

type Scope = "notebook" | "global";

export function NotebookSettingsModal({
  open,
  notebookTitle,
  globalDefaults,
  notebookOverrides,
  onClose,
  onSaveNotebookOverrides,
  onSaveGlobalDefaults,
}: {
  open: boolean;
  notebookTitle: string;
  globalDefaults: NotebookAppearanceSettings;
  notebookOverrides: NotebookAppearanceSettings;
  onClose: () => void;
  onSaveNotebookOverrides: (settings: NotebookAppearanceSettings) => Promise<void>;
  onSaveGlobalDefaults: (settings: NotebookAppearanceSettings) => Promise<void>;
}) {
  const t = useTranslations("notebook");
  const [scope, setScope] = useState<Scope>("notebook");
  const [globalDraft, setGlobalDraft] = useState<NotebookAppearanceSettings>(globalDefaults);
  const [notebookDraft, setNotebookDraft] = useState<NotebookAppearanceSettings>(notebookOverrides);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setScope("notebook");
    setGlobalDraft(globalDefaults);
    setNotebookDraft(notebookOverrides);
  }, [globalDefaults, notebookOverrides, open]);

  const activeDraft = scope === "notebook" ? notebookDraft : globalDraft;
  const setActiveDraft = scope === "notebook" ? setNotebookDraft : setGlobalDraft;
  const previewAppearance = useMemo(
    () =>
      scope === "global"
        ? resolveNotebookAppearance(globalDraft)
        : resolveNotebookAppearance(globalDefaults, notebookDraft),
    [globalDefaults, globalDraft, notebookDraft, scope],
  );

  const fontOptions = [
    { value: "sans", label: t("settings.fontOptions.sans") },
    { value: "serif", label: t("settings.fontOptions.serif") },
    { value: "mono", label: t("settings.fontOptions.mono") },
  ];
  const themeOptions = [
    { value: "lyra-default", label: t("settings.themeOptions.lyraDefault") },
    { value: "typora-clean", label: t("settings.themeOptions.typoraClean") },
    { value: "paper-serif", label: t("settings.themeOptions.paperSerif") },
    { value: "sepia-reader", label: t("settings.themeOptions.sepiaReader") },
    { value: "mono-draft", label: t("settings.themeOptions.monoDraft") },
  ];
  const fontSizeOptions = [
    { value: "sm", label: t("settings.fontSizeOptions.sm") },
    { value: "md", label: t("settings.fontSizeOptions.md") },
    { value: "lg", label: t("settings.fontSizeOptions.lg") },
  ];
  const widthOptions = [
    { value: "narrow", label: t("settings.widthOptions.narrow") },
    { value: "standard", label: t("settings.widthOptions.standard") },
    { value: "wide", label: t("settings.widthOptions.wide") },
  ];
  const lineHeightOptions = [
    { value: "compact", label: t("settings.lineHeightOptions.compact") },
    { value: "relaxed", label: t("settings.lineHeightOptions.relaxed") },
    { value: "airy", label: t("settings.lineHeightOptions.airy") },
  ];
  const paragraphOptions = [
    { value: "tight", label: t("settings.paragraphOptions.tight") },
    { value: "normal", label: t("settings.paragraphOptions.normal") },
    { value: "loose", label: t("settings.paragraphOptions.loose") },
  ];
  const headingOptions = [
    { value: "compact", label: t("settings.headingOptions.compact") },
    { value: "balanced", label: t("settings.headingOptions.balanced") },
    { value: "dramatic", label: t("settings.headingOptions.dramatic") },
  ];
  const rightPanelOptions = [
    { value: "copilot", label: t("settings.rightPanelOptions.copilot") },
    { value: "artifacts", label: t("settings.rightPanelOptions.artifacts") },
  ];

  async function handleSave() {
    setSaving(true);
    try {
      if (scope === "global") {
        await onSaveGlobalDefaults(toNotebookAppearanceSettings(globalDraft));
      } else {
        await onSaveNotebookOverrides(toNotebookAppearanceSettings(notebookDraft));
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setSaving(true);
    try {
      if (scope === "global") {
        const defaults = toNotebookAppearanceSettings(DEFAULT_NOTEBOOK_APPEARANCE);
        await onSaveGlobalDefaults(defaults);
        setGlobalDraft(defaults);
      } else {
        await onSaveNotebookOverrides({});
        setNotebookDraft({});
      }
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <AnimatePresence>
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/55 backdrop-blur-sm"
        onClick={onClose}
      />

      <m.div
        initial={{ opacity: 0, scale: 0.97, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 18 }}
        transition={{ type: "spring", stiffness: 340, damping: 32, mass: 0.85 }}
        className="fixed inset-0 z-[101] flex items-center justify-center p-4"
      >
        <div
          className="flex h-[min(760px,calc(100dvh-2rem))] w-full max-w-6xl overflow-hidden rounded-[28px] border border-border/50 bg-card shadow-2xl shadow-black/30"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex w-full flex-col md:w-[48%]">
            <div className="flex items-start justify-between border-b border-border/40 px-6 py-5">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground/45">
                  {t("settings.badge")}
                </p>
                <h2 className="mt-2 text-xl font-semibold text-foreground">
                  {t("settings.title")}
                </h2>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  {t("settings.subtitle", { name: notebookTitle || t("untitled") })}
                </p>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>

            <div className="border-b border-border/40 px-6 py-4">
              <div className="inline-flex rounded-full border border-border/50 bg-muted/40 p-1">
                <button
                  type="button"
                  onClick={() => setScope("notebook")}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm transition-colors",
                    scope === "notebook"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t("settings.scopeNotebook")}
                </button>
                <button
                  type="button"
                  onClick={() => setScope("global")}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm transition-colors",
                    scope === "global"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t("settings.scopeGlobal")}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="space-y-6">
                <section className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{t("settings.sections.appearance")}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{t("settings.sections.appearanceDesc")}</p>
                  </div>

                  <SettingRow label={t("settings.font")} description={t("settings.fontDesc")}>
                    <CustomSelect
                      value={activeDraft.fontFamily ?? DEFAULT_NOTEBOOK_APPEARANCE.fontFamily}
                      options={fontOptions}
                      onChange={(value) => setActiveDraft((current) => ({ ...current, fontFamily: value as "sans" | "serif" | "mono" }))}
                    />
                  </SettingRow>

                  <SettingRow label={t("settings.theme")} description={t("settings.themeDesc")}>
                    <CustomSelect
                      value={activeDraft.themeId ?? DEFAULT_NOTEBOOK_APPEARANCE.themeId}
                      options={themeOptions}
                      onChange={(value) =>
                        setActiveDraft((current) => ({
                          ...current,
                          themeId: value as "lyra-default" | "typora-clean" | "paper-serif" | "sepia-reader" | "mono-draft",
                        }))
                      }
                    />
                  </SettingRow>
                </section>

                <section className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{t("settings.sections.rhythm")}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{t("settings.sections.rhythmDesc")}</p>
                  </div>

                  <SettingRow label={t("settings.fontSize")} description={t("settings.fontSizeDesc")}>
                    <CustomSelect
                      value={activeDraft.fontSize ?? DEFAULT_NOTEBOOK_APPEARANCE.fontSize}
                      options={fontSizeOptions}
                      onChange={(value) => setActiveDraft((current) => ({ ...current, fontSize: value as "sm" | "md" | "lg" }))}
                    />
                  </SettingRow>

                  <SettingRow label={t("settings.contentWidth")} description={t("settings.contentWidthDesc")}>
                    <CustomSelect
                      value={activeDraft.contentWidth ?? DEFAULT_NOTEBOOK_APPEARANCE.contentWidth}
                      options={widthOptions}
                      onChange={(value) =>
                        setActiveDraft((current) => ({ ...current, contentWidth: value as "narrow" | "standard" | "wide" }))
                      }
                    />
                  </SettingRow>

                  <SettingRow label={t("settings.lineHeight")} description={t("settings.lineHeightDesc")}>
                    <CustomSelect
                      value={activeDraft.lineHeight ?? DEFAULT_NOTEBOOK_APPEARANCE.lineHeight}
                      options={lineHeightOptions}
                      onChange={(value) =>
                        setActiveDraft((current) => ({ ...current, lineHeight: value as "compact" | "relaxed" | "airy" }))
                      }
                    />
                  </SettingRow>

                  <SettingRow label={t("settings.paragraphSpacing")} description={t("settings.paragraphSpacingDesc")}>
                    <CustomSelect
                      value={activeDraft.paragraphSpacing ?? DEFAULT_NOTEBOOK_APPEARANCE.paragraphSpacing}
                      options={paragraphOptions}
                      onChange={(value) =>
                        setActiveDraft((current) => ({ ...current, paragraphSpacing: value as "tight" | "normal" | "loose" }))
                      }
                    />
                  </SettingRow>

                  <SettingRow label={t("settings.headingScale")} description={t("settings.headingScaleDesc")}>
                    <CustomSelect
                      value={activeDraft.headingScale ?? DEFAULT_NOTEBOOK_APPEARANCE.headingScale}
                      options={headingOptions}
                      onChange={(value) =>
                        setActiveDraft((current) => ({ ...current, headingScale: value as "compact" | "balanced" | "dramatic" }))
                      }
                    />
                  </SettingRow>

                  <SettingRow label={t("settings.emphasizeTitle")} description={t("settings.emphasizeTitleDesc")}>
                    <Toggle
                      checked={activeDraft.emphasizeTitle ?? DEFAULT_NOTEBOOK_APPEARANCE.emphasizeTitle}
                      onChange={(value) => setActiveDraft((current) => ({ ...current, emphasizeTitle: value }))}
                    />
                  </SettingRow>
                </section>

                <section className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{t("settings.sections.experience")}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{t("settings.sections.experienceDesc")}</p>
                  </div>

                  <SettingRow label={t("settings.autoSave")} description={t("settings.autoSaveDesc")}>
                    <Toggle
                      checked={activeDraft.autoSave ?? DEFAULT_NOTEBOOK_APPEARANCE.autoSave}
                      onChange={(value) => setActiveDraft((current) => ({ ...current, autoSave: value }))}
                    />
                  </SettingRow>

                  <SettingRow label={t("settings.focusMode")} description={t("settings.focusModeDesc")}>
                    <Toggle
                      checked={activeDraft.focusModeDefault ?? DEFAULT_NOTEBOOK_APPEARANCE.focusModeDefault}
                      onChange={(value) => setActiveDraft((current) => ({ ...current, focusModeDefault: value }))}
                    />
                  </SettingRow>

                  <SettingRow label={t("settings.defaultRightPanel")} description={t("settings.defaultRightPanelDesc")}>
                    <CustomSelect
                      value={activeDraft.defaultRightPanel ?? DEFAULT_NOTEBOOK_APPEARANCE.defaultRightPanel}
                      options={rightPanelOptions}
                      onChange={(value) => setActiveDraft((current) => ({ ...current, defaultRightPanel: value as "copilot" | "artifacts" }))}
                    />
                  </SettingRow>
                </section>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-border/40 px-6 py-4">
              <button
                type="button"
                onClick={() => void handleReset()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-full border border-border/50 px-3.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RotateCcw size={14} />
                {t("settings.reset")}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                >
                  {t("settings.cancel")}
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving}
                  className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? t("settings.saving") : t("settings.save")}
                </button>
              </div>
            </div>
          </div>

          <div className="hidden flex-1 border-l border-border/40 bg-muted/[0.12] p-6 md:flex">
            <div
              className="notebook-article-shell flex flex-1 flex-col rounded-[28px] border border-border/40"
              data-article-theme={previewAppearance.themeId}
              style={buildNotebookAppearanceStyle(previewAppearance)}
            >
              <div className="border-b border-border/30 px-6 py-4 text-xs uppercase tracking-[0.18em] text-muted-foreground/45">
                {t("settings.preview")}
              </div>
              <div className="flex-1 overflow-y-auto px-8 py-8">
                <div className="mx-auto max-w-[var(--editor-content-width)]">
                  <div
                    className={cn(
                      "notebook-article-title mb-8 font-bold leading-[1.1] tracking-tight text-foreground",
                      !(previewAppearance.emphasizeTitle) && "opacity-90",
                    )}
                    style={{ fontSize: "var(--editor-title-size, 2.5rem)" }}
                  >
                    {t("settings.previewTitle")}
                  </div>
                  <div className="tiptap note-editor-prose notebook-settings-preview-content">
                    <h1>{t("settings.previewSection")}</h1>
                    <p>{t("settings.previewBodyA")}</p>
                    <p>{t("settings.previewBodyB")}</p>
                    <blockquote>{t("settings.previewQuote")}</blockquote>
                    <h2>{t("settings.previewSubsection")}</h2>
                    <p>
                      {t("settings.previewBodyC")} <code>theme + typography + spacing</code> {t("settings.previewBodyD")}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </m.div>
    </AnimatePresence>
  );
}
