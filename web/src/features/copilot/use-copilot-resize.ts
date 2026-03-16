"use client";

/**
 * @file Copilot 面板拖拽调整宽度 Hook
 * @description 实现右侧 Copilot 面板的弹性拖拽调整宽度，
 *              使用 framer-motion 的 useSpring 实现阻尼动画效果。
 *              拖拽时创建全屏透明覆层防止 Tiptap 编辑器抢夺鼠标事件。
 */

import { useSpring } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

/** Copilot 面板最小宽度（px） */
export const MIN_WIDTH = 240;
/** Copilot 面板最大宽度（px） */
export const MAX_WIDTH = 580;
/** Copilot 面板默认宽度（px） */
export const DEFAULT_WIDTH = 300;

/**
 * Copilot 面板弹性拖拽调整宽度
 * @param isOpen - 面板是否展开
 * @param onWidthChange - 宽度变化回调（每帧触发），用于父容器同步布局
 * @param markAllRead - 面板打开时标记所有建议为已读
 * @returns {{ isDragging, asideRef, handleResizeStart }} 拖拽状态、面板 ref 和拖拽起始事件处理
 */
export function useCopilotResize(
  isOpen: boolean,
  onWidthChange?: (width: number) => void,
  markAllRead?: () => void
) {
  const [isDragging, setIsDragging] = useState(false);
  const widthRef = useRef(DEFAULT_WIDTH);
  const asideRef = useRef<HTMLDivElement>(null);

  const springWidth = useSpring(DEFAULT_WIDTH, {
    stiffness: 280,
    damping: 28,
    mass: 0.6,
  });

  useEffect(() => {
    if (isOpen) {
      springWidth.set(widthRef.current);
      markAllRead?.();
    } else {
      springWidth.set(0);
    }
  }, [isOpen, springWidth, markAllRead]);

  useEffect(() => {
    return springWidth.on("change", (v) => {
      const w = Math.max(0, v);
      if (asideRef.current) asideRef.current.style.width = `${w}px`;
      onWidthChange?.(w);
    });
  }, [springWidth, onWidthChange]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const startX = e.clientX;
    const startWidth = widthRef.current;

    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:9999;cursor:col-resize;";
    document.body.appendChild(overlay);
    document.body.style.userSelect = "none";

    const onMouseMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      const next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + delta));
      widthRef.current = next;
      springWidth.set(next);
    };

    const onMouseUp = () => {
      setIsDragging(false);
      document.body.removeChild(overlay);
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [springWidth]);

  return { isDragging, asideRef, handleResizeStart };
}
