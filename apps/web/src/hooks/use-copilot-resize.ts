"use client";

/**
 * @file Copilot 面板拖拽调整宽度 Hook
 * @description 实现右侧 Copilot 面板的拖拽调整宽度。
 *              拖拽时创建全屏透明覆层防止 Tiptap 编辑器抢夺鼠标事件。
 *              同时支持触摸（Touch）事件，兼容移动端/平板。
 */

import { useCallback, useRef, useState } from "react";

/** Copilot 面板最小宽度（px） */
export const MIN_WIDTH = 240;
/** Copilot 面板最大宽度（px） */
export const MAX_WIDTH = 580;
/** Copilot 面板默认宽度（px） */
export const DEFAULT_WIDTH = 300;

/**
 * Copilot 面板拖拽调整宽度
 * @param onWidthChange - 宽度变化回调，每次拖拽移动时触发
 * @param currentWidth  - 当前面板宽度，用于拖拽起点同步
 * @returns {{ isDragging, handleResizeStart, handleResizeTouchStart }}
 */
export function useCopilotResize(
  onWidthChange?: (width: number) => void,
  currentWidth?: number,
) {
  const [isDragging, setIsDragging] = useState(false);
  const widthRef = useRef(currentWidth ?? DEFAULT_WIDTH);
  // 每次渲染同步最新宽度，确保下次拖拽从正确起点开始
  widthRef.current = currentWidth ?? DEFAULT_WIDTH;

  const startDrag = useCallback((startX: number) => {
    setIsDragging(true);
    const startWidth = widthRef.current;

    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:9999;cursor:col-resize;";
    document.body.appendChild(overlay);
    document.body.style.userSelect = "none";

    const applyDelta = (currentX: number) => {
      const delta = startX - currentX;
      const next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + delta));
      widthRef.current = next;
      onWidthChange?.(next);
    };

    const onMouseMove = (ev: MouseEvent) => applyDelta(ev.clientX);
    const onTouchMove = (ev: TouchEvent) => {
      if (ev.touches[0]) applyDelta(ev.touches[0].clientX);
    };

    const cleanup = () => {
      setIsDragging(false);
      document.body.removeChild(overlay);
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", cleanup);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", cleanup);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", cleanup);
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", cleanup);
  }, [onWidthChange]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startDrag(e.clientX);
  }, [startDrag]);

  const handleResizeTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches[0]) startDrag(e.touches[0].clientX);
  }, [startDrag]);

  return { isDragging, handleResizeStart, handleResizeTouchStart };
}
