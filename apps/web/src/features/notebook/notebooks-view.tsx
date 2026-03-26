"use client";

import { type Variants, m } from "framer-motion";
import { LayoutGrid, List, Plus, SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createNotebook } from "@/services/notebook-service";
import type { Notebook } from "@/types";

import { NewNotebookCard, NotebookCard, NotebookListRow } from "./notebook-card";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.96 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring" as const, stiffness: 300, damping: 24, mass: 0.8 },
  },
};

type ViewMode = "grid" | "list";

export function NotebooksView({ notebooks }: { notebooks: Notebook[] }) {
  const router = useRouter();
  const t = useTranslations("notebooks");
  const tc = useTranslations("common");
  const tn = useTranslations("nav");
  const [view, setView] = useState<ViewMode>("grid");
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    const title = newTitle.trim();
    if (!title || creating) return;
    setCreating(true);
    try {
      const nb = await createNotebook(title);
      setCreateOpen(false);
      setNewTitle("");
      // Store the "new notebook" signal in sessionStorage so the workspace
      // page can pick it up without exposing it in the URL.
      if (nb.isNew) sessionStorage.setItem(`notebook-new:${nb.id}`, "1");
      router.push(`/app/notebooks/${nb.id}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex h-full flex-col gap-6 p-8 dark:border border-border/40">
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t("myNotebooks")}</h1>

        <div className="flex items-center gap-2">
          {/* Sort */}
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            <SlidersHorizontal size={14} />
            {tn("recent")}
          </button>

          {/* View toggle */}
          <div className="flex items-center rounded-lg border border-border/40 p-0.5">
            <button
              type="button"
              onClick={() => setView("grid")}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                view === "grid"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutGrid size={14} />
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                view === "list"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <List size={14} />
            </button>
          </div>

          {/* Create */}
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus size={15} />
            {t("new")}
          </button>
        </div>
      </div>

      {/* ── Grid ────────────────────────────────────────────────────────── */}
      {view === "grid" ? (
        <m.div
          key="grid"
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 w-full"
        >
          <m.div variants={item} className="h-full">
            <NewNotebookCard onClick={() => setCreateOpen(true)} />
          </m.div>

          {notebooks.map((nb) => (
            <m.div key={nb.id} variants={item} className="h-full">
              <NotebookCard notebook={nb} />
            </m.div>
          ))}
        </m.div>
      ) : (
        /* ── List ──────────────────────────────────────────────────────── */
        <m.div
          key="list"
          variants={container}
          initial="hidden"
          animate="show"
          className="flex flex-col gap-0.5"
        >
          {notebooks.map((nb) => (
            <m.div key={nb.id} variants={item}>
              <NotebookListRow notebook={nb} />
            </m.div>
          ))}
        </m.div>
      )}

      {/* ── Create dialog ───────────────────────────────────────────────── */}
      <Dialog
        description={t("createDesc")}
        open={createOpen}
        title={t("dialog.title")}
      >
        <div className="space-y-4">
          <Input
            autoFocus
            placeholder={t("dialog.namePlaceholder")}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); }}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              disabled={creating}
              onClick={() => { setCreateOpen(false); setNewTitle(""); }}
            >
              {tc("cancel")}
            </Button>
            <Button
              disabled={!newTitle.trim() || creating}
              onClick={() => void handleCreate()}
            >
              {creating ? t("creating") : t("dialog.create")}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
