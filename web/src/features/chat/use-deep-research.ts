import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { useDeepResearchStore } from "@/store/use-deep-research-store";
import { submitMessageFeedback } from "@/services/feedback-service";
import { saveNote } from "@/services/note-service";
import { getMessages } from "@/services/conversation-service";
import { saveActiveConversation } from "@/features/chat/chat-persistence";
import type { DrProgress } from "@/features/chat/deep-research-progress";
import type { useStreamLifecycle } from "@/features/chat/use-stream-lifecycle";
import { getErrorMessage, isAbortError } from "@/lib/request-error";
import { notifyError, notifySuccess } from "@/lib/notify";
import type { LocalMessage } from "./chat-types";
import { MESSAGES_PAGE_SIZE } from "./chat-types";
import { mapRecord, sortMessagesByTime } from "./chat-helpers";
import type { Dispatch, SetStateAction } from "react";

export const DR_MESSAGES_KEY = "lyranote-dr-messages";

interface UseDeepResearchOpts {
  globalNotebookId: string | undefined;
  activeConvId: string | null;
  drMode: "quick" | "deep";
  streaming: boolean;
  streamLifecycle: ReturnType<typeof useStreamLifecycle>;
  streamAbortRef: React.MutableRefObject<AbortController | null>;
  setMessages: Dispatch<SetStateAction<LocalMessage[]>>;
  setInput: Dispatch<SetStateAction<string>>;
  setStreaming: Dispatch<SetStateAction<boolean>>;
  setActiveConvId: Dispatch<SetStateAction<string | null>>;
}

const getDrState = () => useDeepResearchStore.getState();

export function useDeepResearch({
  globalNotebookId,
  activeConvId,
  drMode,
  streaming,
  streamLifecycle,
  streamAbortRef,
  setMessages,
  setInput,
  setStreaming,
  setActiveConvId,
}: UseDeepResearchOpts) {
  const queryClient = useQueryClient();
  const t = useTranslations("deepResearch");
  const tc = useTranslations("common");

  const drStore = useDeepResearchStore();

  const lastReportRef = useRef<{ title: string; tokens: string } | null>(null);
  const deliverableMessageIdRef = useRef<string | null>(null);
  const drPersistedRef = useRef(false);
  const drQueryRef = useRef<string>("");

  // Watch store: when isActive transitions false → handle completion
  const prevIsActiveRef = useRef(drStore.isActive);
  useEffect(() => {
    const wasActive = prevIsActiveRef.current;
    prevIsActiveRef.current = drStore.isActive;

    if (wasActive && !drStore.isActive) {
      const finalTokens = drStore.reportTokens;
      const finalProgress = drStore.progress;
      const convId = drStore.conversationId;

      setStreaming(false);
      streamLifecycle.finish();

      // Incomplete transitions (e.g. reconnect/network interruption) should
      // stop UI streaming but keep task state for reconnect.
      if (!finalProgress || finalProgress.status !== "done" || !finalTokens) {
        streamAbortRef.current = null;
        return;
      }

      lastReportRef.current = {
        title: finalProgress.deliverable?.title ?? t("reportLabel"),
        tokens: finalTokens,
      };

      // Store timeline in localStorage for the conversation
      if (convId) {
        const timelinePayload = JSON.stringify({
          subQuestions: finalProgress.subQuestions,
          learnings: finalProgress.learnings,
          doneCitations: finalProgress.doneCitations,
          mode: finalProgress.mode,
          researchGoal: finalProgress.researchGoal,
          evaluationCriteria: finalProgress.evaluationCriteria,
          reportTitle: finalProgress.reportTitle,
          deliverable: finalProgress.deliverable,
        });
        try {
          localStorage.setItem(`lyranote-dr-timeline-${convId}`, timelinePayload);
        } catch { /* ignore quota */ }
      }

      // Refresh messages from server (backend already saved user + assistant messages)
      if (convId && globalNotebookId) {
        queryClient.invalidateQueries({ queryKey: ["conversations", globalNotebookId] });
      }

      const finalize = () => {
        getDrState().clear();
        streamAbortRef.current = null;
      };

      // If the user is currently on the same conversation, refresh messages
      // immediately so the server-persisted deep-research assistant reply appears.
      if (convId && activeConvId === convId) {
        void getMessages(convId, { offset: 0, limit: MESSAGES_PAGE_SIZE })
          .then((rows) => {
            setMessages(sortMessagesByTime(rows.map(mapRecord)));
          })
          .catch(() => {
            setMessages((prev) => {
              const exists = prev.some(
                (m) => m.role === "assistant" && m.content === finalTokens
              );
              if (exists) return prev;
              return [
                ...prev,
                {
                  id: `local-dr-${Date.now()}`,
                  role: "assistant",
                  content: finalTokens,
                  timestamp: new Date(),
                  deepResearch: finalProgress,
                },
              ];
            });
          })
          .finally(finalize);
        return;
      }

      finalize();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drStore.isActive, activeConvId]);

  const handleDeepResearch = useCallback(async (text: string) => {
    if (!text || streaming) return;
    setInput("");
    drQueryRef.current = text;

    const userMsg: LocalMessage = { id: `local-${Date.now()}`, role: "user", content: text, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setStreaming(true);
    streamLifecycle.start();
    streamAbortRef.current?.abort();

    deliverableMessageIdRef.current = null;

    try {
      await getDrState().start(text, globalNotebookId ?? undefined, drMode);

      // Backend created the conversation — activate it immediately
      const { conversationId } = getDrState();
      if (conversationId) {
        setActiveConvId(conversationId);
        saveActiveConversation(conversationId);
        drPersistedRef.current = true;
        queryClient.invalidateQueries({ queryKey: ["conversations", globalNotebookId] });
      }
    } catch (error) {
      if (isAbortError(error)) return;
      const msg = getErrorMessage(error, t("requestFailed"));
      streamLifecycle.fail(msg);
      notifyError(msg);
      setStreaming(false);
      streamLifecycle.finish();
    }
  }, [streaming, globalNotebookId, drMode, streamLifecycle, streamAbortRef, setMessages, setInput, setStreaming, setActiveConvId, queryClient, t]);

  const handleSaveAsNote = useCallback(async (reportOverride?: string, titleOverride?: string) => {
    if (!globalNotebookId) throw new Error("No notebook");
    const state = getDrState();
    const report = reportOverride ?? state.reportTokens ?? lastReportRef.current?.tokens;
    const title = titleOverride ?? state.progress?.deliverable?.title ?? lastReportRef.current?.title ?? t("reportLabel");
    if (!report) throw new Error("No report content");
    try {
      await saveNote({
        notebookId: globalNotebookId,
        noteId: null,
        title,
        contentJson: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: report }] }],
        },
      });
      notifySuccess(t("savedAsNote"));
    } catch (e) {
      notifyError(tc("saveFailed"));
      throw e;
    }
  }, [globalNotebookId, t, tc]);

  const handleDrRate = useCallback(async (rating: "like" | "dislike") => {
    const msgId = deliverableMessageIdRef.current;
    if (!msgId) return;
    try {
      await submitMessageFeedback(msgId, rating);
    } catch { /* non-critical */ }
  }, []);

  const drProgress = drStore.isActive ? drStore.progress : null;

  const setDrProgress: Dispatch<SetStateAction<DrProgress | null>> = useCallback(
    (_: SetStateAction<DrProgress | null>) => {},
    [],
  );

  return {
    drProgress,
    drPersistedRef,
    deliverableMessageIdRef,
    handleDeepResearch,
    handleSaveAsNote,
    handleDrRate,
    setDrProgress,
  };
}
