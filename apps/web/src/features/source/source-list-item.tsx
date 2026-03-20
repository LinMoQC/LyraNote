"use client";

import { FileAudio, FileText, Globe, NotepadText } from "lucide-react";

import { cn } from "@/lib/utils";
import { useNotebookStore } from "@/store/use-notebook-store";
import type { Source } from "@/types";

const sourceIconMap = {
  audio: FileAudio,
  doc: NotepadText,
  pdf: FileText,
  web: Globe
};

export function SourceListItem({ source }: { source: Source }) {
  const activeSourceId = useNotebookStore((state) => state.activeSourceId);
  const setActiveSourceId = useNotebookStore((state) => state.setActiveSourceId);
  const Icon = sourceIconMap[source.type];
  const isActive = activeSourceId === source.id;

  return (
    <button
      className={cn(
        "w-full rounded-3xl border px-4 py-4 text-left transition",
        isActive ? "border-cyan-300/30 bg-cyan-300/10" : "border-border/50 bg-muted/50 hover:border-border/80 hover:bg-accent"
      )}
      onClick={() => setActiveSourceId(source.id)}
      type="button"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-muted/50 p-2 text-primary">
          <Icon size={16} />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">{source.title}</p>
          <p className="text-xs leading-5 text-muted-foreground">{source.summary}</p>
        </div>
      </div>
    </button>
  );
}
