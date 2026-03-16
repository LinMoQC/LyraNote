import type { Notebook } from "@/types";

import { NotebookCard } from "@/features/notebook/notebook-card";

export function NotebookCardGrid({
  title,
  description,
  notebooks
}: {
  title: string;
  description: string;
  notebooks: Notebook[];
}) {
  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        {notebooks.map((notebook) => (
          <NotebookCard key={notebook.id} notebook={notebook} />
        ))}
      </div>
    </section>
  );
}
