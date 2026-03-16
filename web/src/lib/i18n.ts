/**
 * @file 轻量级全局国际化工具
 * @description 供非 React 文件（lib、services 等）使用的 i18n 翻译函数。
 *              由 Providers 组件在挂载时通过 setI18nMessages 注入消息对象，
 *              无法获取翻译时回退到 key 本身或指定的 fallback 值。
 */

let _msgs: Record<string, unknown> = {};

/**
 * 注入国际化消息对象（在 Providers 初始化时调用一次）
 * @param messages - 从 next-intl 获取的消息对象
 */
export function setI18nMessages(messages: Record<string, unknown>) {
  _msgs = messages;
}

/**
 * 按点分路径获取翻译文本
 * @param key - 翻译键（如 "errors.pageError"）
 * @param fallback - 未找到翻译时的回退文本
 * @returns 翻译后的文本字符串
 */
export function t(key: string, fallback?: string): string {
  const parts = key.split(".");
  let cur: unknown = _msgs;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return fallback ?? key;
    }
  }
  return typeof cur === "string" ? cur : (fallback ?? key);
}
