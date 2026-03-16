import { Filter, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuItem } from "@/components/ui/dropdown-menu";

export function NotebookListToolbar() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Workbench</p>
        <h1 className="text-3xl font-semibold">Notebook collection</h1>
      </div>
      <div className="flex items-center gap-3">
        <DropdownMenu label="Sort & filter">
          <DropdownMenuItem>Last updated</DropdownMenuItem>
          <DropdownMenuItem>Source count</DropdownMenuItem>
          <DropdownMenuItem>Artifacts ready</DropdownMenuItem>
        </DropdownMenu>
        <Button variant="outline">
          <Filter size={16} />
          Filter
        </Button>
        <Button>
          <Plus size={16} />
          Create
        </Button>
      </div>
    </div>
  );
}
