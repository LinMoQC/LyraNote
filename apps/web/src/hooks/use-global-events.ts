"use client";

/**
 * @file 全局 SSE 事件总线 Hook
 * @description 建立与后端 /events/stream 的持久 SSE 连接，接收 Lyra Soul
 *              推送的各类事件，并将其分发到 ProactiveStore 等状态管理器。
 *
 * 支持的事件类型：
 *   lyra_thought       — Lyra 主动浮现的思考/洞察
 *   proactive_insight  — 基于上下文的主动建议
 *   source_indexed     — 来源索引完成通知
 *   portrait_updated   — 用户画像更新完成
 *
 * 特性：
 *   - 断线自动重连（指数退避，最大 30 秒）
 *   - 组件卸载时自动清理连接
 */

import { useEffect, useRef } from "react";

import { http } from "@/lib/http-client";
import { EVENTS } from "@/lib/api-routes";
import {
  createSuggestionFingerprint,
  rememberThoughtSurface,
  shouldAutoSurfaceSource,
  shouldAutoSurfaceThought,
} from "@/features/copilot/proactive-surface-policy";
import { useNotebookStore } from "@/store/use-notebook-store";
import { useProactiveStore } from "@/store/use-proactive-store";
import type { ProactiveSuggestion } from "@/store/use-proactive-store";
import { authHeaderFromCookie } from "@/lib/request-error";

interface LyraSoulEvent {
  type: "lyra_thought" | "proactive_insight" | "source_indexed" | "portrait_updated";
  content?: string;
  insight?: string;
  source_id?: string;
  source_name?: string;
  summary?: string;
  questions?: string[];
  message?: string;
}

const MIN_RETRY_MS = 2_000;
const MAX_RETRY_MS = 30_000;

export function useGlobalEvents() {
  const addSuggestion = useProactiveStore((s) => s.addSuggestion);
  const abortRef = useRef<AbortController | null>(null);
  const retryDelayRef = useRef(MIN_RETRY_MS);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;

    const connect = async () => {
      if (!mounted) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const url = http.url(EVENTS.STREAM);
        const res = await fetch(url, {
          credentials: "include",
          headers: { ...authHeaderFromCookie() },
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`SSE connect failed: ${res.status}`);
        }

        // 连接成功，重置退避
        retryDelayRef.current = MIN_RETRY_MS;

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (mounted) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const raw = trimmed.slice(5).trim();
            if (!raw || raw === "[DONE]") continue;

            try {
              const event = JSON.parse(raw) as LyraSoulEvent;
              handleEvent(event, addSuggestion);
            } catch {
              // 忽略无法解析的 SSE 数据行
            }
          }
        }
      } catch (err: unknown) {
        if (!mounted) return;
        // AbortError 是正常断开，不需要重连
        if (err instanceof DOMException && err.name === "AbortError") return;

        // 指数退避重连
        const delay = retryDelayRef.current;
        retryDelayRef.current = Math.min(delay * 2, MAX_RETRY_MS);
        retryTimerRef.current = setTimeout(() => {
          if (mounted) connect();
        }, delay);
      }
    };

    connect();

    return () => {
      mounted = false;
      abortRef.current?.abort();
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [addSuggestion]);
}

function handleEvent(
  event: LyraSoulEvent,
  addSuggestion: (suggestion: Omit<ProactiveSuggestion, "id" | "createdAt" | "read">) => string | null,
) {
  const isMobile = window.matchMedia("(max-width: 767px)").matches;
  const notebookState = useNotebookStore.getState();
  const proactiveState = useProactiveStore.getState();
  const hasActiveSurface = proactiveState.suggestions.some(
    (suggestion) => suggestion.delivery === "surface" && !suggestion.read && !suggestion.hiddenAt,
  );

  switch (event.type) {
    case "lyra_thought": {
      const message = event.content ?? event.message;
      const fingerprint = createSuggestionFingerprint("lyra_thought", { message });
      const delivery = shouldAutoSurfaceThought({
        fingerprint,
        isMobile,
        copilotOpen: notebookState.copilotPanelOpen,
        streaming: notebookState.copilotStreaming,
        hasActiveSurface,
        lastInteractionAt: notebookState.lastInteractionAt,
      })
        ? "surface"
        : "inbox";

      addSuggestion({
        type: "insight",
        origin: "lyra_thought",
        delivery,
        fingerprint,
        message,
      });
      if (delivery === "surface") {
        rememberThoughtSurface(fingerprint);
      }
      break;
    }

    case "proactive_insight":
      addSuggestion({
        type: "insight",
        origin: "proactive_insight",
        delivery: "inbox",
        fingerprint: createSuggestionFingerprint("proactive_insight", {
          summary: event.summary ?? event.insight,
          questions: event.questions,
          message: event.message,
        }),
        summary: event.summary ?? event.insight,
        questions: event.questions,
        message: event.message,
      });
      break;

    case "source_indexed":
      addSuggestion({
        type: "source_indexed",
        origin: "source_indexed",
        delivery: shouldAutoSurfaceSource(isMobile) ? "surface" : "inbox",
        fingerprint: createSuggestionFingerprint("source_indexed", {
          sourceId: event.source_id,
          sourceName: event.source_name,
          summary: event.summary,
        }),
        sourceId: event.source_id,
        sourceName: event.source_name,
        summary: event.summary,
        questions: event.questions,
      });
      break;

    default:
      break;
  }
}
