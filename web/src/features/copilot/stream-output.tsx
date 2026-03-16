import { BotAvatar } from "@/components/ui/bot-avatar";

export function StreamOutput({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <div className="flex gap-2.5">
      <BotAvatar className="mt-0.5" />
      <div className="flex items-center gap-1 rounded-2xl bg-muted/50 px-4 py-3">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/50" />
      </div>
    </div>
  );
}
