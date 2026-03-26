"use client";

/**
 * @file Mermaid 图表渲染块
 * @description 按需从 CDN 加载 Mermaid.js，将代码围栏（```mermaid）渲染为 SVG 图表，
 *              支持流式输出时的加载态、放大查看、错误降级展示，以及暗色主题适配。
 */

import { AnimatePresence, m } from "framer-motion";
import { memo, useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";

const MERMAID_CDN = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mermaidReady: Promise<any> | null = null;

function loadMermaid() {
  if (!mermaidReady) {
    mermaidReady = import(/* webpackIgnore: true */ MERMAID_CDN).then((m) => {
      const mermaid = m.default;
      mermaid.initialize({
        startOnLoad: false,
        theme: "dark",
        themeVariables: {
          primaryColor: "#6366f1",
          primaryTextColor: "#e2e8f0",
          primaryBorderColor: "#4f46e5",
          lineColor: "#64748b",
          secondaryColor: "#1e293b",
          tertiaryColor: "#0f172a",
          fontFamily: "inherit",
          fontSize: "13px",
        },
      });
      return mermaid;
    });
  }
  return mermaidReady;
}

function MermaidBlockInner({ code, isStreaming }: { code: string; isStreaming?: boolean }) {
  const t = useTranslations("genui");
  const uniqueId = useId().replace(/:/g, "_");
  const [error, setError] = useState<string | null>(null);
  const [svgHtml, setSvgHtml] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    if (isStreaming) return;
    let cancelled = false;
    loadMermaid()
      .then(async (mermaid) => {
        if (cancelled) return;
        try {
          const { svg } = await mermaid.render(`mermaid${uniqueId}`, code.trim());
          if (!cancelled) setSvgHtml(svg);
        } catch {
          if (!cancelled) setError("Diagram render failed");
        }
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load Mermaid");
      });
    return () => { cancelled = true; };
  }, [code, uniqueId, isStreaming]);

  if (isStreaming) {
    return (
      <div className="my-3 flex items-center gap-2 rounded-xl border border-border/40 bg-muted/20 px-4 py-3 text-xs text-muted-foreground/60">
        <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        {t("mermaidStreaming")}
      </div>
    );
  }

  if (error) {
    return (
      <pre className="my-2 overflow-x-auto rounded-xl bg-accent/60 p-3 font-mono text-xs leading-5">
        <code>{code}</code>
      </pre>
    );
  }

  return (
    <>
      <div
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={svgHtml ? { __html: svgHtml } : undefined}
        onClick={() => svgHtml && setZoomed(true)}
        className="group my-2 flex cursor-zoom-in justify-center overflow-x-auto rounded-xl bg-accent/30 p-4 transition-colors hover:bg-accent/50 [&_svg]:max-w-full"
      />
      <AnimatePresence>
        {zoomed && svgHtml && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[999] flex cursor-zoom-out items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => setZoomed(false)}
          >
            <m.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="max-h-[90vh] max-w-[90vw] overflow-auto rounded-2xl bg-card/95 p-6 shadow-2xl ring-1 ring-white/10 [&_svg]:max-h-[80vh] [&_svg]:max-w-full"
              onClick={(e) => e.stopPropagation()}
              dangerouslySetInnerHTML={{ __html: svgHtml }}
            />
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}

export const MermaidBlock = memo(MermaidBlockInner);
