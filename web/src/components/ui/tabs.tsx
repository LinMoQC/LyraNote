"use client";

import { createContext, useContext, useMemo, useState } from "react";

import { cn } from "@/lib/utils";

type TabsContextValue = {
  value: string;
  setValue: (value: string) => void;
};

const TabsContext = createContext<TabsContextValue | null>(null);

export function Tabs({
  defaultValue,
  children,
  className
}: {
  defaultValue: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const contextValue = useMemo(() => ({ value, setValue }), [value]);

  return (
    <TabsContext.Provider value={contextValue}>
      <div className={cn("space-y-4", className)}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("inline-flex rounded-full bg-muted/50 p-1", className)}>{children}</div>;
}

export function TabsTrigger({
  value,
  children,
  className
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  const context = useContext(TabsContext);

  if (!context) {
    throw new Error("TabsTrigger must be used inside Tabs");
  }

  return (
    <button
      className={cn(
        "rounded-full px-4 py-2 text-sm transition",
        context.value === value ? "bg-white text-slate-950" : "text-muted-foreground hover:text-foreground",
        className
      )}
      onClick={() => context.setValue(value)}
      type="button"
    >
      {children}
    </button>
  );
}

export function TabsContent({
  value,
  children,
  className
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  const context = useContext(TabsContext);

  if (!context || context.value !== value) {
    return null;
  }

  return <div className={cn(className)}>{children}</div>;
}
