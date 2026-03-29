"use client";

import { m, useDragControls } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export type MobileWorkspaceSheetKey = "none" | "sources" | "copilot" | "toc";
export type MobileCopilotSnap = "half" | "tall";

export function MobileWorkspaceSheet({
  activeSheet,
  copilotSnap,
  onClose,
  onSnapChange,
  children,
}: {
  activeSheet: MobileWorkspaceSheetKey;
  copilotSnap: MobileCopilotSnap;
  onClose: () => void;
  onSnapChange: (snap: MobileCopilotSnap) => void;
  children: ReactNode;
}) {
  const isOpen = activeSheet !== "none";
  const [lastOpenSheet, setLastOpenSheet] = useState<Exclude<MobileWorkspaceSheetKey, "none">>("sources");

  useEffect(() => {
    if (activeSheet !== "none") {
      setLastOpenSheet(activeSheet);
    }
  }, [activeSheet]);

  const resolvedSheet = activeSheet === "none" ? lastOpenSheet : activeSheet;
  const isCopilot = resolvedSheet === "copilot";
  const height = isCopilot
    ? (copilotSnap === "tall" ? "84vh" : "56vh")
    : "72vh";
  const dragControls = useDragControls();

  return (
    <>
      <m.div
        initial={false}
        animate={{ opacity: isOpen ? 1 : 0 }}
        transition={{ duration: 0.2 }}
        className={cn(
          "fixed inset-0 z-40 bg-black/50 md:hidden",
          isOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
        onClick={onClose}
      />

      <m.div
        data-testid="mobile-workspace-sheet-root"
        drag={isCopilot ? "y" : false}
        dragControls={dragControls}
        dragListener={false}
        dragElastic={0.08}
        dragConstraints={{ top: 0, bottom: 0 }}
        onDragEnd={(_, info) => {
          if (!isCopilot) return;
          if (info.offset.y < -80) {
            onSnapChange("tall");
            return;
          }
          if (info.offset.y > 80) {
            onSnapChange("half");
          }
        }}
        initial={false}
        animate={{ y: isOpen ? 0 : "100%" }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 flex flex-col overflow-hidden rounded-t-2xl bg-card md:hidden",
          isOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
        style={{ height }}
      >
        <div
          className="flex justify-center pt-3 pb-1"
          onPointerDown={(event) => {
            if (isCopilot) dragControls.start(event);
          }}
        >
          <div className="h-1 w-10 rounded-full bg-border/60" />
        </div>
        <div className="min-h-0 flex-1">{children}</div>
      </m.div>
    </>
  );
}
