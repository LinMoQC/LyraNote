import { Button } from "@/components/ui/button";

export function EmptyState({
  title,
  description,
  actionLabel,
  actionHref
}: {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="surface-panel flex flex-col items-center justify-center gap-4 px-6 py-12 text-center">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      </div>
      {actionLabel && actionHref ? (
        <Button asLink href={actionHref}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
