"use client";

/**
 * @file 笔记本工作区
 * @description 笔记本详情页的核心布局组件，组合编辑器、Copilot 面板、来源面板、
 *              目录、导入对话框等子组件。管理面板间的联动交互和数据流。
 */

import type { Editor } from "@tiptap/react";
import { AnimatePresence, m } from "framer-motion";
import { useTranslations } from "next-intl";
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { CopilotPanel, DEFAULT_WIDTH } from "@/features/copilot/copilot-panel";
import { FloatingOrb } from "@/features/copilot/floating-orb";
import { NoteEditor } from "@/features/editor/note-editor";
import { NotebookHeader } from "@/features/notebook/notebook-header";
import { NotebookTOC } from "@/features/notebook/notebook-toc";
import { ImportSourceDialog } from "@/features/source/import-source-dialog";
import { SourceDetailDrawer } from "@/features/source/source-detail-drawer";
import { SourcesPanel } from "@/features/source/sources-panel";
import { useNotebookStore } from "@/store/use-notebook-store";
import { useProactiveStore } from "@/store/use-proactive-store";
import { useUiStore } from "@/store/use-ui-store";
import { getWritingContext } from "@/services/ai-service";
import { getSources } from "@/services/source-service";
import { useMarkdownWorker } from "@/hooks/use-markdown-worker";
import type { Message, MindMapData } from "@/types";

const ACTION_PROMPT_KEYS: Record<string, string> = {
  ask: "selectionExplain",
  polish: "selectionRewrite",
  shorten: "selectionCondense",
};

export function NotebookWorkspace({
  notebookId,
  title,
  initialMessages,
  isNew = false,
}: {
  notebookId: string;
  title: string;
  initialMessages: Message[];
  isNew?: boolean;
}) {
  const tNotebook = useTranslations("notebook");
  const setImportDialogOpen = useUiStore((state) => state.setImportDialogOpen);
  const activeSourceId = useNotebookStore((state) => state.activeSourceId);
  const setActiveSourceId = useNotebookStore((state) => state.setActiveSourceId);
  const [copilotOpen, setCopilotOpen] = useState(true);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  // Direct DOM ref for the CopilotPanel wrapper — updated on every spring tick
  // so there is only ONE spring driving the layout (no double-spring jitter).
  const copilotWrapperRef = useRef<HTMLDivElement>(null);
  const handleCopilotWidthChange = useCallback((w: number) => {
    if (copilotWrapperRef.current) copilotWrapperRef.current.style.width = `${w}px`;
  }, []);

  // Fetch sources so we can resolve activeSourceId → Source object for the drawer
  const { data: sources = [] } = useQuery({
    queryKey: ["sources", notebookId],
    queryFn: () => getSources(notebookId),
  });
  const activeSource = sources.find((s) => s.id === activeSourceId) ?? null;
  const [pendingQuote, setPendingQuote] = useState<{ text: string; key: number } | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<{ text: string; key: number } | null>(null);

  useEffect(() => {
    // Check sessionStorage for the "new notebook" signal set by notebooks-view
    const key = `notebook-new:${notebookId}`;
    const isNewFromSession = typeof window !== "undefined" && sessionStorage.getItem(key) === "1";
    if (isNew || isNewFromSession) {
      setImportDialogOpen(true);
      if (isNewFromSession) sessionStorage.removeItem(key);
    }
  }, [isNew, notebookId, setImportDialogOpen]);

  // Bridge: hold a reference to the Tiptap editor instance
  // Also keep it as state so TOC and other consumers can re-render on change
  const editorRef = useRef<Editor | null>(null);
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);
  const [noteRefreshKey, setNoteRefreshKey] = useState(0);
  const convertMarkdown = useMarkdownWorker();

  const handleEditorReady = useCallback((editor: Editor) => {
    editorRef.current = editor;
    setEditorInstance(editor);
  }, []);

  const handleAskAI = useCallback((text: string, action: string) => {
    setCopilotOpen(true);
    if (action === "ask") {
      setPendingQuote({ text, key: Date.now() });
    } else {
      const promptKey = ACTION_PROMPT_KEYS[action] ?? ACTION_PROMPT_KEYS.ask;
      setPendingPrompt({ text: tNotebook(promptKey, { text }), key: Date.now() });
    }
  }, [tNotebook]);

  const handleInsertToEditor = useCallback(async (content: string) => {
    const html = await convertMarkdown(content);
    editorRef.current?.chain().focus().insertContent(html).run();
  }, [convertMarkdown]);

  const handleInsertMindMap = useCallback((data: MindMapData) => {
    editorRef.current
      ?.chain()
      .focus()
      .insertContent({
        type: "mindMap",
        attrs: { data: JSON.stringify(data) },
      })
      .run();
  }, []);

  const getEditorContext = useCallback(() => {
    return editorRef.current?.getText() ?? "";
  }, []);

  // ── Debounced writing context: fetch related chunks as user writes ──
  const setWritingContext = useProactiveStore((s) => s.setWritingContext);
  const writingContextTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWritingContextRef = useRef("");

  useEffect(() => {
    if (!editorInstance) return;

    const handleUpdate = () => {
      if (writingContextTimerRef.current) clearTimeout(writingContextTimerRef.current);

      writingContextTimerRef.current = setTimeout(() => {
        const text = editorInstance.getText();
        const cursor = editorInstance.state.selection.from;
        const contextSlice = text.slice(Math.max(0, cursor - 300), cursor + 200);

        if (contextSlice.length < 50) return;
        if (Math.abs(contextSlice.length - lastWritingContextRef.current.length) < 50
            && contextSlice.slice(0, 100) === lastWritingContextRef.current.slice(0, 100)) {
          return;
        }
        lastWritingContextRef.current = contextSlice;

        getWritingContext(notebookId, contextSlice)
          .then((chunks) => setWritingContext(chunks))
          .catch(() => {});
      }, 30_000);
    };

    editorInstance.on("update", handleUpdate);
    return () => {
      editorInstance.off("update", handleUpdate);
      if (writingContextTimerRef.current) clearTimeout(writingContextTimerRef.current);
    };
  }, [editorInstance, notebookId, setWritingContext]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <NotebookHeader
        title={title}
        sourcesOpen={sourcesOpen}
        onToggleSources={() => setSourcesOpen((v) => !v)}
      />
      <ImportSourceDialog notebookId={notebookId} />

      <div className="relative flex flex-1 overflow-hidden">
        <AnimatePresence initial={false}>
          {sourcesOpen && (
            <m.div
              key="sources"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 260, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30, mass: 0.8 }}
              className="h-full flex-shrink-0 overflow-hidden"
            >
              <SourcesPanel
                notebookId={notebookId}
                onClose={() => {
                  setSourcesOpen(false);
                  setActiveSourceId(null);
                }}
              />
            </m.div>
          )}
        </AnimatePresence>

        <NoteEditor
          notebookId={notebookId}
          onEditorReady={handleEditorReady}
          onAskAI={handleAskAI}
          refreshKey={noteRefreshKey}
        />

        {/*
         * CopilotPanel is ALWAYS mounted so scroll position and state are
         * preserved across open/close. A m.div wrapper animates the
         * layout width (0 ↔ panel width) so the flex layout shrinks/expands
         * smoothly toward the right edge — no position:fixed tricks.
         */}
        {/*
         * Plain div — no Framer Motion spring here.
         * CopilotPanel owns the ONE spring; onWidthChange writes the width
         * directly to this div's style on every tick so layout & visual stay
         * perfectly in sync. The right edge never moves.
         */}
        <div
          ref={copilotWrapperRef}
          className="h-full flex-shrink-0"
          style={{
            width: DEFAULT_WIDTH,
            pointerEvents: copilotOpen ? "auto" : "none",
          }}
        >
          <CopilotPanel
            notebookId={notebookId}
            initialMessages={initialMessages}
            isOpen={copilotOpen}
            onClose={() => setCopilotOpen(false)}
            onInsertToEditor={handleInsertToEditor}
            onInsertMindMap={handleInsertMindMap}
            onWidthChange={handleCopilotWidthChange}
            onNoteCreated={() => setNoteRefreshKey((k) => k + 1)}
            pendingPrompt={pendingPrompt}
            pendingQuote={pendingQuote}
            getEditorContext={getEditorContext}
          />
        </div>

        {/* TOC — shrinks/expands toward the right edge with the same spring */}
        <AnimatePresence initial={false}>
          {!copilotOpen && (
            <m.div
              key="toc"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 180, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{
                width: { type: "spring", stiffness: 320, damping: 32, mass: 0.8 },
                opacity: { duration: 0.22, ease: "easeInOut" },
              }}
              className="h-full flex-shrink-0 overflow-hidden"
            >
              <NotebookTOC editor={editorInstance} />
            </m.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {!copilotOpen && (
            <FloatingOrb onClick={() => setCopilotOpen(true)} />
          )}
        </AnimatePresence>

        {/* ── Source detail drawer — portal-based, self-animated ─────────── */}
        <SourceDetailDrawer
          source={activeSource}
          onClose={() => startTransition(() => setActiveSourceId(null))}
        />
      </div>
    </div>
  );
}
