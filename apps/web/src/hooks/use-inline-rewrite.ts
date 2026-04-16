import { useCallback, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";

import type { InlineRewriteAction } from "@/features/editor/editor-actions";
import { rewriteSelection } from "@/services/ai-service";

export interface AppliedEdit {
  action: InlineRewriteAction;
  /** Start of the applied result in the document */
  from: number;
  /** End of the applied result in the document (from + result.length) */
  to: number;
  originalText: string;
  result: string;
}

export function useInlineRewrite(editor: Editor | null) {
  const [isRewriting, setIsRewriting] = useState(false);
  const [appliedEdit, setAppliedEdit] = useState<AppliedEdit | null>(null);
  const isRewritingRef = useRef(false);

  const runRewrite = useCallback(
    async (
      action: InlineRewriteAction,
      fromOverride?: number,
      toOverride?: number,
      originalTextOverride?: string,
    ) => {
      if (!editor || isRewritingRef.current) return;

      const from = fromOverride ?? editor.state.selection.from;
      const to = toOverride ?? editor.state.selection.to;
      const originalText =
        originalTextOverride ?? editor.state.doc.textBetween(from, to, "\n");
      if (!originalText.trim()) return;

      isRewritingRef.current = true;
      setIsRewriting(true);

      try {
        const result = await rewriteSelection(originalText, action, editor.getText());

        // Auto-apply to the editor immediately
        editor
          .chain()
          .focus()
          .deleteRange({ from, to })
          .insertContentAt(from, result)
          .run();

        setAppliedEdit({ action, from, to: from + result.length, originalText, result });
      } finally {
        isRewritingRef.current = false;
        setIsRewriting(false);
      }
    },
    [editor],
  );

  /** Keep the applied change — just dismiss the action bar */
  const acceptEdit = useCallback(() => {
    setAppliedEdit(null);
  }, []);

  /** Restore the original text and dismiss */
  const rejectEdit = useCallback(() => {
    if (!editor || !appliedEdit) return;
    editor
      .chain()
      .focus()
      .deleteRange({ from: appliedEdit.from, to: appliedEdit.to })
      .insertContentAt(appliedEdit.from, appliedEdit.originalText)
      .run();
    setAppliedEdit(null);
  }, [editor, appliedEdit]);

  /** Restore original and run the same action again */
  const retry = useCallback(async () => {
    if (!appliedEdit || !editor) return;
    // Restore original text first
    editor
      .chain()
      .focus()
      .deleteRange({ from: appliedEdit.from, to: appliedEdit.to })
      .insertContentAt(appliedEdit.from, appliedEdit.originalText)
      .run();

    const { action, from, originalText } = appliedEdit;
    setAppliedEdit(null);
    await runRewrite(action, from, from + originalText.length, originalText);
  }, [appliedEdit, editor, runRewrite]);

  return {
    isRewriting,
    appliedEdit,
    runRewrite,
    acceptEdit,
    rejectEdit,
    retry,
    lastAction: appliedEdit?.action ?? null,
  };
}
