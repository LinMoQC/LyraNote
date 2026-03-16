import { Suspense } from "react";

import { ChatView } from "@/features/chat/chat-view";
import { LoadingSpinner } from "@/components/shared/loading-spinner";

function ChatFallback() {
  return (
    <div className="flex h-full items-center justify-center">
      <LoadingSpinner className="size-6" />
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
