export default function NotebooksLoading() {
  return (
    <div className="flex h-full flex-col gap-6 p-8 dark:border border-border/40">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-36 animate-pulse rounded-lg bg-muted/50" />
        <div className="flex items-center gap-2">
          <div className="h-8 w-20 animate-pulse rounded-lg bg-muted/40" />
          <div className="h-8 w-[66px] animate-pulse rounded-lg bg-muted/40" />
        </div>
      </div>

      {/* Notebook card grid — matches grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {/* "New notebook" card placeholder */}
        <div className="h-[140px] animate-pulse rounded-2xl border border-dashed border-border/30 bg-muted/10" />

        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-2xl border border-border/40 bg-card p-5 animate-pulse"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            {/* Icon + menu */}
            <div className="flex items-start justify-between">
              <div className="h-9 w-9 rounded-xl bg-muted/50" />
              <div className="h-6 w-6 rounded-md bg-muted/30" />
            </div>
            {/* Title */}
            <div className="space-y-1.5">
              <div className="h-4 w-3/5 rounded bg-muted/50" />
              <div className="h-3 w-4/5 rounded bg-muted/40" />
              <div className="h-3 w-2/5 rounded bg-muted/30" />
            </div>
            {/* Footer */}
            <div className="mt-auto flex items-center gap-3">
              <div className="h-3 w-12 rounded bg-muted/30" />
              <div className="h-3 w-16 rounded bg-muted/30" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
