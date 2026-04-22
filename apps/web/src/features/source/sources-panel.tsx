"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, FileAudio, FileText, Globe, Loader2, NotepadText, Plus, X } from "lucide-react";

import { startTransition, useEffect, useRef } from "react";

import { createSuggestionFingerprint, shouldAutoSurfaceSource } from "@/features/copilot/proactive-surface-policy";
import { lyraQueryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { getSourceSuggestions } from "@/services/ai-service";
import { getSources } from "@/services/source-service";
import { dedupeSourcesByLatest } from "@/features/source/source-list";
import { useNotebookStore } from "@/store/use-notebook-store";
import { useProactiveStore } from "@/store/use-proactive-store";
import { useUiStore } from "@/store/use-ui-store";
import type { Source } from "@/types";
import { useTranslations } from "next-intl";
import { Loader } from "@/components/ui/loader";

const sourceIconMap = {
  audio: FileAudio,
  doc: NotepadText,
  pdf: FileText,
  web: Globe
};

const sourceColorMap = {
  audio: "text-violet-400 bg-violet-400/10",
  doc: "text-blue-400 bg-blue-400/10",
  pdf: "text-amber-400 bg-amber-400/10",
  web: "text-emerald-400 bg-emerald-400/10"
};

const statusConfig: Record<string, { labelKey: string; className: string; icon?: typeof Loader2 }> = {
  processing: { labelKey: "importing", className: "text-blue-400 bg-blue-400/10", icon: Loader2 },
  pending:    { labelKey: "pending", className: "text-amber-400 bg-amber-400/10" },
  indexed:    { labelKey: "ready", className: "text-emerald-400 bg-emerald-400/10", icon: CheckCircle2 },
  failed:     { labelKey: "importFailed", className: "text-red-400 bg-red-400/10", icon: AlertCircle },
}

function SourceItem({ source }: { source: Source }) {
  const t = useTranslations("source");
  const activeSourceId = useNotebookStore((state) => state.activeSourceId);
  const setActiveSourceId = useNotebookStore((state) => state.setActiveSourceId);
  const Icon = sourceIconMap[source.type];
  const isActive = activeSourceId === source.id;
  const isProcessing = source.status === "processing" || source.status === "pending";
  const isFailed = source.status === "failed";
  const cfg = statusConfig[source.status] ?? statusConfig.pending;

  return (
    <button
      className={cn(
        "group w-full rounded-xl px-3 py-3 text-left transition-colors",
        isActive ? "bg-accent/80" : "hover:bg-muted/50"
      )}
      onClick={() => startTransition(() => setActiveSourceId(source.id))}
      type="button"
    >
      <div className="flex items-start gap-2.5">
        <div className="relative mt-0.5 flex-shrink-0">
          <div className={cn("rounded-lg p-1.5", sourceColorMap[source.type])}>
            <Icon size={13} />
          </div>
          {isProcessing && (
            <div className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-card">
              <Loader2 size={9} className="animate-spin text-blue-400" />
            </div>
          )}
          {isFailed && (
            <div className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-card">
              <AlertCircle size={9} className="text-red-400" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "truncate text-[13px] leading-snug",
              isActive ? "font-medium text-foreground" : "font-normal text-muted-foreground/85"
            )}
          >
            {source.title}
          </p>

          {isProcessing ? (
            <div className="mt-1.5">
              <div className="mb-1 flex items-center gap-1.5">
                <span className="text-[10px] font-medium text-blue-400">{t(cfg.labelKey)}</span>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-accent/60">
                <div className="h-full animate-pulse rounded-full bg-gradient-to-r from-blue-500/60 via-blue-400/80 to-blue-500/60" style={{ width: "65%", animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite" }} />
              </div>
            </div>
          ) : isFailed ? (
            <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-red-400">
              <AlertCircle size={9} />
              {t(cfg.labelKey)}
            </span>
          ) : (
            <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
              {source.summary}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

export function SourcesPanel({
  notebookId,
  onClose,
  variant = "sidebar",
}: {
  notebookId: string;
  onClose?: () => void;
  variant?: "sidebar" | "sheet";
}) {
  const t = useTranslations("source");
  const setImportDialogOpen = useUiStore((state) => state.setImportDialogOpen);

  const addSuggestion = useProactiveStore((s) => s.addSuggestion);
  const prevSourcesRef = useRef<Source[]>([]);

  const { data: sources = [], isLoading } = useQuery({
    queryKey: lyraQueryKeys.sources.list({ notebookId, scope: "notebook" }),
    queryFn: () => getSources(notebookId),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: (query) => {
      const list = query.state.data ?? []
      return list.some((s) => s.status === "processing" || s.status === "pending")
        ? 4000
        : false
    },
    refetchIntervalInBackground: true,
  })

  const visibleSources = dedupeSourcesByLatest(sources);

  // Detect processing → indexed transitions and trigger AI suggestions
  useEffect(() => {
    const prev = prevSourcesRef.current;
    if (prev.length === 0 && visibleSources.length > 0) {
      prevSourcesRef.current = visibleSources;
      return;
    }

    for (const source of visibleSources) {
      if (source.status !== "indexed") continue;
      const prevSource = prev.find((s) => s.id === source.id);
      if (prevSource && (prevSource.status === "processing" || prevSource.status === "pending")) {
        getSourceSuggestions(source.id)
          .then((data) => {
            const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
            addSuggestion({
              type: "source_indexed",
              origin: "source_indexed",
              delivery: shouldAutoSurfaceSource(isMobile) ? "surface" : "inbox",
              fingerprint: createSuggestionFingerprint("source_indexed", {
                sourceId: source.id,
                sourceName: source.title || t("unknownSource"),
                summary: data.summary || undefined,
              }),
              sourceId: source.id,
              sourceName: source.title || t("unknownSource"),
              summary: data.summary || undefined,
              questions: data.questions,
            });
          })
          .catch(() => {});
      }
    }

    prevSourcesRef.current = visibleSources;
  }, [visibleSources, addSuggestion, t]);

  const indexed = visibleSources.filter((s) => s.status === "indexed");
  const processing = visibleSources.filter((s) => s.status === "processing" || s.status === "pending");
  const failed = visibleSources.filter((s) => s.status === "failed");

  const isSheet = variant === "sheet";

  return (
    <aside
      className={cn(
        "font-notebook-ui flex h-full flex-col overflow-hidden text-[13px] font-normal leading-normal antialiased",
        isSheet ? "w-full bg-card/20" : "w-[260px] flex-shrink-0 border-r border-border/25 bg-sidebar/45",
      )}
      data-testid={`sources-panel-${variant}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
          <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/55">
            {t("sourcesHeader", { count: visibleSources.length })}
          </span>
          <div className="flex items-center gap-1">
            <button
              className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              onClick={() => setImportDialogOpen(true)}
              title={t("addSourceTitle")}
              type="button"
            >
              <Plus size={15} />
            </button>
            {!isSheet && onClose ? (
              <button
                className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                onClick={onClose}
                title={t("closePanelTitle")}
                type="button"
              >
                <X size={15} />
              </button>
            ) : null}
          </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader size="medium" />
          </div>
        ) : (
          <>
            {processing.length > 0 && (
              <div className="mb-3">
                <p className="mb-1 px-2 text-[10px] font-medium tracking-wider text-blue-400/60">
                  {t("importing")}
                </p>
                {processing.map((source) => (
                  <SourceItem key={source.id} source={source} />
                ))}
              </div>
            )}

            {failed.length > 0 && (
              <div className="mb-3">
                <p className="mb-1 px-2 text-[10px] font-medium tracking-wider text-red-400/60">
                  {t("importFailed")}
                </p>
                {failed.map((source) => (
                  <SourceItem key={source.id} source={source} />
                ))}
              </div>
            )}

            {indexed.length > 0 && (
              <div>
                <p className="mb-1 px-2 text-[10px] font-medium tracking-wider text-muted-foreground/60">
                  {t("ready")}
                </p>
                {indexed.map((source) => (
                  <SourceItem key={source.id} source={source} />
                ))}
              </div>
            )}

            {visibleSources.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-sm text-muted-foreground">{t("noSources")}</p>
                <button
                  className="mt-2 text-xs text-primary hover:underline"
                  onClick={() => setImportDialogOpen(true)}
                  type="button"
                >
                  {t("addFirstSource")}
                </button>
              </div>
            )}
          </>
        )}
      </div>

    </aside>
  );
}
