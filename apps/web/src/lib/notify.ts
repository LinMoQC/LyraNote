/**
 * @file Toast 通知工具
 * @description 对 sileo toast 库的轻量封装，提供全局统一的通知调用方式。
 */
import { sileo } from "sileo";

/**
 * 显示错误通知
 * @param message - 错误信息文本
 */
export function notifyError(message: string) {
  sileo.error({ title: message });
}

/**
 * 显示成功通知
 * @param message - 成功信息文本
 */
export function notifySuccess(message: string) {
  sileo.success({ title: message });
}

/**
 * 显示信息通知
 * @param message - 提示信息文本
 */
export function notifyInfo(message: string) {
  sileo.info({ title: message });
}
