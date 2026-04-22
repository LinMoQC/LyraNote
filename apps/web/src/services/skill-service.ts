import type { SkillItem } from "@lyranote/api-client"

import { getWebSkillService } from "@/lib/api-client"

/**
 * @file AI 技能管理服务
 * @description 提供 AI Agent 可用技能的查询和启用/禁用切换接口。
 */

export type { SkillItem } from "@lyranote/api-client"

/**
 * 获取所有可用技能列表
 * @returns 技能数组
 */
export async function getSkills(): Promise<SkillItem[]> {
  return getWebSkillService().getSkills()
}

/**
 * 切换技能的启用/禁用状态
 * @param name - 技能名称
 * @param isEnabled - 是否启用
 */
export async function toggleSkill(name: string, isEnabled: boolean): Promise<void> {
  await getWebSkillService().toggleSkill(name, isEnabled)
}
