"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FilePlus2, FileText, Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { notifyError } from "@/lib/notify";
import { lyraQueryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { createNotebook, getNotebooks } from "@/services/notebook-service";

interface DeepResearchSaveNoteDialogProps {
  open: boolean;
  reportTitle?: string;
  onClose: () => void;
  onSelectNotebook: (notebookId: string) => Promise<void>;
}

export function DeepResearchSaveNoteDialog({
  open,
  reportTitle,
  onClose,
  onSelectNotebook,
}: DeepResearchSaveNoteDialogProps) {
  const t = useTranslations("deepResearch");
  const tn = useTranslations("notebooks");
  const th = useTranslations("home");
  const tc = useTranslations("common");
  const queryClient = useQueryClient();

  const [createMode, setCreateMode] = useState(false);
  const [newNotebookTitle, setNewNotebookTitle] = useState("");
  const [savingNotebookId, setSavingNotebookId] = useState<string | null>(null);

  const { data: notebooks = [], isLoading } = useQuery({
    queryKey: lyraQueryKeys.notebooks.list(),
    queryFn: getNotebooks,
    enabled: open,
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (!open) {
      setCreateMode(false);
      setNewNotebookTitle("");
      setSavingNotebookId(null);
    }
  }, [open]);

  const showCreateMode = createMode || (!isLoading && notebooks.length === 0);
  const isBusy = savingNotebookId !== null;

  const createNotebookMutation = useMutation({
    mutationFn: async (title: string) => createNotebook(title),
    onError: () => {
      notifyError(tc("saveFailed"));
    },
  });

  const targetTitle = reportTitle?.trim() || t("reportLabel");

  const dialogDescription = useMemo(() => (
    t("saveTargetDesc", { title: targetTitle })
  ), [t, targetTitle]);

  async function handleSelectNotebook(notebookId: string) {
    setSavingNotebookId(notebookId);
    try {
      await onSelectNotebook(notebookId);
    } finally {
      setSavingNotebookId(null);
    }
  }

  async function handleCreateNotebookAndSave() {
    const title = newNotebookTitle.trim();
    if (!title) return;

    const notebook = await createNotebookMutation.mutateAsync(title);
    await queryClient.invalidateQueries({ queryKey: lyraQueryKeys.notebooks.list() });
    await handleSelectNotebook(notebook.id);
  }

  return (
    <Dialog
      open={open}
      title={t("saveTargetTitle")}
      description={dialogDescription}
      onClose={isBusy || createNotebookMutation.isPending ? undefined : onClose}
      className="max-w-xl"
    >
      {showCreateMode ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border/50 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
            {notebooks.length === 0 ? t("saveTargetEmpty") : t("saveTargetCreateHint")}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor="dr-save-note-notebook-title">
              {t("newNotebookName")}
            </label>
            <Input
              id="dr-save-note-notebook-title"
              value={newNotebookTitle}
              onChange={(event) => setNewNotebookTitle(event.target.value)}
              placeholder={tn("dialog.namePlaceholder")}
              disabled={isBusy || createNotebookMutation.isPending}
            />
          </div>

          <div className="flex items-center justify-end gap-3">
            {notebooks.length > 0 ? (
              <Button
                variant="ghost"
                onClick={() => setCreateMode(false)}
                disabled={isBusy || createNotebookMutation.isPending}
              >
                {t("backToNotebookList")}
              </Button>
            ) : (
              <Button
                variant="ghost"
                onClick={onClose}
                disabled={isBusy || createNotebookMutation.isPending}
              >
                {tn("dialog.cancel")}
              </Button>
            )}
            <Button
              onClick={() => void handleCreateNotebookAndSave()}
              disabled={!newNotebookTitle.trim() || isBusy || createNotebookMutation.isPending}
            >
              {createNotebookMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <FilePlus2 size={14} />}
              {createNotebookMutation.isPending ? t("creatingNotebookAndSave") : t("createNotebookAndSave")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            {isLoading ? (
              <div className="flex items-center gap-2 rounded-2xl border border-border/50 bg-muted/20 px-4 py-4 text-sm text-muted-foreground">
                <Loader2 size={14} className="animate-spin" />
                {t("loadingNotebookOptions")}
              </div>
            ) : (
              notebooks.map((notebook) => {
                const isSavingThisNotebook = savingNotebookId === notebook.id;
                return (
                  <button
                    key={notebook.id}
                    type="button"
                    onClick={() => void handleSelectNotebook(notebook.id)}
                    disabled={isBusy || createNotebookMutation.isPending}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-border/50 bg-muted/15 px-4 py-3 text-left transition-colors hover:border-border/80 hover:bg-muted/30 disabled:cursor-not-allowed disabled:opacity-60",
                    )}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/12 text-blue-400">
                      {isSavingThisNotebook ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{notebook.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {th("sourcesShort", { count: notebook.sourceCount })}
                      </p>
                    </div>
                    <span className="text-xs font-medium text-primary/80">
                      {isSavingThisNotebook ? t("savingToNotebook") : t("saveToNotebook")}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              onClick={onClose}
              disabled={isBusy || createNotebookMutation.isPending}
            >
              {tn("dialog.cancel")}
            </Button>
            <Button
              variant="outline"
              onClick={() => setCreateMode(true)}
              disabled={isBusy || createNotebookMutation.isPending}
            >
              <Plus size={14} />
              {t("createNotebookAndSave")}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
