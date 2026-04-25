/**
 * @file 通用 Markdown 渲染组件（共享）
 * @description 基于 react-markdown + remark-gfm，支持标题、加粗、列表、代码块、表格。
 *              使用 opacity/white 工具类继承父元素文字颜色，Web 和 Desktop 通用。
 */

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { CodeBlock } from "./code-block"

export interface MarkdownRendererProps {
  content: string
  className?: string
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="mb-3 mt-6 text-xl font-bold">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2.5 mt-5 text-lg font-bold">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-2 mt-4 text-base font-semibold">{children}</h3>,
          h4: ({ children }) => <h4 className="mb-1.5 mt-3 text-sm font-semibold opacity-90">{children}</h4>,
          h5: ({ children }) => <h5 className="mb-1 mt-2.5 text-[13px] font-semibold opacity-80">{children}</h5>,
          h6: ({ children }) => <h6 className="mb-1 mt-2 text-xs font-semibold opacity-70">{children}</h6>,
          p: ({ children }) => <p className="my-1.5 leading-relaxed">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => <ul className="my-1 ml-4 list-disc space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="my-1 ml-4 list-decimal space-y-0.5">{children}</ol>,
          li: ({ children }) => <li className="my-0.5 leading-6">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-1.5 border-l-2 border-current/40 pl-3 opacity-70">{children}</blockquote>
          ),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          code: ({ children, className: cls, ...props }: any) => {
            // react-markdown v10: fenced blocks get className="language-xxx", inline code has no className
            const isInline = !cls && !("data-language" in props)
            if (isInline) {
              return (
                <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs">{children}</code>
              )
            }
            return <CodeBlock code={String(children).replace(/\n$/, "")} language={cls} />
          },
          pre: ({ children }) => <>{children}</>,
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-lg border border-white/[0.08]">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-white/[0.04]">{children}</thead>,
          tbody: ({ children }) => <tbody className="divide-y divide-white/[0.06]">{children}</tbody>,
          tr: ({ children }) => <tr className="hover:bg-white/[0.02]">{children}</tr>,
          th: ({ children }) => (
            <th className="px-3 py-2 text-left text-xs font-semibold opacity-70">{children}</th>
          ),
          td: ({ children }) => <td className="px-3 py-2 opacity-80">{children}</td>,
          a: ({ href, children }) => (
            <a
              href={href}
              className="underline underline-offset-2 hover:opacity-80"
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
