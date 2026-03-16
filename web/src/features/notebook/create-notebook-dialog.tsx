"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function CreateNotebookDialog() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)} variant="secondary">
        New notebook
      </Button>
      <Dialog
        description="The creation flow is scaffolded here and can later connect to services/notebook-service.ts."
        open={open}
        title="Create notebook"
      >
        <div className="space-y-4">
          <Input placeholder="Notebook name" />
          <div className="flex justify-end gap-3">
            <Button onClick={() => setOpen(false)} variant="ghost">
              Cancel
            </Button>
            <Button onClick={() => setOpen(false)}>Create</Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
