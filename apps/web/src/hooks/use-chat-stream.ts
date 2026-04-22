import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import {
  getMessageGenerationStatus,
  sendMessageStream,
  subscribeMessageGeneration,
  type AgentEvent,
  type AttachmentMeta,
  type MessageGenerationHandle,
} from "@/services/ai-service";
import { getMessages } from "@/services/conversation-service";
import { saveActiveConversation } from "@/features/chat/chat-persistence";
import type { useStreamLifecycle } from "@/hooks/use-stream-lifecycle";
import { getErrorMessage, isAbortError } from "@/lib/request-error";
import { notifyError, notifySuccess } from "@/lib/notify";
import { lyraQueryKeys } from "@/lib/query-keys";
import { useAgentStreamEvents } from "@/hooks/use-agent-stream-events";
import type { DiagramData, MindMapData, MCPResultData } from "@/types";
import type { LocalMessage, MessageAttachment } from "@/features/chat/chat-types";
import type { DrProgress } from "@/components/deep-research/deep-research-progress";
import { mapRecord, sortMessagesByTime } from "@/features/chat/chat-helpers";
import { MESSAGES_PAGE_SIZE } from "@/features/chat/chat-types";

interface UseChatStreamOpts {
  activeConvId: string | null;
  input: string;
  streaming: boolean;
  isDeepResearch: boolean;
  streamLifecycle: ReturnType<typeof useStreamLifecycle>;
  streamAbortRef: React.MutableRefObject<AbortController | null>;
  handleDeepResearch: (text?: string) => Promise<void>;
  setMessages: Dispatch<SetStateAction<LocalMessage[]>>;
  setInput: Dispatch<SetStateAction<string>>;
  setStreaming: Dispatch<SetStateAction<boolean>>;
  setActiveConvId: Dispatch<SetStateAction<string | null>>;
  setDrProgress: Dispatch<SetStateAction<DrProgress | null>>;
  isThinkingModel?: boolean;
  thinkingEnabled?: boolean;
}

export function useChatStream({
  activeConvId,
  input,
  streaming,
  isDeepResearch,
  streamLifecycle,
  streamAbortRef,
  handleDeepResearch,
  setMessages,
  setInput,
  setStreaming,
  setActiveConvId,
  setDrProgress,
  isThinkingModel,
  thinkingEnabled,
}: UseChatStreamOpts) {
  const queryClient = useQueryClient();
  const t = useTranslations("chat");
  const router = useRouter();
  const {
    agentSteps,
    pendingApproval,
    setPendingApproval,
    handleAgentEvent,
    buildSavedSteps,
    reset: resetAgentState,
  } = useAgentStreamEvents();
  const assistantContentRef = useRef("");
  const reasoningContentRef = useRef("");
  const pendingRefreshConvIdRef = useRef<string | null>(null);
  const toolHintRef = useRef<string | null>(null);
  const attachmentIdsRef = useRef<string[]>([]);
  const attachmentPreviewsRef = useRef<MessageAttachment[]>([]);
  const attachmentMetaRef = useRef<AttachmentMeta[]>([]);
  const assistantIdRef = useRef("");
  const activeGenerationIdRef = useRef<string | null>(null);
  const generationEventIndexRef = useRef(-1);

  // Token render queue — drains at TOKEN_INTERVAL_MS regardless of how fast
  // tokens arrive from the API (handles providers that batch-send all tokens at once).
  const TOKEN_INTERVAL_MS = 25
  const tokenQueueRef = useRef<string[]>([])
  const tokenTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Callback executed once the queue empties naturally (after stream ends).
  const onDrainCompleteRef = useRef<{ callback: () => void; keepTimerRunning: boolean } | null>(null)

  const startTokenDrain = useCallback(() => {
    if (tokenTimerRef.current) return
    tokenTimerRef.current = setInterval(() => {
      const token = tokenQueueRef.current.shift()
      if (token !== undefined) {
        assistantContentRef.current += token
        const curId = assistantIdRef.current
        setMessages((prev) =>
          prev.map((m) => m.id === curId ? { ...m, content: m.content + token } : m)
        )
        return
      }
      // Queue is empty — check for a pending drain-complete callback
      const pending = onDrainCompleteRef.current
      if (pending) {
        onDrainCompleteRef.current = null
        if (!pending.keepTimerRunning) {
          clearInterval(tokenTimerRef.current!)
          tokenTimerRef.current = null
        }
        pending.callback()
      }
    }, TOKEN_INTERVAL_MS)
  }, [setMessages])

  /**
   * Schedule `callback` to run after the token queue is fully drained.
   * If the queue is already empty, the callback runs on the next tick.
   * Used for the citations / finalize path so typing completes before UI updates.
   */
  const scheduleAfterDrain = useCallback((
    callback: () => void,
    { keepTimerRunning = false }: { keepTimerRunning?: boolean } = {},
  ) => {
    if (tokenQueueRef.current.length === 0) {
      if (tokenTimerRef.current && !keepTimerRunning) {
        clearInterval(tokenTimerRef.current)
        tokenTimerRef.current = null
      }
      callback()
      return
    }
    // Tokens still pending — let the interval drain them, then call back
    onDrainCompleteRef.current = { callback, keepTimerRunning }
  }, [])

  /**
   * Hard-stop the drain immediately (used for abort / error / cancel paths).
   * Flushes remaining tokens in one batch so content is never lost.
   */
  const stopTokenDrain = useCallback(() => {
    onDrainCompleteRef.current = null
    if (!tokenTimerRef.current) return
    clearInterval(tokenTimerRef.current)
    tokenTimerRef.current = null
    const remaining = tokenQueueRef.current.splice(0)
    if (remaining.length > 0) {
      const flush = remaining.join("")
      assistantContentRef.current += flush
      const curId = assistantIdRef.current
      setMessages((prev) =>
        prev.map((m) => m.id === curId ? { ...m, content: m.content + flush } : m)
      )
    }
  }, [setMessages])

  // Clean up timer on unmount
  useEffect(() => () => {
    if (tokenTimerRef.current) clearInterval(tokenTimerRef.current)
  }, [])

  const resetGenerationTracking = useCallback(() => {
    activeGenerationIdRef.current = null;
    generationEventIndexRef.current = -1;
  }, []);

  const applyGenerationReady = useCallback((generation: MessageGenerationHandle) => {
    const previousAssistantId = assistantIdRef.current;
    activeGenerationIdRef.current = generation.generation_id;
    generationEventIndexRef.current = -1;
    assistantIdRef.current = generation.assistant_message_id;
    setMessages((prev) => prev.map((message) => (
      message.id === previousAssistantId
        ? {
            ...message,
            id: generation.assistant_message_id,
            status: "streaming",
            generationId: generation.generation_id,
          }
        : message
    )));
  }, [setMessages]);

  const finalizeStream = useCallback((citations?: import("@/types").CitationData[]) => {
    scheduleAfterDrain(async () => {
      const curId = assistantIdRef.current;
      const savedSteps = buildSavedSteps();
      setMessages((prev) =>
        prev.map((m) => m.id === curId
          ? {
              ...m,
              status: "completed",
              citations: citations?.length ? citations : m.citations,
              agentSteps: savedSteps.length ? savedSteps : undefined,
            }
          : m)
      );
      streamLifecycle.finalize();
      setStreaming(false);
      streamLifecycle.finish();
      resetGenerationTracking();
      queryClient.invalidateQueries({ queryKey: lyraQueryKeys.conversations.all() });

      // Refresh from server AFTER streaming ends — prevents full content
      // appearing all at once by overwriting the drain queue mid-flight.
      const convId = pendingRefreshConvIdRef.current;
      pendingRefreshConvIdRef.current = null;
      if (convId) {
        try {
          const rows = await getMessages(convId, { offset: 0, limit: MESSAGES_PAGE_SIZE });
          setMessages(sortMessagesByTime(rows.map(mapRecord)));
        } catch {
          // best-effort normalization only
        }
      }
    });
  }, [buildSavedSteps, queryClient, resetGenerationTracking, scheduleAfterDrain, setMessages, setStreaming, streamLifecycle]);

  const applyAgentEvent = useCallback((event: AgentEvent) => {
    if (typeof event.event_index === "number") {
      generationEventIndexRef.current = Math.max(generationEventIndexRef.current, event.event_index);
    }

    if (event.type === "done" && event.message_id) {
      const curId = assistantIdRef.current;
      assistantIdRef.current = event.message_id;
      setMessages((prev) =>
        prev.map((m) => m.id === curId
          ? { ...m, id: event.message_id!, status: "completed" }
          : m)
      );
      return;
    }
    if (event.type === "speed" && event.ttft_ms !== undefined) {
      const curId = assistantIdRef.current;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === curId
            ? {
                ...m,
                speed: { ttft_ms: event.ttft_ms!, tps: event.tps ?? 0, tokens: event.tokens ?? 0 },
              }
            : m
        )
      );
      return;
    }
    if (event.type === "reasoning" && event.content) {
      reasoningContentRef.current += event.content;
      const curId = assistantIdRef.current;
      const snap = reasoningContentRef.current;
      setMessages((prev) =>
        prev.map((m) => m.id === curId ? { ...m, reasoning: snap } : m)
      );
      return;
    }
    if (event.type === "note_created") {
      queryClient.invalidateQueries({ queryKey: ["note"] });
      queryClient.invalidateQueries({ queryKey: lyraQueryKeys.notes.all() });
      queryClient.invalidateQueries({ queryKey: lyraQueryKeys.notebooks.all() });
      const noteTitle = event.note_title ?? t("aiDraft");
      notifySuccess(t("noteCreated", { title: noteTitle }));
      if (event.notebook_id) {
        const notebookId = event.notebook_id as string;
        setTimeout(() => router.push(`/app/notebooks/${notebookId}`), 1500);
      }
      return;
    }
    if (event.type === "ui_element" && event.element_type) {
      const curId = assistantIdRef.current;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === curId
            ? { ...m, uiElements: [...(m.uiElements ?? []), { element_type: event.element_type!, data: event.data ?? {} }] }
            : m
        )
      );
      return;
    }
    if (event.type === "mind_map" && event.data) {
      const curId = assistantIdRef.current;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === curId ? { ...m, mindMap: event.data as unknown as MindMapData } : m
        )
      );
      return;
    }
    if (event.type === "diagram" && event.data) {
      const curId = assistantIdRef.current;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === curId ? { ...m, diagram: event.data as unknown as DiagramData } : m
        )
      );
      return;
    }
    if (event.type === "mcp_result" && event.data) {
      const curId = assistantIdRef.current;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === curId ? { ...m, mcpResult: event.data as unknown as MCPResultData } : m
        )
      );
      return;
    }
    if (event.type === "content_replace" && typeof event.content === "string") {
      const replacedContent = event.content;
      const curId = assistantIdRef.current;
      scheduleAfterDrain(() => {
        tokenQueueRef.current = [];
        assistantContentRef.current = replacedContent;
        setMessages((prev) =>
          prev.map((m) => m.id === curId ? { ...m, content: replacedContent } : m)
        );
        startTokenDrain();
      }, { keepTimerRunning: true });
      return;
    }
    handleAgentEvent(event);
  }, [handleAgentEvent, queryClient, router, scheduleAfterDrain, setMessages, startTokenDrain, t]);

  const handleSend = useCallback(async (overrideText?: string, skipUserBubble?: boolean) => {
    const text = (overrideText ?? input).trim();
    if (!text || streaming) return;

    if (isDeepResearch) {
      await handleDeepResearch(text);
      return;
    }

    setInput("");
    setDrProgress(null);

    if (!skipUserBubble) {
      const userMsg: LocalMessage = {
        id: `local-${Date.now()}`,
        role: "user",
        content: text,
        timestamp: new Date(),
        ...(attachmentPreviewsRef.current.length > 0
          ? { attachments: [...attachmentPreviewsRef.current] }
          : {}),
      };
      setMessages((prev) => [...prev, userMsg]);
    }

    const assistantId = `local-asst-${Date.now()}`;
    assistantIdRef.current = assistantId;
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "", timestamp: new Date() }]);
    setStreaming(true);
    streamLifecycle.start();
    streamAbortRef.current?.abort();
    const abortController = new AbortController();
    streamAbortRef.current = abortController;
    resetAgentState();
    resetGenerationTracking();
    assistantContentRef.current = "";
    reasoningContentRef.current = "";
    tokenQueueRef.current = [];
    startTokenDrain();

    try {
      const usedConvId = await sendMessageStream(
        text,
        (token) => {
          tokenQueueRef.current.push(token)
        },
        finalizeStream,
        undefined,
        undefined,  // notebookId — global chat is notebook-free
        applyAgentEvent,
        activeConvId ?? undefined,
        true,
        abortController.signal,
        toolHintRef.current ?? undefined,
        attachmentIdsRef.current.length > 0 ? attachmentIdsRef.current : undefined,
        attachmentMetaRef.current.length > 0 ? attachmentMetaRef.current : undefined,
        isThinkingModel ? thinkingEnabled : undefined,
        undefined,
        (conversationId) => {
          if (!activeConvId) {
            setActiveConvId(conversationId);
            saveActiveConversation(conversationId);
          }
        },
        applyGenerationReady,
      );
      toolHintRef.current = null;
      attachmentIdsRef.current = [];
      attachmentPreviewsRef.current = [];
      attachmentMetaRef.current = [];
      if (!activeConvId) {
        setActiveConvId(usedConvId);
        saveActiveConversation(usedConvId);
      }
      // Register convId for post-drain server refresh (handled inside finalizeStream).
      pendingRefreshConvIdRef.current = usedConvId;
    } catch (error) {
      stopTokenDrain();
      if (isAbortError(error)) return;
      const message = getErrorMessage(error, t("streamFailed"));
      streamLifecycle.fail(message);
      notifyError(message);
      setStreaming(false);
      if (!activeGenerationIdRef.current) {
        setMessages((prev) =>
          prev.map((m) => m.id === assistantId ? { ...m, content: message, status: "error" } : m)
        );
      }
    } finally {
      streamAbortRef.current = null;
    }
  }, [input, streaming, activeConvId, isDeepResearch, handleDeepResearch, streamLifecycle, streamAbortRef, setMessages, setInput, setStreaming, setActiveConvId, setDrProgress, isThinkingModel, thinkingEnabled, t, startTokenDrain, stopTokenDrain, resetAgentState, resetGenerationTracking, finalizeStream, applyAgentEvent, applyGenerationReady]);

  const handleRegenerate = useCallback(async (messages: LocalMessage[]) => {
    if (streaming) return;
    const lastAsstIdx = messages.map((m, i) => (m.role === "assistant" ? i : -1)).filter((i) => i >= 0).at(-1);
    if (lastAsstIdx === undefined) return;
    const lastUserMsg = messages.slice(0, lastAsstIdx).reverse().find((m) => m.role === "user");
    if (!lastUserMsg) return;
    setMessages((prev) => prev.slice(0, lastAsstIdx));
    await handleSend(lastUserMsg.content, true);
  }, [streaming, handleSend, setMessages]);

  const handleCancelStreaming = useCallback(() => {
    if (!streaming) return;
    streamAbortRef.current?.abort();
    stopTokenDrain();
    streamLifecycle.finish();
    setStreaming(false);
    // If the assistant placeholder never received any tokens, remove it
    // so a spinning-but-empty avatar is not left on screen.
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant" && last.content === "") {
        return prev.slice(0, -1);
      }
      return prev;
    });
  }, [streaming, streamLifecycle, streamAbortRef, setStreaming, stopTokenDrain, setMessages]);

  const recoverGeneration = useCallback(async (
    conversationId: string,
    assistantMessageId: string,
    generationId: string,
  ) => {
    if (streaming && activeGenerationIdRef.current === generationId) return;

    streamAbortRef.current?.abort();
    const abortController = new AbortController();
    streamAbortRef.current = abortController;
    assistantIdRef.current = assistantMessageId;
    activeGenerationIdRef.current = generationId;
    assistantContentRef.current = "";
    reasoningContentRef.current = "";
    tokenQueueRef.current = [];
    startTokenDrain();

    try {
      const status = await getMessageGenerationStatus(generationId, abortController.signal);
      generationEventIndexRef.current = status.last_event_index;
      if (status.assistant_message) {
        assistantContentRef.current = status.assistant_message.content;
        reasoningContentRef.current = status.assistant_message.reasoning ?? "";
        setMessages((prev) => prev.map((message) => (
          message.id === assistantMessageId
            ? {
                ...message,
                id: status.assistant_message!.id,
                status: status.assistant_message!.status,
                generationId,
                content: status.assistant_message!.content,
                reasoning: status.assistant_message!.reasoning ?? undefined,
                citations: (status.assistant_message!.citations as LocalMessage["citations"]) ?? message.citations,
                agentSteps: (status.assistant_message!.agent_steps as LocalMessage["agentSteps"]) ?? message.agentSteps,
                speed: status.assistant_message!.speed ?? message.speed,
                uiElements: (status.assistant_message!.ui_elements as LocalMessage["uiElements"]) ?? message.uiElements,
                mindMap: (status.assistant_message!.mind_map as LocalMessage["mindMap"]) ?? message.mindMap,
                diagram: (status.assistant_message!.diagram as LocalMessage["diagram"]) ?? message.diagram,
                mcpResult: (status.assistant_message!.mcp_result as LocalMessage["mcpResult"]) ?? message.mcpResult,
              }
            : message
        )));
      }

      if (status.status !== "running") {
        const rows = await getMessages(conversationId, { offset: 0, limit: MESSAGES_PAGE_SIZE });
        setMessages(sortMessagesByTime(rows.map(mapRecord)));
        setStreaming(false);
        streamLifecycle.finish();
        resetGenerationTracking();
        return;
      }

      setStreaming(true);
      streamLifecycle.start();
      await subscribeMessageGeneration(
        generationId,
        (token) => {
          tokenQueueRef.current.push(token);
        },
        finalizeStream,
        applyAgentEvent,
        abortController.signal,
        status.last_event_index + 1,
      );

      const rows = await getMessages(conversationId, { offset: 0, limit: MESSAGES_PAGE_SIZE });
      setMessages(sortMessagesByTime(rows.map(mapRecord)));
      streamLifecycle.finish();
    } catch (error) {
      stopTokenDrain();
      if (isAbortError(error)) return;
      notifyError(getErrorMessage(error, t("streamFailed")));
      setStreaming(false);
    } finally {
      streamAbortRef.current = null;
    }
  }, [streaming, streamAbortRef, startTokenDrain, setMessages, setStreaming, streamLifecycle, resetGenerationTracking, finalizeStream, applyAgentEvent, stopTokenDrain, t]);

  return {
    agentSteps,
    pendingApproval,
    setPendingApproval,
    handleSend,
    handleRegenerate,
    handleCancelStreaming,
    recoverGeneration,
    resetAgentState,
    toolHintRef,
    attachmentIdsRef,
    attachmentPreviewsRef,
    attachmentMetaRef,
  };
}
