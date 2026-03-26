"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import {
  Loader2,
  RefreshCw,
  Search,
  X,
  Share2,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import dynamic from "next/dynamic";
import { m, AnimatePresence } from "framer-motion";

import { Select, SelectContent, SelectItem } from "@/components/ui/select";

import {
  getGlobalGraph,
  getNotebookGraph,
  rebuildGraph,
  rebuildAllGraphs,
  getEntityDetail,
  getRebuildProgress,
  type KnowledgeGraphData,
  type GraphNode,
  type EntityDetail,
  type RebuildProgress,
} from "@/services/knowledge-graph-service";
import { getNotebooks } from "@/services/notebook-service";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

const TYPE_COLORS: Record<string, string> = {
  concept: "#60a5fa",
  person: "#34d399",
  technology: "#a78bfa",
  event: "#fbbf24",
  organization: "#f87171",
  other: "#94a3b8",
};

interface ForceNode extends GraphNode {
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  __indexColor?: string;
}

interface ForceLink {
  source: string | ForceNode;
  target: string | ForceNode;
  relationType: string;
  description?: string | null;
  weight: number;
}

interface Notebook {
  id: string;
  title: string;
}

interface KnowledgeGraphViewProps {
  toolbarContainer?: HTMLDivElement | null;
}

export function KnowledgeGraphView({ toolbarContainer }: KnowledgeGraphViewProps) {
  const t = useTranslations("knowledge");
  const tTypes = useTranslations("knowledge.entityTypes");

  const TYPE_LABELS: Record<string, string> = {
    concept:      tTypes("concept"),
    person:       tTypes("person"),
    technology:   tTypes("technology"),
    event:        tTypes("event"),
    organization: tTypes("organization"),
    other:        tTypes("other"),
  };
  const [graphData, setGraphData] = useState<KnowledgeGraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedNode, setSelectedNode] = useState<ForceNode | null>(null);
  const [entityDetail, setEntityDetail] = useState<EntityDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [selectedNotebook, setSelectedNotebook] = useState<string>("global");
  const [progress, setProgress] = useState<RebuildProgress | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const startProgressPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const p = await getRebuildProgress();
        setProgress(p);
        if (p.status === "done" || p.status === "idle" || (p.total > 0 && p.current >= p.total)) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setRebuilding(false);
          setProgress(null);
          fetchGraphRef.current();
        }
      } catch { /* keep polling */ }
    }, 2000);
  }, []);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const fetchGraphRef = useRef<() => void>(() => {});

  useEffect(() => {
    getNotebooks().then((nbs) => {
      const mapped = nbs.map((nb: { id: string; title: string }) => ({ id: nb.id, title: nb.title }));
      setNotebooks(mapped);
    }).catch(() => {});

    getRebuildProgress().then((p) => {
      if (p.status === "processing") {
        setRebuilding(true);
        setProgress(p);
        startProgressPolling();
      }
    }).catch(() => {});
  }, [startProgressPolling]);

  const fetchGraph = useCallback(async () => {
    setLoading(true);
    try {
      const data = selectedNotebook === "global"
        ? await getGlobalGraph()
        : await getNotebookGraph(selectedNotebook);
      setGraphData(data);
    } catch {
      setGraphData({ nodes: [], links: [] });
    } finally {
      setLoading(false);
    }
  }, [selectedNotebook]);

  useEffect(() => { fetchGraphRef.current = fetchGraph; }, [fetchGraph]);
  useEffect(() => { fetchGraph(); }, [fetchGraph]);

  useEffect(() => {
    if (!containerEl) return;
    const measure = () => {
      const rect = containerEl.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (w > 0 && h > 0) setDimensions((prev) => {
        if (prev.width === w && prev.height === h) return prev;
        return { width: w, height: h };
      });
    };
    const frame = requestAnimationFrame(measure);
    const obs = new ResizeObserver(() => requestAnimationFrame(measure));
    obs.observe(containerEl);
    return () => { cancelAnimationFrame(frame); obs.disconnect(); };
  }, [containerEl]);

  const handleRebuild = async () => {
    if (rebuilding) return;
    setRebuilding(true);
    setProgress(null);
    try {
      if (selectedNotebook === "global") {
        await rebuildAllGraphs();
      } else {
        await rebuildGraph(selectedNotebook);
      }
      startProgressPolling();
    } catch {
      setRebuilding(false);
    }
  };

  const handleNodeClick = useCallback(async (node: ForceNode) => {
    setSelectedNode(node);
    setDetailLoading(true);
    try {
      const detail = await getEntityDetail(node.id);
      setEntityDetail(detail);
    } catch {
      setEntityDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const filteredData = useMemo(() => {
    if (!graphData) return { nodes: [], links: [] };
    if (!search.trim()) return graphData;

    const lowerSearch = search.toLowerCase();
    const matchedIds = new Set(
      graphData.nodes
        .filter((n) => n.name.toLowerCase().includes(lowerSearch))
        .map((n) => n.id)
    );

    return {
      nodes: graphData.nodes.filter((n) => matchedIds.has(n.id)),
      links: graphData.links.filter(
        (l) =>
          matchedIds.has(typeof l.source === "object" ? (l.source as { id: string }).id : String(l.source)) &&
          matchedIds.has(typeof l.target === "object" ? (l.target as { id: string }).id : String(l.target))
      ),
    };
  }, [graphData, search]);

  const highlightNodes = useMemo(() => {
    if (!search.trim()) return new Set<string>();
    const lowerSearch = search.toLowerCase();
    return new Set(
      (graphData?.nodes ?? [])
        .filter((n) => n.name.toLowerCase().includes(lowerSearch))
        .map((n) => n.id)
    );
  }, [graphData, search]);

  const forceGraphData = useMemo(() => {
    if (!filteredData) return { nodes: [], links: [] };
    return {
      nodes: filteredData.nodes.map((n) => ({ ...n })),
      links: filteredData.links.map((l) => ({
        source: l.source,
        target: l.target,
        relationType: l.relationType,
        description: l.description,
        weight: l.weight,
      })),
    };
  }, [filteredData]);

  const nodeCanvasObject = useCallback(
    (node: ForceNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const label = node.name;
      const fontSize = Math.max(10 / globalScale, 3);
      const radius = Math.max(3, Math.min(12, 4 + (node.mentionCount || 1) * 1.5));
      const color = TYPE_COLORS[node.type] || TYPE_COLORS.other;
      const isHighlighted = highlightNodes.size > 0 && highlightNodes.has(node.id);
      const isSelected = selectedNode?.id === node.id;
      const isDimmed = highlightNodes.size > 0 && !highlightNodes.has(node.id);

      ctx.beginPath();
      ctx.arc(node.x || 0, node.y || 0, radius, 0, 2 * Math.PI);
      ctx.fillStyle = isDimmed ? `${color}40` : color;
      ctx.fill();

      if (isSelected || isHighlighted) {
        ctx.strokeStyle = isSelected ? "#fff" : color;
        ctx.lineWidth = isSelected ? 2 / globalScale : 1.5 / globalScale;
        ctx.stroke();
      }

      if (globalScale > 0.8 || isHighlighted || isSelected) {
        ctx.font = `${isSelected ? "bold " : ""}${fontSize}px -apple-system, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = isDimmed ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.85)";
        ctx.fillText(label, node.x || 0, (node.y || 0) + radius + 2);
      }
    },
    [highlightNodes, selectedNode]
  );

  const linkCanvasObject = useCallback(
    (link: ForceLink, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const src = link.source as ForceNode;
      const tgt = link.target as ForceNode;
      if (!src.x || !src.y || !tgt.x || !tgt.y) return;

      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = Math.max(0.5, link.weight * 1.5) / globalScale;
      ctx.stroke();

      if (globalScale > 1.5) {
        const midX = (src.x + tgt.x) / 2;
        const midY = (src.y + tgt.y) / 2;
        const fontSize = Math.max(8 / globalScale, 2.5);
        ctx.font = `${fontSize}px -apple-system, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.fillText(link.relationType, midX, midY);
      }
    },
    []
  );

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!graphData || (graphData.nodes.length === 0 && graphData.links.length === 0)) {
    const pct = progress && progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50">
          <Share2 size={28} className="text-muted-foreground/40" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground/80">{t("graphEmpty")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t("graphEmptyDesc")}</p>
        </div>

        {rebuilding && progress && progress.total > 0 ? (
          <div className="mt-2 w-72 space-y-2">
            {/* Progress bar */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted/50">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{progress.current} / {progress.total}</span>
              <span>{pct}%</span>
            </div>
            {progress.sourceTitle && (
              <p className="truncate text-[11px] text-muted-foreground/60">
                {t("processingSource")}: {progress.sourceTitle}
              </p>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={async () => {
              if (rebuilding) return;
              setRebuilding(true);
              setProgress(null);
              try {
                await rebuildAllGraphs();
                startProgressPolling();
              } catch {
                setRebuilding(false);
              }
            }}
            disabled={rebuilding}
            className="mt-2 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-50"
          >
            {rebuilding ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {rebuilding ? t("rebuilding") : t("rebuildGraph")}
          </button>
        )}
      </div>
    );
  }

  const toolbar = (
    <div className="flex items-center gap-4">
      <div className="relative max-w-sm flex-1">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("graphSearch")}
          className="w-full rounded-lg border border-border/40 bg-background py-2 pl-8 pr-8 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
        />
        {search && (
          <button type="button" onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground">
            <X size={13} />
          </button>
        )}
      </div>

      <Select
        value={selectedNotebook}
        onValueChange={(v) => { setSelectedNotebook(v); setSelectedNode(null); }}
        className="w-[180px]"
        triggerClassName="h-[36px] text-xs"
      >
        <SelectContent>
          <SelectItem value="global">{t("graphGlobal")}</SelectItem>
          {notebooks.map((nb) => (
            <SelectItem key={nb.id} value={nb.id}>{nb.title}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="ml-auto flex items-center gap-2">
        <span className="text-xs text-muted-foreground/60">
          {graphData.nodes.length} {t("entityCount")} · {graphData.links.length} {t("relationCount")}
        </span>
        <button
          type="button"
          onClick={handleRebuild}
          disabled={rebuilding}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/40 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
          title={rebuilding ? t("rebuilding") : t("rebuildGraph")}
        >
          {rebuilding ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {toolbarContainer && createPortal(toolbar, toolbarContainer)}
      {/* Graph + Detail Panel */}
      <div className="relative flex-1 overflow-hidden">
        {/* Force Graph */}
        <div ref={setContainerEl} className="absolute inset-0">
          {dimensions.width > 0 && dimensions.height > 0 && (
            <ForceGraph2D
              width={dimensions.width}
              height={dimensions.height}
              graphData={forceGraphData}
              nodeCanvasObject={nodeCanvasObject as (node: object, ctx: CanvasRenderingContext2D, globalScale: number) => void}
              linkCanvasObject={linkCanvasObject as (link: object, ctx: CanvasRenderingContext2D, globalScale: number) => void}
              onNodeClick={handleNodeClick as (node: object) => void}
              nodeId="id"
              cooldownTicks={100}
              warmupTicks={50}
              backgroundColor="transparent"
              linkDirectionalArrowLength={3}
              linkDirectionalArrowRelPos={1}
              d3AlphaDecay={0.03}
              d3VelocityDecay={0.3}
            />
          )}
        </div>

        {/* Legend */}
        <div className="absolute bottom-3 left-3 flex flex-wrap gap-2 rounded-lg border border-border/30 bg-background/80 px-3 py-2 backdrop-blur-sm">
          {Object.entries(TYPE_COLORS).map(([type, color]) => (
            <div key={type} className="flex items-center gap-1">
              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-[10px] text-muted-foreground">{TYPE_LABELS[type] || type}</span>
            </div>
          ))}
        </div>

        {/* Entity Detail Panel */}
        <AnimatePresence>
          {selectedNode && (
            <m.div
              initial={{ x: 320, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 320, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="absolute bottom-0 left-0 right-0 z-20 border-t border-border/40 bg-background/95 backdrop-blur-md md:bottom-auto md:left-auto md:right-0 md:top-0 md:h-full md:w-[300px] md:border-l md:border-t-0"
            >
              <div className="flex h-full max-h-[50vh] flex-col overflow-hidden md:max-h-none">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
                  <h3 className="text-sm font-semibold">{t("entityDetail")}</h3>
                  <button type="button" onClick={() => { setSelectedNode(null); setEntityDetail(null); }}>
                    <X size={14} className="text-muted-foreground hover:text-foreground" />
                  </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-4 py-3">
                  {detailLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 size={18} className="animate-spin text-muted-foreground" />
                    </div>
                  ) : entityDetail ? (
                    <div className="space-y-4">
                      {/* Entity info */}
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: TYPE_COLORS[entityDetail.type] || TYPE_COLORS.other }} />
                          <span className="text-base font-semibold">{entityDetail.name}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {TYPE_LABELS[entityDetail.type] || entityDetail.type}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {t("mentionCount", { count: entityDetail.mentionCount })}
                          </span>
                        </div>
                      </div>

                      {entityDetail.description && (
                        <p className="text-xs leading-relaxed text-muted-foreground">{entityDetail.description}</p>
                      )}

                      {entityDetail.sourceTitle && (
                        <div className="rounded-lg border border-border/40 px-3 py-2">
                          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">{t("relatedSources")}</p>
                          <p className="mt-1 text-xs text-foreground/80">{entityDetail.sourceTitle}</p>
                        </div>
                      )}

                      {/* Relations */}
                      {entityDetail.relations.length > 0 && (
                        <div>
                          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                            {t("relations")} ({entityDetail.relations.length})
                          </p>
                          <div className="space-y-1.5">
                            {entityDetail.relations.map((rel, idx) => (
                              <div key={idx} className="flex items-center gap-1.5 rounded-lg border border-border/30 px-2.5 py-1.5 text-xs">
                                {rel.direction === "outgoing" ? (
                                  <ArrowRight size={10} className="shrink-0 text-primary/60" />
                                ) : (
                                  <ArrowLeft size={10} className="shrink-0 text-emerald-400/60" />
                                )}
                                <span className="text-muted-foreground">{rel.relationType}</span>
                                <span className="font-medium text-foreground/80">{rel.entityName}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="py-4 text-center text-xs text-muted-foreground">{t("graphEmpty")}</p>
                  )}
                </div>
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
