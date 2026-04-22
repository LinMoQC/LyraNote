import { describe, expect, it } from "vitest";

import { parseChoicesBlock, parseMessageContent } from "@lyranote/ui/message-render";

describe("parseMessageContent", () => {
  it("extracts choices blocks into structured options", () => {
    const parsed = parseMessageContent([
      "如果你愿意，我可以继续从这几个方向展开：",
      "",
      "```choices",
      '[{"label":"讲系统架构","value":"请讲一下系统架构"}]',
      "```",
    ].join("\n"));

    expect(parsed.textContent).toBe("如果你愿意，我可以继续从这几个方向展开：");
    expect(parsed.choices).toEqual([
      { label: "讲系统架构", value: "请讲一下系统架构" },
    ]);
  });

  it("does not expose malformed choices payload as visible text", () => {
    const parsed = parseMessageContent([
      "我可以继续展开：",
      "",
      "```choices",
      '[{"label":"讲系统架构","value":"请讲一下系统架构",}]',
      "```",
      "",
      "你也可以直接指定方向。",
    ].join("\n"));

    expect(parsed.textContent).toBe("我可以继续展开：\n\n你也可以直接指定方向。");
    expect(parsed.choices).toEqual([
      { label: "讲系统架构", value: "请讲一下系统架构" },
    ]);
  });

  it("hides incomplete streaming choices blocks before they close", () => {
    const parsed = parseMessageContent([
      "我可以从下面几个方向继续：",
      "",
      "```choices",
      '[{"label":"讲系统架构"',
    ].join("\n"));

    expect(parsed.textContent).toBe("我可以从下面几个方向继续：");
    expect(parsed.choices).toBeNull();
  });
});

describe("parseChoicesBlock", () => {
  it("removes a complete choices block even when parsing fails", () => {
    const parsed = parseChoicesBlock([
      "前文说明",
      "",
      "```choices title=followups",
      "not-json",
      "```",
      "",
      "后文说明",
    ].join("\n"));

    expect(parsed.textContent).toBe("前文说明\n\n后文说明");
    expect(parsed.choices).toBeNull();
  });
});
