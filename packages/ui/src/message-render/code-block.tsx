/**
 * @file 代码块组件（共享）
 * @description macOS 风格标题栏 + 一键复制，供 Web 和 Desktop 共用。
 */

import { useState } from "react";
import { useMemo } from "react";
import { Check, Copy } from "lucide-react";
import { highlightCode } from "./code-highlight";

function cn(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(" ");
}

export interface CodeBlockProps {
  code: string;
  language?: string;
}

export function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const { displayLanguage, isHighlighted, rendered } = useMemo(
    () => highlightCode(code, language),
    [code, language],
  );

  function handleCopy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className="group/code my-3 overflow-hidden rounded-lg bg-[#1a1b26] shadow-lg ring-1 ring-white/[0.08]"
      data-code-language={displayLanguage}
      data-highlighted={isHighlighted ? "true" : "false"}
    >
      <div className="flex items-center gap-2 bg-[#15161e] px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        </div>
        {displayLanguage && (
          <span className="ml-1 text-[11px] font-medium text-white/30">
            {displayLanguage}
          </span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            "flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] transition-all",
            copied
              ? "text-emerald-400"
              : "text-white/25 opacity-0 hover:bg-white/5 hover:text-white/50 group-hover/code:opacity-100",
          )}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-4 font-mono text-[13px] leading-6 text-[#c0caf5]">
        <code className="block min-w-max">{rendered}</code>
      </pre>
    </div>
  );
}
