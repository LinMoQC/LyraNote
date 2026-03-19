/**
 * @file 请求错误处理工具
 * @description 提供认证 token 提取、401 未授权跳转、错误信息格式化等通用函数，
 *              被 HttpClient（http-client.ts）内部的 axios 拦截器和 fetch 流式请求共同使用。
 */

import type { AxiosError } from "axios";

/**
 * 从 document.cookie 中提取指定名称的 Cookie 值
 * @param name - Cookie 名称
 * @returns Cookie 值，未找到返回 null
 */
function getCookieValue(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match?.[1] ?? null;
}

/**
 * 从 Cookie 中读取会话 token 并构造 Authorization 请求头
 * @returns 包含 Bearer token 的请求头对象，未登录时返回空对象
 */
export function authHeaderFromCookie(): Record<string, string> {
  const token = getCookieValue("lyranote_session");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** API business code: system not yet initialized */
export const CODE_NOT_CONFIGURED = 1001;

/**
 * 处理 code 1001（系统未初始化）：重定向到初始化向导页
 * 仅在浏览器端且当前不在 /setup 页面时触发
 */
export function handleNotConfigured() {
  if (typeof window === "undefined") return;
  if (!window.location.pathname.startsWith("/setup")) {
    window.location.href = "/setup";
  }
}

/**
 * 处理 401 未授权响应：重定向到 /login?expired=1
 * middleware 检测到 expired 参数后会在服务端清除 httpOnly cookie
 */
export function handleUnauthorized() {
  if (typeof window === "undefined") return;
  const pathname = window.location.pathname;
  if (!pathname.startsWith("/login") && !pathname.startsWith("/setup")) {
    window.location.href = "/login?expired=1";
  }
}

/**
 * 从各类错误对象中提取人类可读的错误信息
 * @param error - 捕获到的错误（可能是 AxiosError、Error 或字符串）
 * @param fallback - 无法提取时的兜底文案
 * @returns 用于展示给用户的错误描述文本
 */
export function getErrorMessage(error: unknown, fallback = "请求失败，请稍后重试"): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const axiosError = error as AxiosError<{ detail?: string; message?: string }>;
    const detail = axiosError.response?.data?.detail ?? axiosError.response?.data?.message;
    if (detail && detail.trim()) return detail;
    if (axiosError.message?.trim()) return axiosError.message;
    const genericMessage = (error as { message?: string }).message;
    if (genericMessage?.trim()) return genericMessage;
  }
  return fallback;
}

/**
 * 判断错误是否为用户主动取消（AbortController.abort）引起
 * @param error - 捕获到的错误对象
 * @returns 是否为 AbortError
 */
export function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { name?: string; message?: string };
  return e.name === "AbortError" || e.message === "The operation was aborted.";
}
