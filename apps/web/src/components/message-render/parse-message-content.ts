/**
 * @file 消息内容解析工具
 * @description 统一解析消息文本，提取结构化选项块，
 *              并判断是否需要 ReactMarkdown 进行富文本渲染。
 */

import { parseChoicesBlock, type Choice } from "./choice-cards";

export interface ParsedMessageContent {
  /** 去除 choices 块后的纯文本内容 */
  textContent: string;
  /** 解析出的结构化选项，无则为 null */
  choices: Choice[] | null;
  /** 是否包含标题/代码块/表格等需要 ReactMarkdown 渲染的内容 */
  needsRichMarkdown: boolean;
}

export function parseMessageContent(content: string): ParsedMessageContent {
  const { textBefore, choices } = parseChoicesBlock(content);
  const textContent = choices ? textBefore : content;
  const needsRichMarkdown =
    textContent.includes("\n## ") || textContent.startsWith("## ") ||
    textContent.includes("\n### ") || textContent.startsWith("### ") ||
    textContent.includes("```") ||
    /\|.+\|/.test(textContent);
  return { textContent, choices, needsRichMarkdown };
}
