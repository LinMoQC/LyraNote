import { describe, it, expect } from "vitest"
import { markdownToTiptapDoc } from "@/utils/markdown-to-tiptap"

describe("markdownToTiptapDoc", () => {
  it("converts headings to heading nodes", () => {
    const doc = markdownToTiptapDoc("# H1\n## H2\n### H3")
    expect(doc.content).toHaveLength(3)
    const nodes = doc.content as Array<{ type: string; attrs: { level: number }; content: Array<{ text: string }> }>
    expect(nodes[0].type).toBe("heading")
    expect(nodes[0].attrs.level).toBe(1)
    expect(nodes[0].content[0].text).toBe("H1")
    expect(nodes[1].attrs.level).toBe(2)
    expect(nodes[2].attrs.level).toBe(3)
  })

  it("converts paragraphs with inline formatting", () => {
    const doc = markdownToTiptapDoc("This is **bold** and *italic* text")
    const nodes = doc.content as Array<{ type: string; content: Array<{ type: string; text: string; marks?: Array<{ type: string }> }> }>
    expect(nodes).toHaveLength(1)
    expect(nodes[0].type).toBe("paragraph")
    const inline = nodes[0].content
    expect(inline[0]).toEqual({ type: "text", text: "This is " })
    expect(inline[1]).toEqual({ type: "text", text: "bold", marks: [{ type: "bold" }] })
    expect(inline[2]).toEqual({ type: "text", text: " and " })
    expect(inline[3]).toEqual({ type: "text", text: "italic", marks: [{ type: "italic" }] })
    expect(inline[4]).toEqual({ type: "text", text: " text" })
  })

  it("converts inline code", () => {
    const doc = markdownToTiptapDoc("Use `markdownToHtml` here")
    const nodes = doc.content as Array<{ type: string; content: Array<{ text: string; marks?: Array<{ type: string }> }> }>
    const inline = nodes[0].content
    expect(inline[1]).toEqual({ type: "text", text: "markdownToHtml", marks: [{ type: "code" }] })
  })

  it("converts links", () => {
    const doc = markdownToTiptapDoc("Visit [Google](https://google.com) now")
    const nodes = doc.content as Array<{ type: string; content: Array<{ text: string; marks?: Array<{ type: string; attrs?: Record<string, unknown> }> }> }>
    const link = nodes[0].content[1]
    expect(link.text).toBe("Google")
    expect(link.marks?.[0]).toEqual({ type: "link", attrs: { href: "https://google.com" } })
  })

  it("converts bullet lists", () => {
    const doc = markdownToTiptapDoc("- Item 1\n- Item 2\n- Item 3")
    const nodes = doc.content as Array<{ type: string; content: Array<{ type: string }> }>
    expect(nodes).toHaveLength(1)
    expect(nodes[0].type).toBe("bulletList")
    expect(nodes[0].content).toHaveLength(3)
    expect(nodes[0].content[0].type).toBe("listItem")
  })

  it("converts ordered lists", () => {
    const doc = markdownToTiptapDoc("1. First\n2. Second")
    const nodes = doc.content as Array<{ type: string; content: Array<{ type: string }> }>
    expect(nodes[0].type).toBe("orderedList")
    expect(nodes[0].content).toHaveLength(2)
  })

  it("converts blockquotes", () => {
    const doc = markdownToTiptapDoc("> Quoted text")
    const nodes = doc.content as Array<{ type: string; content: Array<{ type: string }> }>
    expect(nodes[0].type).toBe("blockquote")
    expect(nodes[0].content[0].type).toBe("paragraph")
  })

  it("converts code blocks with language", () => {
    const doc = markdownToTiptapDoc("```python\nprint('hello')\n```")
    const nodes = doc.content as Array<{ type: string; attrs: { language: string }; content: Array<{ text: string }> }>
    expect(nodes[0].type).toBe("codeBlock")
    expect(nodes[0].attrs.language).toBe("python")
    expect(nodes[0].content[0].text).toBe("print('hello')")
  })

  it("converts genui code blocks to genuiBlock nodes", () => {
    const genui = JSON.stringify({ type: "table", props: { columns: ["A"], data: [{ A: "1" }] } })
    const doc = markdownToTiptapDoc(`\`\`\`genui\n${genui}\n\`\`\``)
    const nodes = doc.content as Array<{ type: string; attrs: { code: string } }>
    expect(nodes[0].type).toBe("genuiBlock")
    expect(nodes[0].attrs.code).toBe(genui)
  })

  it("converts horizontal rules", () => {
    const doc = markdownToTiptapDoc("---")
    const nodes = doc.content as Array<{ type: string }>
    expect(nodes[0].type).toBe("horizontalRule")
  })

  it("handles mixed content correctly", () => {
    const md = [
      "# Title",
      "",
      "A paragraph with **bold**.",
      "",
      "- List item 1",
      "- List item 2",
      "",
      "## Subtitle",
      "",
      "Another paragraph.",
    ].join("\n")

    const doc = markdownToTiptapDoc(md)
    const types = (doc.content as Array<{ type: string }>).map((n) => n.type)
    expect(types).toEqual(["heading", "paragraph", "bulletList", "heading", "paragraph"])
  })

  it("returns a doc with at least one node for empty input", () => {
    const doc = markdownToTiptapDoc("")
    expect(doc.type).toBe("doc")
    expect((doc.content as Array<{ type: string }>).length).toBeGreaterThanOrEqual(1)
  })
})
