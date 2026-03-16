import type { ReactNode } from "react";

export function ChatSidebar({ children }: { children: ReactNode }) {
  return <div className="flex w-60 flex-shrink-0 flex-col border-r border-border/30">{children}</div>;
}

export function ChatMessageList({ children }: { children: ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 no-scrollbar">
      <div className="mx-auto max-w-2xl space-y-6">{children}</div>
    </div>
  );
}

export function ChatInputContainer({ children }: { children: ReactNode }) {
  return (
    <div className="flex-shrink-0 px-6 py-5">
      <div className="mx-auto max-w-2xl">{children}</div>
    </div>
  );
}
