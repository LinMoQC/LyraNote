import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { type ReactNode, useRef, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useDeepResearch } from "@/hooks/use-deep-research";
import { useStreamLifecycle } from "@/hooks/use-stream-lifecycle";
import { useDeepResearchStore } from "@/store/use-deep-research-store";
import type { LocalMessage } from "@/features/chat/chat-types";
import { createTestQueryClient } from "@test/utils/create-test-query-client";

const {
  createDeepResearchMock,
  getMessagesMock,
  notifyErrorMock,
  notifySuccessMock,
  planDeepResearchMock,
  saveActiveConversationMock,
  saveDeepResearchSourcesMock,
  saveNoteMock,
  subscribeDeepResearchMock,
  submitMessageFeedbackMock,
} = vi.hoisted(() => ({
  createDeepResearchMock: vi.fn(),
  getMessagesMock: vi.fn(),
  notifyErrorMock: vi.fn(),
  notifySuccessMock: vi.fn(),
  planDeepResearchMock: vi.fn(),
  saveActiveConversationMock: vi.fn(),
  saveDeepResearchSourcesMock: vi.fn(),
  saveNoteMock: vi.fn(),
  subscribeDeepResearchMock: vi.fn(),
  submitMessageFeedbackMock: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/services/ai-service", () => ({
  createDeepResearch: createDeepResearchMock,
  getDeepResearchStatus: vi.fn(),
  planDeepResearch: planDeepResearchMock,
  saveDeepResearchSources: saveDeepResearchSourcesMock,
  subscribeDeepResearch: subscribeDeepResearchMock,
}));

vi.mock("@/services/feedback-service", () => ({
  submitMessageFeedback: submitMessageFeedbackMock,
}));

vi.mock("@/services/note-service", () => ({
  saveNote: saveNoteMock,
}));

vi.mock("@/services/conversation-service", () => ({
  getMessages: getMessagesMock,
}));

vi.mock("@/features/chat/chat-persistence", () => ({
  saveActiveConversation: saveActiveConversationMock,
}));

vi.mock("@/lib/notify", () => ({
  notifyError: notifyErrorMock,
  notifySuccess: notifySuccessMock,
}));

function createWrapper() {
  const queryClient = createTestQueryClient();

  return function Wrapper({ children }: { children?: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

function resetDeepResearchStore() {
  localStorage.removeItem("lyranote-deep-research");
  useDeepResearchStore.setState({
    taskId: null,
    conversationId: null,
    query: "",
    notebookId: undefined,
    mode: "quick",
    progress: null,
    reportTokens: "",
    webSources: [],
    isActive: false,
    eventIndex: 0,
    focusRequested: false,
    planData: null,
    isPlanLoading: false,
    drawerOpen: false,
  });
}

function useDeepResearchHarness(selectedNotebookId?: string) {
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const streamLifecycle = useStreamLifecycle();

  const dr = useDeepResearch({
    activeConvId,
    drMode: "quick",
    selectedNotebookId,
    streaming,
    streamLifecycle,
    streamAbortRef,
    setMessages,
    setInput,
    setStreaming,
    setActiveConvId,
  });

  return {
    ...dr,
    activeConvId,
    input,
    messages,
    streaming,
  };
}

describe("useDeepResearch", () => {
  beforeEach(() => {
    resetDeepResearchStore();
    createDeepResearchMock.mockReset();
    getMessagesMock.mockReset();
    notifyErrorMock.mockReset();
    notifySuccessMock.mockReset();
    planDeepResearchMock.mockReset();
    saveActiveConversationMock.mockReset();
    saveDeepResearchSourcesMock.mockReset();
    saveNoteMock.mockReset();
    subscribeDeepResearchMock.mockReset();
    submitMessageFeedbackMock.mockReset();

    createDeepResearchMock.mockResolvedValue({
      taskId: "task-1",
      conversationId: "conv-1",
    });
    subscribeDeepResearchMock.mockImplementation(() => new Promise(() => {}));
  });

  it("passes the selected notebook id when starting deep research", async () => {
    const plan = {
      subQuestions: ["问题一"],
      searchMatrix: { "问题一": ["query"] },
      researchGoal: "研究目标",
      evaluationCriteria: ["标准一"],
      reportTitle: "研究报告",
    };
    planDeepResearchMock.mockResolvedValue(plan);

    const { result } = renderHook(() => useDeepResearchHarness("notebook-1"), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.handleDeepResearch("Agentic Engineering");
    });

    await act(async () => {
      await result.current.confirmPlan(plan);
    });

    await waitFor(() => {
      expect(createDeepResearchMock).toHaveBeenCalledWith(
        "Agentic Engineering",
        expect.objectContaining({
          notebookId: "notebook-1",
          mode: "quick",
        }),
      );
    });
  });

  it("still saves to the remembered notebook after the deep research store is cleared", async () => {
    const plan = {
      subQuestions: ["问题一"],
      researchGoal: "研究目标",
      evaluationCriteria: ["标准一"],
      reportTitle: "研究报告",
    };
    planDeepResearchMock.mockResolvedValue(plan);
    saveNoteMock.mockResolvedValue({
      id: "note-1",
      title: "研究报告",
      content_json: null,
      updated_at: null,
    });

    const { result } = renderHook(() => useDeepResearchHarness("notebook-1"), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.handleDeepResearch("Agentic Engineering");
    });

    await act(async () => {
      await result.current.confirmPlan(plan);
    });

    await act(async () => {
      resetDeepResearchStore();
    });

    await act(async () => {
      await result.current.handleSaveAsNote("深度研究报告正文", "研究报告");
    });

    expect(saveNoteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        notebookId: "notebook-1",
        title: "研究报告",
      }),
    );
    expect(notifySuccessMock).toHaveBeenCalledWith("savedAsNote");
  });

  it("opens notebook selection when saving a report without a notebook", async () => {
    const { result } = renderHook(() => useDeepResearchHarness(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await expect(
        result.current.handleSaveAsNote("深度研究报告正文", "深度研究报告"),
      ).rejects.toThrow("Notebook selection required");
    });

    expect(saveNoteMock).not.toHaveBeenCalled();
    expect(notifyErrorMock).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(result.current.pendingSaveNoteRequest).toEqual({
        report: "深度研究报告正文",
        title: "深度研究报告",
      });
    });
  });

  it("continues saving immediately after the user picks a notebook", async () => {
    saveNoteMock.mockResolvedValue({
      id: "note-1",
      title: "深度研究报告",
      content_json: null,
      updated_at: null,
    });

    const { result } = renderHook(() => useDeepResearchHarness(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await expect(
        result.current.handleSaveAsNote("深度研究报告正文", "深度研究报告"),
      ).rejects.toThrow("Notebook selection required");
    });

    await waitFor(() => {
      expect(result.current.pendingSaveNoteRequest).toEqual({
        report: "深度研究报告正文",
        title: "深度研究报告",
      });
    });

    await act(async () => {
      await result.current.confirmPendingSaveNote("notebook-2");
    });

    await waitFor(() => {
      expect(saveNoteMock).toHaveBeenCalledWith(
        expect.objectContaining({
          notebookId: "notebook-2",
          title: "深度研究报告",
        }),
      );
    });
    expect(result.current.pendingSaveNoteRequest).toBeNull();
    expect(notifySuccessMock).toHaveBeenCalledWith("savedAsNote");
  });
});
