"use client";

import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { m } from "framer-motion";

import { getInsights } from "@/services/ai-service";
import { useProactiveStore } from "@/store/use-proactive-store";

export function FloatingOrb({ onClick }: { onClick: () => void }) {
  const storeUnread = useProactiveStore((s) => s.unreadCount);
  const { data: insightsData } = useQuery({
    queryKey: ["insights"],
    queryFn: getInsights,
    refetchInterval: 60_000,
  });
  const unreadCount = storeUnread + (insightsData?.unread_count ?? 0);

  return (
    <m.button
      type="button"
      onClick={onClick}
      title="打开 AI Copilot"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.93 }}
      className="absolute bottom-6 right-6 z-10 flex h-12 w-12 items-center justify-center rounded-full shadow-lg shadow-indigo-900/50 ring-1 ring-white/10"
      style={{
        background: "radial-gradient(circle at 35% 35%, #a78bfa, #6366f1 55%, #3b82f6)",
      }}
    >
      <div className="absolute inset-0 z-10 overflow-hidden rounded-full">
        <Image src="/bot_avatar.png" alt="AI" fill className="object-cover" />
      </div>

      {/* subtle highlight */}
      <div className="absolute left-2.5 top-2 z-20 h-3 w-3 rounded-full bg-white/20 blur-[3px]" />

      {/* unread badge */}
      {unreadCount > 0 && (
        <m.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -right-0.5 -top-0.5 z-20 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white shadow-sm"
        >
          {unreadCount > 9 ? "9+" : unreadCount}
        </m.div>
      )}

      {/* floating bob animation */}
      <m.div
        className="absolute inset-0 rounded-full ring-2 ring-indigo-400/30"
        animate={{ scale: [1, 1.18, 1] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      />
    </m.button>
  );
}
