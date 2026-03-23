import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { sendMessageStream, type AttachmentMeta } from "@/services/ai-service";
import { saveActiveConversation } from "@/features/chat/chat-persistence";
import type { useStreamLifecycle } from "@/hooks/use-stream-lifecycle";
import { getErrorMessage, isAbortError } from "@/lib/request-error";
import { notifyError, notifySuccess } from "@/lib/notify";
import { useAgentStreamEvents } from "@/hooks/use-agent-stream-events";
import type { DiagramData, MindMapData, MCPResultData } from "@/types";
import type { LocalMessage, MessageAttachment } from "@/features/chat/chat-types";
import type { DrProgress } from "@/components/deep-research/deep-research-progress";

interface UseChatStreamOpts {
  globalNotebookId: string | undefined;
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
}

export function useChatStream({
  globalNotebookId,
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
}: UseChatStreamOpts) {
  const queryClient = useQueryClient();
  const t = useTranslations("chat");
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
  const toolHintRef = useRef<string | null>(null);
  const attachmentIdsRef = useRef<string[]>([]);
  const attachmentPreviewsRef = useRef<MessageAttachment[]>([]);
  const attachmentMetaRef = useRef<AttachmentMeta[]>([]);
  const assistantIdRef = useRef("");

  // Token render queue — drains at TOKEN_INTERVAL_MS regardless of how fast
  // tokens arrive from the API (handles providers that batch-send all tokens at once).
  const TOKEN_INTERVAL_MS = 25
  const tokenQueueRef = useRef<string[]>([])
  const tokenTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Callback executed once the queue empties naturally (after stream ends).
  const onDrainCompleteRef = useRef<(() => void) | null>(null)

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
      const cb = onDrainCompleteRef.current
      if (cb) {
        onDrainCompleteRef.current = null
        clearInterval(tokenTimerRef.current!)
        tokenTimerRef.current = null
        cb()
      }
    }, TOKEN_INTERVAL_MS)
  }, [setMessages])

  /**
   * Schedule `callback` to run after the token queue is fully drained.
   * If the queue is already empty, the callback runs on the next tick.
   * Used for the citations / finalize path so typing completes before UI updates.
   */
  const scheduleAfterDrain = useCallback((callback: () => void) => {
    if (tokenQueueRef.current.length === 0) {
      if (tokenTimerRef.current) {
        clearInterval(tokenTimerRef.current)
        tokenTimerRef.current = null
      }
      callback()
      return
    }
    // Tokens still pending — let the interval drain them, then call back
    onDrainCompleteRef.current = callback
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

  const handleSend = useCallback(async (overrideText?: string, skipUserBubble?: boolean) => {
    const text = (overrideText ?? input).trim();
    if (!text || streaming || !globalNotebookId) return;

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
        (citations) => {
          // Wait for the token queue to drain naturally before finalizing,
          // so the typing effect plays out completely even with pseudo-streaming.
          scheduleAfterDrain(() => {
            const curId = assistantIdRef.current;
            const savedSteps = buildSavedSteps();
            setMessages((prev) =>
              prev.map((m) => m.id === curId
                ? { ...m, citations: citations?.length ? citations : m.citations, agentSteps: savedSteps.length ? savedSteps : undefined }
                : m)
            );
            streamLifecycle.finalize();
            setStreaming(false);
            queryClient.invalidateQueries({ queryKey: ["conversations", globalNotebookId] });
          });
        },
        undefined,
        globalNotebookId,
        (event) => {
          if (event.type === "done" && event.message_id) {
            const curId = assistantIdRef.current;
            assistantIdRef.current = event.message_id;
            setMessages((prev) =>
              prev.map((m) => m.id === curId ? { ...m, id: event.message_id! } : m)
            );
            return;
          }
          if (event.type === "speed" && event.ttft_ms !== undefined) {
            const curId = assistantIdRef.current;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === curId
                  ? { ...m, speed: { ttft_ms: event.ttft_ms!, tps: event.tps ?? 0, tokens: event.tokens ?? 0 } }
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
            queryClient.invalidateQueries({ queryKey: ["notes"] });
            notifySuccess(t("noteCreated", { title: event.note_title ?? t("aiDraft") }));
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
          }
          if (event.type === "diagram" && event.data) {
            const curId = assistantIdRef.current;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === curId ? { ...m, diagram: event.data as unknown as DiagramData } : m
              )
            );
          }
          if (event.type === "mcp_result" && event.data) {
            const curId = assistantIdRef.current;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === curId ? { ...m, mcpResult: event.data as unknown as MCPResultData } : m
              )
            );
          }
          if (event.type === "content_replace" && typeof event.content === "string") {
            const replacedContent = event.content;
            const curId = assistantIdRef.current;
            // Wait for pending tokens to drain before replacing, so the typing
            // animation completes before the JSON block disappears.
            scheduleAfterDrain(() => {
              tokenQueueRef.current = [];
              assistantContentRef.current = replacedContent;
              setMessages((prev) =>
                prev.map((m) => m.id === curId ? { ...m, content: replacedContent } : m)
              );
            });
          }
          // Common: human_approve_required + append to agentSteps
          handleAgentEvent(event);
        },
        activeConvId ?? undefined,
        true,
        abortController.signal,
        toolHintRef.current ?? undefined,
        attachmentIdsRef.current.length > 0 ? attachmentIdsRef.current : undefined,
        attachmentMetaRef.current.length > 0 ? attachmentMetaRef.current : undefined,
      );
      toolHintRef.current = null;
      attachmentIdsRef.current = [];
      attachmentPreviewsRef.current = [];
      attachmentMetaRef.current = [];
      if (!activeConvId) {
        setActiveConvId(usedConvId);
        saveActiveConversation(usedConvId);
      }
      streamLifecycle.finish();
    } catch (error) {
      stopTokenDrain();
      if (isAbortError(error)) return;
      const message = getErrorMessage(error, t("streamFailed"));
      streamLifecycle.fail(message);
      notifyError(message);
      setStreaming(false);
      setMessages((prev) =>
        prev.map((m) => m.id === assistantId ? { ...m, content: message } : m)
      );
    } finally {
      streamAbortRef.current = null;
    }
  }, [input, streaming, globalNotebookId, activeConvId, queryClient, isDeepResearch, handleDeepResearch, streamLifecycle, streamAbortRef, setMessages, setInput, setStreaming, setActiveConvId, setDrProgress, t, startTokenDrain, stopTokenDrain, scheduleAfterDrain, buildSavedSteps, handleAgentEvent, resetAgentState]);

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
  }, [streaming, streamLifecycle, streamAbortRef, setStreaming, stopTokenDrain]);

  return {
    agentSteps,
    pendingApproval,
    setPendingApproval,
    handleSend,
    handleRegenerate,
    handleCancelStreaming,
    resetAgentState,
    toolHintRef,
    attachmentIdsRef,
    attachmentPreviewsRef,
    attachmentMetaRef,
  };
}
