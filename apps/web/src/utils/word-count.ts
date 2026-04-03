/**
 * 从 Tiptap JSON 文档中提取纯文本
 */
export function extractTextFromTiptap(doc: Record<string, unknown>): string {
  function walk(node: Record<string, unknown>): string {
    if (node.type === "text") return (node.text as string) ?? ""
    const children = node.content as Record<string, unknown>[] | undefined
    if (!children?.length) return ""
    return children.map(walk).join("")
  }
  return walk(doc)
}

/**
 * 计算字数：中文按字计，英文/数字按词计
 */
export function computeWordCount(text: string): number {
  const chinese = (text.match(/[\u4e00-\u9fff]/g) ?? []).length
  const english = (text.match(/[a-zA-Z0-9]+/g) ?? []).length
  return chinese + english
}
