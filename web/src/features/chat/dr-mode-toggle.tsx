"use client";

import { FlaskConical, Zap, Microscope, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, useEffect, useCallback } from "react";
import { AnimatePresence, m } from "framer-motion";
import { cn } from "@/lib/utils";

interface Props {
  isActive: boolean;
  mode: "quick" | "deep";
  onToggle: () => void;
  onModeChange: (mode: "quick" | "deep") => void;
}

export function DeepResearchToggle({ isActive, mode, onToggle, onModeChange }: Props) {
  const t = useTranslations("chat");
  const [popoverOpen, setPopoverOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!popoverOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [popoverOpen]);

  const handleModeSelect = useCallback((m: "quick" | "deep") => {
    onModeChange(m);
    setPopoverOpen(false);
    if (!isActive) onToggle();
  }, [isActive, onModeChange, onToggle]);

  return (
    <div ref={containerRef} className="relative">
      <div
        className={cn(
          "flex h-7 items-center rounded-full border text-[11px] transition-all",
          isActive
            ? "border-amber-500/30 bg-amber-500/10 text-amber-300/90"
            : "border-border/40 bg-muted/30 text-muted-foreground/50 hover:border-border/60 hover:text-muted-foreground/70"
        )}
      >
        <button
          type="button"
          onClick={onToggle}
          className="flex h-full w-7 items-center justify-center gap-1.5 rounded-full sm:w-auto sm:px-2.5"
          title={isActive ? t("switchToNormal") : t("switchToDeepResearch")}
        >
          <FlaskConical size={10} className={isActive ? "text-amber-400" : ""} />
          <span className="hidden sm:inline">{t("deepResearchLabel")}</span>
          {isActive && (
            <>
              <span className="hidden text-amber-400/50 sm:inline">·</span>
              <span className="hidden text-amber-400/80 sm:inline">
                {mode === "quick" ? t("quickMode") : t("deepMode")}
              </span>
            </>
          )}
        </button>
        {isActive && (
          <button
            type="button"
            className="hidden h-full items-center rounded-r-full px-1.5 transition-colors hover:bg-amber-500/20 sm:flex"
            onClick={() => setPopoverOpen((v) => !v)}
          >
            <ChevronDown size={10} className="text-amber-400/60" />
          </button>
        )}
      </div>

      <AnimatePresence>
        {popoverOpen && (
          <m.div
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-0 z-50 mb-2 w-56 overflow-hidden rounded-xl border border-border/50 bg-card/95 shadow-xl backdrop-blur-xl"
          >
            <button
              type="button"
              onClick={() => handleModeSelect("quick")}
              className={cn(
                "flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/50",
                mode === "quick" && "bg-amber-500/5"
              )}
            >
              <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
                <Zap size={14} className="text-amber-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground/90">{t("quickMode")}</p>
                <p className="text-[11px] text-muted-foreground/50">{t("quickModeDesc")}</p>
              </div>
              {mode === "quick" && (
                <div className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-400" />
              )}
            </button>
            <div className="mx-3 border-t border-border/30" />
            <button
              type="button"
              onClick={() => handleModeSelect("deep")}
              className={cn(
                "flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/50",
                mode === "deep" && "bg-orange-500/5"
              )}
            >
              <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-orange-500/10">
                <Microscope size={14} className="text-orange-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground/90">{t("deepMode")}</p>
                <p className="text-[11px] text-muted-foreground/50">{t("deepModeDesc")}</p>
              </div>
              {mode === "deep" && (
                <div className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-orange-400" />
              )}
            </button>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
