import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { sendMessageStream, type AgentEvent, type AttachmentMeta } from "@/services/ai-service";
import { saveActiveConversation } from "@/features/chat/chat-persistence";
import type { useStreamLifecycle } from "@/features/chat/use-stream-lifecycle";
import { getErrorMessage, isAbortError } from "@/lib/request-error";
import { notifyError } from "@/lib/notify";
import type { AgentStep } from "@/types";
import type { LocalMessage, MessageAttachment } from "./chat-types";
import type { DrProgress } from "./deep-research-progress";

interface UseChatStreamOpts {
  globalNotebookId: string | undefined;
  activeConvId: string | null;
  input: string;
  streaming: boolean;
  isDeepResearch: boolean;
  streamLifecycle: ReturnType<typeof useStreamLifecycle>;
  streamAbortRef: React.MutableRefObject<AbortController | null>;
  handleDeepResearch: (text: string) => Promise<void>;
  setMessages: Dispatch<SetStateAction<LocalMessage[]>>;
  setInput: Dispatch<SetStateAction<string>>;
  setStreaming: Dispatch<SetStateAction<boolean>>;
  setActiveConvId: Dispatch<SetStateAction<string | null>>;
  setDrProgress: Dispatch<SetStateAction<DrProgress | null>>;
  setNoteCreatedAlert: Dispatch<SetStateAction<{ id: string; title: string; notebookId?: string } | null>>;
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
  setNoteCreatedAlert,
}: UseChatStreamOpts) {
  const queryClient = useQueryClient();
  const t = useTranslations("chat");
  const [agentSteps, setAgentSteps] = useState<AgentEvent[]>([]);
  const agentStepsRef = useRef<AgentEvent[]>([]);
  const assistantContentRef = useRef("");

  const toolHintRef = useRef<string | null>(null);
  const attachmentIdsRef = useRef<string[]>([]);
  const attachmentPreviewsRef = useRef<MessageAttachment[]>([]);
  const attachmentMetaRef = useRef<AttachmentMeta[]>([]);
  const assistantIdRef = useRef("");

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
    setAgentSteps([]);
    agentStepsRef.current = [];
    assistantContentRef.current = "";

    try {
      const usedConvId = await sendMessageStream(
        text,
        (token) => {
          assistantContentRef.current += token;
          const curId = assistantIdRef.current;
          setMessages((prev) =>
            prev.map((m) => m.id === curId ? { ...m, content: m.content + token } : m)
          );
        },
        (citations) => {
          const curId = assistantIdRef.current;
          const savedSteps: AgentStep[] = agentStepsRef.current
            .filter((e) => e.type === "thought" || e.type === "tool_call" || e.type === "tool_result")
            .map((e) => ({ type: e.type as AgentStep["type"], content: e.content, tool: e.tool, input: e.input }));
          setMessages((prev) =>
            prev.map((m) => m.id === curId
              ? { ...m, citations: citations?.length ? citations : m.citations, agentSteps: savedSteps.length ? savedSteps : undefined }
              : m)
          );
          streamLifecycle.finalize();
          setStreaming(false);
          queryClient.invalidateQueries({ queryKey: ["conversations", globalNotebookId] });
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
          if (event.type === "note_created") {
            queryClient.invalidateQueries({ queryKey: ["note"] });
            queryClient.invalidateQueries({ queryKey: ["notes"] });
            setNoteCreatedAlert({
              id: event.note_id!,
              title: event.note_title ?? t("aiDraft"),
              notebookId: event.notebook_id ?? globalNotebookId,
            });
            return;
          }
          agentStepsRef.current = [...agentStepsRef.current, event];
          setAgentSteps((prev) => [...prev, event]);
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
  }, [input, streaming, globalNotebookId, activeConvId, queryClient, isDeepResearch, handleDeepResearch, streamLifecycle, streamAbortRef, setMessages, setInput, setStreaming, setActiveConvId, setDrProgress, setNoteCreatedAlert, t]);

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
    streamLifecycle.finish();
    setStreaming(false);
  }, [streaming, streamLifecycle, streamAbortRef, setStreaming]);

  return {
    agentSteps,
    handleSend,
    handleRegenerate,
    handleCancelStreaming,
    setAgentSteps,
    toolHintRef,
    attachmentIdsRef,
    attachmentPreviewsRef,
    attachmentMetaRef,
  };
}
