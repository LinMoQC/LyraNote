import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "flex h-10 w-full rounded-2xl border border-border/50 bg-muted/50 px-4 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/20",
        className
      )}
      {...props}
    />
  );
}
