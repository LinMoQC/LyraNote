"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, m } from "framer-motion";
import { Check, ChevronDown, FileText, Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { createNote, deleteNote, listNotes } from "@/services/note-service";
import type { NoteRecord } from "@/services/note-service";

type Props = {
  notebookId: string;
  activeNoteId: string | null;
  activeNoteTitle: string | null;
  onSelect: (note: NoteRecord) => void;
  onCreated: (note: NoteRecord) => void;
  onDeleted: (noteId: string) => void;
  variant?: "breadcrumb" | "compact";
};

export function NotePickerDropdown({
  notebookId,
  activeNoteId,
  activeNoteTitle,
  onSelect,
  onCreated,
  onDeleted,
  variant = "breadcrumb",
}: Props) {
  const t = useTranslations("notebook");
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState<{ top: number; left: number } | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["notes", notebookId],
    queryFn: () => listNotes(notebookId),
    enabled: open,
    staleTime: 10_000,
  });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!panelRef.current?.contains(target) && !btnRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleToggle = () => {
    if (open) { setOpen(false); return; }
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setDropPos({ top: rect.bottom + 6, left: rect.left });
    }
    setOpen(true);
  };

  const handleSelect = (note: NoteRecord) => {
    onSelect(note);
    setOpen(false);
  };

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const newNote = await createNote(notebookId, t("newNote"));
      await queryClient.invalidateQueries({ queryKey: ["notes", notebookId] });
      onCreated(newNote);
      setOpen(false);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, noteId: string) => {
    e.stopPropagation();
    if (deletingId) return;
    setDeletingId(noteId);
    try {
      await deleteNote(noteId);
      await queryClient.invalidateQueries({ queryKey: ["notes", notebookId] });
      onDeleted(noteId);
    } finally {
      setDeletingId(null);
    }
  };

  const displayTitle = activeNoteTitle || t("untitled");

  return (
    <>
      {variant === "breadcrumb" && (
        <span className="px-0.5 text-muted-foreground/30">/</span>
      )}
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        data-testid={variant === "compact" ? "note-picker-compact-trigger" : "note-picker-trigger"}
        className={cn(
          "flex items-center text-[13px] text-foreground/75 transition-colors hover:bg-accent/60 hover:text-foreground",
          variant === "breadcrumb"
            ? "gap-0.5 rounded-sm px-1.5 py-1"
            : "h-11 w-full justify-between gap-2 rounded-xl border border-border/10 bg-background/60 px-3.5 shadow-sm shadow-black/10 backdrop-blur-sm",
        )}
      >
        <span className={cn("truncate font-medium", variant === "compact" ? "max-w-[12rem]" : "max-w-[160px]")}>
          {displayTitle}
        </span>
        <ChevronDown
          size={12}
          className={cn(
            "flex-shrink-0 text-muted-foreground/40 transition-transform duration-150",
            open && "rotate-180"
          )}
        />
      </button>

      {dropPos && createPortal(
        <AnimatePresence>
          {open && (
            <m.div
              ref={panelRef}
              key="note-picker"
              initial={{ opacity: 0, scale: 0.95, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -6 }}
              transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
              className="fixed z-[9999] w-56 overflow-hidden rounded-xl border border-border/40 bg-card shadow-2xl shadow-black/30"
              style={{ top: dropPos.top, left: dropPos.left }}
            >
              {/* Note list */}
              <div className="max-h-60 overflow-y-auto px-1 py-1.5">
                {isLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 size={14} className="animate-spin text-muted-foreground/40" />
                  </div>
                ) : notes.length === 0 ? (
                  <p className="px-3 py-3 text-center text-[12px] text-muted-foreground/40">
                    {t("noNotes")}
                  </p>
                ) : (
                  notes.map((note) => {
                    const isActive = note.id === activeNoteId;
                    return (
                      <div
                        key={note.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleSelect(note)}
                        onKeyDown={(e) => e.key === "Enter" && handleSelect(note)}
                        className={cn(
                          "group flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
                          isActive
                            ? "bg-accent/70 text-foreground"
                            : "text-foreground/80 hover:bg-accent/50"
                        )}
                      >
                        <FileText
                          size={13}
                          className={cn(
                            "flex-shrink-0",
                            isActive ? "text-primary/70" : "text-muted-foreground/40"
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {note.title || t("untitled")}
                        </span>
                        {isActive ? (
                          <Check size={12} className="flex-shrink-0 text-primary/60" />
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => handleDelete(e, note.id)}
                            className="hidden flex-shrink-0 rounded p-0.5 text-muted-foreground/30 transition-colors hover:bg-red-500/15 hover:text-red-400 group-hover:flex"
                            title={t("deleteNote")}
                          >
                            {deletingId === note.id ? (
                              <Loader2 size={11} className="animate-spin" />
                            ) : (
                              <Trash2 size={11} />
                            )}
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Divider + Create */}
              <div className="mx-2 h-px bg-border/30" />
              <div className="px-1 py-1.5">
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={creating}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground disabled:opacity-50"
                >
                  {creating ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Plus size={13} />
                  )}
                  <span>{t("newNote")}</span>
                </button>
              </div>
            </m.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
