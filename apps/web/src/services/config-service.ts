/**
 * @file 系统配置服务
 * @description 提供全局应用配置（AI、存储、个性化、邮件等）的读取和更新接口。
 */
import type {
  AppConfigMap,
  TestEmailResult,
  TestEmbeddingResult,
  TestLlmResult,
  TestRerankerResult,
} from "@lyranote/api-client"

import { getWebConfigService } from "@/lib/api-client"

export type {
  AppConfigMap,
  TestEmailResult,
  TestEmbeddingResult,
  TestLlmResult,
  TestRerankerResult,
} from "@lyranote/api-client"

/**
 * 获取当前系统配置
 * @returns 部分填充的配置项映射
 */
export async function getConfig(): Promise<Partial<AppConfigMap>> {
  return getWebConfigService().getConfig()
}

/**
 * 批量更新系统配置
 * @param patch - 需要更新的配置字段（只传变更部分）
 */
export async function updateConfig(patch: Partial<AppConfigMap>): Promise<void> {
  await getWebConfigService().updateConfig(patch)
}

/**
 * 测试当前已保存的 LLM 配置是否可用
 * @returns 测试结果（包含 ok 状态和消息）
 */
export async function testLlmConnection(): Promise<TestLlmResult> {
  return getWebConfigService().testLlmConnection()
}

export async function testUtilityLlmConnection(): Promise<TestLlmResult> {
  return getWebConfigService().testUtilityLlmConnection()
}

/**
 * 测试当前已保存的 Embedding 配置是否可用
 */
export async function testEmbeddingConnection(): Promise<TestEmbeddingResult> {
  return getWebConfigService().testEmbeddingConnection()
}

/**
 * 测试当前已保存的 Reranker 配置是否可用
 */
export async function testRerankerConnection(): Promise<TestRerankerResult> {
  return getWebConfigService().testRerankerConnection()
}

/**
 * 测试当前已保存的 SMTP 邮件配置是否可用
 * @returns 测试结果
 */
export async function testEmailConnection(): Promise<TestEmailResult> {
  return getWebConfigService().testEmailConnection()
}
