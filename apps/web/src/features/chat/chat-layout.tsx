import { useVirtualizer } from "@tanstack/react-virtual";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef } from "react";

export function ChatSidebar({ children }: { children: ReactNode }) {
  return <div className="hidden md:flex w-60 flex-shrink-0 flex-col border-r border-border/30">{children}</div>;
}

export function ChatMessageList({ children }: { children: ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto px-3 py-4 no-scrollbar md:px-6 md:py-6">
      <div className="mx-auto max-w-2xl space-y-4 md:space-y-6">{children}</div>
    </div>
  );
}

const VIRTUAL_THRESHOLD = 50;

/**
 * Virtualized message list for long conversations.
 * Renders only visible messages + buffer for smooth scrolling.
 */
export function VirtualizedMessageList({
  count,
  renderItem,
  estimateSize = 120,
}: {
  count: number;
  renderItem: (index: number) => ReactNode;
  estimateSize?: number;
}) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan: 5,
  });

  const scrollToBottom = useCallback(() => {
    if (count > 0) {
      virtualizer.scrollToIndex(count - 1, { align: "end" });
    }
  }, [count, virtualizer]);

  useEffect(() => {
    scrollToBottom();
  }, [count, scrollToBottom]);

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto px-3 py-4 no-scrollbar md:px-6 md:py-6">
      <div
        className="relative mx-auto max-w-2xl"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            data-index={virtualItem.index}
            ref={virtualizer.measureElement}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${virtualItem.start}px)`,
            }}
            className="pb-4 md:pb-6"
          >
            {renderItem(virtualItem.index)}
          </div>
        ))}
      </div>
    </div>
  );
}

export { VIRTUAL_THRESHOLD };

export function ChatInputContainer({ children }: { children: ReactNode }) {
  return (
    <div className="flex-shrink-0 px-3 py-3 md:px-6 md:py-5">
      <div className="mx-auto max-w-2xl">{children}</div>
    </div>
  );
}
