import { screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChatMessageBubble } from "@/features/chat/chat-message-bubble";
import type { LocalMessage } from "@/features/chat/chat-types";
import { renderWithProviders } from "@test/utils/render-with-providers";

const { deepResearchProgressMock, parseMessageContentMock } = vi.hoisted(() => ({
  deepResearchProgressMock: vi.fn(),
  parseMessageContentMock: vi.fn(),
}));

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
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  m: {
    div: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => <div {...props}>{children}</div>,
    span: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
      <span {...props}>{children}</span>
    ),
  },
}));

vi.mock("@/components/ui/bot-avatar", () => ({
  BotAvatar: () => <div>bot-avatar</div>,
}));

vi.mock("@/components/deep-research/deep-research-progress", () => ({
  DeepResearchProgress: (props: unknown) => {
    deepResearchProgressMock(props);
    return null;
  },
}));

vi.mock("@lyranote/ui/message-render", () => ({
  AgentSteps: () => null,
  AttachmentImage: () => null,
  ChoiceCards: () => null,
  CitationFooter: () => null,
  CodeBlock: ({ code, language }: { code: string; language?: string }) => (
    <div data-testid="code-block" data-language={language}>
      {code}
    </div>
  ),
  DiagramView: ({ data, variant }: { data: { title?: string }; variant?: string }) => (
    <div data-testid="diagram-view" data-variant={variant}>
      {data.title}
    </div>
  ),
  ExcalidrawView: () => null,
  MarkdownContent: ({ content, showCursor }: { content: string; showCursor?: boolean }) => (
    <div>
      <span>{content}</span>
      {showCursor ? <span data-testid="streaming-ellipsis" /> : null}
    </div>
  ),
  MCPHTMLView: () => null,
  MCPResultCard: () => null,
  MindMapView: () => null,
  parseMessageContent: (content: string) => parseMessageContentMock(content),
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
  beforeEach(() => {
    parseMessageContentMock.mockImplementation((content: string) => ({
      textContent: content,
      choices: null,
      needsRichMarkdown: false,
    }));
    deepResearchProgressMock.mockReset();
  });

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
      />
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
      />
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
      />
    );

    expect(screen.queryByTestId("streaming-ellipsis")).not.toBeInTheDocument();
  });

  it("renders assistant diagrams inside the message bubble", () => {
    renderWithProviders(
      <ChatMessageBubble
        msg={makeAssistantMessage({
          diagram: {
            title: "典型 Agentic Engineering 架构图",
            xml: '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>',
          },
        })}
        isLastAssistant={false}
        streaming={false}
        liveAgentSteps={[]}
        copied={false}
        avatarUrl={null}
        initials="K"
        onCopy={vi.fn()}
        onFeedback={vi.fn()}
        onRegenerate={vi.fn()}
        onFollowUp={vi.fn()}
      />
    );

    const diagram = screen.getByTestId("diagram-view");
    const bubble = screen.getByTestId("assistant-message-bubble");

    expect(diagram).toHaveAttribute("data-variant", "embedded");
    expect(bubble).toContainElement(diagram);
    expect(bubble).toHaveTextContent("你好");
  });

  it("routes fenced code blocks through the rich markdown renderer for assistant replies", () => {
    parseMessageContentMock.mockReturnValue({
      textContent: ["```ts", "const answer = 42", "```"].join("\n"),
      choices: null,
      needsRichMarkdown: true,
    });

    renderWithProviders(
      <ChatMessageBubble
        msg={makeAssistantMessage({ content: "```ts\nconst answer = 42\n```" })}
        isLastAssistant={false}
        streaming={false}
        liveAgentSteps={[]}
        copied={false}
        avatarUrl={null}
        initials="K"
        onCopy={vi.fn()}
        onFeedback={vi.fn()}
        onRegenerate={vi.fn()}
        onFollowUp={vi.fn()}
      />
    );

    expect(screen.getByTestId("code-block")).toHaveAttribute("data-language", "language-ts");
    expect(screen.getByTestId("code-block")).toHaveTextContent("const answer = 42");
  });

  it("passes the deep research save-note handler through to the progress card", () => {
    const onSaveDeepResearchNote = vi.fn();

    renderWithProviders(
      <ChatMessageBubble
        msg={makeAssistantMessage({
          content: "",
          deepResearch: {
            status: "done",
            mode: "quick",
            subQuestions: [],
            learnings: [],
            reportTokens: "report body",
            doneCitations: [],
            deliverable: {
              title: "Research Report",
              summary: "summary",
              citationCount: 2,
              nextQuestions: [],
              evidenceStrength: "medium",
              citationTable: [],
            },
          },
        })}
        isLastAssistant={false}
        streaming={false}
        liveAgentSteps={[]}
        copied={false}
        avatarUrl={null}
        initials="K"
        onCopy={vi.fn()}
        onFeedback={vi.fn()}
        onRegenerate={vi.fn()}
        onFollowUp={vi.fn()}
        onSaveDeepResearchNote={onSaveDeepResearchNote}
      />
    );

    expect(deepResearchProgressMock).toHaveBeenCalledWith(
      expect.objectContaining({
        onSaveNote: onSaveDeepResearchNote,
      }),
    );
  });
});
