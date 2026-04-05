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
import { useMediaQuery } from "@/hooks/use-media-query";

const HEARTBEAT_INTERVAL_MS = 30_000;

interface ActivitySnapshot {
    action: string;
    notebook_id?: string | null;
    notebook_title?: string | null;
    note_id?: string | null;
  note_title?: string | null;
    editor_word_count?: number | null;
    active_source_id?: string | null;
    copilot_open?: boolean;
    is_mobile?: boolean;
    typing_recently?: boolean;
    last_interaction_ms?: number | null;
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
  const copilotPanelOpen = useNotebookStore((s) => s.copilotPanelOpen);
  const lastInteractionAt = useNotebookStore((s) => s.lastInteractionAt);
  const lastTypingAt = useNotebookStore((s) => s.lastTypingAt);
  const recordInteraction = useNotebookStore((s) => s.recordInteraction);
  const recordTyping = useNotebookStore((s) => s.recordTyping);
  const { matches: isMobile } = useMediaQuery("(max-width: 767px)");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const copilotOpenRef = useRef(false);
  const isMobileRef = useRef(false);
  const lastInteractionRef = useRef(0);
  const lastTypingRef = useRef(0);

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
    copilotOpenRef.current = copilotPanelOpen;
  }, [copilotPanelOpen]);

  useEffect(() => {
    isMobileRef.current = isMobile;
  }, [isMobile]);

  useEffect(() => {
    lastInteractionRef.current = lastInteractionAt;
  }, [lastInteractionAt]);

  useEffect(() => {
    lastTypingRef.current = lastTypingAt;
  }, [lastTypingAt]);

  useEffect(() => {
    const onInteraction = () => recordInteraction(Date.now());
    const onKeydown = () => recordTyping(Date.now());

    window.addEventListener("mousedown", onInteraction, { passive: true });
    window.addEventListener("touchstart", onInteraction, { passive: true });
    window.addEventListener("keydown", onKeydown);

    return () => {
      window.removeEventListener("mousedown", onInteraction);
      window.removeEventListener("touchstart", onInteraction);
      window.removeEventListener("keydown", onKeydown);
    };
  }, [recordInteraction, recordTyping]);

  useEffect(() => {
    const send = async () => {
      const now = Date.now();

      try {
        await http.post(ACTIVITY.HEARTBEAT, {
          ...snapshotRef.current,
          copilot_open: copilotOpenRef.current,
          is_mobile: isMobileRef.current,
          typing_recently: now - lastTypingRef.current < 20_000,
          last_interaction_ms: lastInteractionRef.current || null,
          timestamp_ms: now,
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
