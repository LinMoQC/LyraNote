import Image from "next/image";
import { cn } from "@/lib/utils";

export function BotAvatar({ className }: { className?: string }) {
  return (
    <div className={cn("h-6 w-6 flex-shrink-0 overflow-hidden rounded-full", className)}>
      <Image src="/bot_avatar.png" alt="AI" width={56} height={56} className="h-full w-full object-cover" />
    </div>
  );
}
