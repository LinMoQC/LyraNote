"use client";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotebookStore } from "@/store/use-notebook-store";
import type { Source } from "@/types";

export function SourceReaderPanel({ sources }: { sources: Source[] }) {
  const activeSourceId = useNotebookStore((state) => state.activeSourceId);
  const activeSource = sources.find((source) => source.id === activeSourceId) ?? sources[0];

  return (
    <section className="surface-panel min-h-[320px] p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Reader</p>
          <h2 className="mt-1 text-lg font-semibold">{activeSource?.title}</h2>
        </div>
        <Badge>{activeSource?.type ?? "source"}</Badge>
      </div>

      <ScrollArea className="mt-5 max-h-[360px] space-y-4 pr-2">
        <div className="space-y-4 text-sm leading-7 text-muted-foreground">
          <p>
            {activeSource?.summary ??
              "Select a source to see its extracted context. The future reader panel can sync to citations and page anchors."}
          </p>
          <p>
            This scaffold reserves space for PDF rendering, transcript blocks, and source-aware highlights. It is
            intentionally shaped like a reading pane rather than a table view.
          </p>
          <p>
            When the backend is connected, this panel can scroll to citation anchors from the copilot responses and
            selection actions in the editor.
          </p>
        </div>
      </ScrollArea>
    </section>
  );
}
