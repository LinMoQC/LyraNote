import { http } from "@/lib/http-client"
import { SKILLS } from "@/lib/api-routes"

/**
 * @file AI 技能管理服务
 * @description 提供 AI Agent 可用技能的查询和启用/禁用切换接口。
 */

/** 技能信息（前端格式，camelCase） */
export interface SkillItem {
  name: string
  displayName: string | null
  description: string | null
  category: string | null
  version: string
  isBuiltin: boolean
  isEnabled: boolean
  always: boolean
  requiresEnv: string[] | null
  envSatisfied: boolean
}

interface RawSkill {
  name: string
  display_name: string | null
  description: string | null
  category: string | null
  version: string
  is_builtin: boolean
  is_enabled: boolean
  always: boolean
  requires_env: string[] | null
  env_satisfied: boolean
}

/**
 * 将后端原始技能数据映射为前端格式
 * @param raw - 后端返回的 snake_case 技能数据
 * @returns 映射后的 SkillItem
 */
function mapSkill(raw: RawSkill): SkillItem {
  return {
    name: raw.name,
    displayName: raw.display_name,
    description: raw.description,
    category: raw.category,
    version: raw.version,
    isBuiltin: raw.is_builtin,
    isEnabled: raw.is_enabled,
    always: raw.always,
    requiresEnv: raw.requires_env,
    envSatisfied: raw.env_satisfied,
  }
}

/**
 * 获取所有可用技能列表
 * @returns 技能数组
 */
export async function getSkills(): Promise<SkillItem[]> {
  const data = await http.get<RawSkill[]>(SKILLS.LIST)
  return data.map(mapSkill)
}

/**
 * 切换技能的启用/禁用状态
 * @param name - 技能名称
 * @param isEnabled - 是否启用
 */
export async function toggleSkill(name: string, isEnabled: boolean): Promise<void> {
  await http.put(SKILLS.toggle(name), { is_enabled: isEnabled })
}
