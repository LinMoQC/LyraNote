/**
 * @file 登录表单校验 Schema
 * @description 登录页的表单验证规则，支持国际化错误提示。
 */

import { z } from "zod";

/**
 * 创建登录表单 Zod Schema（支持 i18n 错误提示）
 * @param t - 国际化翻译函数
 * @returns 登录表单校验 Schema
 */
export function createLoginSchema(t: (key: string) => string) {
  return z.object({
    username: z.string().min(1, t("usernameRequired")),
    password: z.string().min(1, t("passwordRequired")),
  });
}

/** 登录表单字段类型 */
export type LoginFormValues = z.infer<ReturnType<typeof createLoginSchema>>;
