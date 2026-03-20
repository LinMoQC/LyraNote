"use client";

/**
 * @file 剪贴板复制 Hook
 * @description 封装 navigator.clipboard API，提供复制操作和「已复制」状态反馈。
 */

import { useCallback, useState } from "react";

/**
 * 剪贴板复制 Hook
 * @returns {{ copied: boolean, copy: (value: string) => Promise<void> }}
 *          copied 在复制成功后保持 1.5 秒的 true 状态
 */
export function useCopyToClipboard() {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async (value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }, []);

  return { copied, copy };
}
