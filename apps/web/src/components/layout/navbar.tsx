"use client";

import { Bell, Search, Sparkles } from "lucide-react";
import { usePathname } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const titleMap: Record<string, string> = {
  "/app": "Workspace overview",
  "/app/notebooks": "Notebook library",
  "/app/settings": "Workspace settings"
};

export function Navbar() {
  const pathname = usePathname();
  const title = titleMap[pathname] ?? "Notebook workspace";

  return (
    <header className="surface-panel sticky top-6 z-10 flex items-center justify-between gap-4 px-5 py-4">
      <div className="space-y-1">
        <Badge>Frontend demo</Badge>
        <h2 className="text-xl font-semibold">{title}</h2>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative hidden w-72 lg:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <Input className="pl-9" placeholder="Search notebook, source, artifact..." />
        </div>
        <Button size="sm" variant="secondary">
          <Sparkles size={16} />
          New flow
        </Button>
        <button className="rounded-full border border-border/50 p-2 text-muted-foreground transition hover:text-foreground" type="button">
          <Bell size={16} />
        </button>
      </div>
    </header>
  );
}
