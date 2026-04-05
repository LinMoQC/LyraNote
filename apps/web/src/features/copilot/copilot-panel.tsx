"use client";

/**
 * @file Copilot 侧边面板
 * @description 笔记本工作区右侧的 AI 助手面板，提供上下文感知对话、
 *              主动洞察卡片、跨笔记本知识关联和写作辅助等功能。
 *              支持弹性拖拽调整宽度。
 */

import { AnimatePresence, m, MotionConfig } from "framer-motion";
import { BookOpen, ChevronDown, PanelRight, PictureInPicture2, Sparkles, SquarePen, X } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCopilotResize, DEFAULT_WIDTH } from "@/hooks/use-copilot-resize";
import type { CopilotMode } from "@/features/notebook/notebook-workspace";

import { ChatInput } from "@/components/chat-input";
import { ApprovalCard } from "@/components/message-render/approval-card";
import { BotAvatar } from "@/components/ui/bot-avatar";
import { CopilotMessageBubble } from "@/features/copilot/copilot-message-bubble";
import { approveToolCall, getContextGreeting, getInsights, sendMessageStream, type GreetingSuggestion, type ProactiveInsight } from "@/services/ai-service";
import { cn } from "@/lib/utils";
import { useProactiveStore } from "@/store/use-proactive-store";
import { useAgentStreamEvents } from "@/hooks/use-agent-stream-events";
import { RelevantSourcesView } from "@/features/copilot/relevant-sources-view";
import { Skeleton } from "@/components/ui/skeleton";
import { useNotebookStore } from "@/store/use-notebook-store";
import type { CitationData, Message, MindMapData } from "@/types";
import { getRelatedKnowledge, type CrossNotebookChunk } from "@/services/ai-service";

export { MIN_WIDTH, MAX_WIDTH, DEFAULT_WIDTH } from "@/hooks/use-copilot-resize";

/**
 * Copilot 侧边面板组件
 * @param notebookId - 当前笔记本 ID
 * @param initialMessages - 初始消息列表
 * @param isOpen - 面板是否展开
 * @param onClose - 关闭面板回调
 * @param onInsertToEditor - 插入文本到编辑器的回调
 * @param onInsertMindMap - 插入思维导图到编辑器的回调
 * @param onWidthChange - 面板宽度变化回调
 * @param onNoteCreated - AI 创建笔记后的回调
 * @param onToggleContext - 切换上下文抽屉回调
 */
export function CopilotPanel({
  notebookId,
  initialMessages,
  isOpen,
  onClose,
  onInsertToEditor,
  onInsertMindMap,
  onWidthChange,
  onNoteCreated,
  pendingPrompt,
  pendingQuote,
  getEditorContext,
  mode = "docked",
  onModeChange,
  panelWidth: externalPanelWidth,
  containerTop = 0,
  containerHeight,
  presentation = "fixed",
  onToggleContext,
}: {
  notebookId?: string;
  initialMessages: Message[];
  isOpen: boolean;
  onClose: () => void;
  onInsertToEditor?: (content: string) => void | Promise<void>;
  onInsertMindMap?: (data: MindMapData) => void;
  onWidthChange?: (width: number) => void;
  onNoteCreated?: (noteId: string, noteTitle: string | null) => void;
  pendingPrompt?: { text: string; key: number } | null;
  pendingQuote?: { text: string; key: number } | null;
  getEditorContext?: () => string;
  mode?: CopilotMode;
  onModeChange?: (mode: CopilotMode) => void;
  /** 面板宽度（px），由父组件管理，用于侧边栏模式定位 */
  panelWidth?: number;
  /** 内容区域顶部距视口的偏移量（px），用于侧边栏模式对齐 */
  containerTop?: number;
  /** 内容区域高度（px），用于侧边栏模式对齐 */
  containerHeight?: number;
  presentation?: "fixed" | "sheet";
  onToggleContext?: () => void;
}) {
  const isFloating = mode === "floating";
  const isSheet = presentation === "sheet";
  const t = useTranslations("copilot");
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [quotedText, setQuotedText] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const setCopilotStreaming = useNotebookStore((s) => s.setCopilotStreaming);
  const streamAbortRef = useRef<AbortController | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  // Persist the copilot's conversation ID so history is maintained across messages
  const [copilotConvId, setCopilotConvId] = useState<string | undefined>(undefined);
  const {
    agentSteps,
    pendingApproval,
    setPendingApproval,
    handleAgentEvent,
    buildSavedSteps,
    reset: resetAgentState,
  } = useAgentStreamEvents();

  // ── Dynamic context greeting ──────────────────────────────
  const [greetingText, setGreetingText] = useState<string | null>(null);
  const [dynamicSuggestions, setDynamicSuggestions] = useState<GreetingSuggestion[] | null>(null);
  const [greetingLoading, setGreetingLoading] = useState(false);

  useEffect(() => {
    if (!notebookId) return;
    let cancelled = false;
    setGreetingLoading(true);
    getContextGreeting(notebookId)
      .then((data) => {
        if (cancelled) return;
        setGreetingText(data.greeting);
        setDynamicSuggestions(data.suggestions);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setGreetingLoading(false); });
    return () => { cancelled = true; };
  }, [notebookId]);

  // ── Proactive suggestions ─────────────────────────────────
  const proactiveSuggestions = useProactiveStore((s) => s.suggestions);
  const markAllRead = useProactiveStore((s) => s.markAllRead);
  const unreadSuggestions = useMemo(
    () => proactiveSuggestions.filter((s) => !s.read),
    [proactiveSuggestions]
  );
  const writingContext = useProactiveStore((s) => s.writingContext);

  // ── Reference Sources Drawer ──────────────────────────────
  const [showReferences, setShowReferences] = useState(false);
  const [relatedKnowledge, setRelatedKnowledge] = useState<CrossNotebookChunk[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);

  useEffect(() => {
    if (!notebookId || !showReferences) return;
    let cancelled = false;
    setLoadingRelated(true);
    getRelatedKnowledge(notebookId)
      .then((chunks) => {
        if (!cancelled) setRelatedKnowledge(chunks);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingRelated(false);
      });
    return () => {
      cancelled = true;
    };
  }, [notebookId, showReferences]);

  // ── Backend insights ────────────────────────────────────────
  const [insights, setInsights] = useState<ProactiveInsight[]>([]);
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    getInsights()
      .then((data) => {
        if (!cancelled) setInsights(data.insights.filter((i) => !i.is_read));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isOpen]);

  const effectivePanelWidth = externalPanelWidth ?? DEFAULT_WIDTH;

  const { isDragging, handleResizeStart, handleResizeTouchStart } = useCopilotResize(
    onWidthChange,
    effectivePanelWidth,
  );

  // 打开面板时标记所有主动建议为已读
  useEffect(() => {
    if (isOpen) markAllRead?.();
  }, [isOpen, markAllRead]);

  useEffect(() => {
    setCopilotStreaming(streaming);
    return () => {
      setCopilotStreaming(false);
    };
  }, [setCopilotStreaming, streaming]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // ── Chat persistence ───────────────────────────────────────
  const chatLoadedRef = useRef(false);
  // Tracks whether the one-time initial scroll has happened
  const didInitialScrollRef = useRef(false);
  // Only auto-scroll for messages added AFTER the initial load
  const autoScrollEnabledRef = useRef(false);

  useEffect(() => {
    if (!notebookId) { chatLoadedRef.current = true; return; }
    // Reset conversation when switching notebooks so messages don't bleed across
    setCopilotConvId(undefined);
    try {
      const stored = localStorage.getItem(`chat:${notebookId}`);
      if (stored) {
        const parsed = JSON.parse(stored) as Message[];
        if (parsed.length > 0) setMessages(parsed);
      }
    } catch { /* ignore */ }
    chatLoadedRef.current = true;
    // Scroll to the latest message once on enter, then enable live auto-scroll
    setTimeout(() => {
      if (!didInitialScrollRef.current) {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
        didInitialScrollRef.current = true;
      }
      autoScrollEnabledRef.current = true;
    }, 120);
  }, [notebookId]);

  useEffect(() => {
    if (!chatLoadedRef.current || !notebookId) return;
    try {
      localStorage.setItem(`chat:${notebookId}`, JSON.stringify(messages));
    } catch { /* ignore */ }
  }, [notebookId, messages]);

  // Auto-scroll for new messages (streaming or sent)
  useEffect(() => {
    if (!autoScrollEnabledRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Show "scroll to bottom" button when user scrolls away from bottom
  useEffect(() => {
    const el = bottomRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => setShowScrollBtn(!entry.isIntersecting),
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const submit = useCallback(
    async (prompt: string) => {
      if (!prompt.trim() || streaming) return;

      const quote = quotedText;
      const editorContext = getEditorContext?.();
      const apiPrompt = quote ? t("referencePrompt", { quote, prompt }) : prompt;

      const userMsg: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: prompt,
        quotedText: quote ?? undefined,
      };
      setMessages((c) => [...c, userMsg]);
      setInput("");
      setQuotedText(null);
      // ChatInput handles auto-resize internally
      setStreaming(true);
      const abortController = new AbortController();
      streamAbortRef.current = abortController;

      const assistantId = `assistant-${Date.now()}`;
      setMessages((c) => [...c, { id: assistantId, role: "assistant", content: "" }]);
      resetAgentState();

      const pendingMindMap = { current: null as MindMapData | null };
      const pendingDiagram = { current: null as import("@/types").DiagramData | null };
      const pendingMCPResult = { current: null as import("@/types").MCPResultData | null };

      try {
        const newConvId = await sendMessageStream(
          apiPrompt,
          (token) => {
            setMessages((c) =>
              c.map((m) => (m.id === assistantId ? { ...m, content: m.content + token } : m))
            );
          },
          (citations?: CitationData[]) => {
            const savedSteps = buildSavedSteps();
            setMessages((c) =>
              c.map((m) => (m.id === assistantId
                ? {
                    ...m,
                    citations: citations?.length ? citations : m.citations,
                    agentSteps: savedSteps.length ? savedSteps : undefined,
                    mindMap: pendingMindMap.current ?? m.mindMap,
                    diagram: pendingDiagram.current ?? m.diagram,
                    mcpResult: pendingMCPResult.current ?? m.mcpResult,
                  }
                : m))
            );
            streamAbortRef.current = null;
            setStreaming(false);
          },
          editorContext,
          notebookId,
          (event) => {
            if (event.type === "mind_map" && event.data) {
              pendingMindMap.current = event.data as unknown as MindMapData;
              setMessages((c) =>
                c.map((m) =>
                  m.id === assistantId
                    ? { ...m, mindMap: event.data as unknown as MindMapData }
                    : m
                )
              );
            }
            if (event.type === "diagram" && event.data) {
              const diagramData = event.data as unknown as import("@/types").DiagramData;
              pendingDiagram.current = diagramData;
              setMessages((c) =>
                c.map((m) =>
                  m.id === assistantId
                    ? { ...m, diagram: diagramData }
                    : m
                )
              );
            }
            if (event.type === "mcp_result" && event.data) {
              const mcpData = event.data as unknown as import("@/types").MCPResultData;
              pendingMCPResult.current = mcpData;
              setMessages((c) =>
                c.map((m) =>
                  m.id === assistantId
                    ? { ...m, mcpResult: mcpData }
                    : m
                )
              );
            }
            if (event.type === "note_created") {
              onNoteCreated?.(event.note_id as string, (event.note_title as string | null) ?? null);
              return;
            }
            // Common: human_approve_required + append to agentSteps
            handleAgentEvent(event);
          },
          copilotConvId,  // reuse existing conversation for context continuity
          undefined, // globalSearch
          abortController.signal,
          undefined, // toolHint
          undefined, // attachmentIds
          undefined, // attachmentsMeta
          undefined, // thinkingEnabled
          true,      // isCopilot
          undefined, // onConversationReady
        );
        // Persist the conversation ID so subsequent messages stay in the same conversation
        if (newConvId && newConvId !== copilotConvId) {
          setCopilotConvId(newConvId);
        }
      } catch (err) {
        streamAbortRef.current = null;
        // Aborted by user — keep whatever content was streamed so far
        if (err instanceof Error && err.name === "AbortError") {
          setStreaming(false);
          return;
        }
        setMessages((c) =>
          c.map((m) =>
            m.id === assistantId ? { ...m, content: t("errorRetry") } : m
          )
        );
        setStreaming(false);
      }
    },
    // notebookId is included so the callback always uses the current notebook context
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [streaming, quotedText, getEditorContext, notebookId, copilotConvId]
  );

  const handleCancel = useCallback(() => {
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    setStreaming(false);
  }, []);

  const handleClearContext = useCallback(() => {
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    setStreaming(false);
    setMessages([]);
    setCopilotConvId(undefined);
    resetAgentState();
    if (notebookId) {
      try { localStorage.removeItem(`chat:${notebookId}`); } catch { /* ignore */ }
    }
  }, [notebookId, resetAgentState]);

  // Auto-submit when parent sends a pending prompt (polish / shorten)
  const lastPendingKey = useRef<number | null>(null);
  useEffect(() => {
    if (!pendingPrompt) return;
    if (pendingPrompt.key === lastPendingKey.current) return;
    lastPendingKey.current = pendingPrompt.key;
    void submit(pendingPrompt.text);
  }, [pendingPrompt, submit]);

  // Set quote chip when parent sends a pending quote (Ask AI)
  const lastPendingQuoteKey = useRef<number | null>(null);
  useEffect(() => {
    if (!pendingQuote) return;
    if (pendingQuote.key === lastPendingQuoteKey.current) return;
    lastPendingQuoteKey.current = pendingQuote.key;
    setQuotedText(pendingQuote.text);
    textareaRef.current?.focus();
  }, [pendingQuote]);

  const hasMessages = messages.length > 0;

  // ── Window height (SSR 安全) ─────────────────────────────────
  const [windowH, setWindowH] = useState(800);
  useEffect(() => {
    setWindowH(window.innerHeight);
    const handleResize = () => setWindowH(window.innerHeight);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const SPRING = { type: "spring", stiffness: 300, damping: 32, mass: 0.75 } as const;

  // ── 动画参数：两种状态均使用 top+height 锚点，Framer Motion 可数值插值 ──
  const FLOAT_H = Math.min(550, windowH * 0.65);
  const FLOAT_W = 440;
  const floatTop = Math.max(24, windowH - 24 - FLOAT_H);
  // 侧边栏模式：与内容区域完全对齐（使用父组件传入的容器尺寸）
  const dockedH = containerHeight ?? windowH;

  const dockedAnim = isOpen
    ? { top: containerTop, right: 0, width: effectivePanelWidth, height: dockedH, borderRadius: 0, opacity: 1, scale: 1 }
    : { top: containerTop, right: -(effectivePanelWidth + 8), width: effectivePanelWidth, height: dockedH, borderRadius: 0, opacity: 0, scale: 1 };

  const floatingAnim = isOpen
    ? { top: floatTop, right: 24, width: FLOAT_W, height: FLOAT_H, borderRadius: 16, opacity: 1, scale: 1 }
    : { top: floatTop + 16, right: 24, width: FLOAT_W, height: FLOAT_H, borderRadius: 16, opacity: 0, scale: 0.93 };

  const panelContent = (
    <>
      {!isFloating && !isSheet && (
        <div
          onMouseDown={handleResizeStart}
          onTouchStart={handleResizeTouchStart}
          className="group absolute inset-y-0 -left-2.5 z-20 w-5 cursor-col-resize touch-none"
        >
          <div
            className={cn(
              "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-all duration-200",
              isDragging
                ? "bg-primary/60 shadow-[0_0_6px_hsl(var(--primary)/0.4)]"
                : "bg-transparent group-hover:bg-primary/25"
            )}
          />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-[3px]">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={cn(
                  "rounded-full transition-all duration-200",
                  isDragging
                    ? "h-[5px] w-[5px] bg-primary shadow-[0_0_4px_hsl(var(--primary)/0.6)]"
                    : "h-1 w-1 bg-muted group-hover:h-[5px] group-hover:w-[5px] group-hover:bg-primary/60"
                )}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── 顶部栏 ── */}
      <div className={cn(
        "relative flex flex-shrink-0 items-center justify-between px-4 py-3",
        isFloating && !isSheet && "rounded-t-2xl"
      )}>
        {/* 顶部渐变线 */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

        {/* 左侧：Logo + 名称 + 会话选择 */}
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="relative flex h-7 w-7 flex-shrink-0 items-center justify-center">
            <div className="absolute inset-0 rounded-[10px] bg-gradient-to-br from-violet-500/20 to-blue-500/15 blur-[6px]" />
            <Image
              src="/lyra.png"
              alt="Lyra"
              width={24}
              height={24}
              className="relative h-6 w-6 rounded-[8px] object-contain"
            />
          </div>
          <span className="text-[14px] font-semibold tracking-tight text-foreground/90">
            Lyra
          </span>
        </div>

        {/* 右侧：操作按钮 */}
        <div className="flex items-center gap-0.5">
          {hasMessages && (
            <div className="group/btn relative">
              <button
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground/50 transition-colors hover:bg-white/[0.06] hover:text-foreground/80"
                onClick={handleClearContext}
                type="button"
              >
                <SquarePen size={14} />
              </button>
              <div className="pointer-events-none absolute right-0 top-[calc(100%+6px)] z-[999] opacity-0 transition-opacity duration-150 delay-500 group-hover/btn:opacity-100">
                <div className="whitespace-nowrap rounded-[6px] bg-[#111] px-2 py-1 text-[11px] font-medium text-white/90 shadow-lg">
                  {t("clearContext")}
                </div>
                <div className="absolute right-2.5 top-0 h-0 w-0 -translate-y-full border-x-[4px] border-b-[4px] border-x-transparent border-b-[#111]" />
              </div>
            </div>
          )}
          <div className="group/btn relative">
            <button
              className={cn(
                "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg transition-colors",
                showReferences 
                  ? "bg-primary/20 text-primary" 
                  : "text-muted-foreground/50 hover:bg-white/[0.06] hover:text-foreground/80"
              )}
              onClick={() => setShowReferences((v) => !v)}
              type="button"
            >
              <BookOpen size={14} />
            </button>
            <div className="pointer-events-none absolute right-0 top-[calc(100%+6px)] z-[999] opacity-0 transition-opacity duration-150 delay-500 group-hover/btn:opacity-100">
              <div className="whitespace-nowrap rounded-[6px] bg-[#111] px-2 py-1 text-[11px] font-medium text-white/90 shadow-lg">
                {t("referenceSources")}
              </div>
              <div className="absolute right-2.5 top-0 h-0 w-0 -translate-y-full border-x-[4px] border-b-[4px] border-x-transparent border-b-[#111]" />
            </div>
          </div>
          {!isSheet && onModeChange && (
            <div className="group/btn relative">
              <button
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground/50 transition-colors hover:bg-white/[0.06] hover:text-foreground/80"
                onClick={() => onModeChange(isFloating ? "docked" : "floating")}
                type="button"
              >
                {isFloating ? <PanelRight size={14} /> : <PictureInPicture2 size={14} />}
              </button>
              <div className="pointer-events-none absolute right-0 top-[calc(100%+6px)] z-[999] opacity-0 transition-opacity duration-150 delay-500 group-hover/btn:opacity-100">
                <div className="whitespace-nowrap rounded-[6px] bg-[#111] px-2 py-1 text-[11px] font-medium text-white/90 shadow-lg">
                  {isFloating ? t("dockPanel") : t("floatPanel")}
                </div>
                <div className="absolute right-2.5 top-0 h-0 w-0 -translate-y-full border-x-[4px] border-b-[4px] border-x-transparent border-b-[#111]" />
              </div>
            </div>
          )}
          <div className="group/btn relative">
            <button
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground/50 transition-colors hover:bg-white/[0.06] hover:text-foreground/80"
              onClick={onClose}
              type="button"
            >
              <X size={14} />
            </button>
            <div className="pointer-events-none absolute right-0 top-[calc(100%+6px)] z-[999] opacity-0 transition-opacity duration-150 delay-500 group-hover/btn:opacity-100">
              <div className="whitespace-nowrap rounded-[6px] bg-[#111] px-2 py-1 text-[11px] font-medium text-white/90 shadow-lg">
                {t("closePanel")}
              </div>
              <div className="absolute right-2.5 top-0 h-0 w-0 -translate-y-full border-x-[4px] border-b-[4px] border-x-transparent border-b-[#111]" />
            </div>
          </div>
        </div>

        {/* 底部分割线 */}
        <div className="absolute inset-x-0 bottom-0 h-px bg-white/[0.06]" />
      </div>

      <div className="relative flex-1 overflow-hidden">
        {/* References Internal Drawer Overlay */}
        <AnimatePresence>
          {showReferences && (
            <m.div
              initial={{ x: "100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute inset-0 z-30 flex flex-col bg-card/95 backdrop-blur-md"
            >
              <div className="flex flex-shrink-0 items-center justify-between border-b border-white/[0.06] px-4 py-3">
                <div className="flex items-center gap-2">
                  <BookOpen size={14} className="text-primary/70" />
                  <span className="text-[13px] font-semibold text-foreground/90">{t("referenceSources")}</span>
                </div>
                <button
                  onClick={() => setShowReferences(false)}
                  className="rounded-md p-1.5 text-muted-foreground/40 transition-colors hover:bg-white/5 hover:text-foreground/70"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {loadingRelated && relatedKnowledge.length === 0 ? (
                  <div className="space-y-4 p-4">
                    <Skeleton className="h-[100px] w-full rounded-xl bg-white/[0.02]" />
                    <Skeleton className="h-[100px] w-full rounded-xl bg-white/[0.02]" />
                  </div>
                ) : (
                  <RelevantSourcesView
                    localChunks={writingContext}
                    globalChunks={relatedKnowledge}
                    onAskAbout={(text) => {
                      setShowReferences(false);
                      void submit(text);
                    }}
                    onInsertCitation={onInsertToEditor}
                  />
                )}
              </div>
            </m.div>
          )}
        </AnimatePresence>

        <div className="h-full overflow-y-auto scroll-smooth">
          {!hasMessages ? (
            <div className="flex flex-col px-5 pt-8 pb-4">
              {/* 问候区：大号图标 + 标题 */}
              <div className="mb-6">
                <BotAvatar className="mb-4 h-[42px] w-[42px] shadow-sm" />
                {greetingLoading ? (
                  <Skeleton className="h-6 w-48 rounded-lg bg-muted/30" />
                ) : (
                  <h2 className="text-[18px] font-semibold leading-snug tracking-tight text-foreground/90">
                    {greetingText || t("greeting")}
                  </h2>
                )}
              </div>

              {/* 主动建议卡片（已移至全局 Toaster） */}

              {/* 洞察卡片 */}
              {insights.length > 0 && (
                <div className="mb-4 space-y-1">
                  {insights.slice(0, 3).map((insight) => (
                    <m.div
                      key={insight.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-lg border border-primary/10 bg-primary/[0.03] px-3 py-2"
                    >
                      <p className="text-[11px] font-medium text-foreground/70">{insight.title}</p>
                      {insight.content && (
                        <p className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground/50">{insight.content}</p>
                      )}
                    </m.div>
                  ))}
                </div>
              )}

              {/* 快捷操作：Notion 风格 icon 行列表 */}
              <div className="space-y-0.5">
                {greetingLoading ? (
                  <>
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-9 rounded-xl bg-muted/20" />
                    ))}
                  </>
                ) : dynamicSuggestions && dynamicSuggestions.length > 0 ? (
                  dynamicSuggestions.map((s) => (
                    <button
                      key={s.label}
                      className="group flex w-full items-center gap-3 rounded-[8px] px-2 py-2.5 text-left transition-colors hover:bg-white/[0.05]"
                      onClick={() => { if (s.prompt) void submit(s.prompt); }}
                      type="button"
                    >
                      <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center text-muted-foreground/50 transition-colors group-hover:text-foreground/70">
                        <Sparkles size={14} />
                      </div>
                      <span className="text-[13px] text-foreground/60 transition-colors group-hover:text-foreground/85">
                        {s.label}
                      </span>
                    </button>
                  ))
                ) : (
                  <>
                    {[
                      { label: t("summarize"), prompt: "Summarize the key insights across all sources." },
                      { label: t("generateOutline"), prompt: "Turn these notes into a short presentation outline." },
                      { label: t("extractArguments"), prompt: "Compare and contrast the main arguments found in sources." },
                    ].map((s) => (
                      <button
                        key={s.prompt}
                        className="group flex w-full items-center gap-3 rounded-[8px] px-2 py-2.5 text-left transition-colors hover:bg-white/[0.05]"
                        onClick={() => void submit(s.prompt)}
                        type="button"
                      >
                        <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center text-muted-foreground/50 transition-colors group-hover:text-foreground/70">
                          <Sparkles size={14} />
                        </div>
                        <span className="text-[13px] text-foreground/60 transition-colors group-hover:text-foreground/85">
                          {s.label}
                        </span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4 p-4 pb-20">
              {/* unreadSuggestions removed to globally floating ProactiveToaster */}
              {messages.map((message, idx) => {
                const isLastAssistant = message.role === "assistant" && idx === messages.length - 1;

                return (
                  <div key={message.id}>
                    {isLastAssistant && streaming && pendingApproval && (
                      <ApprovalCard
                        toolCalls={pendingApproval.toolCalls}
                        onDecision={async (approved) => {
                          await approveToolCall(pendingApproval.approvalId, approved);
                          setPendingApproval(null);
                        }}
                      />
                    )}
                    <CopilotMessageBubble
                      message={message}
                      isLastAssistant={isLastAssistant}
                      streaming={streaming}
                      liveAgentSteps={agentSteps}
                      onInsert={message.role === "assistant" ? onInsertToEditor : undefined}
                      onInsertMindMap={message.role === "assistant" ? onInsertMindMap : undefined}
                    />
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}

          {showScrollBtn && hasMessages && (
            <button
              className="absolute bottom-3 right-3 flex h-7 w-7 items-center justify-center rounded-full border border-border/50 bg-card text-muted-foreground shadow-lg transition-colors hover:border-border/80 hover:text-foreground"
              onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })}
              type="button"
            >
              <ChevronDown size={13} />
            </button>
          )}
        </div>
      </div>

      {/* ── 底部输入区 ── */}
      <div className="flex-shrink-0 px-3 pb-4 pt-2">
        <div className="overflow-hidden rounded-[14px] border border-white/[0.08] bg-white/[0.04] transition-colors focus-within:border-white/[0.12] focus-within:bg-white/[0.06]">
          <ChatInput
            value={input}
            onChange={setInput}
            onSubmit={(text) => void submit(text)}
            onCancel={handleCancel}
            placeholder={t("placeholder")}
            streaming={streaming}
            variant={isSheet ? "default" : "compact"}
            accentBorder="border-transparent"
            showHint={false}
            aboveInput={
              quotedText ? (
                <div className="mb-2.5 flex items-start gap-2 rounded-xl border border-primary/15 bg-primary/[0.04] px-3 py-2">
                  <div className="mt-0.5 h-full w-0.5 flex-shrink-0 self-stretch rounded-full bg-primary/40" />
                  <p className="min-w-0 flex-1 line-clamp-3 text-[11px] leading-4 text-muted-foreground/70">
                    {quotedText}
                  </p>
                  <button
                    type="button"
                    onClick={() => setQuotedText(null)}
                    className="flex-shrink-0 rounded-md p-0.5 text-muted-foreground/40 transition-colors hover:bg-muted/50 hover:text-muted-foreground"
                  >
                    <X size={11} />
                  </button>
                </div>
              ) : undefined
            }
            toolbarLeft={!isSheet ? (
              <span className="flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.05] px-2 py-0.5 text-[10px] text-muted-foreground/40">
                <Sparkles size={8} className="text-violet-400/60" />
                {t("notebookLabel")}
              </span>
            ) : undefined}
          />
        </div>
      </div>
    </>
  );

  return (
    <MotionConfig transition={SPRING}>
      {isSheet ? (
        <div
          className="flex h-full min-h-0 flex-col overflow-hidden bg-card"
          data-testid="copilot-panel-sheet"
        >
          {panelContent}
        </div>
      ) : (
        <m.aside
          initial={false}
          animate={isFloating ? floatingAnim : dockedAnim}
          transition={SPRING}
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden bg-card",
            isFloating
              ? "border border-border/60 shadow-2xl shadow-black/30"
              : "border-l border-border/40",
          )}
          style={{
            pointerEvents: isOpen ? "auto" : "none",
            transformOrigin: isFloating ? "bottom right" : "top right",
          }}
          data-testid="copilot-panel-fixed"
        >
          {panelContent}
        </m.aside>
      )}
    </MotionConfig>
  );
}
