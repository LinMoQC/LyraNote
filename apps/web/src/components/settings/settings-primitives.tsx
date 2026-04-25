"use client";

import { AnimatePresence, m } from "framer-motion";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  group?: string;
  thinking?: boolean;
}

export function CustomSelect({
  value,
  options,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  options: SelectOption[];
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const tc = useTranslations("common");
  const tModel = useTranslations("settings.modelSelect");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  useEffect(() => {
    if (open) {
      setSearch("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const filtered = search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()) || o.value.toLowerCase().includes(search.toLowerCase()))
    : options;

  const hasGroups = filtered.some((o) => o.group);
  const groups: { name: string; items: SelectOption[] }[] = [];
  if (hasGroups) {
    for (const opt of filtered) {
      const g = opt.group || "";
      const existing = groups.find((gr) => gr.name === g);
      if (existing) existing.items.push(opt);
      else groups.push({ name: g, items: [opt] });
    }
  }

  const renderOption = (opt: SelectOption) => {
    const isSel = opt.value === value;
    return (
      <button
        key={opt.value}
        type="button"
        onClick={() => { onChange(opt.value); setOpen(false); }}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg mx-1 px-2.5 py-1.5 text-left text-sm transition-colors",
          isSel ? "bg-primary/15 text-primary font-medium" : "text-foreground/80 hover:bg-muted/60 hover:text-foreground"
        )}
      >
        <span className="w-3.5 flex-shrink-0">
          {isSel && <Check size={12} className="text-primary" />}
        </span>
        <span className="flex-1 truncate">{opt.label}</span>
        {opt.thinking && (
          <span className="flex-shrink-0 rounded-md bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">
            Thinking
          </span>
        )}
      </button>
    );
  };

  return (
    <div ref={ref} className={cn("relative min-w-[180px]", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-8 w-full items-center justify-between gap-2 rounded-xl border px-3 text-sm transition-colors",
          "border-border/50 bg-card text-foreground",
          "hover:border-primary/50",
          open && "border-primary ring-1 ring-primary/20"
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate">{selected?.label ?? placeholder ?? tc("selectPlaceholder")}</span>
          {selected?.thinking && (
            <span className="flex-shrink-0 rounded bg-violet-500/15 px-1 py-px text-[9px] font-medium leading-tight text-violet-400">
              Thinking
            </span>
          )}
        </span>
        <m.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.16 }} className="flex-shrink-0 text-muted-foreground">
          <ChevronDown size={13} />
        </m.span>
      </button>

      <AnimatePresence>
        {open && (
          <m.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.13 }}
            className="absolute right-0 top-full z-50 mt-1.5 min-w-[180px] overflow-hidden rounded-xl border border-border/60 bg-popover shadow-2xl shadow-black/40 backdrop-blur-sm"
          >
            {options.length > 8 && (
              <div className="border-b border-border/50 px-2 py-1.5">
                <input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={tModel("searchPlaceholder")}
                  className="w-full bg-transparent px-1 text-xs text-foreground outline-none placeholder:text-muted-foreground/50"
                />
              </div>
            )}
            <div className="max-h-64 overflow-y-auto py-1.5">
              {hasGroups
                ? groups.map((g) => (
                    <div key={g.name}>
                      {g.name && (
                        <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                          {g.name}
                        </div>
                      )}
                      {g.items.map(renderOption)}
                    </div>
                  ))
                : filtered.map(renderOption)}
              {filtered.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">{tModel("noMatch")}</div>
              )}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-border/50 pb-5 last:border-0 last:pb-0">
      <div className="min-w-0 pt-0.5">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

export function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn("relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200", checked ? "bg-primary" : "bg-muted")}
    >
      <span className={cn("inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200", checked ? "translate-x-4" : "translate-x-0")} />
    </button>
  );
}

export function FieldInput({ label, description, type = "text", value, onChange, placeholder }: {
  label: string; description?: string; type?: string;
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="space-y-1.5 border-b border-border/50 pb-5 last:border-0 last:pb-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex h-9 w-full rounded-xl border border-border/50 bg-muted/50 px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
      />
    </div>
  );
}

export function FieldSelectRow({ label, description, value, options, onChange }: {
  label: string; description?: string;
  value: string; options: SelectOption[]; onChange: (v: string) => void;
}) {
  return (
    <SettingRow label={label} description={description}>
      <CustomSelect value={value} options={options} onChange={onChange} />
    </SettingRow>
  );
}

const CUSTOM_MODEL_SENTINEL = "__custom_model__";

/**
 * Like CustomSelect but adds a "自定义模型…" option at the bottom.
 * If the current value is not in the options list, automatically enters text-input mode.
 */
export function ModelSelectWithCustom({
  value,
  options,
  onChange,
}: {
  value: string;
  options: SelectOption[];
  onChange: (v: string) => void;
}) {
  const tModel = useTranslations("settings.modelSelect");
  const tc = useTranslations("common");
  const isKnown = (v: string) => !!options.find((o) => o.value === v);
  const [mode, setMode] = useState<"select" | "custom">(
    !isKnown(value) && !!value ? "custom" : "select",
  );
  const [draft, setDraft] = useState(!isKnown(value) && value ? value : "");
  const inputRef = useRef<HTMLInputElement>(null);
  // Prevents the sync useEffect from fighting user-initiated mode changes
  const skipSyncRef = useRef(false);

  // Sync when value changes from parent (e.g., config loads from server after mount)
  useEffect(() => {
    if (skipSyncRef.current) { skipSyncRef.current = false; return; }
    if (!isKnown(value) && value) {
      setMode("custom");
      setDraft(value);
    } else if (isKnown(value)) {
      setMode("select");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (mode === "custom") setTimeout(() => inputRef.current?.focus(), 50);
  }, [mode]);

  function commitCustom() {
    const v = draft.trim();
    if (v) { skipSyncRef.current = true; onChange(v); }
  }

  function cancelCustom() {
    skipSyncRef.current = true;
    setMode("select");
    setDraft("");
    // If current value is unknown, reset to a known model so the dropdown renders correctly
    if (!isKnown(value)) onChange(options[0]?.value ?? "");
  }

  const extendedOptions: SelectOption[] = [
    ...options,
    // Include current custom value so CustomSelect can display it after confirming
    ...(!isKnown(value) && value ? [{ value, label: value }] : []),
    { value: CUSTOM_MODEL_SENTINEL, label: tModel("customModel") },
  ];

  if (mode === "custom") {
    return (
      <div className="flex items-center gap-1.5">
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { commitCustom(); setMode("select"); }
            if (e.key === "Escape") cancelCustom();
          }}
          placeholder={tModel("customPlaceholder")}
          className="flex h-8 min-w-[180px] rounded-xl border border-primary/50 bg-card px-3 text-sm text-foreground outline-none ring-1 ring-primary/20 placeholder:text-muted-foreground/40"
        />
        <button
          type="button"
          onClick={() => { commitCustom(); setMode("select"); }}
          className="flex-shrink-0 rounded-lg border border-primary/60 bg-primary/10 px-2.5 py-1 text-xs text-primary transition-colors hover:bg-primary/20"
        >
          {tModel("confirm")}
        </button>
        <button
          type="button"
          onClick={cancelCustom}
          className="flex-shrink-0 rounded-lg border border-border/60 px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {tc("cancel")}
        </button>
      </div>
    );
  }

  return (
    <CustomSelect
      value={value}
      options={extendedOptions}
      onChange={(v) => {
        if (v === CUSTOM_MODEL_SENTINEL) {
          setDraft("");
          setMode("custom");
        } else {
          onChange(v);
        }
      }}
    />
  );
}

export function FieldModelRow({ label, description, value, options, onChange }: {
  label: string; description?: string;
  value: string; options: SelectOption[]; onChange: (v: string) => void;
}) {
  return (
    <SettingRow label={label} description={description}>
      <ModelSelectWithCustom value={value} options={options} onChange={onChange} />
    </SettingRow>
  );
}

export function SaveButton({ onClick, saving, saved }: { onClick: () => void; saving: boolean; saved: boolean }) {
  const tc = useTranslations("common");
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving}
      className={cn(
        "mt-1 flex h-9 items-center gap-2 rounded-xl px-4 text-sm font-medium transition-all",
        saved ? "bg-emerald-500/15 text-emerald-400" : "bg-primary text-primary-foreground shadow-sm shadow-primary/20 hover:bg-primary/90 active:scale-[0.98]",
        saving && "cursor-not-allowed opacity-60"
      )}
    >
      {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : null}
      {saving ? tc("saving") : saved ? tc("saved") : tc("save")}
    </button>
  );
}
