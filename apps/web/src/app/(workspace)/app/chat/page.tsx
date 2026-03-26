import { Suspense } from "react";

import { ChatView } from "@/features/chat/chat-view";
import { Skeleton } from "@/components/ui/skeleton";

function ChatFallback() {
  return (
    <div className="flex h-full dark:border border-border/40">
      {/* Sidebar skeleton — mirrors ChatSidebar: hidden md:flex w-60 */}
      <div className="hidden md:flex w-60 flex-shrink-0 flex-col border-r border-border/30">
        {/* New chat button */}
        <div className="flex-shrink-0 px-3 pb-1 pt-4">
          <Skeleton className="h-9 w-full rounded-xl" />
        </div>
        {/* Conversation list */}
        <div className="flex flex-1 flex-col gap-1 px-2 pt-3">
          <Skeleton className="mb-1 h-3 w-10 rounded-md opacity-40" />
          {[0, 1, 2].map((i) => (
            <Skeleton
              key={i}
              className="h-8 w-full rounded-lg"
              style={{ animationDelay: `${i * 60}ms` }}
            />
          ))}
          <Skeleton className="mb-1 mt-3 h-3 w-14 rounded-md opacity-40" />
          {[0, 1].map((i) => (
            <Skeleton
              key={i}
              className="h-8 w-full rounded-lg"
              style={{ animationDelay: `${(i + 3) * 60}ms` }}
            />
          ))}
        </div>
      </div>

      {/* Main area skeleton */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Messages area */}
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-10">
          <Skeleton className="h-14 w-14 rounded-2xl" />
          <Skeleton className="h-5 w-40 rounded-lg" />
          <Skeleton className="h-3.5 w-56 rounded-lg" />
          <div className="mt-4 grid w-full max-w-lg grid-cols-2 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton
                key={i}
                className="h-[52px] rounded-xl border border-border/30 bg-muted/30"
                style={{ animationDelay: `${i * 80}ms` }}
              />
            ))}
          </div>
        </div>

        {/* Input area */}
        <div className="border-t border-border/20 p-4">
          <Skeleton className="h-12 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<ChatFallback />}>
      <ChatView />
    </Suspense>
  );
}
