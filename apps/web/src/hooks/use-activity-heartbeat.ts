"use client";

/**
 * @file 用户活动心跳 Hook
 * @description 每 30 秒向后端上报一次用户当前操作快照（所在笔记本/笔记、
 *              编辑器字数等），供 Lyra Soul 感知用户上下文。
 */

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { http } from "@/lib/http-client";
import { ACTIVITY } from "@/lib/api-routes";
import { useNotebookStore } from "@/store/use-notebook-store";

const HEARTBEAT_INTERVAL_MS = 30_000;

interface ActivitySnapshot {
  action: string;
  notebook_id?: string | null;
  notebook_title?: string | null;
  note_id?: string | null;
  note_title?: string | null;
  editor_word_count?: number | null;
  active_source_id?: string | null;
  timestamp_ms: number;
}

/**
 * 从当前路径名中解析 notebook ID（格式：/app/notebooks/[id]）。
 */
function parseNotebookId(pathname: string): string | null {
  const match = pathname.match(/\/app\/notebooks\/([^/]+)/);
  return match?.[1] ?? null;
}

/**
 * 从当前路径名中解析 note ID（格式：/app/notebooks/[id]/notes/[noteId]）。
 */
function parseNoteId(pathname: string): string | null {
  const match = pathname.match(/\/notes\/([^/]+)/);
  return match?.[1] ?? null;
}

/**
 * 判断当前用户动作类型。
 */
function inferAction(pathname: string): string {
  if (pathname.includes("/notes/")) return "editing";
  if (pathname.includes("/notebooks/")) return "reading";
  if (pathname.includes("/deep-research")) return "deep_research";
  return "browsing";
}

export function useActivityHeartbeat() {
  const pathname = usePathname();
  const activeSourceId = useNotebookStore((s) => s.activeSourceId);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 使用 ref 持有最新值，避免 interval 闭包过期
  const snapshotRef = useRef<ActivitySnapshot>({
    action: "idle",
    timestamp_ms: Date.now(),
  });

  useEffect(() => {
    snapshotRef.current = {
      action: inferAction(pathname),
      notebook_id: parseNotebookId(pathname),
      note_id: parseNoteId(pathname),
      active_source_id: activeSourceId,
      timestamp_ms: Date.now(),
    };
  }, [pathname, activeSourceId]);

  useEffect(() => {
    const send = async () => {
      try {
        await http.post(ACTIVITY.HEARTBEAT, {
          ...snapshotRef.current,
          timestamp_ms: Date.now(),
        });
      } catch {
        // 静默忽略心跳失败，不影响用户体验
      }
    };

    // 立即发送一次，然后按间隔持续发送
    send();
    timerRef.current = setInterval(send, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []); // 仅挂载时启动一次定时器
}
