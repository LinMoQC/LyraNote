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
import { deleteNotebook, publishNotebook, renameNotebook, unpublishNotebook } from "@/services/notebook-service";
import type { Notebook } from "@/types";
import { formatDate } from "@/utils/format-date";
import { useTranslations } from "next-intl";

// ── Static config ─────────────────────────────────────────────────────────────

const EMOJIS = [
  "📓","📔","📒","📕","📗","📘","📙","🗒️","📋","📑",
  "🗂️","📁","💡","🔬","✏️","🧠","🎯","🚀","💎","🌟",
];

const GRADIENTS = [
  "from-amber-800/80 to-orange-700/80",
  "from-blue-800/80 to-indigo-700/80",
  "from-emerald-800/80 to-teal-700/80",
  "from-violet-800/80 to-purple-700/80",
  "from-rose-800/80 to-pink-700/80",
  "from-sky-800/80 to-cyan-700/80",
  "from-slate-700/80 to-gray-600/80",
  "from-fuchsia-800/80 to-pink-700/80",
];

// Inline styles so Tailwind purge can't remove them
const GRADIENT_STYLES: React.CSSProperties[] = [
  { background: "linear-gradient(135deg,#92400e,#c2410c)" },
  { background: "linear-gradient(135deg,#1e40af,#4338ca)" },
  { background: "linear-gradient(135deg,#065f46,#0f766e)" },
  { background: "linear-gradient(135deg,#5b21b6,#7c3aed)" },
  { background: "linear-gradient(135deg,#9f1239,#be185d)" },
  { background: "linear-gradient(135deg,#075985,#0e7490)" },
  { background: "linear-gradient(135deg,#334155,#4b5563)" },
  { background: "linear-gradient(135deg,#86198f,#9d174d)" },
];

function pick<T>(arr: T[], id: string): T {
  const hash = id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return arr[hash % arr.length];
}

// ── localStorage helpers ──────────────────────────────────────────────────────

interface NotebookMeta { icon: string; gradient: string }

function loadMeta(id: string): NotebookMeta {
  try {
    const stored = localStorage.getItem(`notebook-meta:${id}`);
    if (stored) {
      const p = JSON.parse(stored) as Partial<NotebookMeta>;
      return { icon: p.icon ?? pick(EMOJIS, id), gradient: p.gradient ?? pick(GRADIENTS, id) };
    }
  } catch { /* ignore */ }
  return { icon: pick(EMOJIS, id), gradient: pick(GRADIENTS, id) };
}

function saveMeta(id: string, meta: NotebookMeta) {
  try { localStorage.setItem(`notebook-meta:${id}`, JSON.stringify(meta)); } catch { /* ignore */ }
}

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
            重命名
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] text-foreground/70 transition-colors hover:bg-accent/80 hover:text-foreground"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); onTogglePublish(); }}
          >
            {isPublic ? (
              <>
                <GlobeLock size={13} className="opacity-60" />
                取消公开
              </>
            ) : (
              <>
                <Globe size={13} className="opacity-60" />
                公开发布
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
            删除
          </button>
        </div>
      )}
    </div>
  );
}

// ── Edit dialog (name + icon + gradient) ─────────────────────────────────────

function EditNotebookDialog({
  open,
  notebook,
  currentIcon,
  currentGradient,
  onClose,
  onSaved,
}: {
  open: boolean;
  notebook: Notebook;
  currentIcon: string;
  currentGradient: string;
  onClose: () => void;
  onSaved: (icon: string, gradient: string) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(notebook.title);
  const [icon, setIcon] = useState(currentIcon);
  const [gradient, setGradient] = useState(currentGradient);
  const [loading, setLoading] = useState(false);
  const tc = useTranslations("common");

  // Sync when dialog opens
  useEffect(() => {
    if (open) {
      setName(notebook.title);
      setIcon(currentIcon);
      setGradient(currentGradient);
    }
  }, [open, notebook.title, currentIcon, currentGradient]);

  async function handleSave() {
    const title = name.trim();
    if (!title || loading) return;
    setLoading(true);
    try {
      await renameNotebook(notebook.id, title);
      saveMeta(notebook.id, { icon, gradient });
      onSaved(icon, gradient);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }


  return (
    <Dialog open={open} title="编辑笔记本" onClose={onClose} className="max-w-md">
      <div className="space-y-4">
        {/* Preview + name */}
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-2xl",
              gradient
            )}
          >
            {icon}
          </div>
          <Input
            autoFocus
            placeholder="笔记本名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleSave(); }}
          />
        </div>

        {/* Divider */}
        <div className="border-t border-border/30" />

        {/* Emoji picker */}
        <div>
          <p className="mb-2 text-[11px] font-medium text-muted-foreground/50 uppercase tracking-widest">
            图标
          </p>
          <div className="grid grid-cols-5 gap-1">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setIcon(e)}
                className={cn(
                  "flex h-11 w-full items-center justify-center rounded-xl text-xl transition-all",
                  icon === e
                    ? "bg-accent ring-1 ring-border scale-110"
                    : "text-foreground/70 hover:bg-accent/60 hover:text-foreground"
                )}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        {/* Gradient picker */}
        <div>
          <p className="mb-2 text-[11px] font-medium text-muted-foreground/50 uppercase tracking-widest">
            颜色
          </p>
          <div className="flex gap-2">
            {GRADIENTS.map((g, i) => (
              <button
                key={g}
                type="button"
                onClick={() => setGradient(g)}
                className={cn(
                  "relative h-8 w-8 rounded-full transition-all duration-150",
                  gradient === g
                    ? "scale-110 ring-2 ring-white/60 ring-offset-2 ring-offset-background"
                    : "opacity-70 hover:opacity-100 hover:scale-105"
                )}
                style={GRADIENT_STYLES[i]}
              />
            ))}
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
    <Dialog open={open} title="删除笔记本" onClose={onClose} className="max-w-sm">
      <div className="rounded-xl border border-red-500/15 bg-red-500/8 px-4 py-3">
        <p className="text-sm leading-relaxed text-foreground/80">
          确定要删除笔记本{" "}
          <span className="font-semibold text-foreground">「{notebook.title}」</span>{" "}
          吗？删除后所有内容将无法恢复。
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
  const [icon, setIcon] = useState(() => pick(EMOJIS, notebook.id));
  const [gradient, setGradient] = useState(() => pick(GRADIENTS, notebook.id));
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const t = useTranslations("notebook");

  useEffect(() => {
    const m = loadMeta(notebook.id);
    setIcon(m.icon);
    setGradient(m.gradient);
  }, [notebook.id]);

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
        <article className="group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm transition-all duration-200 hover:border-border/80 hover:shadow-lg">
          <NotebookMenu
            isPublic={notebook.isPublic}
            onRename={() => setEditOpen(true)}
            onDelete={() => setDeleteOpen(true)}
            onTogglePublish={() => void handleTogglePublish()}
          />

          {/* Gradient banner with icon */}
          <div className={cn("flex h-20 items-end bg-gradient-to-br px-4 pb-0", gradient)}>
            <div className="flex h-10 w-10 -mb-5 items-center justify-center rounded-xl bg-card text-xl shadow-md ring-2 ring-card">
              {icon}
            </div>
            {notebook.isPublic && (
              <div className="mb-2 ml-auto flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] text-white/90 backdrop-blur-sm">
                <Globe size={9} />
                公开
              </div>
            )}
          </div>

          {/* Body */}
          <div className="flex flex-1 flex-col px-4 pb-4 pt-7">
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

      {/* Dialogs rendered OUTSIDE the <article> so CSS transforms don't break fixed positioning */}
      <EditNotebookDialog
        open={editOpen}
        notebook={notebook}
        currentIcon={icon}
        currentGradient={gradient}
        onClose={() => setEditOpen(false)}
        onSaved={(i, g) => { setIcon(i); setGradient(g); setEditOpen(false); }}
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
  const [icon, setIcon] = useState(() => pick(EMOJIS, notebook.id));
  const [gradient, setGradient] = useState(() => pick(GRADIENTS, notebook.id));
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const t = useTranslations("notebook");

  useEffect(() => {
    const m = loadMeta(notebook.id);
    setIcon(m.icon);
    setGradient(m.gradient);
  }, [notebook.id]);

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
        <article className="group relative flex cursor-pointer items-center gap-4 rounded-xl border border-transparent px-3 py-2.5 transition-colors hover:bg-accent hover:border-border/40">
          <div className={cn("flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-base", gradient)}>
            {icon}
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
        currentIcon={icon}
        currentGradient={gradient}
        onClose={() => setEditOpen(false)}
        onSaved={(i, g) => { setIcon(i); setGradient(g); setEditOpen(false); }}
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
      className="group flex h-full w-full cursor-pointer flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed border-border/50 bg-muted/20 transition-all duration-200 hover:border-border/80 hover:bg-muted/50"
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
