"use client";

import { Highlighter, List, Quote, Type } from "lucide-react";

import { Button } from "@/components/ui/button";

export function EditorToolbar() {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border/50 pb-4">
      <Button size="sm" variant="ghost">
        <Type size={14} />
        Heading
      </Button>
      <Button size="sm" variant="ghost">
        <List size={14} />
        List
      </Button>
      <Button size="sm" variant="ghost">
        <Quote size={14} />
        Quote
      </Button>
      <Button size="sm" variant="ghost">
        <Highlighter size={14} />
        Cite
      </Button>
    </div>
  );
}
