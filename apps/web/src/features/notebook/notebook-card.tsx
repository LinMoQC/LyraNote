"use client";

/**
 * @file 笔记本卡片组件
 * @description 提供卡片视图（NotebookCard）和列表行视图（NotebookListRow）两种展示模式，
 *              支持重命名、删除、发布/取消发布等操作。使用 React.memo 优化列表渲染。
 */

import { Globe, GlobeLock, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
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

  function show() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  }
  function hide() {
    closeTimer.current = setTimeout(() => setOpen(false), 130);
  }

  return (
    <div
      className="absolute right-2.5 top-2.5 z-10"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
        className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground/60 opacity-0 transition-all hover:bg-accent hover:text-foreground group-hover:opacity-100"
      >
        <MoreHorizontal size={14} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-9 w-36 overflow-hidden rounded-2xl border border-border/50 bg-card p-1 shadow-2xl shadow-black/60 backdrop-blur-xl"
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
        <article className="group relative flex aspect-square cursor-pointer flex-col overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm transition-all duration-200 hover:border-border/80 hover:shadow-lg">
          <NotebookMenu
            isPublic={notebook.isPublic}
            onRename={() => setEditOpen(true)}
            onDelete={() => setDeleteOpen(true)}
            onTogglePublish={() => void handleTogglePublish()}
          />

          {/* Top area with icon */}
          <div className="flex items-center gap-3 px-4 pt-5 pb-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50">
              <Icon size={28} />
            </div>
            {notebook.isPublic && (
              <div className="ml-auto flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                <Globe size={9} />
                {t("publishedBadge")}
              </div>
            )}
          </div>

          {/* Body */}
          <div className="flex flex-1 flex-col px-4 pb-4 pt-1">
            <h3 className="line-clamp-1 text-sm font-semibold text-foreground">
              {notebook.title}
            </h3>

            {notebook.summary ? (
              <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground/70">
                {notebook.summary}
              </p>
            ) : (
              <p className="mt-1.5 text-xs italic text-muted-foreground/40">{t("noSummary")}</p>
            )}

            {/* Footer stats */}
            <div className="mt-auto flex items-center gap-1.5 border-t border-border/20 pt-3 text-[11px] text-muted-foreground/50">
              <span>{formatDate(notebook.updatedAt)}</span>
              <span className="opacity-30">·</span>
              <span>{t("sourceCount", { count: notebook.sourceCount })}</span>
              {notebook.wordCount > 0 && (
                <>
                  <span className="opacity-30">·</span>
                  <span>
                    {notebook.wordCount >= 1000
                      ? t("wordCountK", { count: (notebook.wordCount / 1000).toFixed(1) })
                      : t("wordCount", { count: notebook.wordCount })}
                  </span>
                </>
              )}
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
        <article className="group relative flex cursor-pointer items-center gap-3.5 rounded-xl border border-transparent px-3 py-2.5 transition-colors hover:bg-accent hover:border-border/40">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-muted/50">
            <Icon size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium text-foreground">{notebook.title}</p>
              {notebook.isPublic && (
                <Globe size={11} className="flex-shrink-0 text-primary/60" />
              )}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground/55">
              <span>{formatDate(notebook.updatedAt)}</span>
              <span className="opacity-40">·</span>
              <span>{t("sourceCount", { count: notebook.sourceCount })}</span>
              {notebook.wordCount > 0 && (
                <>
                  <span className="opacity-40">·</span>
                  <span>
                    {notebook.wordCount >= 1000
                      ? t("wordCountK", { count: (notebook.wordCount / 1000).toFixed(1) })
                      : t("wordCount", { count: notebook.wordCount })}
                  </span>
                </>
              )}
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
      className="group flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed border-border/50 bg-muted/20 transition-all duration-200 hover:border-border/80 hover:bg-muted/50"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary transition-all duration-200 group-hover:scale-110 group-hover:bg-primary/25">
        <Plus size={20} />
      </div>
      <span className="text-xs text-muted-foreground/70 transition-colors group-hover:text-muted-foreground">
        {tc("newNotebook")}
      </span>
    </button>
  );
}
