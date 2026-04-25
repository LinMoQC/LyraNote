import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { buildMarkdownComponents } from "@lyranote/ui/genui";
import { renderWithProviders } from "@test/utils/render-with-providers";

describe("GenUI markdown components", () => {
  it("renders table payloads that put columns and rows at the top level", () => {
    const markdown = [
      "```genui",
      JSON.stringify({
        type: "table",
        columns: ["策略名称", "工作原理", "优点", "缺点"],
        rows: [
          [
            "滑动窗口 (Sliding Window)",
            "仅保留最近的 N 条对话记录，丢弃旧信息",
            "实现简单，响应速度快",
            "会彻底遗忘较早之前的对话背景",
          ],
          [
            "摘要压缩 (Summarization)",
            "定期将旧对话总结成一段简短的摘要，与新对话一同输入",
            "保留了历史大意，节省 Token",
            "摘要过程会损失细节，且增加一次 LLM 调用成本",
          ],
        ],
      }),
      "```",
    ].join("\n");

    renderWithProviders(
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={buildMarkdownComponents({})}>
        {markdown}
      </ReactMarkdown>
    );

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("策略名称")).toBeInTheDocument();
    expect(screen.getByText("滑动窗口 (Sliding Window)")).toBeInTheDocument();
    expect(screen.queryByText(/"type":"table"/)).not.toBeInTheDocument();
  });

  it("renders fenced code blocks with syntax highlighting via the shared code block fallback", () => {
    const markdown = ["```ts", "const answer = 42", "console.log(answer)", "```"].join("\n");

    const { container } = renderWithProviders(
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={buildMarkdownComponents({})}>
        {markdown}
      </ReactMarkdown>
    );

    expect(screen.getByText("TypeScript")).toBeInTheDocument();
    expect(container.querySelector('[data-highlighted="true"]')).toBeInTheDocument();
    expect(container.querySelector("pre code span[data-code-token]")).toBeInTheDocument();
  });
});
