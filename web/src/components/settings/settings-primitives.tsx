"use client";

import { AnimatePresence, m } from "framer-motion";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
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
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <div ref={ref} className={cn("relative min-w-[130px]", className)}>
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
        <span className="truncate">{selected?.label ?? placeholder ?? tc("selectPlaceholder")}</span>
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
            className="absolute left-0 top-full z-50 mt-1.5 min-w-full overflow-hidden rounded-xl border border-border bg-card shadow-xl shadow-black/25"
          >
            <div className="max-h-52 overflow-y-auto py-1">
              {options.map((opt) => {
                const isSel = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { onChange(opt.value); setOpen(false); }}
                    className={cn(
                      "flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors",
                      isSel ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted/50"
                    )}
                  >
                    <span>{opt.label}</span>
                    {isSel && <Check size={12} className="flex-shrink-0" />}
                  </button>
                );
              })}
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
