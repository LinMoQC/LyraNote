import type { SkillItem } from "@lyranote/api-client"

import { getDesktopSkillService } from "@/lib/api-client"

export function getSkills() {
  return getDesktopSkillService().getSkills().then((skills) => skills.map(mapSkillToLegacy))
}

export function toggleSkill(name: string, is_enabled: boolean) {
  return getDesktopSkillService().toggleSkill(name, is_enabled)
}

function mapSkillToLegacy(skill: SkillItem) {
  return {
    name: skill.name,
    display_name: skill.displayName,
    description: skill.description,
    category: skill.category,
    is_enabled: skill.isEnabled,
    always: skill.always,
    env_satisfied: skill.envSatisfied,
  }
}
