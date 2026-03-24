"use client";

/**
 * @file Copilot 侧边面板
 * @description 笔记本工作区右侧的 AI 助手面板，提供上下文感知对话、
 *              主动洞察卡片、跨笔记本知识关联和写作辅助等功能。
 *              支持弹性拖拽调整宽度。
 */

import { AnimatePresence, m, MotionConfig } from "framer-motion";
import { ChevronDown, PanelRight, PictureInPicture2, Sparkles, X } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCopilotResize, DEFAULT_WIDTH } from "@/hooks/use-copilot-resize";
import type { CopilotMode } from "@/features/notebook/notebook-workspace";

import { ChatInput } from "@/components/chat-input";
import { AgentSteps } from "@/components/message-render/agent-steps";
import { ApprovalCard } from "@/components/message-render/approval-card";
import { CopilotMessageBubble } from "@/features/copilot/copilot-message-bubble";
import { ProactiveCard } from "@/features/copilot/proactive-card";
import { SoulCard } from "@/features/copilot/soul-card";
import { WritingContextBar } from "@/features/copilot/writing-context-bar";
import { approveToolCall, getContextGreeting, getInsights, getRelatedKnowledge, sendMessageStream, type CrossNotebookChunk, type GreetingSuggestion, type ProactiveInsight } from "@/services/ai-service";
import { cn } from "@/lib/utils";
import { useProactiveStore } from "@/store/use-proactive-store";
import { useAgentStreamEvents } from "@/hooks/use-agent-stream-events";
import type { CitationData, Message, MindMapData } from "@/types";

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
}: {
  notebookId?: string;
  initialMessages: Message[];
  isOpen: boolean;
  onClose: () => void;
  onInsertToEditor?: (content: string) => void | Promise<void>;
  onInsertMindMap?: (data: MindMapData) => void;
  onWidthChange?: (width: number) => void;
  onNoteCreated?: () => void;
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
}) {
  const isFloating = mode === "floating";
  const t = useTranslations("copilot");
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [quotedText, setQuotedText] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
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

  // ── Cross-notebook related knowledge ───────────────────────
  const [relatedKnowledge, setRelatedKnowledge] = useState<CrossNotebookChunk[]>([]);

  useEffect(() => {
    if (!notebookId) return;
    let cancelled = false;
    getRelatedKnowledge(notebookId)
      .then((chunks) => { if (!cancelled) setRelatedKnowledge(chunks); })
      .catch(() => {});
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
              onNoteCreated?.();
              return;
            }
            // Common: human_approve_required + append to agentSteps
            handleAgentEvent(event);
          },
          copilotConvId,  // reuse existing conversation for context continuity
          undefined, // globalSearch
          undefined, // signal
          undefined, // toolHint
          undefined, // attachmentIds
          undefined, // attachmentsMeta
          true,      // isCopilot
        );
        // Persist the conversation ID so subsequent messages stay in the same conversation
        if (newConvId && newConvId !== copilotConvId) {
          setCopilotConvId(newConvId);
        }
      } catch {
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

  return (
    <MotionConfig transition={SPRING}>
      {/* ── Panel ─────────────────────────────────────────────── */}
      {/*
       * 永远 position:fixed，通过 animate 对坐标数值插值：
       * 侧边栏: top=0, right=0,  width=panelW, height=windowH → 弹簧附着到屏幕右侧
       * 浮窗:   top=floatTop, right=24, width=360, height=520 → 右下角小卡片
       * 切换时所有数值由弹簧平滑过渡，避免 FLIP 跨 context 跳位问题
       */}
      <m.aside
        initial={false}
        animate={isFloating ? floatingAnim : dockedAnim}
        transition={SPRING}
        className={cn(
          "fixed z-50 flex flex-col bg-card overflow-hidden",
          isFloating
            ? "border border-border/60 shadow-2xl shadow-black/30"
            : "border-l border-border/40",
        )}
        style={{
          pointerEvents: isOpen ? "auto" : "none",
          transformOrigin: isFloating ? "bottom right" : "top right",
        }}
      >
      {/* ── Resize handle (docked only) ─────────────────────────────────── */}
      {!isFloating && (
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

      {/* ── Header ────────────────────────────────────────── */}
      <div className={cn(
        "relative flex flex-shrink-0 items-center justify-between overflow-hidden px-3 py-2.5",
        isFloating && "rounded-t-2xl"
      )}>
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

        <div className="flex min-w-0 items-center gap-2">
          <div className="relative flex h-6 w-6 flex-shrink-0 items-center justify-center">
            <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 blur-sm" />
            <Image
              src="/lyra.png"
              alt="Lyra"
              width={20}
              height={20}
              className="relative h-5 w-5 rounded object-contain"
            />
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[13px] font-semibold leading-none tracking-tight text-foreground/90">
              Lyra
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Mode toggle */}
          {onModeChange && (
            <button
              className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-muted/50 hover:text-foreground/80"
              onClick={() => onModeChange(isFloating ? "docked" : "floating")}
              type="button"
              title={isFloating ? t("dockPanel") : t("floatPanel")}
            >
              {isFloating ? <PanelRight size={12} /> : <PictureInPicture2 size={12} />}
            </button>
          )}
          <button
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-muted/50 hover:text-foreground/80"
            onClick={onClose}
            type="button"
            title={t("closePanel")}
          >
            <X size={12} />
          </button>
        </div>

        <div className="absolute inset-x-0 bottom-0 h-px bg-border/30" />
      </div>

      {/* ── Writing context bar ─────────────────────────── */}
      <WritingContextBar
        chunks={writingContext}
        onAskAbout={(q) => void submit(q)}
        onInsertCitation={onInsertToEditor}
      />

      {/* ── Cross-notebook knowledge ─────────────────────── */}
      {relatedKnowledge.length > 0 && (
        <WritingContextBar
          chunks={relatedKnowledge.map((c) => ({
            source_title: `${c.notebook_title} → ${c.source_title}`,
            excerpt: c.excerpt,
            score: c.score,
            chunk_id: c.chunk_id,
          }))}
          onAskAbout={(q) => void submit(q)}
        />
      )}

      {/* ── Content ───────────────────────────────────────── */}
      <div className="relative flex-1 overflow-y-auto">
        {!hasMessages ? (
          <div className="p-4">
            <p className="mb-4 text-[12px] leading-5 text-muted-foreground/70">
              {greetingText || t("greeting")}
            </p>

            {/* Proactive suggestions */}
            {unreadSuggestions.length > 0 && (
              <div className="mb-3 space-y-2">
                <AnimatePresence>
                  {unreadSuggestions.map((s) =>
                    s.type === "insight" ? (
                      <SoulCard
                        key={s.id}
                        suggestion={s}
                        onReply={(text) => void submit(text)}
                      />
                    ) : (
                      <ProactiveCard
                        key={s.id}
                        suggestion={s}
                        onAskQuestion={(q) => void submit(q)}
                      />
                    )
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Backend insights */}
            {insights.length > 0 && (
              <div className="mb-3 space-y-1.5">
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

            <div className="space-y-2">
              {greetingLoading ? (
                <>
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-12 animate-pulse rounded-xl border border-border/30 bg-muted/20" />
                  ))}
                </>
              ) : dynamicSuggestions && dynamicSuggestions.length > 0 ? (
                dynamicSuggestions.map((s) => (
                  <button
                    key={s.label}
                    className="group flex w-full items-center gap-3 rounded-xl border border-border/50 bg-background px-3.5 py-3 text-left transition-colors hover:border-border hover:bg-accent"
                    onClick={() => { if (s.prompt) void submit(s.prompt); }}
                    type="button"
                  >
                    <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                      <Sparkles size={13} />
                    </div>
                    <span className="text-[13px] text-foreground/70 group-hover:text-foreground/90">
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
                      className="group flex w-full items-center gap-3 rounded-xl border border-border/50 bg-background px-3.5 py-3 text-left transition-colors hover:border-border hover:bg-accent"
                      onClick={() => void submit(s.prompt)}
                      type="button"
                    >
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                        <Sparkles size={13} />
                      </div>
                      <span className="text-[13px] text-foreground/70 group-hover:text-foreground/90">
                        {s.label}
                      </span>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4 p-4">
            {/* Proactive cards above messages */}
            {unreadSuggestions.length > 0 && (
              <AnimatePresence>
                {unreadSuggestions.map((s) =>
                  s.type === "insight" ? (
                    <SoulCard
                      key={s.id}
                      suggestion={s}
                      onReply={(text) => void submit(text)}
                    />
                  ) : (
                    <ProactiveCard
                      key={s.id}
                      suggestion={s}
                      onAskQuestion={(q) => void submit(q)}
                    />
                  )
                )}
              </AnimatePresence>
            )}
            {messages.map((message, idx) => {
              const isLastAssistant = message.role === "assistant" && idx === messages.length - 1;
              const stepsToShow = isLastAssistant && agentSteps.length > 0
                ? agentSteps
                : message.agentSteps;

              return (
                <div key={message.id}>
                  {message.role === "assistant" && stepsToShow?.length ? (
                    <AgentSteps
                      steps={stepsToShow}
                      isStreaming={isLastAssistant && streaming}
                      defaultOpen={isLastAssistant && streaming}
                    />
                  ) : null}
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
                    onInsert={message.role === "assistant" ? onInsertToEditor : undefined}
                    onInsertMindMap={message.role === "assistant" ? onInsertMindMap : undefined}
                  />
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}

        {/* ── Scroll to bottom button ────────────────────── */}
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

      {/* ── Input ─────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-t border-border/30 p-3">
        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={(text) => void submit(text)}
          placeholder={t("placeholder")}
          streaming={streaming}
          variant="compact"
          accentBorder="border-border/40 focus-within:border-primary/30 focus-within:shadow-[0_0_0_2px_hsl(var(--primary)/0.06)]"
          showHint
          hintText={t("sendHint")}
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
          toolbarLeft={
            <span className="flex items-center gap-1 rounded-full border border-border/30 bg-muted/20 px-2 py-0.5 text-[10px] text-muted-foreground/40">
              <Sparkles size={8} className="text-primary/50" />
              {t("notebookLabel")}
            </span>
          }
        />
      </div>
      </m.aside>
    </MotionConfig>
  );
}
