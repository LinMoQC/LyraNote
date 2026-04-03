export default function NotebooksLoading() {
  return (
    <div className="flex h-full flex-col gap-5 border border-border/40 px-4 py-5 dark:border sm:gap-6 sm:p-8">
      {/* Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start justify-between gap-4 sm:block">
          <div className="h-10 w-44 animate-pulse rounded-xl bg-muted/50 sm:h-8 sm:w-36 sm:rounded-lg" />
          <div className="h-10 w-36 animate-pulse rounded-full bg-muted/40 sm:hidden" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-20 animate-pulse rounded-lg bg-muted/40" />
          <div className="h-8 w-[66px] animate-pulse rounded-lg bg-muted/40" />
        </div>
      </div>

      {/* Notebook card grid — matches grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 */}
      <div
        data-testid="notebooks-loading-grid"
        className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex min-h-[180px] max-h-[280px] flex-col rounded-[24px] border border-border/40 bg-card p-4 animate-pulse sm:min-h-0 sm:h-[200px] sm:max-h-[200px] sm:rounded-2xl"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            {/* Icon */}
            <div className="h-10 w-10 rounded-xl bg-muted/50" />
            {/* Title + summary */}
            <div className="mt-3 space-y-2">
              <div className="h-4 w-2/5 rounded bg-muted/50" />
              <div className="h-3 w-4/5 rounded bg-muted/35" />
              <div className="h-3 w-3/5 rounded bg-muted/25" />
            </div>
            {/* Footer */}
            <div className="mt-auto flex items-center gap-2.5 border-t border-border/20 pt-2.5">
              <div className="h-3 w-14 rounded bg-muted/30" />
              <div className="h-3 w-14 rounded bg-muted/30" />
              <div className="ml-auto h-3 w-10 rounded bg-muted/30" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
