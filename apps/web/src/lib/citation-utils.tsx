/**
 * @file 引用标记工具函数
 * @description 统一处理 AI 回复中的引用标记（如 [来源1]、【1】、[[1]] 等），
 *              将其解析为可交互的 InlineCitationBadge 组件。
 *              chat-helpers 和 copilot/chat-message-bubble 共享此模块，避免重复定义。
 */

import { Fragment, type ReactNode } from "react";
import { InlineCitationBadge } from "@/features/copilot/inline-citation";
import type { CitationData } from "@/types";

/** 引用标记正则表达式，匹配半角 [来源N]/[[N]]/[N] 和全角 【来源N】/【N】 */
export const CITATION_RE = /【来源(\d+)】|【(\d+)】|\[来源(\d+)\]|\[\[(\d+)\]\]|\[(\d+)\]/g;

/**
 * 移除文本中的所有引用标记
 * @param text - 包含引用标记的原始文本
 * @returns 清理后的纯文本
 */
export function stripCitationMarkers(text: string): string {
  return text
    .replace(/【来源\d+】|【\d+】|\[来源\d+\]|\[\[\d+\]\]|\[\d+\]/g, "")
    .replace(/ {2,}/g, " ")
    .trim();
}

/**
 * 将文本中的引用标记替换为 InlineCitationBadge 组件
 * @param text - 包含引用标记的文本
 * @param citations - 引用数据数组，按编号索引
 * @returns ReactNode — 混合文本和引用徽章的节点
 */
export function renderInlineCitations(text: string, citations?: CitationData[]): ReactNode {
  const parts: ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  CITATION_RE.lastIndex = 0;
  while ((match = CITATION_RE.exec(text)) !== null) {
    if (match.index > lastIdx) parts.push(text.slice(lastIdx, match.index));
    const num = parseInt(match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5], 10);
    parts.push(
      <InlineCitationBadge key={`cite-${match.index}`} index={num} citation={citations?.[num - 1]} />
    );
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts.length > 1 ? <>{parts}</> : text;
}

/**
 * 递归处理 ReactMarkdown 子节点，将字符串中的引用标记替换为组件
 * @param children - ReactMarkdown 渲染的子节点
 * @param citations - 引用数据数组
 * @returns 处理后的 ReactNode
 */
export function processChildren(children: ReactNode, citations?: CitationData[]): ReactNode {
  if (typeof children === "string") return renderInlineCitations(children, citations);
  if (Array.isArray(children)) {
    return children.map((child, i) => (
      <Fragment key={i}>{processChildren(child, citations)}</Fragment>
    ));
  }
  return children;
}
