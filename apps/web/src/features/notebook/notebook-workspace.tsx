"use client";

/**
 * @file 笔记本工作区
 * @description 笔记本详情页的核心布局组件，组合编辑器、Copilot 面板、来源面板、
 *              目录、导入对话框等子组件。管理面板间的联动交互和数据流。
 */

import type { Editor } from "@tiptap/react";
import { AnimatePresence, m } from "framer-motion";
import { Library, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useMediaQuery } from "@/hooks/use-media-query";
import { CopilotPanel, DEFAULT_WIDTH } from "@/features/copilot/copilot-panel";
import { FloatingOrb } from "@/features/copilot/floating-orb";
import { NoteEditor } from "@/features/editor/note-editor";
import type { EditorActionRequest } from "@/features/editor/editor-actions";
import { NotebookTopBar } from "@/features/notebook/notebook-header";
import type { SaveStatus } from "@/features/notebook/notebook-header";
import { MobileWorkspaceSheet } from "@/features/notebook/mobile-workspace-sheet";
import type { MobileCopilotSnap, MobileWorkspaceSheetKey } from "@/features/notebook/mobile-workspace-sheet";
import { RelevantSourcesView } from "@/features/copilot/relevant-sources-view";
import { NotebookTOC } from "@/features/notebook/notebook-toc";
import { FloatingTOC } from "@/features/notebook/floating-toc";
import { ProactiveToaster } from "@/features/copilot/proactive-toaster";
import { ImportSourceDialog } from "@/features/source/import-source-dialog";
import { SourceDetailDrawer } from "@/features/source/source-detail-drawer";
import { SourcesPanel } from "@/features/source/sources-panel";
import { useNotebookStore } from "@/store/use-notebook-store";
import { useProactiveStore } from "@/store/use-proactive-store";
import { useUiStore } from "@/store/use-ui-store";
import { getWritingContext } from "@/services/ai-service";
import { getSources } from "@/services/source-service";
import { getRelatedKnowledge, type CrossNotebookChunk } from "@/services/ai-service";
import { listNotes } from "@/services/note-service";
import type { NoteRecord } from "@/services/note-service";
import { useMarkdownWorker } from "@/hooks/use-markdown-worker";
import { cn } from "@/lib/utils";
import type { Message, MindMapData } from "@/types";

export type CopilotMode = "docked" | "floating";

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
  const setMobileHeaderMode = useUiStore((state) => state.setMobileHeaderMode);
  const activeSourceId = useNotebookStore((state) => state.activeSourceId);
  const setActiveSourceId = useNotebookStore((state) => state.setActiveSourceId);
  const setCopilotPanelOpen = useNotebookStore((state) => state.setCopilotPanelOpen);
  const { matches: isMobile, ready: mediaReady } = useMediaQuery("(max-width: 767px)");
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [copilotMode, setCopilotMode] = useState<CopilotMode>("floating");
  const [mobileActiveSheet, setMobileActiveSheet] = useState<MobileWorkspaceSheetKey>("none");
  const [mobileCopilotSnap, setMobileCopilotSnap] = useState<MobileCopilotSnap>("half");
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const [notebookTitle, setNotebookTitle] = useState(title);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Hydrate copilot state from localStorage after mount to avoid SSR mismatch
  useEffect(() => {
    if (!mediaReady || isMobile) return;
    const storedMode = localStorage.getItem("lyra:copilot-mode") as CopilotMode | null;
    if (storedMode === "floating" || storedMode === "docked") {
      setCopilotMode(storedMode);
    }
    const storedOpen = localStorage.getItem("lyra:copilot-open");
    if (storedOpen === "true") {
      setCopilotOpen(true);
    }
  }, [isMobile, mediaReady]);

  useEffect(() => {
    if (isMobile) {
      setCopilotOpen(false);
      setSourcesOpen(false);
      setIsFullscreen(false);
      setMobileActiveSheet("none");
    }
  }, [isMobile]);

  useEffect(() => {
    setMobileHeaderMode(isMobile ? "hidden" : "default");
    return () => setMobileHeaderMode("default");
  }, [isMobile, setMobileHeaderMode]);

  useEffect(() => {
    const open = isMobile ? mobileActiveSheet === "copilot" : copilotOpen;
    setCopilotPanelOpen(open);
  }, [copilotOpen, isMobile, mobileActiveSheet, setCopilotPanelOpen]);

  useEffect(() => () => setCopilotPanelOpen(false), [setCopilotPanelOpen]);

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
  const [charCount, setCharCount] = useState(0);
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

  const handleEditorNoteTitleChange = useCallback((next: string) => {
    setActiveNoteTitle(next.length ? next : null);
  }, []);

  const handleNoteSaved = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["notes", notebookId] });
  }, [notebookId, queryClient]);

  const handleEditorReady = useCallback((editor: Editor) => {
    editorRef.current = editor;
    setEditorInstance(editor);
    // Initialize char count
    setCharCount(editor.storage.characterCount?.characters?.() ?? 0);
    editor.on("update", () => {
      setCharCount(editor.storage.characterCount?.characters?.() ?? 0);
    });
  }, []);

  const handleEditorAction = useCallback((payload: EditorActionRequest) => {
    if (isMobile) {
      setMobileActiveSheet("copilot");
    } else {
      setCopilotOpen(true);
    }
    if (payload.action === "askCopilot") {
      setPendingQuote({ text: payload.text, key: Date.now() });
      return;
    }

    if (payload.action === "customEdit") {
      setPendingPrompt({
        text: tNotebook("customEditPrompt", {
          text: payload.text,
          intent: payload.intent ?? "",
        }),
        key: Date.now(),
      });
      return;
    }

    const promptByAction: Partial<Record<EditorActionRequest["action"], string>> = {
      explain: tNotebook("selectionExplain", { text: payload.text }),
      continue: tNotebook("continueWritingPrompt"),
      summarize: tNotebook("summarizeSourcesPrompt"),
      comment: tNotebook("selectionExplain", { text: payload.text }),
      editSuggestion: tNotebook("selectionExplain", { text: payload.text }),
    };

    setPendingPrompt({
      text: promptByAction[payload.action] ?? tNotebook("selectionExplain", { text: payload.text }),
      key: Date.now(),
    });
  }, [isMobile, tNotebook]);

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

  const handleMobileSheetChange = useCallback((sheet: MobileWorkspaceSheetKey) => {
    setMobileActiveSheet(sheet);
    if (sheet !== "sources") {
      startTransition(() => setActiveSourceId(null));
    }
    if (sheet === "copilot") {
      setMobileCopilotSnap("half");
    }
  }, [setActiveSourceId]);

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
    <div
      ref={containerRef}
      className="flex h-full flex-col overflow-hidden dark:border border-border/40"
      data-testid="notebook-workspace"
    >
      <ImportSourceDialog notebookId={notebookId} />
      
      <ProactiveToaster
        onAsk={(text) => {
          setCopilotOpen(true);
          setPendingPrompt({ text, key: Date.now() });
        }}
      />

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
        isMobile={isMobile}
        mobileActiveSheet={mobileActiveSheet}
        onMobileSheetChange={handleMobileSheetChange}
        charCount={charCount}
      />

      <div className="relative flex flex-1 overflow-hidden" data-testid="notebook-workspace-main">
        <AnimatePresence initial={false}>
          {!isMobile && !isFullscreen && sourcesOpen && (
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
            onEditorAction={handleEditorAction}
            onSaveStatusChange={setSaveStatus}
            onActiveNoteTitleChange={handleEditorNoteTitleChange}
            onNoteSaved={handleNoteSaved}
            refreshKey={noteRefreshKey}
            onToggleSources={() => setSourcesOpen((v) => !v)}
            sourcesOpen={sourcesOpen}
            wideLayout={isFullscreen}
            isMobileLayout={isMobile}
          />


          {!isMobile && isFullscreen && <FloatingTOC editor={editorInstance} />}
        </div>

        {/*
         * 占位 div — 侧边栏模式时在 flex 布局中保留宽度空间。
         * CopilotPanel 永远 position:fixed，不参与 flex 排列，
         * 故两者分离：占位控制布局，面板控制视觉位置。
         */}
        {!isMobile && (
          <m.div
            className="h-full flex-shrink-0"
            animate={{ width: showCopilotInFlow ? panelWidth : 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 32, mass: 0.75 }}
            style={{ pointerEvents: "none", overflow: "hidden" }}
          />
        )}

        {!isMobile && !isFullscreen && (
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
          {!isMobile && !isFullscreen && !showCopilotInFlow && (
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
          {!isMobile && !isFullscreen && !copilotOpen && (
            <FloatingOrb onClick={() => setCopilotOpen(true)} />
          )}
        </AnimatePresence>

        {/* Floating sources toggle */}
        {!isMobile && !isFullscreen && (
          <m.button
            key="sources-toggle"
            type="button"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setSourcesOpen((v) => !v)}
            title={tNotebook("tabSources")}
            className={cn(
              "absolute bottom-6 left-6 z-20 flex h-10 w-10 items-center justify-center rounded-full border shadow-xl backdrop-blur-md transition-all duration-300",
              sourcesOpen
                ? "border-primary/40 bg-primary/10 text-primary ring-4 ring-primary/5"
                : "border-border/30 bg-card/60 text-muted-foreground/50 hover:border-border/60 hover:text-foreground hover:shadow-primary/5",
            )}
          >
            <m.div
              animate={{ rotate: sourcesOpen ? 90 : 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 20 }}
            >
              <Library size={18} strokeWidth={2.2} />
            </m.div>

            {/* Numeric Badge */}
            {sources.length > 0 && (
              <m.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground shadow-sm ring-2 ring-background/50"
              >
                {sources.length > 9 ? "9+" : sources.length}
              </m.div>
            )}
          </m.button>
        )}

        {isMobile && (
          <MobileWorkspaceSheet
            activeSheet={mobileActiveSheet}
            copilotSnap={mobileCopilotSnap}
            onClose={() => handleMobileSheetChange("none")}
            onSnapChange={setMobileCopilotSnap}
          >
            <div className={cn("h-full", mobileActiveSheet === "sources" ? "block" : "hidden")}>
              <SourcesPanel notebookId={notebookId} variant="sheet" />
            </div>
            <div className={cn("h-full", mobileActiveSheet === "toc" ? "block" : "hidden")}>
              <NotebookTOC
                editor={editorInstance}
                variant="sheet"
                onNavigate={() => handleMobileSheetChange("none")}
              />
            </div>
            <div className={cn("h-full min-h-0", mobileActiveSheet === "copilot" ? "block" : "hidden")}>
              <CopilotPanel
                notebookId={notebookId}
                initialMessages={initialMessages}
                isOpen={mobileActiveSheet === "copilot"}
                onClose={() => handleMobileSheetChange("none")}
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
                mode="floating"
                panelWidth={panelWidth}
                onWidthChange={setPanelWidth}
                containerTop={containerBounds.top}
                containerHeight={containerBounds.height}
                presentation="sheet"
              />
            </div>
          </MobileWorkspaceSheet>
        )}

        <SourceDetailDrawer
          source={activeSource}
          onClose={() => startTransition(() => setActiveSourceId(null))}
          presentation={isMobile ? "modal" : "side"}
        />
      </div>
    </div>
  );
}
