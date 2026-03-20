"use client";

import { AnimatePresence, m } from "framer-motion";
import {
  Brain,
  ChevronDown,
  Edit3,
  Loader2,
  Star,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import {
  deleteMemory,
  getMemories,
  getMemoryDoc,
  updateMemory,
  updateMemoryDoc,
  type MemoryEntry,
  type MemoryGrouped,
} from "@/services/memory-service";
import { SaveButton } from "../settings-primitives";

const TYPE_META: Record<
  string,
  { icon: typeof Brain; label: string; color: string }
> = {
  preference: { icon: Star, label: "memory.typePreference", color: "text-amber-400" },
  fact: { icon: Brain, label: "memory.typeFact", color: "text-blue-400" },
  skill: { icon: Zap, label: "memory.typeSkill", color: "text-emerald-400" },
};

function MemoryCard({
  entry,
  onUpdate,
  onDelete,
}: {
  entry: MemoryEntry;
  onUpdate: (id: string, value: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const t = useTranslations("settings");
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(entry.value);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSave() {
    if (editValue.trim() === entry.value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onUpdate(entry.id, editValue.trim());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await onDelete(entry.id);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <m.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="group rounded-xl border border-border/40 bg-card/50 px-3.5 py-2.5 transition-colors hover:border-border/70"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground/70">{entry.key}</p>
          {editing ? (
            <div className="mt-1.5 flex gap-2">
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                  if (e.key === "Escape") { setEditing(false); setEditValue(entry.value); }
                }}
                autoFocus
                className="flex-1 rounded-lg border border-border/60 bg-muted/50 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20"
              />
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex-shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : t("memory.save")}
              </button>
              <button
                type="button"
                onClick={() => { setEditing(false); setEditValue(entry.value); }}
                className="flex-shrink-0 rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <p className="mt-0.5 text-sm text-foreground">{entry.value}</p>
          )}
        </div>
        {!editing && (
          <div className="flex flex-shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <Edit3 size={13} />
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-md p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
            >
              {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            </button>
          </div>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-3 text-[10px] text-muted-foreground/50">
        <span>{t("memory.confidence")}: {Math.round(entry.confidence * 100)}%</span>
        <span>{t("memory.accessCount")}: {entry.access_count}</span>
        {entry.expires_at && (
          <span>{t("memory.expiresAt")}: {new Date(entry.expires_at).toLocaleDateString()}</span>
        )}
      </div>
    </m.div>
  );
}

function MemoryGroup({
  type,
  entries,
  onUpdate,
  onDelete,
}: {
  type: string;
  entries: MemoryEntry[];
  onUpdate: (id: string, value: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const t = useTranslations("settings");
  const [open, setOpen] = useState(true);
  const meta = TYPE_META[type] || TYPE_META.fact;
  const Icon = meta.icon;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
      >
        <Icon size={14} className={meta.color} />
        <span className="text-sm font-medium">
          {t(meta.label)} ({entries.length})
        </span>
        <m.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.15 }}
          className="text-muted-foreground"
        >
          <ChevronDown size={12} />
        </m.span>
      </button>
      <AnimatePresence mode="popLayout">
        {open &&
          entries.map((entry) => (
            <MemoryCard
              key={entry.id}
              entry={entry}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          ))}
      </AnimatePresence>
    </div>
  );
}

export function MemorySection() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");

  // ── Structured memories tab ────────────────────────────────────────────
  const [memories, setMemories] = useState<MemoryGrouped | null>(null);
  const [loadingMemories, setLoadingMemories] = useState(true);

  // ── Memory doc tab ─────────────────────────────────────────────────────
  const [docContent, setDocContent] = useState("");
  const [docLoading, setDocLoading] = useState(true);
  const [docSaving, setDocSaving] = useState(false);
  const [docSaved, setDocSaved] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const [tab, setTab] = useState<"structured" | "document">("structured");

  const loadMemories = useCallback(async () => {
    try {
      const data = await getMemories();
      setMemories(data);
    } catch {
      // silently fail
    } finally {
      setLoadingMemories(false);
    }
  }, []);

  useEffect(() => {
    loadMemories();
    getMemoryDoc()
      .then((d) => { setDocContent(d.content_md); setUpdatedAt(d.updated_at); setDocLoading(false); })
      .catch(() => setDocLoading(false));
  }, [loadMemories]);

  const handleUpdate = useCallback(async (id: string, value: string) => {
    const updated = await updateMemory(id, value);
    setMemories((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      for (const type of ["preference", "fact", "skill"] as const) {
        next[type] = next[type].map((m) => (m.id === id ? { ...m, ...updated } : m));
      }
      return next;
    });
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    await deleteMemory(id);
    setMemories((prev) => {
      if (!prev) return prev;
      return {
        preference: prev.preference.filter((m) => m.id !== id),
        fact: prev.fact.filter((m) => m.id !== id),
        skill: prev.skill.filter((m) => m.id !== id),
      };
    });
  }, []);

  async function handleDocSave() {
    setDocSaving(true); setDocError(null);
    try {
      await updateMemoryDoc(docContent);
      setDocSaved(true); setTimeout(() => setDocSaved(false), 2500);
      setUpdatedAt(new Date().toISOString());
    } catch { setDocError(tc("saveFailed")); }
    finally { setDocSaving(false); }
  }

  const totalCount = memories
    ? memories.preference.length + memories.fact.length + memories.skill.length
    : 0;

  return (
    <div className="space-y-4">
      {/* Info box */}
      <div className="space-y-1 rounded-xl border border-border/50 bg-muted/10 p-4 text-xs text-muted-foreground">
        <p className="font-medium text-foreground/80">{t("memory.whatIsTitle")}</p>
        <p>{t("memory.whatIsDesc")}</p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 rounded-xl bg-muted/30 p-1">
        <button
          type="button"
          onClick={() => setTab("structured")}
          className={cn(
            "flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            tab === "structured"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t("memory.structuredTab")} ({totalCount})
        </button>
        <button
          type="button"
          onClick={() => setTab("document")}
          className={cn(
            "flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            tab === "document"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t("memory.documentTab")}
        </button>
      </div>

      {tab === "structured" ? (
        loadingMemories ? (
          <div className="flex justify-center py-8">
            <Loader2 size={18} className="animate-spin text-muted-foreground" />
          </div>
        ) : !memories || totalCount === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground/60">
            {t("memory.noMemories")}
          </p>
        ) : (
          <div className="space-y-5">
            {memories.preference.length > 0 && (
              <MemoryGroup type="preference" entries={memories.preference} onUpdate={handleUpdate} onDelete={handleDelete} />
            )}
            {memories.fact.length > 0 && (
              <MemoryGroup type="fact" entries={memories.fact} onUpdate={handleUpdate} onDelete={handleDelete} />
            )}
            {memories.skill.length > 0 && (
              <MemoryGroup type="skill" entries={memories.skill} onUpdate={handleUpdate} onDelete={handleDelete} />
            )}
          </div>
        )
      ) : (
        <div className="space-y-3">
          {docLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 size={18} className="animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">{t("memory.globalDoc")}</p>
                <p className="text-xs text-muted-foreground">{t("memory.globalDocDesc")}</p>
                {updatedAt && (
                  <p className="text-[10px] text-muted-foreground/50">
                    {t("memory.lastUpdated", { date: new Date(updatedAt).toLocaleString() })}
                  </p>
                )}
                <textarea
                  value={docContent}
                  onChange={(e) => setDocContent(e.target.value)}
                  placeholder={t("memory.placeholder")}
                  rows={14}
                  className="w-full resize-none rounded-xl border border-border/50 bg-muted/50 px-3 py-2.5 text-sm font-mono text-foreground outline-none transition placeholder:text-muted-foreground/40 focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                />
              </div>
              {docError && <p className="text-xs text-destructive">{docError}</p>}
              <SaveButton onClick={handleDocSave} saving={docSaving} saved={docSaved} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
