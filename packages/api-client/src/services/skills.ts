import type { HttpClient } from "../lib/client";
import { SKILLS } from "../lib/routes";

export interface SkillItem {
  name: string;
  displayName: string | null;
  description: string | null;
  category: string | null;
  version: string;
  isBuiltin: boolean;
  isEnabled: boolean;
  always: boolean;
  requiresEnv: string[] | null;
  envSatisfied: boolean;
}

interface RawSkill {
  name: string;
  display_name: string | null;
  description: string | null;
  category: string | null;
  version: string;
  is_builtin: boolean;
  is_enabled: boolean;
  always: boolean;
  requires_env: string[] | null;
  env_satisfied: boolean;
}

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
  };
}

export function createSkillService(http: HttpClient) {
  return {
    getSkills: async (): Promise<SkillItem[]> => {
      const data = await http.get<RawSkill[]>(SKILLS.LIST);
      return data.map(mapSkill);
    },
    toggleSkill: (name: string, isEnabled: boolean) =>
      http.put<void>(SKILLS.toggle(name), { is_enabled: isEnabled }),
  };
}

export type SkillService = ReturnType<typeof createSkillService>;
