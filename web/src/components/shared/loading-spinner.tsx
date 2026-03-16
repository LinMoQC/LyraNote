import { cn } from "@/lib/utils";

export function LoadingSpinner({ className }: { className?: string }) {
  return <span className={cn("inline-flex size-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary", className)} />;
}
