"use client";

/**
 * @file 移动端会话列表底部 Sheet
 * @description 在小屏设备上通过底部抽屉展示会话列表，支持切换、新建和加载更多。
 */

import { AnimatePresence, m } from "framer-motion";
import { MessageSquare, Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import type { ConversationRecord } from "@/services/conversation-service";

interface MobileConvSheetProps {
  isOpen: boolean;
  onClose: () => void;
  conversationList: ConversationRecord[];
  activeConvId: string | null;
  hasMoreConversations: boolean;
  onSelectConv: (conv: ConversationRecord) => void;
  onNewChat: () => void;
  onLoadMore: () => void;
}

export function MobileConvSheet({
  isOpen,
  onClose,
  conversationList,
  activeConvId,
  hasMoreConversations,
  onSelectConv,
  onNewChat,
  onLoadMore,
}: MobileConvSheetProps) {
  const t = useTranslations("chat");
  const tc = useTranslations("common");

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <m.div
            key="conv-sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={onClose}
          />
          <m.div
            key="conv-sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="fixed bottom-0 left-0 right-0 z-50 flex max-h-[70vh] flex-col rounded-t-2xl bg-card md:hidden"
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-border/60" />
            </div>
            <div className="flex items-center justify-between px-4 py-2">
              <span className="text-sm font-medium text-foreground">{t("title")}</span>
              <button
                type="button"
                onClick={() => { onNewChat(); onClose(); }}
                className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs text-primary transition-colors hover:bg-primary/20"
              >
                <Plus size={13} />
                {t("newChat")}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-6">
              {conversationList.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground/50">{t("noConversations")}</p>
              ) : (
                conversationList.map((conv) => (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => { onSelectConv(conv); onClose(); }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                      conv.id === activeConvId
                        ? "bg-primary/10 text-primary"
                        : "text-foreground/70 hover:bg-accent/50",
                    )}
                  >
                    <MessageSquare size={15} className="flex-shrink-0" />
                    <span className="flex-1 truncate text-sm">{conv.title ?? t("newChat")}</span>
                  </button>
                ))
              )}
              {hasMoreConversations && (
                <button
                  type="button"
                  onClick={onLoadMore}
                  className="mt-1 w-full rounded-xl py-2 text-xs text-muted-foreground/50 transition-colors hover:text-muted-foreground"
                >
                  {tc("loadMore")}
                </button>
              )}
            </div>
          </m.div>
        </>
      )}
    </AnimatePresence>
  );
}
