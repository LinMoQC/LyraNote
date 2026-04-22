import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { useDeepResearchStore } from "@/store/use-deep-research-store";
import { submitMessageFeedback } from "@/services/feedback-service";
import { saveNote } from "@/services/note-service";
import { getMessages } from "@/services/conversation-service";
import { saveDeepResearchSources, planDeepResearch } from "@/services/ai-service";
import { saveActiveConversation } from "@/features/chat/chat-persistence";
import type { DrProgress, DrPlanData } from "@/components/deep-research/deep-research-progress";
import type { useStreamLifecycle } from "@/hooks/use-stream-lifecycle";
import { lyraQueryKeys } from "@/lib/query-keys";
import { getErrorMessage, isAbortError } from "@/lib/request-error";
import { notifyError, notifySuccess } from "@/lib/notify";
import type { LocalMessage } from "@/features/chat/chat-types";
import { MESSAGES_PAGE_SIZE } from "@/features/chat/chat-types";
import { mapRecord, sortMessagesByTime } from "@/features/chat/chat-helpers";
import type { Dispatch, SetStateAction } from "react";

export const DR_MESSAGES_KEY = "lyranote-dr-messages";

interface UseDeepResearchOpts {
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
      if (convId) {
        queryClient.invalidateQueries({ queryKey: lyraQueryKeys.conversations.all() });
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

  const _startResearch = useCallback(async (
    text: string,
    clarificationContext: Array<{ question: string; answer: string }> | null,
    planOverride?: DrPlanData,
  ) => {
    setStreaming(true);
    streamLifecycle.start();
    streamAbortRef.current?.abort();
    deliverableMessageIdRef.current = null;

    try {
      await getDrState().start(text, undefined, drMode, clarificationContext ?? undefined, planOverride);
      getDrState().setDrawerOpen(true);

      const { conversationId } = getDrState();
      if (conversationId) {
        setActiveConvId(conversationId);
        saveActiveConversation(conversationId);
        drPersistedRef.current = true;
        queryClient.invalidateQueries({ queryKey: lyraQueryKeys.conversations.all() });
      }
    } catch (error) {
      if (isAbortError(error)) return;
      const msg = getErrorMessage(error, t("requestFailed"));
      streamLifecycle.fail(msg);
      notifyError(msg);
      setStreaming(false);
      streamLifecycle.finish();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drMode, streamLifecycle, streamAbortRef, setStreaming, setActiveConvId, queryClient, t]);

  const handleDeepResearch = useCallback(async (overrideText?: string) => {
    const text = overrideText ?? "";
    if (!text || streaming) return;
    setInput("");
    drQueryRef.current = text;

    const userMsg: LocalMessage = { id: `local-${Date.now()}`, role: "user", content: text, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);

    const clarificationContext: Array<{ question: string; answer: string }> | null = null;

    // Generate plan for user confirmation
    getDrState().setPlanLoading(true);
    try {
      const plan = await planDeepResearch(text, { mode: drMode, clarificationContext: clarificationContext ?? undefined });
      getDrState().setPlanData(plan);
    } catch (error) {
      if (isAbortError(error)) return;
      // Plan generation failed: fall back to direct research start
      await _startResearch(text, clarificationContext);
    } finally {
      getDrState().setPlanLoading(false);
    }
  }, [streaming, drMode, _startResearch, setMessages, setInput]);

  const confirmPlan = useCallback(async (editedPlan: DrPlanData) => {
    const text = drQueryRef.current;
    if (!text) return;
    getDrState().setPlanData(null);
    await _startResearch(text, null, editedPlan);
  }, [_startResearch]);

  const cancelPlan = useCallback(() => {
    getDrState().setPlanData(null);
    getDrState().setPlanLoading(false);
  }, []);

  const handleSaveAsNote = useCallback(async (reportOverride?: string, titleOverride?: string) => {
    const state = getDrState();
    const notebookId = state.notebookId;
    const report = reportOverride ?? state.reportTokens ?? lastReportRef.current?.tokens;
    const title = titleOverride ?? state.progress?.deliverable?.title ?? lastReportRef.current?.title ?? t("reportLabel");
    if (!report) throw new Error("No report content");
    if (!notebookId) throw new Error("No notebook");
    try {
      await saveNote({
        notebookId,
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
  }, [t, tc]);

  const handleSaveSources = useCallback(async () => {
    const state = getDrState();
    if (!state.taskId) throw new Error("No deep research task");

    try {
      const result = await saveDeepResearchSources(state.taskId, state.notebookId);
      notifySuccess(
        t("savedSources", {
          created: result.created_count,
          skipped: result.skipped_count,
        }),
      );
    } catch (e) {
      notifyError(tc("saveFailed"));
      throw e;
    }
  }, [t, tc]);

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
    taskId: drStore.taskId,
    handleDeepResearch,
    handleSaveAsNote,
    handleSaveSources,
    handleDrRate,
    setDrProgress,
    confirmPlan,
    cancelPlan,
    planData: drStore.planData,
    isPlanLoading: drStore.isPlanLoading,
    drawerOpen: drStore.drawerOpen,
    setDrawerOpen: (open: boolean) => getDrState().setDrawerOpen(open),
  };
}
