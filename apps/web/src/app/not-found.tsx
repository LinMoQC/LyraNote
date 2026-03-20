import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="surface-panel max-w-lg space-y-4 p-8 text-center">
        <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">404</p>
        <h1 className="text-3xl font-semibold">Page not found</h1>
        <p className="text-sm text-muted-foreground">
          The requested view does not exist in the current demo workspace.
        </p>
        <Button asLink href="/app">
          Back to workspace
        </Button>
      </div>
    </main>
  );
}
