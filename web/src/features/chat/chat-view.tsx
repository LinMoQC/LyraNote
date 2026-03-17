"use client";

/**
 * @file 独立对话页视图
 * @description 全屏对话界面的核心组件，包含对话列表侧边栏、消息流、输入框、
 *              深度研究面板、反馈系统等。支持流式消息、多轮对话和文件附件。
 */

import { useAuth } from "@/features/auth/auth-provider";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, m } from "framer-motion";
import {
  ChevronDown,
  FlaskConical,
  MessageSquare,
  Plus,
  Sparkles,
  Zap,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatInputHandle } from "@/components/chat-input";

import { ChatInput } from "@/components/chat-input";
import { AttachmentPreviewBar } from "@/components/chat-input/attachment-preview-bar";
import { useFileAttachments } from "@/hooks/use-file-attachments";
import { http } from "@/lib/http-client";
import { cn } from "@/lib/utils";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { getSuggestions } from "@/services/ai-service";
import { DeepResearchProgress } from "@/features/chat/deep-research-progress";
import { useUiStore } from "@/store/use-ui-store";
import { getConversationFeedback, submitMessageFeedback, type FeedbackRating } from "@/services/feedback-service";
import {
  deleteConversation,
  getConversations,
  getMessages,
  type ConversationRecord,
} from "@/services/conversation-service";
import { getGlobalNotebook } from "@/services/notebook-service";
import { clearConversationMessages, loadActiveConversation, loadConversationMessages, saveActiveConversation, saveConversationMessages } from "@/features/chat/chat-persistence";
import { useStreamLifecycle } from "@/features/chat/use-stream-lifecycle";
import { getErrorMessage } from "@/lib/request-error";
import { notifyError } from "@/lib/notify";
import { ChatInputContainer, ChatMessageList } from "@/features/chat/chat-layout";

import { ChatAlerts } from "./chat-alerts";
import { ChatEmptyState } from "./chat-empty-state";
import type { LocalMessage } from "./chat-types";
import { CONVERSATIONS_PAGE_SIZE, MESSAGES_PAGE_SIZE } from "./chat-types";
import { isLocalAssistantDraft, isServerMessageId, mapRecord, sameConversationIds, sortMessagesByTime } from "./chat-helpers";
import { ChatSidebarPanel } from "./chat-sidebar-panel";
import { ChatMessageBubble } from "./chat-message-bubble";
import { useDeepResearch, DR_MESSAGES_KEY } from "./use-deep-research";
import { useChatStream } from "./use-chat-stream";

// ── Main component ────────────────────────────────────────────────────────────

export function ChatView() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { success: toastOk } = useToast();
  const t = useTranslations("chat");
  const tc = useTranslations("common");
  const setMobileHeaderRight = useUiStore((s) => s.setMobileHeaderRight);

  const [convSheetOpen, setConvSheetOpen] = useState(false);

  const avatarUrl = user?.avatar_url ?? null;
  const initials = (user?.name?.[0] ?? user?.username?.[0] ?? "U").toUpperCase();

  // ── Read pending query from sessionStorage (set by HomeQA) ──────────────
  // Done once via ref to survive React Strict Mode double-mount.
  const pendingChatPayload = useRef<Record<string, string> | null | undefined>(undefined);
  if (pendingChatPayload.current === undefined) {
    try {
      const raw = typeof window !== "undefined" ? sessionStorage.getItem("pending-chat-query") : null;
      if (raw) {
        pendingChatPayload.current = JSON.parse(raw);
        sessionStorage.removeItem("pending-chat-query");
      } else {
        pendingChatPayload.current = null;
      }
    } catch {
      pendingChatPayload.current = null;
    }
  }

  // ── Shared state (lifted for both hooks) ────────────────────────────────
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const streamAbortRef = useRef<AbortController | null>(null);
  const streamLifecycle = useStreamLifecycle();

  const [isDeepResearch, setIsDeepResearch] = useState(false);
  const [noteCreatedAlert, setNoteCreatedAlert] = useState<{ id: string; title: string; notebookId?: string } | null>(null);
  const [feedbackMap, setFeedbackMap] = useState<Record<string, FeedbackRating>>({});
  const [conversationOffset, setConversationOffset] = useState(0);
  const [messageOffset, setMessageOffset] = useState(0);
  const [hasMoreConversations, setHasMoreConversations] = useState(true);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [conversationList, setConversationList] = useState<ConversationRecord[]>([]);
  const restoredActiveConvId = useRef<string | null>(null);
  const { copied, copy } = useCopyToClipboard();

  const bottomRef = useRef<HTMLDivElement>(null);

  // ── 注入移动端 header 右侧按钮 ──────────────────────────────────────────
  useEffect(() => {
    const activeConv = conversationList.find((c) => c.id === activeConvId);
    setMobileHeaderRight(
      <button
        type="button"
        onClick={() => setConvSheetOpen(true)}
        className="flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
      >
        <MessageSquare size={16} />
        <span className="max-w-[120px] truncate text-xs">
          {activeConv?.title ?? t("newChat")}
        </span>
        <ChevronDown size={12} />
      </button>
    );
    return () => setMobileHeaderRight(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConvId, conversationList]);
  const chatInputRef = useRef<ChatInputHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileAttachments = useFileAttachments();

  // ── Global notebook ─────────────────────────────────────────────────────
  const { data: globalNotebook } = useQuery({
    queryKey: ["global-notebook"],
    queryFn: getGlobalNotebook,
  });
  const globalNotebookId = globalNotebook?.id;

  // ── Dynamic suggestions ─────────────────────────────────────────────────
  const { data: dynamicSuggestions, isLoading: suggestionsLoading } = useQuery({
    queryKey: ["chat-suggestions"],
    queryFn: getSuggestions,
    staleTime: 1000 * 60 * 30,
    retry: false,
  });

  // ── Deep Research hook ──────────────────────────────────────────────────
  const dr = useDeepResearch({
    globalNotebookId,
    streaming,
    streamLifecycle,
    streamAbortRef,
    setMessages,
    setInput,
    setStreaming,
    setActiveConvId,
  });

  // ── Chat Stream hook ────────────────────────────────────────────────────
  const chat = useChatStream({
    globalNotebookId,
    activeConvId,
    input,
    streaming,
    isDeepResearch,
    streamLifecycle,
    streamAbortRef,
    handleDeepResearch: dr.handleDeepResearch,
    setMessages,
    setInput,
    setStreaming,
    setActiveConvId,
    setDrProgress: dr.setDrProgress,
    setNoteCreatedAlert,
  });

  // NOTE: We intentionally do NOT abort on unmount.
  // React Strict Mode double-mounts would cancel in-flight auto-trigger
  // requests. Abort is handled by handleCancelStreaming (user cancel)
  // and the guard at the start of handleSend (new send replaces old).

  // ── Conversation list ───────────────────────────────────────────────────
  const { data: conversations } = useQuery({
    queryKey: ["conversations", globalNotebookId, conversationOffset],
    queryFn: () => getConversations(globalNotebookId!, {
      offset: conversationOffset,
      limit: CONVERSATIONS_PAGE_SIZE,
    }),
    enabled: !!globalNotebookId,
  });

  useEffect(() => {
    if (!globalNotebookId) return;
    setConversationOffset(0);
    setConversationList([]);
    setHasMoreConversations(true);
  }, [globalNotebookId]);

  useEffect(() => {
    if (!globalNotebookId || !conversations) return;
    if (conversationOffset === 0) {
      setConversationList((prev) => (sameConversationIds(prev, conversations) ? prev : conversations));
    } else {
      setConversationList((prev) => {
        const ids = new Set(prev.map((item) => item.id));
        const merged = [...prev];
        conversations.forEach((item) => {
          if (!ids.has(item.id)) merged.push(item);
        });
        return sameConversationIds(prev, merged) ? prev : merged;
      });
    }
    setHasMoreConversations(conversations.length >= CONVERSATIONS_PAGE_SIZE);
  }, [conversations, conversationOffset, globalNotebookId]);

  const loadMoreConversations = useCallback(() => {
    if (!hasMoreConversations) return;
    setConversationOffset((prev) => prev + CONVERSATIONS_PAGE_SIZE);
  }, [hasMoreConversations]);

  // ── Delete conversation ─────────────────────────────────────────────────
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteConversation(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["conversations", globalNotebookId] });
      clearConversationMessages(id);
      setConversationList((prev) => prev.filter((item) => item.id !== id));
      if (activeConvId === id) {
        setActiveConvId(null);
        setMessages([]);
        saveActiveConversation(null);
      }
      toastOk(t("conversationDeleted"));
    },
  });

  // ── Load feedback ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeConvId) {
      setFeedbackMap({});
      return;
    }
    let cancelled = false;
    getConversationFeedback(activeConvId)
      .then((rows) => {
        if (cancelled) return;
        const next: Record<string, FeedbackRating> = {};
        rows.forEach((r) => { next[r.message_id] = r.rating; });
        setFeedbackMap(next);
      })
      .catch(() => { if (!cancelled) setFeedbackMap({}); });
    return () => { cancelled = true; };
  }, [activeConvId]);

  // ── Select conversation ─────────────────────────────────────────────────
  const handleSelectConv = useCallback(async (conv: ConversationRecord) => {
    if (activeConvId === conv.id) return;
    try {
      setActiveConvId(conv.id);
      saveActiveConversation(conv.id);
      setStreaming(false);
      streamLifecycle.finish();
      chat.setAgentSteps([]);
      dr.setDrProgress(null);
      dr.drPersistedRef.current = false;
      setMessageOffset(0);
      try { localStorage.removeItem(DR_MESSAGES_KEY); } catch { /* ignore */ }
      const msgs = await getMessages(conv.id, { offset: 0, limit: MESSAGES_PAGE_SIZE });
      setHasMoreMessages(msgs.length >= MESSAGES_PAGE_SIZE);

      let drTimeline: Omit<import("./deep-research-progress").DrProgress, "status" | "reportTokens"> | null = null;
      try {
        const saved = localStorage.getItem(`lyranote-dr-timeline-${conv.id}`);
        if (saved) drTimeline = JSON.parse(saved);
      } catch { /* ignore */ }

      let drTimelineApplied = false;
      const mappedFromServer = msgs.map((m) => {
        const base = mapRecord(m);
        if (m.role === "assistant" && drTimeline && !drTimelineApplied) {
          drTimelineApplied = true;
          base.deepResearch = { ...drTimeline, status: "done", reportTokens: m.content };
        }
        return base;
      });
      const cached = loadConversationMessages(conv.id).map((m) => ({
        ...m,
        timestamp: new Date(m.timestamp),
      })).filter(isLocalAssistantDraft) as LocalMessage[];
      const merged = [...mappedFromServer];
      const seen = new Set(mappedFromServer.map((item) => item.id));
      if (cached.length > 0) {
        const maxServerMs = merged.reduce((max, m) => Math.max(max, m.timestamp.getTime()), 0);
        cached.forEach((item, i) => {
          if (!seen.has(item.id)) merged.push({ ...item, timestamp: new Date(maxServerMs + (i + 1) * 100) });
        });
      }
      setMessages(sortMessagesByTime(merged));
      if (cached.length === 0) clearConversationMessages(conv.id);
    } catch (error) {
      notifyError(getErrorMessage(error, t("loadConvFailed")));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConvId, streamLifecycle, chat, dr]);

  const loadMoreMessages = useCallback(async () => {
    if (!activeConvId || !hasMoreMessages || streaming) return;
    try {
      const nextOffset = messageOffset + MESSAGES_PAGE_SIZE;
      const batch = await getMessages(activeConvId, { offset: nextOffset, limit: MESSAGES_PAGE_SIZE });
      setMessageOffset(nextOffset);
      setHasMoreMessages(batch.length >= MESSAGES_PAGE_SIZE);
      if (batch.length > 0) {
        const mapped = batch.map(mapRecord);
        setMessages((prev) => sortMessagesByTime([...mapped, ...prev]));
      }
    } catch (error) {
      notifyError(getErrorMessage(error, t("loadMoreFailed")));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConvId, hasMoreMessages, messageOffset, streaming]);

  // ── DR message persistence (localStorage) ───────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DR_MESSAGES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Array<LocalMessage & { timestamp: string }>;
        if (parsed.length > 0)
          setMessages(parsed.map((m) => ({ ...m, timestamp: new Date(m.timestamp) })));
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (activeConvId) return;
    if (dr.drPersistedRef.current) return;
    if (messages.length === 0) return;
    try {
      localStorage.setItem(DR_MESSAGES_KEY, JSON.stringify(messages));
    } catch { /* ignore quota */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, activeConvId]);

  // Normal chat draft persistence
  useEffect(() => {
    if (!activeConvId || isDeepResearch) return;
    if (!streaming) {
      clearConversationMessages(activeConvId);
      return;
    }
    const drafts = messages
      .filter(isLocalAssistantDraft)
      .map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        timestamp: message.timestamp.toISOString(),
      }));
    if (drafts.length === 0) {
      clearConversationMessages(activeConvId);
      return;
    }
    saveConversationMessages(activeConvId, drafts);
  }, [activeConvId, isDeepResearch, messages, streaming]);

  // Restore active conversation on refresh (skip if arriving from HomeQA)
  useEffect(() => {
    if (pendingChatPayload.current) {
      restoredActiveConvId.current = null;
    } else {
      restoredActiveConvId.current = loadActiveConversation();
    }
  }, []);

  useEffect(() => {
    if (!globalNotebookId || conversationList.length === 0 || activeConvId) return;
    const targetId = restoredActiveConvId.current;
    if (targetId) {
      const matched = conversationList.find((item) => item.id === targetId);
      if (!matched) return;
      restoredActiveConvId.current = null;
      handleSelectConv(matched);
    }
  }, [activeConvId, conversationList, globalNotebookId, handleSelectConv]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streaming]);

  // ── Feedback ────────────────────────────────────────────────────────────
  const handleFeedback = useCallback(async (messageId: string, rating: FeedbackRating) => {
    if (!isServerMessageId(messageId)) return;
    if (feedbackMap[messageId] === rating) return;
    const previous = feedbackMap[messageId];
    setFeedbackMap((prev) => ({ ...prev, [messageId]: rating }));
    try {
      await submitMessageFeedback(messageId, rating);
    } catch {
      setFeedbackMap((prev) => {
        const next = { ...prev };
        if (previous) next[messageId] = previous;
        else delete next[messageId];
        return next;
      });
    }
  }, [feedbackMap]);

  // ── New chat ────────────────────────────────────────────────────────────
  const handleNewChat = () => {
    setActiveConvId(null);
    saveActiveConversation(null);
    setMessages([]);
    setInput("");
    dr.setDrProgress(null);
    setHasMoreMessages(false);
    setMessageOffset(0);
    streamLifecycle.finish();
    dr.drPersistedRef.current = false;
    try { localStorage.removeItem(DR_MESSAGES_KEY); } catch { /* ignore */ }
    chatInputRef.current?.focus();
  };

  // ── Auto-trigger from HomeQA (pending query was read from sessionStorage above) ──
  const autoTriggered = useRef(false);

  useEffect(() => {
    const payload = pendingChatPayload.current;
    if (!payload?.q || autoTriggered.current || !globalNotebookId) return;
    autoTriggered.current = true;
    pendingChatPayload.current = null;

    const q = payload.q;
    const toolParam = payload.tool;
    const attachmentsParam = payload.attachments;
    const notebookParam = payload.notebook;

    // Force a clean new conversation
    setActiveConvId(null);
    saveActiveConversation(null);
    setMessages([]);
    setHasMoreMessages(false);
    setMessageOffset(0);
    dr.setDrProgress(null);
    streamLifecycle.finish();
    try { localStorage.removeItem(DR_MESSAGES_KEY); } catch { /* ignore */ }

    if (toolParam) chat.toolHintRef.current = toolParam;
    if (attachmentsParam) {
      const ids = attachmentsParam.split(",").filter(Boolean);
      chat.attachmentIdsRef.current = ids;
      try {
        const raw = sessionStorage.getItem("pending-attachments");
        if (raw) {
          const meta = JSON.parse(raw) as Array<{ id: string; name: string; type: string }>;
          chat.attachmentPreviewsRef.current = meta.map((m) => ({
            name: m.name,
            type: m.type,
            previewUrl: m.type.startsWith("image/") ? http.url(`/uploads/temp/${m.id}`) : null,
          }));
          chat.attachmentMetaRef.current = meta.map((m) => ({
            name: m.name,
            type: m.type,
            file_id: m.id,
          }));
          sessionStorage.removeItem("pending-attachments");
        }
      } catch { /* ignore */ }
    }
    const finalQuery = notebookParam
      ? `[请在笔记本 ${notebookParam} 中搜索] ${q}`
      : q;

    setInput(finalQuery);
    chat.handleSend(finalQuery);
  }, [globalNotebookId, chat, dr, streamLifecycle, setInput, setActiveConvId, setMessages, setHasMoreMessages, setMessageOffset]);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full">
      <ChatSidebarPanel
        conversationList={conversationList}
        activeConvId={activeConvId}
        globalNotebookId={globalNotebookId}
        hasMoreConversations={hasMoreConversations}
        deletePending={deleteMut.isPending}
        onSelectConv={handleSelectConv}
        onNewChat={handleNewChat}
        onDeleteConv={(id) => deleteMut.mutate(id)}
        onLoadMore={loadMoreConversations}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* 移动端顶部会话选择栏已移至 header 右侧按钮 + 底部 Sheet */}
        <ChatAlerts
          noteCreatedAlert={noteCreatedAlert}
          onDismissNoteAlert={() => setNoteCreatedAlert(null)}
          streamState={streamLifecycle.state}
          lastError={streamLifecycle.lastError}
          onResetError={streamLifecycle.resetError}
        />

        {messages.length > 0 || pendingChatPayload.current ? (
          <ChatMessageList>
            {hasMoreMessages && activeConvId && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={loadMoreMessages}
                  className="rounded-lg border border-border/40 px-3 py-1.5 text-xs text-muted-foreground/70 transition-colors hover:bg-accent/50 hover:text-foreground"
                >
                  {tc("loadMore")}
                </button>
              </div>
            )}
            <AnimatePresence initial={false}>
              {messages.map((msg, idx) => (
                <ChatMessageBubble
                  key={msg.id}
                  msg={msg}
                  isLastAssistant={msg.role === "assistant" && idx === messages.length - 1}
                  streaming={streaming}
                  liveAgentSteps={chat.agentSteps}
                  feedbackRating={feedbackMap[msg.id]}
                  copied={copied}
                  avatarUrl={avatarUrl}
                  initials={initials}
                  onCopy={copy}
                  onFeedback={handleFeedback}
                  onRegenerate={() => chat.handleRegenerate(messages)}
                  onFollowUp={(q) => chat.handleSend(q)}
                />
              ))}
            </AnimatePresence>

            <AnimatePresence>
              {dr.drProgress && (
                <m.div
                  key="dr-progress-live"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="px-4 pb-4"
                >
                  <DeepResearchProgress
                    progress={dr.drProgress}
                    onSaveNote={dr.handleSaveAsNote}
                    onFollowUp={(q) => chat.handleSend(q)}
                    onRate={dr.handleDrRate}
                    onCopy={copy}
                    savedMessageId={dr.deliverableMessageIdRef.current}
                  />
                </m.div>
              )}
            </AnimatePresence>

            <div ref={bottomRef} />
          </ChatMessageList>
        ) : (
          <ChatEmptyState
            suggestionsLoading={suggestionsLoading}
            dynamicSuggestions={dynamicSuggestions}
            onSend={chat.handleSend}
          />
        )}

        {/* Input */}
        <ChatInputContainer>
          <ChatInput
            ref={chatInputRef}
            value={input}
            onChange={setInput}
            onSubmit={() => {
              if (fileAttachments.isUploading) return;
              const ids = fileAttachments.getServerIds();
              if (ids.length > 0) chat.attachmentIdsRef.current = ids;
              const hasAttachments = fileAttachments.attachments.length > 0;
              if (hasAttachments) {
                chat.attachmentPreviewsRef.current = fileAttachments.attachments.map((a) => ({
                  name: a.file.name,
                  type: a.file.type,
                  previewUrl: a.previewUrl,
                }));
                chat.attachmentMetaRef.current = fileAttachments.attachments
                  .filter((a) => a.serverId)
                  .map((a) => ({ name: a.file.name, type: a.file.type, file_id: a.serverId! }));
              }
              chat.handleSend();
              fileAttachments.clearAll(hasAttachments);
            }}
            placeholder={isDeepResearch ? t("deepResearchPlaceholder") : t("placeholder")}
            disabled={!globalNotebookId || fileAttachments.isUploading}
            streaming={streaming}
            onCancel={chat.handleCancelStreaming}
            variant="default"
            shadow
            maxHeight={140}
            accentBorder={isDeepResearch
              ? "border-amber-500/25 focus-within:border-amber-500/50 focus-within:shadow-[0_0_0_3px_rgba(245,158,11,0.08)]"
              : undefined
            }
            showHint
            hintText={t("sendHint")}
            sendTitle={t("send")}
            cancelTitle={t("cancelGenerate")}
            onFilePaste={(files) => fileAttachments.addFiles(files)}
            aboveInput={
              <AttachmentPreviewBar
                attachments={fileAttachments.attachments}
                onRemove={fileAttachments.removeAttachment}
              />
            }
            toolbarLeft={
              <>
                <button
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/60 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title={tc("addSource")}
                >
                  <Plus size={13} />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.webp"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      fileAttachments.addFiles(e.target.files);
                    }
                    e.target.value = "";
                  }}
                />
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border/40 bg-muted/30 text-[11px] text-muted-foreground/50 sm:w-auto sm:gap-1.5 sm:px-2.5 sm:py-1">
                  <Sparkles size={10} className="text-primary/60" />
                  <span className="hidden sm:inline">{t("globalKnowledge")}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIsDeepResearch((v) => !v)}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full border text-[11px] transition-all sm:w-auto sm:gap-1.5 sm:px-2.5 sm:py-1",
                    isDeepResearch
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-300/90"
                      : "border-border/40 bg-muted/30 text-muted-foreground/50 hover:border-border/60 hover:text-muted-foreground/70"
                  )}
                  title={isDeepResearch ? t("switchToNormal") : t("switchToDeepResearch")}
                >
                  <FlaskConical size={10} className={isDeepResearch ? "text-amber-400" : ""} />
                  <span className="hidden sm:inline">{t("deepResearchLabel")}</span>
                  {isDeepResearch && <Zap size={8} className="hidden text-amber-400 sm:block" />}
                </button>
              </>
            }
            toolbarRight={
              input.length > 0 ? (
                <span className={cn(
                  "text-[11px] tabular-nums transition-colors",
                  input.length > 800 ? "text-amber-400/70" : "text-muted-foreground/30"
                )}>
                  {input.length}
                </span>
              ) : undefined
            }
          />
        </ChatInputContainer>
      </div>

      {/* 移动端：底部会话列表 Sheet */}
      <AnimatePresence>
        {convSheetOpen && (
          <>
            {/* 蒙层 */}
            <m.div
              key="conv-sheet-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/50 md:hidden"
              onClick={() => setConvSheetOpen(false)}
            />
            {/* Sheet 面板 */}
            <m.div
              key="conv-sheet"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              className="fixed bottom-0 left-0 right-0 z-50 flex max-h-[70vh] flex-col rounded-t-2xl bg-card md:hidden"
            >
              {/* 拖动指示条 */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="h-1 w-10 rounded-full bg-border/60" />
              </div>
              {/* 标题栏 */}
              <div className="flex items-center justify-between px-4 py-2">
                <span className="text-sm font-medium text-foreground">{t("title")}</span>
                <button
                  type="button"
                  onClick={() => { handleNewChat(); setConvSheetOpen(false); }}
                  className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs text-primary transition-colors hover:bg-primary/20"
                >
                  <Plus size={13} />
                  {t("newChat")}
                </button>
              </div>
              {/* 会话列表 */}
              <div className="flex-1 overflow-y-auto px-2 pb-6">
                {conversationList.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground/50">{t("noConversations")}</p>
                ) : (
                  conversationList.map((conv) => (
                    <button
                      key={conv.id}
                      type="button"
                      onClick={() => { handleSelectConv(conv); setConvSheetOpen(false); }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                        conv.id === activeConvId
                          ? "bg-primary/10 text-primary"
                          : "text-foreground/70 hover:bg-accent/50"
                      )}
                    >
                      <MessageSquare size={15} className="flex-shrink-0" />
                      <span className="flex-1 truncate text-sm">{conv.title ?? t("newChat")}</span>
                    </button>
                  ))
                )}
                {hasMoreConversations && (
                  <button
                    type="button"
                    onClick={loadMoreConversations}
                    className="mt-1 w-full rounded-xl py-2 text-xs text-muted-foreground/50 transition-colors hover:text-muted-foreground"
                  >
                    {tc("loadMore")}
                  </button>
                )}
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
