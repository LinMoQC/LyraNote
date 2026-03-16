import type { Artifact } from "@/types";

import { ArtifactCard } from "@/features/artifacts/artifact-card";
import { ArtifactPlaceholder } from "@/features/artifacts/artifact-placeholder";

export function StudioPanel({ artifacts }: { artifacts: Artifact[] }) {
  return (
    <section className="surface-panel space-y-4 p-5">
      <div className="space-y-1">
        <p className="text-sm font-medium">Artifact studio</p>
        <p className="text-xs text-muted-foreground">Generated outputs, cards, and structure previews live here.</p>
      </div>
      <div className="space-y-3">
        {artifacts.map((artifact) =>
          artifact.status === "generating" ? (
            <ArtifactPlaceholder key={artifact.id} />
          ) : (
            <ArtifactCard key={artifact.id} artifact={artifact} />
          )
        )}
      </div>
    </section>
  );
}
