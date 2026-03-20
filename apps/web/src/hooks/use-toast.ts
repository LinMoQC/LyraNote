"use client";

/**
 * @file Toast Hook
 * @description 对 sileo toast 库的 Hook 封装，提供 toast、success、error 三种通知方法。
 */

import { sileo } from "sileo";

/**
 * Toast 通知 Hook
 * @returns {{ toast, success, error }} 三种级别的通知触发方法
 */
export function useToast() {
  return {
    toast: (value: string) => sileo.info({ title: value }),
    success: (value: string) => sileo.success({ title: value }),
    error: (value: string) => sileo.error({ title: value }),
  };
}
