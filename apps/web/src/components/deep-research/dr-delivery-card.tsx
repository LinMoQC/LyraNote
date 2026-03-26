"use client";

import { AnimatePresence, m } from "framer-motion";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  Globe,
  Save,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { EVIDENCE_STRENGTH_CONFIG, type DrDeliverable } from "./dr-types";

export function DeliveryCard({
  deliverable,
  doneCitations,
  onSaveNote,
  onFollowUp,
  onRate,
  savedMessageId: _savedMessageId,
}: {
  deliverable: DrDeliverable;
  doneCitations: Array<{ title?: string; url?: string; type?: string }>;
  onSaveNote?: () => void;
  onFollowUp?: (q: string) => void;
  onRate?: (rating: "like" | "dislike") => void;
  savedMessageId?: string | null;
}) {
  const t = useTranslations("deepResearch");
  const tc = useTranslations("common");
  const [citationOpen, setCitationOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [rated, setRated] = useState<"like" | "dislike" | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const strengthCfg = EVIDENCE_STRENGTH_CONFIG[deliverable.evidenceStrength];
  const StrengthIcon = strengthCfg.icon;

  async function handleSave() {
    if (saving || saved || !onSaveNote) return;
    setSaving(true);
    try {
      await onSaveNote();
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  function handleRate(rating: "like" | "dislike") {
    if (rated) return;
    setRated(rating);
    onRate?.(rating);
  }

  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4"
    >
      <div className="mb-3 flex items-start gap-3 border-b border-border/30 pb-3">
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
          <FileText size={13} className="text-amber-400" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-xs font-semibold leading-tight text-foreground/90">{deliverable.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground/50">
              {t("sourceCount", { count: deliverable.citationCount })}
            </span>
            <button
              type="button"
              onClick={() => setSourcesOpen((v) => !v)}
              className={cn(
                "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-medium transition-opacity hover:opacity-80",
                strengthCfg.color,
              )}
            >
              <StrengthIcon size={9} />
              {t(strengthCfg.labelKey)}
            </button>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleRate("like")}
            disabled={!!rated}
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-md transition-all",
              rated === "like"
                ? "bg-emerald-500/20 text-emerald-400"
                : "text-muted-foreground/40 hover:bg-muted/40 hover:text-muted-foreground/70",
            )}
            title={t("helpful")}
          >
            <ThumbsUp size={11} />
          </button>
          <button
            type="button"
            onClick={() => handleRate("dislike")}
            disabled={!!rated}
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-md transition-all",
              rated === "dislike"
                ? "bg-red-500/20 text-red-400"
                : "text-muted-foreground/40 hover:bg-muted/40 hover:text-muted-foreground/70",
            )}
            title={t("notAccurate")}
          >
            <ThumbsDown size={11} />
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || saved}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-all",
              saved
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-muted/40 text-muted-foreground/60 hover:bg-muted/60 hover:text-foreground/70",
            )}
            title={t("saveAsNote")}
          >
            <Save size={10} />
            {saving ? tc("saving") : saved ? t("savedAsNote") : t("saveAsNote")}
          </button>
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-foreground/70">{deliverable.summary}</p>

      {deliverable.citationTable.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setCitationOpen((v) => !v)}
            className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50 hover:text-muted-foreground/80"
          >
            {citationOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            {t("citationTable", { count: deliverable.citationTable.length })}
          </button>
          <AnimatePresence>
            {citationOpen && (
              <m.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-2 space-y-1.5">
                  {deliverable.citationTable.map((row, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-md border border-border/20 bg-muted/20 px-2 py-1.5">
                      <span className={cn(
                        "mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full",
                        row.grade === "strong" ? "bg-emerald-400" : row.grade === "medium" ? "bg-amber-400" : "bg-red-400",
                      )} />
                      <span className="flex-1 text-[10px] text-foreground/75">{row.conclusion}</span>
                      <span className="flex-shrink-0 text-[9px] text-muted-foreground/40">{row.source}</span>
                    </div>
                  ))}
                </div>
              </m.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {sourcesOpen && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-1 border-t border-border/20 pt-2">
              <p className="mb-1 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/40">{t("allSources")}</p>
              {doneCitations.filter((c) => c.url || c.title).slice(0, 8).map((c, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  {c.type === "web" ? (
                    <Globe size={9} className="flex-shrink-0 text-cyan-400/60" />
                  ) : (
                    <FileText size={9} className="flex-shrink-0 text-blue-400/60" />
                  )}
                  {c.url ? (
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 truncate text-[10px] text-muted-foreground/55 hover:text-muted-foreground/90"
                    >
                      <span className="truncate">{c.title || c.url}</span>
                      <ExternalLink size={8} className="flex-shrink-0 opacity-50" />
                    </a>
                  ) : (
                    <span className="truncate text-[10px] text-muted-foreground/55">{c.title || tc("internalSource")}</span>
                  )}
                </div>
              ))}
            </div>
          </m.div>
        )}
      </AnimatePresence>

      {deliverable.nextQuestions.length > 0 && (
        <div className="mt-3 border-t border-border/20 pt-3">
          <p className="mb-2 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/40">{t("followUp")}</p>
          <div className="flex flex-wrap gap-1.5">
            {deliverable.nextQuestions.map((q, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onFollowUp?.(q)}
                className="rounded-full border border-primary/20 bg-primary/8 px-2.5 py-1 text-[10px] text-primary/70 transition-all hover:border-primary/40 hover:bg-primary/15 hover:text-primary/90 active:scale-95"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}
    </m.div>
  );
}
