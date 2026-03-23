"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { DrProgress, DrDeliverable } from "@/components/deep-research/dr-types";
import {
  createDeepResearch,
  subscribeDeepResearch,
  getDeepResearchStatus,
  type DeepResearchEvent,
} from "@/services/ai-service";

interface DeepResearchState {
  taskId: string | null;
  conversationId: string | null;
  query: string;
  notebookId: string | undefined;
  mode: "quick" | "deep";
  progress: DrProgress | null;
  reportTokens: string;
  isActive: boolean;
  /** Accumulated event index for reconnect */
  eventIndex: number;
  /** Set to true when the floating indicator is clicked on the chat page */
  focusRequested: boolean;
}

interface DeepResearchActions {
  start(query: string, notebookId: string | undefined, mode: "quick" | "deep", clarificationContext?: Array<{ question: string; answer: string }>): Promise<void>;
  reconnect(taskId: string): Promise<void>;
  finishFromDB(status: {
    report: string | null;
    deliverable: Record<string, unknown> | null;
    timeline: Record<string, unknown> | null;
  }): void;
  requestFocus(): void;
  abort(): void;
  clear(): void;
}

type DeepResearchStore = DeepResearchState & DeepResearchActions;

let _abortController: AbortController | null = null;

function processEvent(
  event: DeepResearchEvent,
  acc: DrProgress,
  reportTokens: { value: string },
): DrProgress {
  type RawCitation = { source_id?: string; title?: string; url?: string; excerpt?: string; type?: string };

  if (event.type === "token") {
    const d = event.data as { token?: string };
    reportTokens.value += d.token ?? "";
    return { ...acc, reportTokens: reportTokens.value };
  }

  if (event.type === "report_complete") {
    const d = event.data as { report?: string };
    if (d.report) {
      reportTokens.value = d.report;
      return { ...acc, reportTokens: d.report };
    }
    return acc;
  }

  if (event.type === "plan") {
    const d = event.data as { sub_questions?: string[]; research_goal?: string; evaluation_criteria?: string[]; report_title?: string };
    if (d.sub_questions) {
      return {
        ...acc,
        status: "searching",
        subQuestions: d.sub_questions,
        researchGoal: d.research_goal ?? acc.researchGoal,
        evaluationCriteria: d.evaluation_criteria ?? acc.evaluationCriteria,
        reportTitle: d.report_title ?? acc.reportTitle,
      };
    }
  } else if (event.type === "searching") {
    const d = event.data as { query?: string };
    return { ...acc, status: "searching", currentSearch: d.query ?? "" };
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
    return {
      ...acc,
      learnings: [
        ...acc.learnings,
        {
          question: d.question ?? "",
          content: d.content ?? "",
          citations,
          evidenceGrade: d.evidence_grade as "strong" | "medium" | "weak" | undefined,
          dimension: d.dimension as "concept" | "latest" | "evidence" | "controversy" | undefined,
          counterpoint: d.counterpoint,
        },
      ],
      currentSearch: undefined,
    };
  } else if (event.type === "writing") {
    return { ...acc, status: "writing", currentSearch: undefined };
  } else if (event.type === "done") {
    const d = event.data as { citations?: DrProgress["doneCitations"] };
    return { ...acc, status: "done", doneCitations: d.citations ?? [] };
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
    return { ...acc, deliverable };
  }

  return acc;
}

function makeInitialProgress(mode: "quick" | "deep"): DrProgress {
  return {
    status: "planning",
    mode,
    subQuestions: [],
    learnings: [],
    reportTokens: "",
    doneCitations: [],
  };
}

async function subscribeTo(
  taskId: string,
  get: () => DeepResearchStore,
  set: (partial: Partial<DeepResearchState>) => void,
  fromIndex = 0,
) {
  _abortController?.abort();
  const ac = new AbortController();
  _abortController = ac;

  const reportTokens = { value: get().reportTokens };
  let eventIdx = fromIndex;
  let sawDoneEvent = false;

  try {
    await subscribeDeepResearch(
      taskId,
      (event) => {
        if (event.type === "done") sawDoneEvent = true;
        eventIdx++;
        const current = get();
        if (!current.progress) return;
        const next = processEvent(event, current.progress, reportTokens);
        set({ progress: next, reportTokens: reportTokens.value, eventIndex: eventIdx });
      },
      ac.signal,
      fromIndex,
    );
  } catch {
    // aborted or network error; non-fatal for background tasks
  } finally {
    if (_abortController === ac) _abortController = null;

    // If the abort signal fired (e.g. page refresh or manual cancel),
    // do NOT mark progress as "done" — the backend task is still running.
    // Just set isActive to false so the persist layer keeps taskId for reconnect.
    if (ac.signal.aborted) {
      set({ isActive: false });
      return;
    }

    // Non-abort exits can happen on transient SSE/network interruptions.
    // Only treat as completed when we actually received a "done" event.
    if (sawDoneEvent) {
      set({ isActive: false });
      return;
    }
    set({ isActive: false });
  }
}

export const useDeepResearchStore = create<DeepResearchStore>()(
  persist(
    (set, get) => ({
      taskId: null,
      conversationId: null,
      query: "",
      notebookId: undefined,
      mode: "quick",
      progress: null,
      reportTokens: "",
      isActive: false,
      eventIndex: 0,
      focusRequested: false,

      async start(query, notebookId, mode, clarificationContext) {
        _abortController?.abort();

        set({
          query,
          notebookId,
          mode,
          progress: makeInitialProgress(mode),
          reportTokens: "",
          isActive: true,
          eventIndex: 0,
          taskId: null,
          conversationId: null,
        });

        const { taskId, conversationId } = await createDeepResearch(query, {
          notebookId,
          mode,
          clarificationContext,
        });
        set({ taskId, conversationId });

        subscribeTo(taskId, get, set);
      },

      async reconnect(taskId) {
        const status = await getDeepResearchStatus(taskId);

        if (status.conversation_id) {
          set({ conversationId: status.conversation_id });
        }

        if (status.status === "done") {
          get().finishFromDB({
            report: status.report,
            deliverable: status.deliverable,
            timeline: status.timeline,
          });
          return;
        }

        if (status.status === "error") {
          set({
            taskId: null,
            isActive: false,
            progress: null,
            reportTokens: "",
          });
          return;
        }

        set({
          taskId,
          query: status.query,
          mode: status.mode as "quick" | "deep",
          isActive: true,
          progress: makeInitialProgress(status.mode as "quick" | "deep"),
          reportTokens: "",
          eventIndex: 0,
        });

        subscribeTo(taskId, get, set, 0);
      },

      finishFromDB(status) {
        const tl = status.timeline as Record<string, unknown> | null;
        const deliverable = status.deliverable as Record<string, unknown> | null;
        const dlv: DrDeliverable | undefined = deliverable
          ? {
              title: (deliverable.title as string) ?? "",
              summary: (deliverable.summary as string) ?? "",
              citationCount: (deliverable.citation_count as number) ?? 0,
              nextQuestions: (deliverable.next_questions as string[]) ?? [],
              evidenceStrength: ((deliverable.evidence_strength as string) ?? "low") as "low" | "medium" | "high",
              citationTable: (deliverable.citation_table as Array<{ conclusion: string; grade: string; source: string }>) ?? [],
            }
          : undefined;

        set({
          isActive: false,
          reportTokens: status.report ?? "",
          progress: {
            status: "done",
            mode: get().mode,
            subQuestions: (tl?.subQuestions as string[]) ?? [],
            learnings: (tl?.learnings ?? []) as DrProgress["learnings"],
            reportTokens: status.report ?? "",
            doneCitations: (tl?.doneCitations ?? []) as DrProgress["doneCitations"],
            researchGoal: tl?.researchGoal as string | undefined,
            evaluationCriteria: tl?.evaluationCriteria as string[] | undefined,
            reportTitle: tl?.reportTitle as string | undefined,
            deliverable: dlv,
          },
        });
      },

      requestFocus() {
        set({ focusRequested: true });
      },

      abort() {
        _abortController?.abort();
        _abortController = null;
        set({
          taskId: null,
          conversationId: null,
          isActive: false,
          progress: null,
          reportTokens: "",
        });
      },

      clear() {
        _abortController?.abort();
        _abortController = null;
        set({
          taskId: null,
          conversationId: null,
          query: "",
          notebookId: undefined,
          progress: null,
          reportTokens: "",
          isActive: false,
          eventIndex: 0,
        });
      },
    }),
    {
      name: "lyranote-deep-research",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        taskId: state.taskId,
        conversationId: state.conversationId,
        query: state.query,
        notebookId: state.notebookId,
        mode: state.mode,
      }),
    },
  ),
);
