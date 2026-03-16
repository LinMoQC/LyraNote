import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { startDeepResearch } from "@/services/ai-service";
import { createConversation, saveMessage } from "@/services/conversation-service";
import { submitMessageFeedback } from "@/services/feedback-service";
import { saveNote } from "@/services/note-service";
import { saveActiveConversation } from "@/features/chat/chat-persistence";
import type { DrProgress, DrDeliverable } from "@/features/chat/deep-research-progress";
import type { useStreamLifecycle } from "@/features/chat/use-stream-lifecycle";
import { getErrorMessage, isAbortError } from "@/lib/request-error";
import { notifyError, notifySuccess } from "@/lib/notify";
import type { LocalMessage } from "./chat-types";

export const DR_MESSAGES_KEY = "lyranote-dr-messages";

interface UseDeepResearchOpts {
  globalNotebookId: string | undefined;
  streaming: boolean;
  streamLifecycle: ReturnType<typeof useStreamLifecycle>;
  streamAbortRef: React.MutableRefObject<AbortController | null>;
  setMessages: Dispatch<SetStateAction<LocalMessage[]>>;
  setInput: Dispatch<SetStateAction<string>>;
  setStreaming: Dispatch<SetStateAction<boolean>>;
  setActiveConvId: Dispatch<SetStateAction<string | null>>;
}

export function useDeepResearch({
  globalNotebookId,
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
  const [drProgress, setDrProgress] = useState<DrProgress | null>(null);
  const drProgressRef = useRef<DrProgress | null>(null);
  const lastReportRef = useRef<{ title: string; tokens: string } | null>(null);
  const deliverableMessageIdRef = useRef<string | null>(null);
  const drPersistedRef = useRef(false);

  const handleDeepResearch = useCallback(async (text: string) => {
    if (!text || streaming) return;
    setInput("");

    const userMsg: LocalMessage = { id: `local-${Date.now()}`, role: "user", content: text, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setStreaming(true);
    streamLifecycle.start();
    streamAbortRef.current?.abort();
    const abortController = new AbortController();
    streamAbortRef.current = abortController;

    deliverableMessageIdRef.current = null;

    let acc: DrProgress = {
      status: "planning",
      mode: "quick",
      subQuestions: [],
      learnings: [],
      reportTokens: "",
      doneCitations: [],
      researchGoal: undefined,
      evaluationCriteria: undefined,
      deliverable: undefined,
    };
    drProgressRef.current = acc;
    setDrProgress(acc);

    const reportTokensRef = { value: "" };

    try {
      await startDeepResearch(
        text,
        { notebookId: globalNotebookId ?? undefined, mode: "quick" },
        (event) => {
          if (event.type === "token") {
            const d = event.data as { token?: string };
            reportTokensRef.value += d.token ?? "";
            const snapshot = reportTokensRef.value;
            acc = { ...acc, reportTokens: snapshot };
            drProgressRef.current = acc;
            setDrProgress((prev) => prev ? { ...prev, reportTokens: snapshot } : null);
            return;
          }

          type RawCitation = { source_id?: string; title?: string; url?: string; excerpt?: string; type?: string };

          if (event.type === "plan") {
            const d = event.data as { sub_questions?: string[]; research_goal?: string; evaluation_criteria?: string[] };
            if (d.sub_questions) {
              acc = {
                ...acc,
                status: "searching",
                subQuestions: d.sub_questions,
                researchGoal: d.research_goal ?? acc.researchGoal,
                evaluationCriteria: d.evaluation_criteria ?? acc.evaluationCriteria,
              };
            }
          } else if (event.type === "searching") {
            const d = event.data as { query?: string };
            acc = { ...acc, status: "searching", currentSearch: d.query ?? "" };
          } else if (event.type === "learning") {
            const d = event.data as {
              question?: string; content?: string; citations?: RawCitation[];
              evidence_grade?: string; dimension?: string; counterpoint?: string;
            };
            const citations = (d.citations ?? []).map((c) => ({
              source_id: c.source_id,
              title: c.title,
              url: c.url,
              excerpt: c.excerpt,
              type: c.type === "web" ? ("web" as const) : c.type === "internal" ? ("internal" as const) : undefined,
            }));
            acc = {
              ...acc,
              learnings: [
                ...acc.learnings,
                {
                  question: d.question ?? "",
                  content: d.content ?? "",
                  citations,
                  evidenceGrade: (d.evidence_grade as "strong" | "medium" | "weak" | undefined),
                  dimension: (d.dimension as "concept" | "latest" | "evidence" | "controversy" | undefined),
                  counterpoint: d.counterpoint,
                },
              ],
              currentSearch: undefined,
            };
          } else if (event.type === "writing") {
            acc = { ...acc, status: "writing", currentSearch: undefined };
          } else if (event.type === "done") {
            const d = event.data as { citations?: DrProgress["doneCitations"] };
            acc = { ...acc, status: "done", doneCitations: d.citations ?? [] };
          } else if (event.type === "deliverable") {
            const d = event.data as {
              title?: string; summary?: string; citation_count?: number;
              next_questions?: string[]; evidence_strength?: string;
              citation_table?: Array<{ conclusion: string; grade: string; source: string }>;
            };
            const deliverable: DrDeliverable = {
              title: d.title ?? "",
              summary: d.summary ?? "",
              citationCount: d.citation_count ?? 0,
              nextQuestions: d.next_questions ?? [],
              evidenceStrength: (d.evidence_strength as "low" | "medium" | "high") ?? "low",
              citationTable: d.citation_table ?? [],
            };
            acc = { ...acc, deliverable };
          } else {
            return;
          }

          drProgressRef.current = acc;
          setDrProgress({ ...acc });
        },
        abortController.signal,
      );
    } catch (error) {
      if (isAbortError(error)) return;
      const msg = getErrorMessage(error, t("requestFailed"));
      streamLifecycle.fail(msg);
      notifyError(msg);
      acc = { ...acc, status: "done" };
      drProgressRef.current = acc;
      setDrProgress(acc);
    } finally {
      streamLifecycle.finish();
      setStreaming(false);

      const finalTokens = reportTokensRef.value;
      const combined: DrProgress = { ...acc, status: "done", reportTokens: finalTokens };

      if (finalTokens) {
        lastReportRef.current = {
          title: combined.deliverable?.title ?? t("reportLabel"),
          tokens: finalTokens,
        };
      }

      drProgressRef.current = null;
      setDrProgress(null);

      if (finalTokens) {
        const timelinePayload = JSON.stringify({
          subQuestions: combined.subQuestions,
          learnings: combined.learnings,
          doneCitations: combined.doneCitations,
          mode: combined.mode,
          researchGoal: combined.researchGoal,
          evaluationCriteria: combined.evaluationCriteria,
          deliverable: combined.deliverable,
        });

        const msgId = `local-dr-${Date.now()}`;
        setMessages((prev) => {
          if (prev.some((m) => m.id === msgId)) return prev;
          return [
            ...prev,
            {
              id: msgId,
              role: "assistant" as const,
              content: finalTokens,
              timestamp: new Date(),
              deepResearch: combined,
            },
          ];
        });

        if (globalNotebookId) {
          createConversation(globalNotebookId, t("titlePrefix", { topic: text.slice(0, 40) }))
            .then((conv) => {
              setActiveConvId(conv.id);
              saveActiveConversation(conv.id);
              drPersistedRef.current = true;
              try {
                localStorage.removeItem(DR_MESSAGES_KEY);
                localStorage.setItem(`lyranote-dr-timeline-${conv.id}`, timelinePayload);
              } catch { /* ignore quota */ }
              queryClient.invalidateQueries({ queryKey: ["conversations", globalNotebookId] });
              return saveMessage(conv.id, "user", text).then(() =>
                saveMessage(conv.id, "assistant", finalTokens)
              );
            })
            .then((assistantRecord) => {
              if (assistantRecord?.id) {
                deliverableMessageIdRef.current = assistantRecord.id;
                setMessages((prev) =>
                  prev.map((m) => m.id === msgId ? { ...m, id: assistantRecord.id } : m)
                );
              }
            })
            .catch(() => {/* non-critical */});
        }
      }
      streamAbortRef.current = null;
    }
  }, [streaming, globalNotebookId, queryClient, streamLifecycle, streamAbortRef, setMessages, setInput, setStreaming, setActiveConvId, t]);

  const handleSaveAsNote = useCallback(async (reportOverride?: string, titleOverride?: string) => {
    if (!globalNotebookId) throw new Error("No notebook");
    const report = reportOverride ?? drProgressRef.current?.reportTokens ?? lastReportRef.current?.tokens;
    const title = titleOverride ?? drProgressRef.current?.deliverable?.title ?? lastReportRef.current?.title ?? t("reportLabel");
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
