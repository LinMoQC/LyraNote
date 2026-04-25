"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";

import { ChatInput, ChatToolbar } from "@/components/chat-input";
import { AttachmentPreviewBar } from "@/components/chat-input/attachment-preview-bar";
import { useFileAttachments } from "@/hooks/use-file-attachments";
import { lyraQueryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { getConfig } from "@/services/config-service";
import { LLM_MODELS } from "@/lib/constants";
import { CHAT_TOOL_DEFS } from "@/lib/chat-tools";
import { getNotebooks } from "@/services/notebook-service";
import type { Notebook } from "@/types";

export function HomeQA({ showHint = true }: HomeQAProps) {
  const router = useRouter();
  const t = useTranslations("chat");
  const th = useTranslations("home");
  const tn = useTranslations("notebooks");
  const [value, setValue] = useState("");
  const [isDeepResearch, setIsDeepResearch] = useState(false);
  const [drMode, setDrMode] = useState<"quick" | "deep">("quick");
  const [thinkingEnabled, setThinkingEnabled] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
  const [selectedNotebook, setSelectedNotebook] = useState<Notebook | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { attachments, addFiles, removeAttachment, getServerIds, isUploading } = useFileAttachments();
  const { data: appConfig } = useQuery({
    queryKey: lyraQueryKeys.config.current(),
    queryFn: getConfig,
    staleTime: 60_000,
  });
  const currentModelId = appConfig?.llm_model ?? "";
  const isThinkingModel = LLM_MODELS.find((m) => m.value === currentModelId)?.thinking ?? false;
  const { data: notebooks = [] } = useQuery({
    queryKey: lyraQueryKeys.notebooks.list(),
    queryFn: getNotebooks,
    enabled: menuOpen,
    staleTime: 1000 * 60 * 5,
  });
  const toolItems = useMemo(
    () => CHAT_TOOL_DEFS.map((tool) => ({
      id: tool.hint,
      label: th(tool.key),
      icon: tool.icon,
    })),
    [th],
  );

  const handleToolbarFileClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleToggleDeepResearch = useCallback(() => {
    setIsDeepResearch((v) => !v);
  }, []);

  const handleToggleThinking = useCallback(() => {
    setThinkingEnabled((v) => !v);
  }, []);

  function handleSend(text: string) {
    if (isUploading) return;
    const payload: Record<string, string> = { q: text };
    payload.deep_research = isDeepResearch ? "1" : "0";
    payload.dr_mode = drMode;
    if (isThinkingModel) payload.thinking_enabled = thinkingEnabled ? "1" : "0";
    if (selectedToolId) payload.tool = selectedToolId;
    if (selectedNotebook) {
      payload.notebook = selectedNotebook.title;
      payload.notebook_id = selectedNotebook.id;
    }
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

  const aboveInput = (
    <AttachmentPreviewBar attachments={attachments} onRemove={removeAttachment} />
  );

  const toolbarLeft = (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.doc,.docx,.txt,.md,.markdown,.png,.jpg,.jpeg,.webp,text/markdown"
        className="hidden"
        onChange={handleFileSelect}
      />
      <ChatToolbar
        onFileClick={handleToolbarFileClick}
        isDeepResearch={isDeepResearch}
        onToggleDeepResearch={handleToggleDeepResearch}
        drMode={drMode}
        onDrModeChange={setDrMode}
        isThinkingModel={isThinkingModel}
        thinkingEnabled={thinkingEnabled}
        onToggleThinking={handleToggleThinking}
        onMenuOpenChange={setMenuOpen}
        tools={toolItems}
        selectedToolId={selectedToolId}
        onToolSelect={setSelectedToolId}
        toolsLabel={th("tools")}
        notebooks={notebooks}
        selectedNotebook={selectedNotebook}
        onNotebookSelect={setSelectedNotebook}
        notebookLabel={th("notebook")}
        notebookEmptyLabel={tn("empty")}
        clearNotebookLabel={th("clearNotebook")}
      />
    </>
  );

  return (
    <div className="w-full max-w-3xl 2xl:max-w-4xl">
      <ChatInput
        value={value}
        onChange={setValue}
        onSubmit={handleSend}
        placeholder={isDeepResearch ? t("deepResearchPlaceholder") : t("placeholder")}
        variant="default"
        shadow
        maxHeight={140}
        disabled={isUploading}
        accentBorder={isDeepResearch
          ? "border-amber-500/25 focus-within:border-amber-500/50 focus-within:shadow-[0_0_0_3px_rgba(245,158,11,0.08)]"
          : undefined
        }
        showHint={showHint}
        hintText={t("sendHint")}
        sendTitle={t("send")}
        cancelTitle={t("cancelGenerate")}
        toolbarLeft={toolbarLeft}
        toolbarRight={
          value.length > 0 ? (
            <span className={cn(
              "text-[11px] tabular-nums transition-colors",
              value.length > 800 ? "text-amber-400/70" : "text-muted-foreground/30"
            )}>
              {value.length}
            </span>
          ) : undefined
        }
        aboveInput={aboveInput}
        onFilePaste={(files) => addFiles(files)}
      />
    </div>
  );
}

interface HomeQAProps {
  showHint?: boolean;
}
