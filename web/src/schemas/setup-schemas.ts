/**
 * @file 初始化向导表单校验 Schema
 * @description 系统首次部署时的初始化向导各步骤的表单验证规则，
 *              包含账号、AI 配置、个性化和存储后端四个 Schema。
 */

import { z } from "zod";

// ── 账号 ──────────────────────────────────────────────────────────────────────

/**
 * 创建账号注册表单 Schema
 * @param t - 国际化翻译函数（setup 命名空间）
 * @returns 含密码一致性校验的 Schema
 */
export function createAccountSchema(t: (key: string) => string) {
  return z
    .object({
      username: z.string().min(2, t("validation.usernameMin")),
      password: z.string().min(6, t("validation.passwordMin")),
      confirmPassword: z.string(),
      email: z.string().email(t("validation.invalidEmail")).optional().or(z.literal("")),
      avatar_url: z.string().url(t("validation.invalidImageUrl")).optional().or(z.literal("")),
    })
    .refine((d) => d.password === d.confirmPassword, {
      message: t("validation.passwordMismatch"),
      path: ["confirmPassword"],
    });
}

// ── AI 配置 ───────────────────────────────────────────────────────────────────

/**
 * 创建 AI 配置表单 Schema
 * @param t - 国际化翻译函数
 * @returns AI 相关字段的校验 Schema
 */
export function createAiSchema(t: (key: string) => string) {
  return z.object({
    openai_api_key: z.string().min(1, t("validation.apiKeyRequired")),
    openai_base_url: z.string().url(t("validation.invalidUrl")).optional().or(z.literal("")),
    llm_model: z.string().min(1),
    embedding_model: z.string().min(1),
    tavily_api_key: z.string().optional(),
  });
}

// ── 个性化 ────────────────────────────────────────────────────────────────────

/**
 * 创建 AI 个性化配置表单 Schema
 * @param t - 国际化翻译函数
 * @returns 个性化字段的校验 Schema
 */
export function createPersonalitySchema(t: (key: string) => string) {
  return z.object({
    ai_name: z.string().min(1, t("validation.nameRequired")).max(20, t("validation.nameMaxLength")),
    user_occupation: z.string().max(100).optional(),
    user_preferences: z.string().max(500).optional(),
    custom_system_prompt: z.string().max(5000).optional(),
  });
}

// ── 存储后端 ──────────────────────────────────────────────────────────────────

/**
 * 创建存储后端配置表单 Schema
 * @description 根据选择的存储后端动态校验必填字段：
 *              - minio/oss 需要 endpoint
 *              - s3/cos 需要 region
 *              - 非 local 均需要 bucket 和密钥
 * @param t - 国际化翻译函数
 * @returns 含动态校验规则的存储配置 Schema
 */
export function createStorageSchema(t: (key: string) => string) {
  return z
    .object({
      storage_backend: z.enum(["local", "minio", "s3", "oss", "cos"] as const),
      storage_region: z.string().optional(),
      storage_s3_endpoint_url: z.string().optional(),
      storage_s3_bucket: z.string().optional(),
      storage_s3_access_key: z.string().optional(),
      storage_s3_secret_key: z.string().optional(),
    })
    .superRefine((d, ctx) => {
      const needsEndpoint = d.storage_backend === "minio" || d.storage_backend === "oss";
      const needsRegion = d.storage_backend === "s3" || d.storage_backend === "cos";
      const needsCreds = d.storage_backend !== "local";
      if (needsEndpoint && !d.storage_s3_endpoint_url)
        ctx.addIssue({ code: "custom", path: ["storage_s3_endpoint_url"], message: t("validation.endpointRequired") });
      if (needsRegion && !d.storage_region)
        ctx.addIssue({ code: "custom", path: ["storage_region"], message: t("validation.regionRequired") });
      if (needsCreds && !d.storage_s3_bucket)
        ctx.addIssue({ code: "custom", path: ["storage_s3_bucket"], message: t("validation.bucketRequired") });
      if (needsCreds && !d.storage_s3_access_key)
        ctx.addIssue({ code: "custom", path: ["storage_s3_access_key"], message: t("validation.accessKeyRequired") });
      if (needsCreds && !d.storage_s3_secret_key)
        ctx.addIssue({ code: "custom", path: ["storage_s3_secret_key"], message: t("validation.secretKeyRequired") });
    });
}

// ── 类型导出 ──────────────────────────────────────────────────────────────────

/** 账号表单字段类型 */
export type AccountValues = z.infer<ReturnType<typeof createAccountSchema>>;
/** AI 配置表单字段类型 */
export type AIValues = z.infer<ReturnType<typeof createAiSchema>>;
/** 存储配置表单字段类型 */
export type StorageValues = z.infer<ReturnType<typeof createStorageSchema>>;
/** 个性化配置表单字段类型 */
export type PersonalityValues = z.infer<ReturnType<typeof createPersonalitySchema>>;
