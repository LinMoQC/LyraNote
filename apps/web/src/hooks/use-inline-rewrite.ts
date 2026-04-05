import { useCallback, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";

import type { InlineRewriteAction } from "@/features/editor/editor-actions";
import { rewriteSelection } from "@/services/ai-service";

interface RewritePreview {
  action: InlineRewriteAction;
  from: number;
  to: number;
  originalText: string;
  result: string;
}

export function useInlineRewrite(editor: Editor | null) {
  const [isRewriting, setIsRewriting] = useState(false);
  const [preview, setPreview] = useState<RewritePreview | null>(null);
  const requestRef = useRef<{ action: InlineRewriteAction; originalText: string } | null>(null);

  const runRewrite = useCallback(async (action: InlineRewriteAction) => {
    if (!editor || isRewriting) return;

    const { from, to } = editor.state.selection;
    const originalText = editor.state.doc.textBetween(from, to, "\n");
    if (!originalText.trim()) return;

    setIsRewriting(true);
    requestRef.current = { action, originalText };

    try {
      const result = await rewriteSelection(originalText, action, editor.getText());
      setPreview({
        action,
        from,
        to,
        originalText,
        result,
      });
    } finally {
      setIsRewriting(false);
    }
  }, [editor, isRewriting]);

  const applyPreview = useCallback(() => {
    if (!editor || !preview) return;

    editor
      .chain()
      .focus()
      .deleteRange({ from: preview.from, to: preview.to })
      .insertContentAt(preview.from, preview.result)
      .setTextSelection(preview.from + preview.result.length)
      .run();

    setPreview(null);
  }, [editor, preview]);

  const retry = useCallback(async () => {
    if (!preview) return;
    await runRewrite(preview.action);
  }, [preview, runRewrite]);

  const cancel = useCallback(() => {
    setPreview(null);
  }, []);

  return {
    isRewriting,
    preview,
    runRewrite,
    applyPreview,
    retry,
    cancel,
    lastAction: requestRef.current?.action ?? null,
  };
}
