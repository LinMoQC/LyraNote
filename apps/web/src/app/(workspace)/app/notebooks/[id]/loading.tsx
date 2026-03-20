export default function NotebookLoading() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Header skeleton ──────────────────────────────────────── */}
      <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-border/25 bg-card/30 px-5">
        {/* Left */}
        <div className="flex items-center gap-3">
          {/* back button */}
          <div className="h-8 w-8 flex-shrink-0 animate-pulse rounded-lg bg-accent/60" />
          <div className="h-4 w-px flex-shrink-0 bg-border/40" />
          {/* title */}
          <div className="h-4 w-40 animate-pulse rounded-md bg-muted/50" />
        </div>

        {/* Center toolbar */}
        <div className="flex items-center gap-1">
          {[52, 40, 40, 36, 52, 44, 52].map((w, i) => (
            <div
              key={i}
              className="animate-pulse rounded-md bg-accent/60"
              style={{ height: 28, width: w, animationDelay: `${i * 40}ms` }}
            />
          ))}
        </div>

        {/* Right */}
        <div className="flex items-center gap-2">
          <div className="h-7 w-16 animate-pulse rounded-lg bg-accent/60" />
          <div className="h-7 w-16 animate-pulse rounded-lg bg-primary/20" />
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────────── */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Editor area */}
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

        {/* Right panel skeleton (Copilot) */}
        <div className="flex h-full w-[300px] flex-shrink-0 flex-col border-l border-border/30">
          {/* Panel header */}
          <div className="flex h-12 items-center justify-between border-b border-border/30 px-4">
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 animate-pulse rounded-md bg-primary/20" />
              <div className="h-3.5 w-10 animate-pulse rounded bg-muted/50" />
            </div>
            <div className="h-6 w-6 animate-pulse rounded-md bg-accent/60" />
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
