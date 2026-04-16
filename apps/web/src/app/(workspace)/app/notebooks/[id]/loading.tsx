export default function NotebookLoading() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── TopBar skeleton (breadcrumb + ... menu) ──────────────── */}
      <div className="flex h-10 flex-shrink-0 items-center border-b border-border/20 bg-card/10 px-3">
        <div className="flex flex-1 items-center gap-1.5">
          <div className="h-5 w-10 animate-pulse rounded-md bg-muted/40" />
          <span className="text-muted-foreground/20 text-xs">/</span>
          <div className="h-5 w-16 animate-pulse rounded-md bg-muted/40" />
          <span className="text-muted-foreground/20 text-xs">/</span>
          <div className="h-5 w-36 animate-pulse rounded-md bg-muted/40" />
        </div>
        <div className="h-7 w-7 animate-pulse rounded-md bg-accent/40" />
      </div>

      {/* ── Body ─────────────────────────────────────────────────── */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Editor area */}
        <div className="flex flex-1 flex-col items-center overflow-hidden px-8 pt-20 pb-10">
          <div className="w-full max-w-3xl space-y-4">
            {/* Large title — two lines like the actual h1 */}
            <div className="h-10 w-full animate-pulse rounded-lg bg-muted/50" />
            <div className="h-10 w-3/4 animate-pulse rounded-lg bg-muted/50" style={{ animationDelay: "60ms" }} />

            <div className="h-6" />

            {/* Section heading */}
            <div className="h-6 w-2/5 animate-pulse rounded-md bg-muted/45" style={{ animationDelay: "120ms" }} />

            {/* Paragraph lines */}
            {[100, 92, 88, 96].map((w, i) => (
              <div
                key={i}
                className="animate-pulse rounded bg-muted/40"
                style={{ height: 13, width: `${w}%`, animationDelay: `${(i + 3) * 60}ms` }}
              />
            ))}

            <div className="h-4" />

            {/* Section heading */}
            <div className="h-6 w-1/2 animate-pulse rounded-md bg-muted/45" style={{ animationDelay: "360ms" }} />

            {/* Paragraph lines */}
            {[100, 95, 82, 90, 70].map((w, i) => (
              <div
                key={i + 10}
                className="animate-pulse rounded bg-muted/40"
                style={{ height: 13, width: `${w}%`, animationDelay: `${(i + 7) * 60}ms` }}
              />
            ))}

            <div className="h-4" />

            {/* Section heading */}
            <div className="h-6 w-2/5 animate-pulse rounded-md bg-muted/45" style={{ animationDelay: "720ms" }} />

            {/* Paragraph lines */}
            {[100, 88, 95, 78, 85, 60].map((w, i) => (
              <div
                key={i + 20}
                className="animate-pulse rounded bg-muted/40"
                style={{ height: 13, width: `${w}%`, animationDelay: `${(i + 13) * 60}ms` }}
              />
            ))}
          </div>
        </div>

        {/* ── Right TOC panel skeleton ──────────────────────────── */}
        <div className="hidden w-44 flex-shrink-0 border-l border-border/15 px-3 py-4 xl:flex xl:flex-col">
          <div className="space-y-2.5">
            {[80, 90, 75, 85, 65].map((w, i) => (
              <div
                key={i}
                className="animate-pulse rounded bg-muted/40"
                style={{ height: 11, width: `${w}%`, animationDelay: `${i * 80}ms` }}
              />
            ))}
          </div>
        </div>

        {/* Floating Copilot orb skeleton */}
        <div
          data-testid="notebook-loading-orb"
          className="pointer-events-none fixed bottom-6 right-6 z-10 flex h-12 w-12 items-center justify-center"
        >
          <div
            className="absolute inset-0 animate-pulse rounded-full shadow-lg shadow-indigo-950/30 ring-1 ring-white/10"
            style={{
              background:
                "radial-gradient(circle at 35% 35%, rgba(167,139,250,0.75), rgba(99,102,241,0.65) 55%, rgba(59,130,246,0.6))",
            }}
          />
          <div className="absolute inset-[4px] animate-pulse rounded-full bg-card/70 backdrop-blur-[6px]" />
          <div className="absolute left-3 top-2.5 h-2.5 w-2.5 rounded-full bg-white/20 blur-[3px]" />
          <div className="absolute inset-0 rounded-full ring-2 ring-indigo-400/20" />
        </div>
      </div>
    </div>
  )
}
