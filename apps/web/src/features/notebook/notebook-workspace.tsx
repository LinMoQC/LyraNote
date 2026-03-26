"use client";

/**
 * @file 笔记本工作区
 * @description 笔记本详情页的核心布局组件，组合编辑器、Copilot 面板、来源面板、
 *              目录、导入对话框等子组件。管理面板间的联动交互和数据流。
 */

import type { Editor } from "@tiptap/react";
import { AnimatePresence, m } from "framer-motion";
import { Library } from "lucide-react";
import { useTranslations } from "next-intl";
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useMediaQuery } from "@/hooks/use-media-query";
import { CopilotPanel, DEFAULT_WIDTH } from "@/features/copilot/copilot-panel";
import { FloatingOrb } from "@/features/copilot/floating-orb";
import { NoteEditor } from "@/features/editor/note-editor";
import { NotebookTopBar } from "@/features/notebook/notebook-header";
import type { SaveStatus } from "@/features/notebook/notebook-header";
import { NotebookTOC } from "@/features/notebook/notebook-toc";
import { FloatingTOC } from "@/features/notebook/floating-toc";
import { ImportSourceDialog } from "@/features/source/import-source-dialog";
import { SourceDetailDrawer } from "@/features/source/source-detail-drawer";
import { SourcesPanel } from "@/features/source/sources-panel";
import { useNotebookStore } from "@/store/use-notebook-store";
import { useProactiveStore } from "@/store/use-proactive-store";
import { useUiStore } from "@/store/use-ui-store";
import { getWritingContext } from "@/services/ai-service";
import { getSources } from "@/services/source-service";
import { listNotes } from "@/services/note-service";
import type { NoteRecord } from "@/services/note-service";
import { useMarkdownWorker } from "@/hooks/use-markdown-worker";
import { cn } from "@/lib/utils";
import type { Message, MindMapData } from "@/types";

export type CopilotMode = "docked" | "floating";

const ACTION_PROMPT_KEYS: Record<string, string> = {
  ask: "selectionExplain",
  polish: "selectionRewrite",
  shorten: "selectionCondense",
  continue: "continueWritingPrompt",
  summarize: "summarizeSourcesPrompt",
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
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [copilotMode, setCopilotMode] = useState<CopilotMode>("floating");
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const [notebookTitle, setNotebookTitle] = useState(title);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Hydrate copilot state from localStorage after mount to avoid SSR mismatch
  useEffect(() => {
    const storedMode = localStorage.getItem("lyra:copilot-mode") as CopilotMode | null;
    if (storedMode === "floating" || storedMode === "docked") {
      setCopilotMode(storedMode);
    }
    const storedOpen = localStorage.getItem("lyra:copilot-open");
    if (storedOpen === "true") {
      setCopilotOpen(true);
    }
  }, []);

  useEffect(() => {
    if (isMobile) {
      setCopilotOpen(false);
      setSourcesOpen(false);
    }
  }, [isMobile]);

  useEffect(() => {
    localStorage.setItem("lyra:copilot-mode", copilotMode);
  }, [copilotMode]);

  useEffect(() => {
    localStorage.setItem("lyra:copilot-open", String(copilotOpen));
  }, [copilotOpen]);

  const editorRef = useRef<Editor | null>(null);

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
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);
  const [noteRefreshKey, setNoteRefreshKey] = useState(0);
  const convertMarkdown = useMarkdownWorker();

  // Active note state — drives both NotePickerDropdown and NoteEditor
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [activeNoteTitle, setActiveNoteTitle] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // On mount, load the first note to populate the picker
  useEffect(() => {
    if (activeNoteId !== null) return;
    listNotes(notebookId).then((notes) => {
      if (notes[0]) {
        setActiveNoteId(notes[0].id);
        setActiveNoteTitle(notes[0].title ?? null);
      }
    });
  }, [notebookId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNoteSelect = useCallback((note: NoteRecord) => {
    setActiveNoteId(note.id);
    setActiveNoteTitle(note.title ?? null);
  }, []);

  const handleNoteCreated = useCallback((note: NoteRecord) => {
    setActiveNoteId(note.id);
    setActiveNoteTitle(note.title ?? null);
    void queryClient.invalidateQueries({ queryKey: ["notes", notebookId] });
  }, [notebookId, queryClient]);

  const handleNoteDeleted = useCallback((deletedNoteId: string) => {
    void queryClient.invalidateQueries({ queryKey: ["notes", notebookId] });
    if (activeNoteId === deletedNoteId) {
      // Fall back to the next available note
      listNotes(notebookId).then((notes) => {
        const next = notes.find((n) => n.id !== deletedNoteId) ?? null;
        setActiveNoteId(next?.id ?? null);
        setActiveNoteTitle(next?.title ?? null);
      });
    }
  }, [notebookId, activeNoteId, queryClient]);

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

  const effectiveMode: CopilotMode = isMobile ? "floating" : copilotMode;
  const isDocked = effectiveMode === "docked";
  const showCopilotInFlow = !isFullscreen && isDocked && copilotOpen;

  // 测量内容区域的视口位置，让面板高度与内容区完全对齐
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerBounds, setContainerBounds] = useState({ top: 0, height: 800 });
  useEffect(() => {
    if (!containerRef.current) return;
    const update = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setContainerBounds({ top: Math.round(rect.top), height: Math.round(rect.height) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(containerRef.current);
    window.addEventListener("resize", update);
    return () => { ro.disconnect(); window.removeEventListener("resize", update); };
  }, []);

  return (
    <div ref={containerRef} className="flex h-full flex-col overflow-hidden dark:border border-border/40">
      <ImportSourceDialog notebookId={notebookId} />

      <NotebookTopBar
        notebookId={notebookId}
        title={notebookTitle}
        saveStatus={saveStatus}
        onTitleChange={setNotebookTitle}
        isFullscreen={isFullscreen}
        onToggleFullscreen={() => setIsFullscreen((v) => !v)}
        activeNoteId={activeNoteId}
        activeNoteTitle={activeNoteTitle}
        onNoteSelect={handleNoteSelect}
        onNoteCreated={handleNoteCreated}
        onNoteDeleted={handleNoteDeleted}
      />

      <div className="relative flex flex-1 overflow-hidden">
        <AnimatePresence initial={false}>
          {!isFullscreen && sourcesOpen && (
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

        <div className="relative flex flex-1 overflow-hidden">
          <NoteEditor
            notebookId={notebookId}
            noteId={activeNoteId}
            notebookTitle={notebookTitle}
            onEditorReady={handleEditorReady}
            onAskAI={handleAskAI}
            onSaveStatusChange={setSaveStatus}
            refreshKey={noteRefreshKey}
            onToggleSources={() => setSourcesOpen((v) => !v)}
            sourcesOpen={sourcesOpen}
            wideLayout={isFullscreen}
          />
          {isFullscreen && <FloatingTOC editor={editorInstance} />}
        </div>

        {/*
         * 占位 div — 侧边栏模式时在 flex 布局中保留宽度空间。
         * CopilotPanel 永远 position:fixed，不参与 flex 排列，
         * 故两者分离：占位控制布局，面板控制视觉位置。
         */}
        <m.div
          className="flex-shrink-0 h-full"
          animate={{ width: showCopilotInFlow ? panelWidth : 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 32, mass: 0.75 }}
          style={{ pointerEvents: "none", overflow: "hidden" }}
        />

        {!isFullscreen && (
          <CopilotPanel
            notebookId={notebookId}
            initialMessages={initialMessages}
            isOpen={copilotOpen}
            onClose={() => setCopilotOpen(false)}
            onInsertToEditor={handleInsertToEditor}
            onInsertMindMap={handleInsertMindMap}
            onNoteCreated={(noteId, noteTitle) => {
              setActiveNoteId(noteId);
              setActiveNoteTitle(noteTitle);
              void queryClient.invalidateQueries({ queryKey: ["notes", notebookId] });
              setNoteRefreshKey((k) => k + 1);
            }}
            pendingPrompt={pendingPrompt}
            pendingQuote={pendingQuote}
            getEditorContext={getEditorContext}
            mode={effectiveMode}
            onModeChange={setCopilotMode}
            panelWidth={panelWidth}
            onWidthChange={setPanelWidth}
            containerTop={containerBounds.top}
            containerHeight={containerBounds.height}
          />
        )}

        {/* TOC — show when copilot is not taking docked space */}
        <AnimatePresence initial={false}>
          {!isFullscreen && !isMobile && !showCopilotInFlow && (
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
          {!isFullscreen && !copilotOpen && (
            <FloatingOrb onClick={() => setCopilotOpen(true)} />
          )}
        </AnimatePresence>

        {/* Floating sources toggle */}
        {!isFullscreen && (
          <button
            type="button"
            onClick={() => setSourcesOpen((v) => !v)}
            title={tNotebook("tabSources")}
            className={cn(
              "absolute bottom-6 left-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border shadow-sm backdrop-blur-sm transition-all",
              sourcesOpen
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border/30 bg-card/80 text-muted-foreground/50 hover:text-foreground hover:border-border/60"
            )}
          >
            <Library size={15} />
          </button>
        )}

        <SourceDetailDrawer
          source={activeSource}
          onClose={() => startTransition(() => setActiveSourceId(null))}
        />
      </div>
    </div>
  );
}
