"use client";

/**
 * @file 对话页顶部通知横幅
 * @description 展示两类通知：
 *              1. 笔记创建成功提示（绿色横幅，可跳转查看）
 *              2. 流式请求失败错误提示（红色横幅，可关闭）
 */
import { AnimatePresence, m } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import type { StreamLifecycleState } from "./use-stream-lifecycle";

interface NoteCreatedAlert {
  id: string;
  title: string;
  notebookId?: string;
}

interface ChatAlertsProps {
  noteCreatedAlert: NoteCreatedAlert | null;
  onDismissNoteAlert: () => void;
  streamState: StreamLifecycleState;
  lastError: string | null;
  onResetError: () => void;
}

/**
 * 对话页通知横幅组件
 * @param noteCreatedAlert - 笔记创建成功的提示数据（null 表示不显示）
 * @param onDismissNoteAlert - 关闭笔记创建提示的回调
 * @param streamState - 流式请求的生命周期状态
 * @param lastError - 最近一次错误信息
 * @param onResetError - 清除错误信息的回调
 */
export function ChatAlerts({
  noteCreatedAlert,
  onDismissNoteAlert,
  streamState,
  lastError,
  onResetError,
}: ChatAlertsProps) {
  const router = useRouter();
  const t = useTranslations("chat");
  const tc = useTranslations("common");

  return (
    <>
      <AnimatePresence>
        {noteCreatedAlert && (
          <m.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mx-6 mt-3 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-400"
          >
            <Sparkles size={12} className="flex-shrink-0" />
            <span className="flex-1">{t("noteCreated", { title: noteCreatedAlert.title })}</span>
            {noteCreatedAlert.notebookId && (
              <button
                type="button"
                onClick={() => {
                  router.push(`/app/notebooks/${noteCreatedAlert.notebookId}`);
                  onDismissNoteAlert();
                }}
                className="rounded-md border border-emerald-500/30 px-2 py-0.5 text-[11px] hover:bg-emerald-500/20"
              >
                {t("goToView")}
              </button>
            )}
            <button
              type="button"
              onClick={onDismissNoteAlert}
              className="rounded p-0.5 hover:bg-accent"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </m.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {streamState === "failed" && lastError && (
          <m.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mx-6 mt-3 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-[12px] text-red-300"
          >
            <span className="flex-1">{lastError}</span>
            <button
              type="button"
              onClick={onResetError}
              className="rounded border border-red-400/30 px-2 py-0.5 text-[11px] hover:bg-red-500/10"
            >
              {tc("close")}
            </button>
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}
