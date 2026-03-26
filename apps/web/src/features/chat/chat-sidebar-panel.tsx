"use client";

import { AnimatePresence, m } from "framer-motion";
import {
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";
import type { ConversationRecord } from "@/services/conversation-service";
import { ChatSidebar } from "@/features/chat/chat-layout";
import { groupByDate } from "./chat-helpers";

export interface ChatSidebarPanelProps {
  conversationList: ConversationRecord[];
  activeConvId: string | null;
  hasMoreConversations: boolean;
  deletePending: boolean;
  onSelectConv: (conv: ConversationRecord) => void;
  onNewChat: () => void;
  onDeleteConv: (id: string) => void;
  onLoadMore: () => void;
}

export function ChatSidebarPanel({
  conversationList,
  activeConvId,
  hasMoreConversations,
  deletePending,
  onSelectConv,
  onNewChat,
  onDeleteConv,
  onLoadMore,
}: ChatSidebarPanelProps) {
  const t = useTranslations("chat");
  const tc = useTranslations("common");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ConversationRecord | null>(null);

  useEffect(() => {
    if (!menuOpenId) return;
    function handleClick() { setMenuOpenId(null); }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpenId]);

  const { today, yesterday, older } = groupByDate(conversationList);

  return (
    <>
      <ChatSidebar>
        <div className="flex-shrink-0 px-3 pb-1 pt-4">
          <button
            type="button"
            onClick={onNewChat}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-foreground/80 transition-colors hover:bg-accent/60 hover:text-foreground"
          >
            <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-primary/20">
              <Plus size={13} className="text-primary" />
            </div>
            {t("newChat")}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4 pt-2 no-scrollbar">
          {[
            { label: t("today"), items: today },
            { label: t("yesterday"), items: yesterday },
            { label: t("earlier"), items: older },
          ]
            .filter((g) => g.items.length > 0)
            .map((group) => (
              <div key={group.label} className="mb-3">
                <p className="mb-0.5 px-3 py-1 text-[11px] font-semibold text-muted-foreground/40">
                  {group.label}
                </p>
                <AnimatePresence initial={false} mode="popLayout">
                  {group.items.map((conv) => {
                    const isActive = activeConvId === conv.id;
                    const isMenuOpen = menuOpenId === conv.id;
                    return (
                      <m.div
                        key={conv.id}
                        layout
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97 }}
                        transition={{ duration: 0.14, ease: "easeOut" }}
                        className="relative"
                      >
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => onSelectConv(conv)}
                          onKeyDown={(e) => e.key === "Enter" && onSelectConv(conv)}
                          className={cn(
                            "group relative flex w-full cursor-pointer items-center rounded-lg px-3 py-2 text-left text-[13px] transition-colors",
                            isActive
                              ? "bg-accent font-medium text-foreground"
                              : "text-foreground/55 hover:bg-muted/50 hover:text-foreground/80"
                          )}
                        >
                          <span className="flex-1 truncate pr-1">{conv.title ?? t("newChat")}</span>
                          <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpenId((v) => (v === conv.id ? null : conv.id));
                            }}
                            className={cn(
                              "flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md transition-all",
                              isMenuOpen
                                ? "bg-accent text-foreground opacity-100"
                                : "text-muted-foreground/50 opacity-0 hover:bg-accent group-hover:opacity-100"
                            )}
                          >
                            <MoreHorizontal size={14} />
                          </button>

                          <AnimatePresence>
                            {isMenuOpen && (
                              <m.div
                                initial={{ opacity: 0, scale: 0.94, y: -4 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.94, y: -4 }}
                                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                onMouseDown={(e) => e.stopPropagation()}
                                className="absolute right-0 top-8 z-50 w-44 overflow-hidden rounded-2xl border border-border/70 bg-popover/95 shadow-xl shadow-black/50 backdrop-blur-sm"
                              >
                                <div className="p-1">
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setMenuOpenId(null); }}
                                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] text-foreground/70 transition-colors hover:bg-accent/60 hover:text-foreground"
                                  >
                                    <Pencil size={13} className="text-muted-foreground/60" />
                                    {t("rename")}
                                  </button>
                                  <div className="mx-2 my-1 h-px bg-accent/60" />
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setMenuOpenId(null);
                                      setDeleteTarget(conv);
                                    }}
                                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] text-red-400/90 transition-colors hover:bg-red-500/[0.1] hover:text-red-400"
                                  >
                                    <Trash2 size={13} />
                                    {t("delete")}
                                  </button>
                                </div>
                              </m.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </m.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            ))}

          {conversationList.length > 0 && hasMoreConversations && (
            <div className="px-3 pt-1">
              <button
                type="button"
                onClick={onLoadMore}
                className="w-full rounded-lg border border-border/40 py-1.5 text-[11px] text-muted-foreground/70 transition-colors hover:bg-accent/50 hover:text-foreground"
              >
                {tc("loadMore")}
              </button>
            </div>
          )}

          {conversationList.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-4 py-10">
              <MessageSquare size={18} className="text-muted-foreground/20" />
              <p className="text-center text-[12px] text-muted-foreground/35">
                {t("emptyHintLine1")}<br />{t("emptyHintLine2")}
              </p>
            </div>
          )}
        </div>
      </ChatSidebar>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {deleteTarget && (
              <>
                <m.div
                  key="backdrop"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="fixed inset-0 z-[9999] bg-black/55 backdrop-blur-sm"
                  onClick={() => setDeleteTarget(null)}
                />
                <m.div
                  key="dialog"
                  initial={{ opacity: 0, scale: 0.96, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: 12 }}
                  transition={{ type: "spring", stiffness: 420, damping: 30 }}
                  className="pointer-events-none fixed inset-0 z-[9999] flex items-center justify-center p-4"
                >
                  <div
                    className="pointer-events-auto w-full max-w-[360px] overflow-hidden rounded-2xl border border-border/50 bg-card shadow-2xl shadow-black/70"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="px-6 pb-5 pt-6">
                      <div className="mb-3 flex items-start gap-3">
                        <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-red-500/12">
                          <Trash2 size={15} className="text-red-400" />
                        </div>
                        <div>
                          <h2 className="text-[15px] font-semibold leading-tight text-foreground">
                            {t("deleteConfirmTitle")}
                          </h2>
                          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground/70">
                            {t("deleteConfirmDesc")}{" "}
                            <span className="font-medium text-foreground/80">
                              &ldquo;{deleteTarget.title ?? t("newChat")}&rdquo;
                            </span>
                          </p>
                          <p className="mt-1.5 text-[12px] text-muted-foreground/40">
                            {t("deleteConfirmWarning")}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex border-t border-border/30">
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(null)}
                        className="flex flex-1 items-center justify-center border-r border-border/30 py-3.5 text-[13px] font-medium text-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground/80"
                      >
                        {tc("cancel")}
                      </button>
                      <button
                        type="button"
                        disabled={deletePending}
                        onClick={() => {
                          onDeleteConv(deleteTarget.id);
                          setDeleteTarget(null);
                        }}
                        className="flex flex-1 items-center justify-center gap-1.5 py-3.5 text-[13px] font-semibold text-red-400 transition-colors hover:bg-red-500/[0.08] hover:text-red-300 disabled:opacity-50"
                      >
                        {deletePending ? <Loader2 size={13} className="animate-spin" /> : tc("delete")}
                      </button>
                    </div>
                  </div>
                </m.div>
              </>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}
