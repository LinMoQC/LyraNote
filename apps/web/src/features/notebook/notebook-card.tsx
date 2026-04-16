"use client";

/**
 * @file 笔记本卡片组件
 * @description 提供卡片视图（NotebookCard）和列表行视图（NotebookListRow）两种展示模式，
 *              支持重命名、删除、发布/取消发布等操作。使用 React.memo 优化列表渲染。
 */

import { BookOpen, FileText, Globe, GlobeLock, Hash, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { deleteNotebook, publishNotebook, unpublishNotebook, updateNotebook } from "@/services/notebook-service";
import type { Notebook } from "@/types";
import { formatDate } from "@/utils/format-date";
import { useTranslations } from "next-intl";
import {
  NOTEBOOK_ICONS,
  getNotebookIcon,
  pickDefaultIcon,
} from "./notebook-icons";

// ── Hover dropdown (··· → rename / delete) ───────────────────────────────────

function NotebookMenu({
  isPublic,
  onRename,
  onDelete,
  onTogglePublish,
}: {
  isPublic?: boolean;
  onRename: () => void;
  onDelete: () => void;
  onTogglePublish: () => void;
}) {
  const t = useTranslations("notebook");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [open]);

  function show() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  }
  function hide() {
    closeTimer.current = setTimeout(() => setOpen(false), 130);
  }

  return (
    <div
      ref={menuRef}
      className="absolute right-1.5 top-1.5 z-10 sm:right-2 sm:top-2"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/60 opacity-100 transition-all hover:bg-accent/80 hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100"
      >
        <MoreHorizontal size={16} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-8 w-36 overflow-hidden rounded-lg border border-border/40 bg-card p-1 shadow-md shadow-black/10"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] text-foreground/70 transition-colors hover:bg-accent/80 hover:text-foreground"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); onRename(); }}
          >
            <Pencil size={13} className="opacity-60" />
            {t("rename")}
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] text-foreground/70 transition-colors hover:bg-accent/80 hover:text-foreground"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); onTogglePublish(); }}
          >
            {isPublic ? (
              <>
                <GlobeLock size={13} className="opacity-60" />
                {t("unpublish")}
              </>
            ) : (
              <>
                <Globe size={13} className="opacity-60" />
                {t("publish")}
              </>
            )}
          </button>
          <div className="my-0.5 mx-2 h-px bg-accent/60" />
          <button
            type="button"
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] text-red-400/70 transition-colors hover:bg-red-500/10 hover:text-red-400"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); onDelete(); }}
          >
            <Trash2 size={13} className="opacity-70" />
            {tc("delete")}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Edit dialog (name + icon) ────────────────────────────────────────────────

function EditNotebookDialog({
  open,
  notebook,
  onClose,
  onSaved,
}: {
  open: boolean;
  notebook: Notebook;
  onClose: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(notebook.title);
  const [iconId, setIconId] = useState(() => notebook.coverEmoji || pickDefaultIcon(notebook.id));
  const [loading, setLoading] = useState(false);
  const t = useTranslations("notebook");
  const tc = useTranslations("common");

  useEffect(() => {
    if (open) {
      setName(notebook.title);
      setIconId(notebook.coverEmoji || pickDefaultIcon(notebook.id));
    }
  }, [open, notebook]);

  const PreviewIcon = getNotebookIcon(iconId);

  async function handleSave() {
    const title = name.trim();
    if (!title || loading) return;
    setLoading(true);
    try {
      await updateNotebook(notebook.id, { title, cover_emoji: iconId });
      onSaved();
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} title={t("editTitle")} onClose={onClose} className="max-w-md">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-muted/60">
            <PreviewIcon size={28} />
          </div>
          <Input
            autoFocus
            placeholder={t("editNamePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleSave(); }}
          />
        </div>

        <div className="border-t border-border/30" />

        <div>
          <p className="mb-2 text-[11px] font-medium text-muted-foreground/50 uppercase tracking-widest">
            {t("iconLabel")}
          </p>
          <div className="grid grid-cols-7 gap-1">
            {NOTEBOOK_ICONS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setIconId(item.id)}
                  className={cn(
                    "flex h-11 w-full items-center justify-center rounded-xl transition-all",
                    iconId === item.id
                      ? "bg-accent ring-1 ring-primary/30 scale-110"
                      : "hover:bg-accent/60"
                  )}
                >
                  <Icon size={22} />
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border/30 pt-1">
          <Button disabled={loading} variant="ghost" onClick={onClose}>{tc("cancel")}</Button>
          <Button disabled={!name.trim() || loading} onClick={() => void handleSave()}>
            {loading ? tc("saving") : tc("save")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

// ── Delete confirm dialog ─────────────────────────────────────────────────────

function DeleteNotebookDialog({
  open,
  notebook,
  onClose,
}: {
  open: boolean;
  notebook: Notebook;
  onClose: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const t = useTranslations("notebook");
  const tc = useTranslations("common");

  async function handleDelete() {
    if (loading) return;
    setLoading(true);
    try {
      await deleteNotebook(notebook.id);
      onClose();
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} title={t("deleteTitle")} onClose={onClose} className="max-w-sm">
      <div className="rounded-xl border border-red-500/15 bg-red-500/8 px-4 py-3">
        <p className="text-sm leading-relaxed text-foreground/80">
          {t("deleteConfirm", { name: notebook.title })}
        </p>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button disabled={loading} variant="ghost" onClick={onClose}>{tc("cancel")}</Button>
        <Button
          disabled={loading}
          onClick={() => void handleDelete()}
        >
          {loading ? tc("deleting") : tc("confirmDelete")}
        </Button>
      </div>
    </Dialog>
  );
}

// ── Grid card ─────────────────────────────────────────────────────────────────

export const NotebookCard = memo(function NotebookCard({ notebook }: { notebook: Notebook }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const t = useTranslations("notebook");

  const iconId = notebook.coverEmoji || pickDefaultIcon(notebook.id);
  const Icon = getNotebookIcon(iconId);

  async function handleTogglePublish() {
    if (notebook.isPublic) {
      await unpublishNotebook(notebook.id);
    } else {
      await publishNotebook(notebook.id);
    }
    router.refresh();
  }

  return (
    <>
      <Link href={`/app/notebooks/${notebook.id}`} className="block h-full">
        <article className="group relative flex h-full min-h-[160px] cursor-pointer flex-col overflow-hidden rounded-xl border border-border/40 bg-card shadow-sm transition-all duration-150 hover:bg-accent/30 hover:border-border/60 sm:min-h-[180px] sm:rounded-lg">
          <NotebookMenu
            isPublic={notebook.isPublic}
            onRename={() => setEditOpen(true)}
            onDelete={() => setDeleteOpen(true)}
            onTogglePublish={() => void handleTogglePublish()}
          />

          {/* Top area with icon */}
          <div className="flex items-center gap-3 px-4 pb-1 pt-4 sm:pt-3">
            <div className="flex h-8 w-8 items-center justify-center">
              <Icon size={28} className="text-foreground/90" />
            </div>
          </div>

          {/* Body */}
          <div className="flex flex-1 flex-col px-4 pb-3.5 pt-1 min-h-0">
            <div className="flex items-center gap-2 pr-6">
              <h3 className="line-clamp-1 text-[15px] font-medium text-foreground sm:text-[14px]">
                {notebook.title}
              </h3>
              {notebook.isPublic && (
                <div className="flex flex-shrink-0 items-center gap-1 rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                  <Globe size={10} />
                  {t("publishedBadge")}
                </div>
              )}
            </div>

            {notebook.summary ? (
              <p className="mt-1.5 line-clamp-2 shrink-0 text-[13px] leading-[1.5] text-muted-foreground/80 sm:text-xs">
                {notebook.summary}
              </p>
            ) : (
              <p className="mt-1.5 line-clamp-1 shrink-0 text-xs italic text-muted-foreground/40 sm:text-[11px]">{t("noSummary")}</p>
            )}

            {/* Properties */}
            <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-3 pb-0.5">
              <div className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground/60">
                <FileText size={12} className="opacity-70" />
                {t("sourceCount", { count: notebook.sourceCount })}
              </div>
              <div className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground/60">
                <BookOpen size={12} className="opacity-70" />
                {t("noteCount", { count: notebook.noteCount })}
              </div>
              <div className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground/60">
                <Hash size={12} className="opacity-70" />
                {notebook.wordCount >= 1000
                  ? t("wordCountK", { count: (notebook.wordCount / 1000).toFixed(1) })
                  : t("wordCount", { count: notebook.wordCount })}
              </div>
            </div>
          </div>
        </article>
      </Link>

      <EditNotebookDialog
        open={editOpen}
        notebook={notebook}
        onClose={() => setEditOpen(false)}
        onSaved={() => { setEditOpen(false); router.refresh(); }}
      />
      <DeleteNotebookDialog
        open={deleteOpen}
        notebook={notebook}
        onClose={() => setDeleteOpen(false)}
      />
    </>
  );
});

// ── List row ──────────────────────────────────────────────────────────────────

export const NotebookListRow = memo(function NotebookListRow({ notebook }: { notebook: Notebook }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const t = useTranslations("notebook");

  const iconId = notebook.coverEmoji || pickDefaultIcon(notebook.id);
  const Icon = getNotebookIcon(iconId);

  async function handleTogglePublish() {
    if (notebook.isPublic) {
      await unpublishNotebook(notebook.id);
    } else {
      await publishNotebook(notebook.id);
    }
    router.refresh();
  }

  return (
    <>
      <Link href={`/app/notebooks/${notebook.id}`} className="block">
        <article className="group relative flex min-h-[120px] cursor-pointer items-start gap-3.5 rounded-xl border border-border/40 bg-card px-4 py-4 shadow-sm transition-colors hover:bg-accent/30 hover:border-border/60 sm:min-h-0 sm:items-center sm:rounded-md sm:border-transparent sm:bg-transparent sm:px-2.5 sm:py-2.5 sm:shadow-none sm:hover:bg-accent/60 sm:hover:border-transparent">
          <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center sm:mt-0 sm:h-8 sm:w-8">
            <Icon size={28} className="sm:hidden text-foreground/90" />
            <Icon size={24} className="hidden sm:block text-foreground/90" />
          </div>
          <div className="min-w-0 flex-1 pr-10 sm:pr-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-[15px] font-medium text-foreground sm:text-[14px]">{notebook.title}</p>
              {notebook.isPublic && (
                <div className="flex items-center gap-1 rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                  <Globe size={10} />
                  <span className="hidden sm:inline">{t("publishedBadge")}</span>
                </div>
              )}
            </div>
            {notebook.summary ? (
              <p className="mt-1 line-clamp-1 text-[13px] text-muted-foreground/80 sm:hidden">
                {notebook.summary}
              </p>
            ) : (
              <p className="mt-1 text-[13px] italic text-muted-foreground/40 sm:hidden">{t("noSummary")}</p>
            )}
            
            {/* Properties row */}
            <div className="mt-3 flex items-center gap-4 overflow-hidden sm:mt-0.5 sm:gap-4">
              <div className="flex shrink-0 items-center gap-1 text-[12px] text-muted-foreground/70 sm:text-[11px]">
                <FileText size={12} className="opacity-60" />
                {t("sourceCount", { count: notebook.sourceCount })}
              </div>
              <div className="flex shrink-0 items-center gap-1 text-[12px] text-muted-foreground/70 sm:text-[11px]">
                <BookOpen size={12} className="opacity-60" />
                {t("noteCount", { count: notebook.noteCount })}
              </div>
              <div className="flex shrink-0 items-center gap-1 text-[12px] text-muted-foreground/70 sm:text-[11px]">
                <Hash size={12} className="opacity-60" />
                {notebook.wordCount >= 1000
                  ? t("wordCountK", { count: (notebook.wordCount / 1000).toFixed(1) })
                  : t("wordCount", { count: notebook.wordCount })}
              </div>
            </div>
          </div>
          <NotebookMenu
            isPublic={notebook.isPublic}
            onRename={() => setEditOpen(true)}
            onDelete={() => setDeleteOpen(true)}
            onTogglePublish={() => void handleTogglePublish()}
          />
        </article>
      </Link>

      <EditNotebookDialog
        open={editOpen}
        notebook={notebook}
        onClose={() => setEditOpen(false)}
        onSaved={() => { setEditOpen(false); router.refresh(); }}
      />
      <DeleteNotebookDialog
        open={deleteOpen}
        notebook={notebook}
        onClose={() => setDeleteOpen(false)}
      />
    </>
  );
});

// ── New-notebook card ─────────────────────────────────────────────────────────

export function NewNotebookCard({ onClick }: { onClick?: () => void }) {
  const tc = useTranslations("common");
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex h-full min-h-[160px] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/50 bg-transparent transition-all hover:bg-accent/30 sm:min-h-[180px] sm:rounded-lg"
    >
      <div className="flex h-8 w-8 items-center justify-center text-muted-foreground transition-all group-hover:text-foreground">
        <Plus size={24} />
      </div>
      <span className="text-[13px] font-medium text-muted-foreground transition-colors group-hover:text-foreground">
        {tc("newNotebook")}
      </span>
    </button>
  );
}
