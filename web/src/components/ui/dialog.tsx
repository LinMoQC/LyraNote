import type { ReactNode } from "react";

import { X } from "lucide-react";

import { cn } from "@/lib/utils";

export function Dialog({
  open,
  title,
  description,
  children,
  className,
  onClose
}: {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  onClose?: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
      <div className={cn("w-full max-w-lg space-y-5 rounded-2xl border border-border/60 bg-card p-6 shadow-2xl shadow-black/20", className)}>
        <div className="flex items-center justify-between gap-4 border-b border-border/40 pb-4">
          <div>
            <h2 className="text-base font-semibold tracking-tight">{title}</h2>
            {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="flex-shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X size={15} />
            </button>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  );
}
