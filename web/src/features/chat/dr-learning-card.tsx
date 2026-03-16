"use client";

import { AnimatePresence, m } from "framer-motion";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  Globe,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { DIMENSION_CONFIG, EVIDENCE_GRADE_CONFIG, type DrLearning } from "./dr-types";

export function LearningCard({ learning }: { learning: DrLearning }) {
  const t = useTranslations("deepResearch");
  const tc = useTranslations("common");
  const [expanded, setExpanded] = useState(false);
  const dimCfg = DIMENSION_CONFIG[learning.dimension ?? "concept"];
  const gradeCfg = EVIDENCE_GRADE_CONFIG[learning.evidenceGrade ?? "weak"];

  return (
    <div className="mt-1.5 rounded-lg border border-border/30 bg-muted/20 px-3 py-2">
      <div className="flex cursor-pointer items-start gap-2" onClick={() => setExpanded((v) => !v)}>
        <div className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
          <CheckCircle2 size={9} className="text-emerald-400" />
        </div>
        <p className="flex-1 text-xs leading-relaxed text-foreground/80">{learning.content}</p>
        <button type="button" className="flex-shrink-0 text-muted-foreground/40 hover:text-muted-foreground/70">
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
      </div>

      <div className="mt-1.5 flex items-center gap-1.5">
        {learning.dimension && (
          <span className={cn("rounded-full border px-1.5 py-0.5 text-[9px] font-medium", dimCfg.bg, dimCfg.color)}>
            {t(dimCfg.labelKey)}
          </span>
        )}
        {learning.evidenceGrade && (
          <span className="flex items-center gap-1 text-[9px] text-muted-foreground/50">
            <span className={cn("h-1.5 w-1.5 rounded-full", gradeCfg.dot)} />
            {t(gradeCfg.labelKey)}
          </span>
        )}
        {learning.counterpoint && (
          <span className="text-[9px] text-orange-400/60">{t("hasCounterpoint")}</span>
        )}
      </div>

      <AnimatePresence>
        {expanded && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-1.5 border-t border-border/30 pt-2">
              {learning.counterpoint && (
                <p className="rounded-md border border-orange-500/20 bg-orange-500/5 px-2 py-1.5 text-[10px] text-orange-300/70">
                  <span className="font-medium">{t("counterpointLabel")}</span>
                  {learning.counterpoint}
                </p>
              )}
              {learning.citations.slice(0, 3).map((c, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  {c.type === "web" ? (
                    <Globe size={10} className="flex-shrink-0 text-cyan-400/70" />
                  ) : (
                    <FileText size={10} className="flex-shrink-0 text-blue-400/70" />
                  )}
                  {c.url ? (
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 truncate text-[10px] text-muted-foreground/60 hover:text-muted-foreground/90"
                    >
                      <span className="truncate">{c.title || c.url}</span>
                      <ExternalLink size={8} className="flex-shrink-0" />
                    </a>
                  ) : (
                    <span className="truncate text-[10px] text-muted-foreground/60">
                      {c.title || tc("internalSource")}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
