import { cn } from "@/lib/utils";

export function DropdownMenu({
  label,
  children,
  className
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <details className={cn("relative", className)}>
      <summary className="cursor-pointer list-none rounded-full border border-border/50 px-4 py-2 text-sm text-muted-foreground transition hover:border-border/80 hover:text-foreground">
        {label}
      </summary>
      <div className="surface-panel absolute right-0 top-12 z-20 min-w-44 space-y-2 p-2">{children}</div>
    </details>
  );
}

export function DropdownMenuItem({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("rounded-2xl px-3 py-2 text-sm hover:bg-muted/50", className)}>{children}</div>;
}
