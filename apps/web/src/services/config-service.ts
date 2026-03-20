/**
 * @file 系统配置服务
 * @description 提供全局应用配置（AI、存储、个性化、邮件等）的读取和更新接口。
 */
import { http } from "@/lib/http-client"
import { CONFIG } from "@/lib/api-routes"
import type { StorageBackend } from "@/lib/constants"

/** 应用配置项完整映射（对应后端 config 表的所有字段） */
export interface AppConfigMap {
  // AI
  openai_api_key: string
  openai_base_url: string
  llm_model: string
  embedding_model: string
  tavily_api_key: string
  perplexity_api_key: string
  // Storage
  storage_backend: StorageBackend
  storage_region: string
  storage_s3_endpoint_url: string
  storage_s3_public_url: string
  storage_s3_bucket: string
  storage_s3_access_key: string
  storage_s3_secret_key: string
  // Personality
  ai_name: string
  user_occupation: string
  user_preferences: string
  custom_system_prompt: string
  // Notify
  notify_email: string
  smtp_host: string
  smtp_port: string
  smtp_username: string
  smtp_password: string
  smtp_from: string
}

/**
 * 获取当前系统配置
 * @returns 部分填充的配置项映射
 */
export async function getConfig(): Promise<Partial<AppConfigMap>> {
  const result = await http.get<{ data: Partial<AppConfigMap> }>(CONFIG.BASE)
  return result.data
}

/**
 * 批量更新系统配置
 * @param patch - 需要更新的配置字段（只传变更部分）
 */
export async function updateConfig(patch: Partial<AppConfigMap>): Promise<void> {
  await http.patch(CONFIG.BASE, { data: patch })
}

/** LLM 连接测试结果 */
export interface TestLlmResult {
  ok: boolean
  model: string
  message: string
}

/**
 * 测试当前已保存的 LLM 配置是否可用
 * @returns 测试结果（包含 ok 状态和消息）
 */
export async function testLlmConnection(): Promise<TestLlmResult> {
  return http.post<TestLlmResult>(CONFIG.TEST_LLM)
}

/** 邮件连接测试结果 */
export interface TestEmailResult {
  ok: boolean
  message: string
}

/**
 * 测试当前已保存的 SMTP 邮件配置是否可用
 * @returns 测试结果
 */
export async function testEmailConnection(): Promise<TestEmailResult> {
  return http.post<TestEmailResult>(CONFIG.TEST_EMAIL)
}
