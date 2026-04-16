"use client";

/**
 * @file 对话页业务逻辑 Hook
 * @description 封装 ChatView 所有状态、数据查询、副作用与回调，
 *              使 ChatView 只负责布局渲染。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";

import { useAuth } from "@/features/auth/auth-provider";
import { useToast } from "@/hooks/use-toast";
import { useFileAttachments } from "@/hooks/use-file-attachments";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useStreamLifecycle } from "@/hooks/use-stream-lifecycle";
import { useDeepResearch, DR_MESSAGES_KEY } from "@/hooks/use-deep-research";
import { useChatStream } from "@/hooks/use-chat-stream";
import { useUiStore } from "@/store/use-ui-store";
import { useDeepResearchStore } from "@/store/use-deep-research-store";
import { http } from "@/lib/http-client";
import { CHAT_TOOL_DEFS } from "@/lib/chat-tools";
import { LLM_MODELS } from "@/lib/constants";
import { getErrorMessage } from "@/lib/request-error";
import { notifyError } from "@/lib/notify";
import { getSuggestions } from "@/services/ai-service";
import { getConfig } from "@/services/config-service";
import { getConversationFeedback, submitMessageFeedback, type FeedbackRating } from "@/services/feedback-service";
import {
  deleteConversation,
  getGlobalConversations,
  getMessages,
  type ConversationRecord,
} from "@/services/conversation-service";
import { getNotebooks } from "@/services/notebook-service";
import {
  clearAllConversationMessages,
  clearConversationMessages,
  loadActiveConversation,
  loadConversationMessages,
  saveActiveConversation,
  saveConversationMessages,
} from "@/features/chat/chat-persistence";
import type { ArtifactPayload } from "@/components/genui";
import type { Notebook } from "@/types";
import type { LocalMessage } from "./chat-types";
import { CONVERSATIONS_PAGE_SIZE, MESSAGES_PAGE_SIZE } from "./chat-types";
import {
  findLatestStreamingAssistantMessage,
  isLocalDraftMessage,
  isServerMessageId,
  mapRecord,
  mergeServerAndLocalMessages,
  sameConversationIds,
  sortMessagesByTime,
} from "./chat-helpers";
import type { ChatInputHandle } from "@/components/chat-input";

export function useChatPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { success: toastOk } = useToast();
  const t = useTranslations("chat");
  const tc = useTranslations("common");
  const th = useTranslations("home");
  const tn = useTranslations("notebooks");
  const setMobileHeaderRight = useUiStore((s) => s.setMobileHeaderRight);

  const avatarUrl = user?.avatar_url ?? null;
  const initials = (user?.name?.[0] ?? user?.username?.[0] ?? "U").toUpperCase();

  // ── Read pending query from sessionStorage (set by HomeQA) ──────────────
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

  // ── Shared state ─────────────────────────────────────────────────────────
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const streamAbortRef = useRef<AbortController | null>(null);
  const streamLifecycle = useStreamLifecycle();

  const [isDeepResearch, setIsDeepResearch] = useState(false);
  const [drMode, setDrMode] = useState<"quick" | "deep">("quick");
  const [thinkingEnabled, setThinkingEnabled] = useState(true);

  const { data: appConfig } = useQuery({ queryKey: ["app-config"], queryFn: getConfig, staleTime: 60_000 });
  const currentModelId = appConfig?.llm_model ?? "";
  const isThinkingModel = LLM_MODELS.find((m) => m.value === currentModelId)?.thinking ?? false;

  const [feedbackMap, setFeedbackMap] = useState<Record<string, FeedbackRating>>({});
  const [conversationOffset, setConversationOffset] = useState(0);
  const [messageOffset, setMessageOffset] = useState(0);
  const [hasMoreConversations, setHasMoreConversations] = useState(true);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [conversationList, setConversationList] = useState<ConversationRecord[]>([]);
  const restoredActiveConvId = useRef<string | null>(null);
  const { copied, copy } = useCopyToClipboard();

  // UI state
  const [convSheetOpen, setConvSheetOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
  const [selectedNotebook, setSelectedNotebook] = useState<Notebook | null>(null);
  const [artifactState, setArtifactState] = useState<ArtifactPayload | null>(null);

  // Refs for DOM / input
  const chatInputRef = useRef<ChatInputHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const fileAttachments = useFileAttachments();

  // ── Mobile header injection ──────────────────────────────────────────────
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
      </button>,
    );
    return () => setMobileHeaderRight(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConvId, conversationList]);

  // ── Data queries ─────────────────────────────────────────────────────────
  const { data: notebooks = [] } = useQuery({
    queryKey: ["notebooks"],
    queryFn: getNotebooks,
    enabled: menuOpen,
    staleTime: 1000 * 60 * 5,
  });

  const toolItems = CHAT_TOOL_DEFS.map((tool) => ({
    id: tool.hint,
    label: th(tool.key),
    icon: tool.icon,
  }));

  const { data: dynamicSuggestions, isLoading: suggestionsLoading } = useQuery({
    queryKey: ["chat-suggestions"],
    queryFn: async () => {
      const result = await getSuggestions();
      return result;
    },
    staleTime: 1000 * 60 * 30,  // 30 min — matches backend cache TTL
    retry: 2,
    retryDelay: 2000,
  });

  // ── Deep Research hook ───────────────────────────────────────────────────
  const dr = useDeepResearch({
    activeConvId,
    drMode,
    streaming,
    streamLifecycle,
    streamAbortRef,
    setMessages,
    setInput,
    setStreaming,
    setActiveConvId,
  });

  // ── Chat Stream hook ─────────────────────────────────────────────────────
  const chat = useChatStream({
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
    isThinkingModel,
    thinkingEnabled,
  });

  // ── Conversation list ────────────────────────────────────────────────────
  const { data: conversations } = useQuery({
    queryKey: ["conversations", conversationOffset],
    queryFn: () => getGlobalConversations({
      offset: conversationOffset,
      limit: CONVERSATIONS_PAGE_SIZE,
    }),
  });

  useEffect(() => {
    setConversationOffset(0);
    setConversationList([]);
    setHasMoreConversations(true);
  }, []);

  useEffect(() => {
    if (!conversations) return;
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
  }, [conversations, conversationOffset]);

  const loadMoreConversations = useCallback(() => {
    if (!hasMoreConversations) return;
    setConversationOffset((prev) => prev + CONVERSATIONS_PAGE_SIZE);
  }, [hasMoreConversations]);

  // ── Delete conversation ──────────────────────────────────────────────────
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteConversation(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      clearConversationMessages(id);
      setConversationList((prev) => {
        const next = prev.filter((item) => item.id !== id);
        if (next.length === 0) {
          clearAllConversationMessages();
          setActiveConvId(null);
          setMessages([]);
          saveActiveConversation(null);
          try { localStorage.removeItem(DR_MESSAGES_KEY); } catch { /* ignore */ }
        }
        return next;
      });
      if (activeConvId === id) {
        setActiveConvId(null);
        setMessages([]);
        saveActiveConversation(null);
      }
      toastOk(t("conversationDeleted"));
    },
  });

  const handleDeleteConv = useCallback((id: string) => {
    deleteMut.mutate(id);
  }, [deleteMut]);

  // ── Load feedback ────────────────────────────────────────────────────────
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

  // ── Select conversation ──────────────────────────────────────────────────
  const handleSelectConv = useCallback(async (conv: ConversationRecord) => {
    if (activeConvId === conv.id) return;
    try {
      setActiveConvId(conv.id);
      saveActiveConversation(conv.id);
      setStreaming(false);
      streamLifecycle.finish();
      chat.resetAgentState();
      dr.setDrProgress(null);
      dr.drPersistedRef.current = false;
      setMessageOffset(0);
      try { localStorage.removeItem(DR_MESSAGES_KEY); } catch { /* ignore */ }
      const msgs = await getMessages(conv.id, { offset: 0, limit: MESSAGES_PAGE_SIZE });
      setHasMoreMessages(msgs.length >= MESSAGES_PAGE_SIZE);

      let drTimeline: Omit<import("@/components/deep-research/deep-research-progress").DrProgress, "status" | "reportTokens"> | null = null;
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
      })).filter(isLocalDraftMessage) as LocalMessage[];
      const { messages: merged, unresolvedDrafts } = mergeServerAndLocalMessages(mappedFromServer, cached);
      setMessages(merged);
      const streamingAssistant = findLatestStreamingAssistantMessage(mappedFromServer);
      if (streamingAssistant?.generationId) {
        void chat.recoverGeneration(conv.id, streamingAssistant.id, streamingAssistant.generationId);
      }
      if (unresolvedDrafts.length === 0) clearConversationMessages(conv.id);
      else {
        saveConversationMessages(conv.id, unresolvedDrafts.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          timestamp: message.timestamp.toISOString(),
        })));
      }
    } catch (error) {
      notifyError(getErrorMessage(error, t("loadConvFailed")));
      setActiveConvId(null);
      saveActiveConversation(null);
      setMessages([]);
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

  // ── DR message persistence ───────────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DR_MESSAGES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Array<LocalMessage & { timestamp: string }>;
        if (!Array.isArray(parsed) || parsed.length === 0) {
          localStorage.removeItem(DR_MESSAGES_KEY);
          return;
        }
        setMessages(parsed.map((m) => ({ ...m, timestamp: new Date(m.timestamp) })));
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (activeConvId) return;
    if (dr.drPersistedRef.current) return;
    if (messages.length === 0) {
      try { localStorage.removeItem(DR_MESSAGES_KEY); } catch { /* ignore */ }
      return;
    }
    const hasDeepResearchMessages = messages.some((m) => Boolean(m.deepResearch));
    if (!isDeepResearch && !hasDeepResearchMessages) {
      try { localStorage.removeItem(DR_MESSAGES_KEY); } catch { /* ignore */ }
      return;
    }
    try {
      localStorage.setItem(DR_MESSAGES_KEY, JSON.stringify(messages));
    } catch { /* ignore quota */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, activeConvId, isDeepResearch]);

  useEffect(() => {
    if (!activeConvId) return;
    if (!streaming) {
      clearConversationMessages(activeConvId);
      return;
    }
    const drafts = messages
      .filter(isLocalDraftMessage)
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
  }, [activeConvId, messages, streaming]);

  // ── Restore active conversation on refresh ───────────────────────────────
  useEffect(() => {
    if (pendingChatPayload.current) {
      restoredActiveConvId.current = null;
    } else {
      restoredActiveConvId.current = loadActiveConversation();
    }
  }, []);

  useEffect(() => {
    if (activeConvId) return;
    const targetId = restoredActiveConvId.current;
    if (!targetId) return;
    restoredActiveConvId.current = null;
    handleSelectConv({ id: targetId } as ConversationRecord);
  }, [activeConvId, handleSelectConv]);

  // ── Auto-scroll ──────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streaming]);

  // ── DR focus (floating indicator → chat page) ────────────────────────────
  const drFocusRequested = useDeepResearchStore((s) => s.focusRequested);
  const drConversationId = useDeepResearchStore((s) => s.conversationId);
  useEffect(() => {
    if (!drFocusRequested) return;
    useDeepResearchStore.setState({ focusRequested: false });

    const drState = useDeepResearchStore.getState();
    if (!drState.isActive && !drState.progress) return;

    setStreaming(false);
    streamLifecycle.finish();
    chat.resetAgentState();

    if (drState.conversationId) {
      setActiveConvId(drState.conversationId);
      saveActiveConversation(drState.conversationId);
      if (drState.query) {
        const userMsg: LocalMessage = {
          id: `local-dr-return-${Date.now()}`,
          role: "user",
          content: drState.query,
          timestamp: new Date(),
        };
        setMessages([userMsg]);
      }
    } else {
      setActiveConvId(null);
      setMessages([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drFocusRequested]);

  // ── Feedback ─────────────────────────────────────────────────────────────
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

  const stableRegenerate = useCallback(() => {
    chat.handleRegenerate(messagesRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.handleRegenerate]);

  const stableFollowUp = useCallback((q: string) => {
    chat.handleSend(q);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.handleSend]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(() => {
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
    if (selectedToolId) chat.toolHintRef.current = selectedToolId;
    const finalQuery = selectedNotebook
      ? `[请在笔记本 ${selectedNotebook.title} 中搜索] ${input}`
      : undefined;
    chat.handleSend(finalQuery);
    fileAttachments.clearAll(hasAttachments);
  }, [fileAttachments, chat, selectedToolId, selectedNotebook, input]);

  // ── New chat ──────────────────────────────────────────────────────────────
  const handleNewChat = useCallback(() => {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamLifecycle, dr]);

  // ── Auto-trigger from HomeQA ─────────────────────────────────────────────
  const autoTriggered = useRef(false);
  const pendingAutoSendRef = useRef<{
    query: string;
    deepResearch: boolean;
    drMode: "quick" | "deep";
  } | null>(null);

  useEffect(() => {
    const payload = pendingChatPayload.current;
    if (!payload?.q || autoTriggered.current) return;
    autoTriggered.current = true;
    pendingChatPayload.current = null;

    const { q, tool: toolParam, attachments: attachmentsParam, notebook: notebookParam,
      deep_research: deepResearchParam, dr_mode: drModeParam, thinking_enabled: thinkingParam } = payload;

    setActiveConvId(null);
    saveActiveConversation(null);
    setMessages([]);
    setHasMoreMessages(false);
    setMessageOffset(0);
    dr.setDrProgress(null);
    streamLifecycle.finish();
    try { localStorage.removeItem(DR_MESSAGES_KEY); } catch { /* ignore */ }

    if (toolParam) {
      chat.toolHintRef.current = toolParam;
      setSelectedToolId(toolParam);
    }
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

    const deepResearchEnabled = deepResearchParam === "1";
    const resolvedDrMode = drModeParam === "deep" ? "deep" : "quick";
    const resolvedThinking = thinkingParam ? thinkingParam === "1" : true;

    setIsDeepResearch(deepResearchEnabled);
    setDrMode(resolvedDrMode);
    if (thinkingParam !== undefined) setThinkingEnabled(resolvedThinking);

    const finalQuery = notebookParam
      ? `[请在笔记本 ${notebookParam} 中搜索] ${q}`
      : q;

    setInput(finalQuery);
    pendingAutoSendRef.current = {
      query: finalQuery,
      deepResearch: deepResearchEnabled,
      drMode: resolvedDrMode,
    };
  }, [
    chat, dr, streamLifecycle,
    setInput, setActiveConvId, setMessages, setHasMoreMessages, setMessageOffset,
    setIsDeepResearch, setDrMode, setThinkingEnabled, setSelectedToolId,
  ]);

  useEffect(() => {
    const pending = pendingAutoSendRef.current;
    if (!pending) return;
    if (pending.deepResearch !== isDeepResearch) return;
    if (pending.deepResearch && pending.drMode !== drMode) return;
    pendingAutoSendRef.current = null;
    if (pending.deepResearch) {
      dr.handleDeepResearch(pending.query);
    } else {
      chat.handleSend(pending.query);
    }
  }, [dr, chat, isDeepResearch, drMode]);

  return {
    // User
    avatarUrl,
    initials,
    // Core state
    messages,
    input,
    setInput,
    streaming,
    activeConvId,
    conversationList,
    feedbackMap,
    isDeepResearch,
    setIsDeepResearch,
    drMode,
    setDrMode,
    thinkingEnabled,
    setThinkingEnabled,
    isThinkingModel,
    hasMoreMessages,
    hasMoreConversations,
    // Queries / data
    toolItems,
    notebooks,
    dynamicSuggestions,
    suggestionsLoading,
    deletePending: deleteMut.isPending,
    // UI state
    convSheetOpen,
    setConvSheetOpen,
    menuOpen,
    setMenuOpen,
    artifactState,
    setArtifactState,
    selectedToolId,
    setSelectedToolId,
    selectedNotebook,
    setSelectedNotebook,
    // File attachments
    fileAttachments,
    // Refs
    chatInputRef,
    fileInputRef,
    bottomRef,
    pendingChatPayload,
    pendingAutoSendRef,
    // Stream + DR
    chat,
    dr,
    drConversationId,
    streamLifecycle,
    copied,
    copy,
    // Handlers
    handleSelectConv,
    handleNewChat,
    handleDeleteConv,
    handleSubmit,
    handleFeedback,
    stableRegenerate,
    stableFollowUp,
    loadMoreConversations,
    loadMoreMessages,
    // i18n helpers exposed for JSX in the view
    t,
    tc,
    th,
    tn,
  };
}
