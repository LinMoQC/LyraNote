"use client";

import {
  ChevronDown,
  ChevronUp,
  FileSearch,
  FileText,
  GitCompare,
  Lightbulb,
  List,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ChatInput } from "@/components/chat-input";
import { AttachmentPreviewBar } from "@/components/chat-input/attachment-preview-bar";
import { NotebookPicker, type NotebookPickerHandle } from "@/components/chat-input/notebook-picker";
import { useFileAttachments } from "@/hooks/use-file-attachments";
import { cn } from "@/lib/utils";
import type { Notebook } from "@/types";

const TOOL_DEFS = [
  { key: "toolSummarize", hint: "summarize", icon: FileText },
  { key: "toolInsights", hint: "insights", icon: Lightbulb },
  { key: "toolOutline", hint: "outline", icon: List },
  { key: "toolDeepRead", hint: "deep_read", icon: FileSearch },
  { key: "toolCompare", hint: "compare", icon: GitCompare },
] as const;

export function HomeQA() {
  const router = useRouter();
  const t = useTranslations("home");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [selectedTool, setSelectedTool] = useState<(typeof TOOL_DEFS)[number] | null>(null);
  const [selectedNotebook, setSelectedNotebook] = useState<Notebook | null>(null);
  const [value, setValue] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const notebookPickerRef = useRef<NotebookPickerHandle>(null);

  const { attachments, addFiles, removeAttachment, getServerIds, isUploading } = useFileAttachments();

  function handleSend(text: string) {
    if (isUploading) return;
    const payload: Record<string, string> = { q: text };
    if (selectedTool) payload.tool = selectedTool.hint;
    if (selectedNotebook) payload.notebook = selectedNotebook.title;
    const ids = getServerIds();
    if (ids.length > 0) {
      payload.attachments = ids.join(",");
      const meta = attachments
        .filter((a) => a.status === "done" && a.serverId)
        .map((a) => ({ id: a.serverId!, name: a.file.name, type: a.file.type }));
      try { sessionStorage.setItem("pending-attachments", JSON.stringify(meta)); } catch { /* ignore */ }
    }
    try { sessionStorage.setItem("pending-chat-query", JSON.stringify(payload)); } catch { /* ignore */ }
    router.push("/app/chat");
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
    }
    e.target.value = "";
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setToolsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const aboveInput = (
    <AttachmentPreviewBar attachments={attachments} onRemove={removeAttachment} />
  );

  const toolbarLeft = (
    <div className="flex items-center gap-1.5">
      {/* Upload button */}
      <button
        className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/60 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        type="button"
        onClick={() => fileInputRef.current?.click()}
        title={t("uploadFile")}
      >
        <Plus size={13} />
      </button>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.webp"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Tools dropdown */}
      <div className="relative" ref={dropdownRef}>
        <div
          className={cn(
            "absolute bottom-full left-0 z-20 mb-2 w-52 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-xl",
            "origin-bottom transition-all duration-200 ease-out",
            toolsOpen
              ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
              : "pointer-events-none translate-y-1 scale-95 opacity-0",
          )}
        >
          <p className="px-4 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("tools")}
          </p>
          {TOOL_DEFS.map((tool) => (
            <button
              key={tool.hint}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-foreground/80 transition-colors hover:bg-accent/60 hover:text-foreground"
              onClick={() => {
                setSelectedTool(tool);
                setToolsOpen(false);
              }}
              type="button"
            >
              <tool.icon className="text-muted-foreground" size={15} />
              {t(tool.key)}
            </button>
          ))}
        </div>

        <button
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
            toolsOpen || selectedTool
              ? "bg-accent text-foreground"
              : "bg-accent/60 text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
          onClick={() => setToolsOpen((v) => !v)}
          type="button"
        >
          <Sparkles size={11} />
          {selectedTool ? t(selectedTool.key) : t("tools")}
          {selectedTool ? (
            <X
              className="ml-0.5"
              size={10}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedTool(null);
              }}
            />
          ) : toolsOpen ? (
            <ChevronUp size={10} />
          ) : (
            <ChevronDown size={10} />
          )}
        </button>
      </div>

      {/* Notebook picker */}
      <NotebookPicker ref={notebookPickerRef} selected={selectedNotebook} onSelect={setSelectedNotebook} />
    </div>
  );

  return (
    <div className="w-full max-w-2xl">
      <ChatInput
        value={value}
        onChange={setValue}
        onSubmit={handleSend}
        placeholder={t("qaPlaceholder")}
        variant="default"
        shadow
        maxHeight={220}
        disabled={isUploading}
        toolbarLeft={toolbarLeft}
        aboveInput={aboveInput}
        onFilePaste={(files) => addFiles(files)}
        onAtTrigger={() => notebookPickerRef.current?.open()}
      />
    </div>
  );
}
