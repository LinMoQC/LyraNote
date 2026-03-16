import type { Artifact } from "@/types";

import { Badge } from "@/components/ui/badge";

export function ArtifactCard({ artifact }: { artifact: Artifact }) {
  return (
    <article className="rounded-3xl border border-border/50 bg-muted/50 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium">{artifact.title}</h3>
        <Badge>{artifact.status}</Badge>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Artifact type: {artifact.type}. This slot can later render richer previews such as outline cards or mind map nodes.
      </p>
    </article>
  );
}
