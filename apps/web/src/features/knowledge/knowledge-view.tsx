"use client";

import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { m, AnimatePresence } from "framer-motion";
import {
  FileText,
  Globe,
  Headphones,
  FileIcon,
  Search,
  Upload,
  LayoutGrid,
  List,
  CheckCircle2,
  AlertCircle,
  Loader2,
  BookOpen,
  X,
  RefreshCw,
  Share2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useMemo, useRef, useCallback, useEffect } from "react";

import { ImportSourceDialog } from "@/features/source/import-source-dialog";
import { dedupeSourcesByLatest } from "@/features/source/source-list";
import { SourceDetailDrawer } from "@/features/source/source-detail-drawer";
import { KnowledgeGraphView } from "@/features/knowledge/knowledge-graph-view";
import { getSourcesPage, type SourcePage } from "@/services/source-service";
import { REFETCH_INTERVAL_PROCESSING } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Source } from "@/types";

const PAGE_SIZE = 20;

type SourceType = Source["type"] | "all";

const TYPE_TAB_KEYS: SourceType[] = ["all", "pdf", "web", "audio", "doc"];

const TYPE_CONFIG: Record<
  Source["type"],
  { icon: React.ComponentType<{ size?: number; className?: string }>; color: string; bg: string }
> = {
  pdf: { icon: FileText, color: "text-rose-400", bg: "bg-rose-500/10" },
  web: { icon: Globe, color: "text-sky-400", bg: "bg-sky-500/10" },
  audio: { icon: Headphones, color: "text-violet-400", bg: "bg-violet-500/10" },
  doc: { icon: FileIcon, color: "text-amber-400", bg: "bg-amber-500/10" },
};

type TranslationFn = ReturnType<typeof useTranslations<"knowledge">>;

function StatusBadge({ status, t }: { status: Source["status"]; t: TranslationFn }) {
  if (status === "indexed") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
        <CheckCircle2 size={10} />
        {t("status.indexed")}
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-400">
        <AlertCircle size={10} />
        {t("status.failed")}
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
        <Loader2 size={10} className="animate-spin" />
        {t("status.pending")}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
      <Loader2 size={10} className="animate-spin" />
      {t("status.processing")}
    </span>
  );
}

function KnowledgeCard({ source, index, t, onClick }: { source: Source; index: number; t: TranslationFn; onClick: () => void }) {
  const config = TYPE_CONFIG[source.type];
  const Icon = config.icon;

  return (
    <m.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 28, delay: index * 0.04 }}
      onClick={onClick}
      className="group flex min-h-[188px] cursor-pointer flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm transition-all duration-200 hover:border-border hover:shadow-md"
    >
      <div className="flex items-start justify-between">
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", config.bg)}>
          <Icon size={17} className={config.color} />
        </div>
        <StatusBadge status={source.status} t={t} />
      </div>

      <div className="space-y-1.5">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
          {source.title}
        </p>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {source.summary}
        </p>
      </div>

      <div className="mt-auto flex items-center gap-1.5">
        <BookOpen size={11} className="text-muted-foreground/50" />
        <span className="truncate text-[11px] text-muted-foreground/60">
          {source.notebookId}
        </span>
      </div>
    </m.div>
  );
}

function KnowledgeRow({ source, index, t, onClick }: { source: Source; index: number; t: TranslationFn; onClick: () => void }) {
  const config = TYPE_CONFIG[source.type];
  const Icon = config.icon;

  return (
    <m.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 28, delay: index * 0.03 }}
      onClick={onClick}
      className="group flex cursor-pointer items-center gap-4 rounded-xl border border-border/50 bg-card px-4 py-3 transition-all duration-200 hover:border-border hover:shadow-sm"
    >
      <div className={cn("flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg", config.bg)}>
        <Icon size={15} className={config.color} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{source.title}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{source.summary}</p>
      </div>

      <div className="hidden flex-shrink-0 items-center gap-1.5 sm:flex">
        <BookOpen size={11} className="text-muted-foreground/40" />
        <span className="text-xs text-muted-foreground/60">
          {source.notebookId}
        </span>
      </div>

      <div className="flex-shrink-0">
        <StatusBadge status={source.status} t={t} />
      </div>
    </m.div>
  );
}

// ── Pull-to-refresh hook ──────────────────────────────────────────────────────

function usePullToRefresh(containerRef: React.RefObject<HTMLElement | null>, onRefresh: () => Promise<void>) {
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const isPulling = useRef(false);
  const THRESHOLD = 60;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (el.scrollTop <= 0) {
        startY.current = e.touches[0].clientY;
        isPulling.current = true;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isPulling.current) return;
      const dist = Math.max(0, e.touches[0].clientY - startY.current);
      if (dist > 0 && el.scrollTop <= 0) {
        setPulling(true);
        setPullDistance(Math.min(dist * 0.5, 100));
      }
    };

    const onTouchEnd = async () => {
      if (!isPulling.current) return;
      isPulling.current = false;
      if (pullDistance >= THRESHOLD) {
        setRefreshing(true);
        try { await onRefresh(); } finally { setRefreshing(false); }
      }
      setPulling(false);
      setPullDistance(0);
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [containerRef, onRefresh, pullDistance]);

  return { pulling, pullDistance, refreshing };
}

// ── Main component ────────────────────────────────────────────────────────────

type PageView = "sources" | "graph";

export function KnowledgeView() {
  const t = useTranslations("knowledge");
  const queryClient = useQueryClient();
  const [pageView, setPageView] = useState<PageView>("sources");
  const [activeType, setActiveType] = useState<SourceType>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [graphToolbarEl, setGraphToolbarEl] = useState<HTMLDivElement | null>(null);
  const [activeSource, setActiveSource] = useState<Source | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Debounce search input
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  const queryKey = useMemo(
    () => ["all-sources", activeType, debouncedSearch],
    [activeType, debouncedSearch]
  );

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isRefetching,
    refetch,
  } = useInfiniteQuery<SourcePage>({
    queryKey,
    queryFn: ({ pageParam }) =>
      getSourcesPage({
        offset: pageParam as number,
        limit: PAGE_SIZE,
        type: activeType === "all" ? undefined : activeType,
        search: debouncedSearch || undefined,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: (query) => {
      const pages = query.state.data?.pages ?? [];
      const hasProcessing = pages.some((p) =>
        p.items.some((s) => s.status === "processing" || s.status === "pending")
      );
      return hasProcessing ? REFETCH_INTERVAL_PROCESSING : false;
    },
    refetchIntervalInBackground: true,
  });

  const allSources = useMemo(() => {
    const items = data?.pages.flatMap((p) => p.items) ?? []
    return dedupeSourcesByLatest(items)
  }, [data])
  const total = allSources.length;

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { root: scrollRef.current, threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Pull-to-refresh
  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  const { pullDistance, refreshing } = usePullToRefresh(scrollRef, handleRefresh);

  return (
    <div className="flex h-full flex-col border border-border/40 dark:border">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border/30 px-4 pb-0 pt-5 md:px-8 md:pt-8">
        <div className="mb-4 flex flex-col gap-4 md:mb-6 md:flex-row md:items-center md:justify-between md:gap-4">
          <h1 className="text-[2rem] font-semibold leading-none tracking-tight md:text-2xl md:leading-tight">
            {t("title")}
          </h1>
          <div className="flex items-center justify-between gap-3 md:ml-auto md:flex-1 md:justify-between">
            <div className="flex w-fit gap-0.5 rounded-2xl border border-border/40 bg-muted/40 p-0.5 md:rounded-lg">
              <button
                type="button"
                onClick={() => setPageView("sources")}
                className={cn(
                  "flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors md:rounded-md md:px-3 md:py-1.5",
                  pageView === "sources"
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <List size={12} />
                {t("sourceView")}
              </button>
              <button
                type="button"
                onClick={() => setPageView("graph")}
                className={cn(
                  "flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors md:rounded-md md:px-3 md:py-1.5",
                  pageView === "graph"
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Share2 size={12} />
                {t("graphView")}
              </button>
            </div>

            {pageView === "sources" && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => refetch()}
                  disabled={isRefetching}
                  className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/40 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 md:h-9 md:w-9 md:rounded-lg"
                  title={t("refresh")}
                >
                  <RefreshCw size={14} className={cn(isRefetching && "animate-spin")} />
                </button>
                <button
                  type="button"
                  onClick={() => setUploadOpen(true)}
                  className="flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 md:rounded-lg md:px-4 md:py-2"
                >
                  <Upload size={14} />
                  {t("add")}
                </button>
              </div>
            )}
          </div>
        </div>

        <ImportSourceDialog
          global
          open={uploadOpen}
          onOpenChange={setUploadOpen}
        />
        <SourceDetailDrawer
          source={activeSource}
          onClose={() => setActiveSource(null)}
        />

        {/* Search + tabs + actions row (sources view only) */}
        {pageView === "sources" && <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:gap-2">
          <div className="relative min-w-0 w-full md:flex-1 md:basis-40">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("search")}
              className="w-full rounded-2xl border border-border/40 bg-background py-3 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20 md:rounded-lg md:py-2"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto rounded-2xl border border-border/40 bg-muted/40 p-1 no-scrollbar md:rounded-lg md:p-0.5">
              {TYPE_TAB_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveType(key)}
                  className={cn(
                    "shrink-0 rounded-xl px-3 py-2 text-xs font-medium transition-colors md:rounded-md md:px-3 md:py-1.5",
                    activeType === key
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t(`types.${key}`)}
                </button>
              ))}
            </div>

            <div className="flex shrink-0 items-center rounded-2xl border border-border/40 bg-muted/40 p-1 md:rounded-lg md:p-0.5">
              <button
                type="button"
                data-testid="knowledge-grid-toggle"
                onClick={() => setViewMode("grid")}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-xl transition-colors md:h-7 md:w-7 md:rounded-md",
                  viewMode === "grid" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <LayoutGrid size={13} />
              </button>
              <button
                type="button"
                data-testid="knowledge-list-toggle"
                onClick={() => setViewMode("list")}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-xl transition-colors md:h-7 md:w-7 md:rounded-md",
                  viewMode === "list" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <List size={13} />
              </button>
            </div>
          </div>
        </div>}

        {pageView === "graph" && <div ref={setGraphToolbarEl} />}

        <div className="mt-4" />
      </div>

      {/* Graph view */}
      {pageView === "graph" && <KnowledgeGraphView toolbarContainer={graphToolbarEl} />}

      {/* Sources view content below */}
      {pageView === "sources" && <>
      {/* Pull indicator */}
      <AnimatePresence>
        {(pullDistance > 0 || refreshing) && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: Math.max(pullDistance, refreshing ? 40 : 0), opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex flex-shrink-0 items-center justify-center overflow-hidden"
          >
            <RefreshCw
              size={16}
              className={cn(
                "text-muted-foreground/50",
                refreshing && "animate-spin",
                pullDistance >= 60 && !refreshing && "text-primary"
              )}
            />
          </m.div>
        )}
      </AnimatePresence>

      {/* Content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 no-scrollbar md:px-8 md:py-6">
        <AnimatePresence mode="wait">
          {isLoading ? (
            <m.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={viewMode === "grid"
                ? "grid w-full grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
                : "flex flex-col gap-2"}
            >
              {Array.from({ length: viewMode === "grid" ? 8 : 6 }).map((_, i) => (
                viewMode === "grid" ? (
                  <div
                    key={i}
                    className="flex flex-col gap-3 rounded-xl border border-border/40 bg-card p-4 animate-pulse"
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="h-9 w-9 rounded-lg bg-muted/50" />
                      <div className="h-5 w-16 rounded-full bg-muted/40" />
                    </div>
                    <div className="space-y-2">
                      <div className="h-3.5 w-4/5 rounded bg-muted/50" />
                      <div className="h-3 w-full rounded bg-muted/40" />
                      <div className="h-3 w-3/5 rounded bg-muted/40" />
                    </div>
                    <div className="mt-auto flex items-center gap-1.5">
                      <div className="h-3 w-3 rounded bg-muted/30" />
                      <div className="h-3 w-20 rounded bg-muted/30" />
                    </div>
                  </div>
                ) : (
                  <div
                    key={i}
                    className="flex items-center gap-4 rounded-xl border border-border/40 bg-card px-4 py-3 animate-pulse"
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    <div className="h-8 w-8 flex-shrink-0 rounded-lg bg-muted/50" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="h-3.5 w-2/5 rounded bg-muted/50" />
                      <div className="h-3 w-3/5 rounded bg-muted/40" />
                    </div>
                    <div className="hidden h-5 w-16 rounded-full bg-muted/40 sm:block" />
                  </div>
                )
              ))}
            </m.div>
          ) : allSources.length === 0 ? (
            <m.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-24 text-center"
            >
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50">
                <Search size={22} className="text-muted-foreground/40" />
              </div>
              <p className="text-sm text-muted-foreground">{t("empty")}</p>
              <button
                type="button"
                onClick={() => { setSearch(""); setActiveType("all"); }}
                className="mt-3 text-xs text-primary hover:underline"
              >
                {t("clearFilter")}
              </button>
            </m.div>
          ) : viewMode === "grid" ? (
            <m.div
              key="grid"
              data-testid="knowledge-grid"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid w-full grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
            >
              {allSources.map((source, i) => (
                <KnowledgeCard key={source.id} source={source} index={i} t={t} onClick={() => setActiveSource(source)} />
              ))}
            </m.div>
          ) : (
            <m.div
              key="list"
              data-testid="knowledge-list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col gap-2"
            >
              {allSources.map((source, i) => (
                <KnowledgeRow key={source.id} source={source} index={i} t={t} onClick={() => setActiveSource(source)} />
              ))}
            </m.div>
          )}
        </AnimatePresence>

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="h-px" />

        {/* Loading more indicator */}
        {!isLoading && isFetchingNextPage && (
          <div className="flex items-center justify-center py-6">
            <Loader2 size={18} className="animate-spin text-muted-foreground/40" />
          </div>
        )}

        {/* End of list */}
        {!hasNextPage && allSources.length > 0 && !isLoading && (
          <p className="py-6 text-center text-xs text-muted-foreground/40">
            {t("loadedAll", { total })}
          </p>
        )}
      </div>
      </>}
    </div>
  );
}
