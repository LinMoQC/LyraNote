/**
 * @file 通用工具函数
 * @description 提供 Tailwind CSS 类名合并、URL 判断等基础工具。
 */
import { type ClassValue, clsx } from "clsx";
import Link from "next/link";
import { twMerge } from "tailwind-merge";

/**
 * 合并 Tailwind CSS 类名，自动处理冲突（如 px-2 与 px-4 只保留后者）
 * @param inputs - 任意数量的类名、条件类名对象或数组
 * @returns 合并去重后的类名字符串
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 判断链接是否为外部 URL
 * @param href - 链接地址
 * @returns 是否以 http:// 或 https:// 开头
 */
export function isExternalUrl(href: string) {
  return href.startsWith("http://") || href.startsWith("https://");
}

export { Link };
