import { Network } from "lucide-react";

export function KnowledgePage() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-sidebar-text-muted">
      <Network size={36} className="opacity-20" />
      <p className="text-sm opacity-60">Knowledge Graph</p>
      <p className="text-xs opacity-40">Coming soon</p>
    </div>
  );
}
