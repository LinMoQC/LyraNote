import { Skeleton } from "@/components/ui/skeleton";

export function ArtifactPlaceholder() {
  return (
    <div className="space-y-3 rounded-3xl border border-border/50 bg-muted/50 p-4">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}
