import { screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { ChatMessageBubble } from "@/features/chat/chat-message-bubble";
import type { LocalMessage } from "@/features/chat/chat-types";
import { renderWithProviders } from "@test/utils/render-with-providers";

vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-intl")>();
  return {
    ...actual,
    useTranslations: () => (key: string, values?: Record<string, string | number>) => {
      if (key === "timeCost") return `用时 ${values?.label}`;
      if (key === "tokenCost") return `${values?.count} tokens`;
      return key;
    },
  };
});

vi.mock("framer-motion", () => ({
  m: {
    div: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
      <div {...props}>{children}</div>
    ),
    span: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
      <span {...props}>{children}</span>
    ),
  },
}));

vi.mock("@/components/ui/bot-avatar", () => ({
  BotAvatar: () => <div>bot-avatar</div>,
}));

vi.mock("@/components/deep-research/deep-research-progress", () => ({
  DeepResearchProgress: () => null,
}));

vi.mock("@lyranote/ui/message-render", () => ({
  AgentSteps: () => null,
  AttachmentImage: () => null,
  ChoiceCards: () => null,
  CitationFooter: () => null,
  CodeBlock: () => null,
  DiagramView: () => null,
  ExcalidrawView: () => null,
  MarkdownContent: ({ content }: { content: string }) => <div>{content}</div>,
  MCPHTMLView: () => null,
  MCPResultCard: () => null,
  MindMapView: () => null,
  parseMessageContent: (content: string) => ({
    textContent: content,
    choices: null,
    needsRichMarkdown: false,
  }),
  ReasoningBlock: () => null,
  ThinkingBubble: ({ streamingContent }: { streamingContent?: string }) => (
    <div data-testid="thinking-bubble">{streamingContent ?? "thinking"}</div>
  ),
}));

vi.mock("@/components/genui", () => ({
  buildMarkdownComponents: () => ({}),
}));

function makeAssistantMessage(overrides: Partial<LocalMessage> = {}): LocalMessage {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    role: "assistant",
    content: "你好",
    timestamp: new Date("2026-04-01T17:10:00.000Z"),
    speed: {
      ttft_ms: 700,
      tps: 40,
      tokens: 1268,
    },
    ...overrides,
  };
}

describe("ChatMessageBubble", () => {
  it("shows both time cost and token usage for completed assistant messages", () => {
    renderWithProviders(
      <ChatMessageBubble
        msg={makeAssistantMessage()}
        isLastAssistant
        streaming={false}
        liveAgentSteps={[]}
        copied={false}
        avatarUrl={null}
        initials="K"
        onCopy={vi.fn()}
        onFeedback={vi.fn()}
        onRegenerate={vi.fn()}
        onFollowUp={vi.fn()}
      />,
    );

    expect(screen.getByText(/用时 32\.4s · 1,268 tokens/)).toBeInTheDocument();
  });

  it("renders direct-answer streaming tokens in the assistant bubble instead of the thinking bubble", () => {
    const transitionText = "您好，Boss！很高兴见到您。";

    renderWithProviders(
      <ChatMessageBubble
        msg={makeAssistantMessage({ content: transitionText })}
        isLastAssistant
        streaming
        liveAgentSteps={[]}
        copied={false}
        avatarUrl={null}
        initials="K"
        onCopy={vi.fn()}
        onFeedback={vi.fn()}
        onRegenerate={vi.fn()}
        onFollowUp={vi.fn()}
      />,
    );

    expect(screen.getByTestId("thinking-bubble")).toHaveTextContent("thinking");
    expect(screen.getByText(transitionText)).toBeInTheDocument();
    expect(screen.getAllByText(transitionText)).toHaveLength(1);
    expect(screen.getByTestId("streaming-ellipsis")).toBeInTheDocument();
  });

  it("hides the streaming ellipsis after the assistant message completes", () => {
    renderWithProviders(
      <ChatMessageBubble
        msg={makeAssistantMessage()}
        isLastAssistant
        streaming={false}
        liveAgentSteps={[]}
        copied={false}
        avatarUrl={null}
        initials="K"
        onCopy={vi.fn()}
        onFeedback={vi.fn()}
        onRegenerate={vi.fn()}
        onFollowUp={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("streaming-ellipsis")).not.toBeInTheDocument();
  });
});
