import { cn } from "@/lib/utils";

export function Badge({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-border/50 bg-muted/50 px-3 py-1 text-xs uppercase tracking-[0.2em] text-muted-foreground",
        className
      )}
    >
      {children}
    </span>
  );
}
