import Image from "next/image";
import { cn } from "@/lib/utils";

export function BotAvatar({ className, spinning }: { className?: string; spinning?: boolean }) {
  if (spinning) {
    return (
      <div className="relative h-8 w-8 shrink-0">
        <div
          className="absolute inset-0 spin-ease rounded-full"
          style={{ background: "conic-gradient(from 0deg, #a78bfa, #818cf8, #60a5fa, transparent 55%)" }}
        />
        <div className="absolute inset-[2.5px] overflow-hidden rounded-full">
          <Image src="/bot_avatar.png" alt="AI" width={56} height={56} className="h-full w-full object-cover" />
        </div>
      </div>
    );
  }
  return (
    <div className={cn("h-6 w-6 flex-shrink-0 overflow-hidden rounded-full", className)}>
      <Image src="/bot_avatar.png" alt="AI" width={56} height={56} className="h-full w-full object-cover" />
    </div>
  );
}
