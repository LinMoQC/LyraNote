import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CopilotPanel } from "@/features/copilot/copilot-panel";

const chatInputMock = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => <img alt="" {...props} />,
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  MotionConfig: ({ children }: { children?: ReactNode }) => <>{children}</>,
  m: {
    div: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
      <div {...props}>{children}</div>
    ),
    aside: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
      <aside {...props}>{children}</aside>
    ),
  },
}));

vi.mock("@/hooks/use-copilot-resize", () => ({
  DEFAULT_WIDTH: 400,
  MIN_WIDTH: 320,
  MAX_WIDTH: 640,
  useCopilotResize: () => ({
    isDragging: false,
    handleResizeStart: vi.fn(),
    handleResizeTouchStart: vi.fn(),
  }),
}));

vi.mock("@/components/chat-input", () => ({
  ChatInput: (props: Record<string, unknown>) => {
    chatInputMock(props);
    return <div>{String(props.placeholder)}</div>;
  },
}));

vi.mock("@/components/message-render/agent-steps", () => ({
  AgentSteps: () => null,
}));

vi.mock("@/components/message-render/approval-card", () => ({
  ApprovalCard: () => null,
}));

vi.mock("@/features/copilot/copilot-message-bubble", () => ({
  CopilotMessageBubble: ({ message }: { message: { content: string } }) => <div>{message.content}</div>,
}));

vi.mock("@/features/copilot/proactive-card", () => ({
  ProactiveCard: () => null,
}));

vi.mock("@/features/copilot/soul-card", () => ({
  SoulCard: () => null,
}));

vi.mock("@/features/copilot/writing-context-bar", () => ({
  WritingContextBar: () => null,
}));

vi.mock("@/services/ai-service", () => ({
  approveToolCall: vi.fn(),
  getContextGreeting: vi.fn(async () => ({ greeting: "hello", suggestions: [] })),
  getInsights: vi.fn(async () => ({ insights: [] })),
  getRelatedKnowledge: vi.fn(async () => []),
  sendMessageStream: vi.fn(),
}));

vi.mock("@/store/use-proactive-store", () => ({
  useProactiveStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    suggestions: [],
    markAllRead: vi.fn(),
    writingContext: [],
  }),
}));

vi.mock("@/store/use-notebook-store", () => ({
  useNotebookStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    setCopilotStreaming: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-agent-stream-events", () => ({
  useAgentStreamEvents: () => ({
    agentSteps: [],
    pendingApproval: null,
    setPendingApproval: vi.fn(),
    handleAgentEvent: vi.fn(),
    buildSavedSteps: vi.fn(() => []),
    reset: vi.fn(),
  }),
}));

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: () => <div>loading</div>,
}));

describe("CopilotPanel", () => {
  beforeEach(() => {
    chatInputMock.mockReset();
    Object.defineProperty(globalThis, "IntersectionObserver", {
      value: class {
        observe() {}
        disconnect() {}
        unobserve() {}
      } as unknown as typeof IntersectionObserver,
      configurable: true,
      writable: true,
    });
  });

  it("renders the mobile sheet presentation without dock/float controls", async () => {
    render(
      <CopilotPanel
        notebookId="nb-1"
        initialMessages={[]}
        isOpen
        onClose={vi.fn()}
        onModeChange={vi.fn()}
        presentation="sheet"
        mode="floating"
      />
    );

    expect(await screen.findByTestId("copilot-panel-sheet")).toBeInTheDocument();
    expect(screen.queryByTitle("floatPanel")).not.toBeInTheDocument();
    expect(screen.queryByTitle("dockPanel")).not.toBeInTheDocument();
    expect(screen.getByText("placeholder")).toBeInTheDocument();
    expect(chatInputMock).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "default",
        showHint: false,
        toolbarLeft: undefined,
      }),
    );
  });
});
