import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { ChatMessageBubble } from "@/features/chat/chat-message-bubble";
import type { LocalMessage } from "@/features/chat/chat-types";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    if (key === "timeCost") return `用时 ${values?.label}`;
    if (key === "tokenCost") return `${values?.count} tokens`;
    return key;
  },
}));

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

vi.mock("@/components/message-render/citation-footer", () => ({
  CitationFooter: () => null,
}));

vi.mock("@/components/message-render/mcp-result-views", () => ({
  MCPHTMLView: () => null,
  MCPResultCard: () => null,
}));

vi.mock("@/components/message-render/agent-steps", () => ({
  AgentSteps: () => null,
  ThinkingBubble: ({ streamingContent }: { streamingContent?: string }) => (
    <div data-testid="thinking-bubble">{streamingContent ?? "thinking"}</div>
  ),
}));

vi.mock("@/components/message-render/mind-map-view", () => ({
  MindMapView: () => null,
}));

vi.mock("@/components/message-render/diagram-view", () => ({
  DiagramView: () => null,
}));

vi.mock("@/components/message-render/excalidraw-view", () => ({
  ExcalidrawView: () => null,
}));

vi.mock("@/components/deep-research/deep-research-progress", () => ({
  DeepResearchProgress: () => null,
}));

vi.mock("@/components/message-render/choice-cards", () => ({
  ChoiceCards: () => null,
}));

vi.mock("@/components/message-render/parse-message-content", () => ({
  parseMessageContent: (content: string) => ({
    textContent: content,
    choices: null,
    needsRichMarkdown: false,
  }),
}));

vi.mock("@/components/message-render/attachment-image", () => ({
  AttachmentImage: () => null,
}));

vi.mock("@/components/message-render/markdown-content", () => ({
  MarkdownContent: ({ content }: { content: string }) => <div>{content}</div>,
}));

vi.mock("@/components/message-render/code-block", () => ({
  CodeBlock: () => null,
}));

vi.mock("@/components/message-render/reasoning-block", () => ({
  ReasoningBlock: () => null,
}));

vi.mock("@/components/message-render/source-cards", () => ({
  WebCard: () => null,
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
    render(
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

    render(
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
    render(
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
