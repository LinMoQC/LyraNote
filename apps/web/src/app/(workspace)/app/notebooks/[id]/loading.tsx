export default function NotebookLoading() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── TopBar skeleton (breadcrumb + ... menu) ──────────────── */}
      <div className="flex h-10 flex-shrink-0 items-center border-b border-border/20 bg-card/10 px-3">
        <div className="flex flex-1 items-center gap-1.5">
          <div className="h-6 w-16 animate-pulse rounded-md bg-muted/40" />
          <span className="text-muted-foreground/20 text-xs">/</span>
          <div className="h-5 w-32 animate-pulse rounded-md bg-muted/40" />
        </div>
        <div className="h-7 w-7 animate-pulse rounded-md bg-accent/40" />
      </div>

      {/* ── Body ─────────────────────────────────────────────────── */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Editor area — full width (matches floating-mode layout) */}
        <div className="flex flex-1 flex-col items-center overflow-hidden px-8 py-10">
          <div className="w-full max-w-3xl space-y-5">
            {/* Title */}
            <div className="h-9 w-2/3 animate-pulse rounded-lg bg-muted/50" />
            <div className="h-px w-full bg-muted/40" />
            {/* Paragraphs */}
            {[100, 88, 95, 72, 90, 65, 80, 55, 78].map((w, i) => (
              <div
                key={i}
                className="animate-pulse rounded bg-muted/50"
                style={{
                  height: 14,
                  width: `${w}%`,
                  animationDelay: `${i * 60}ms`,
                }}
              />
            ))}
            <div className="h-4" />
            {[92, 80, 70, 85, 60].map((w, i) => (
              <div
                key={i + 10}
                className="animate-pulse rounded bg-muted/50"
                style={{
                  height: 14,
                  width: `${w}%`,
                  animationDelay: `${(i + 9) * 60}ms`,
                }}
              />
            ))}
          </div>
        </div>

        {/* Floating Copilot panel skeleton — bottom-right corner */}
        <div
          className="pointer-events-none fixed bottom-6 right-6 flex flex-col overflow-hidden rounded-2xl border border-border/30 bg-card/80 shadow-2xl backdrop-blur-sm"
          style={{ width: 440, height: 420 }}
        >
          {/* Panel header */}
          <div className="flex h-12 flex-shrink-0 items-center justify-between border-b border-border/30 px-4">
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 animate-pulse rounded-md bg-primary/20" />
              <div className="h-3.5 w-10 animate-pulse rounded bg-muted/50" />
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-6 w-6 animate-pulse rounded-md bg-accent/60" />
              <div className="h-6 w-6 animate-pulse rounded-md bg-accent/60" />
            </div>
          </div>

          {/* Suggested prompts */}
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-10 w-full animate-pulse rounded-xl bg-muted/40"
                style={{ animationDelay: `${i * 80}ms` }}
              />
            ))}
          </div>

          {/* Input area */}
          <div className="border-t border-border/30 p-3">
            <div className="h-10 w-full animate-pulse rounded-xl bg-accent/60" />
          </div>
        </div>
      </div>
    </div>
  );
}
