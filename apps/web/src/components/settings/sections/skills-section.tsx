"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { Toggle } from "../settings-primitives";

const CATEGORY_COLORS: Record<string, string> = {
  knowledge: "bg-blue-500/15 text-blue-400",
  web: "bg-emerald-500/15 text-emerald-400",
  writing: "bg-violet-500/15 text-violet-400",
  memory: "bg-amber-500/15 text-amber-400",
  productivity: "bg-rose-500/15 text-rose-400",
};

export function SkillsSection() {
  const t = useTranslations("settings");
  const [skills, setSkills] = useState<import("@/services/skill-service").SkillItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setTogglingSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    import("@/services/skill-service").then(({ getSkills }) =>
      getSkills().then(setSkills).catch(() => {}).finally(() => setLoading(false))
    );
  }, []);

  const handleToggle = async (name: string, current: boolean) => {
    setTogglingSet((prev) => new Set(prev).add(name));
    try {
      const { toggleSkill } = await import("@/services/skill-service");
      await toggleSkill(name, !current);
      setSkills((prev) =>
        prev.map((s) => (s.name === name ? { ...s, isEnabled: !current } : s))
      );
    } catch (err) {
      console.warn("[SkillsSection] toggleSkill failed:", err);
    }
    setTogglingSet((prev) => {
      const next = new Set(prev);
      next.delete(name);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (skills.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{t("skills.noSkills")}</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t("skills.desc")}</p>

      {skills.map((skill) => (
        <div
          key={skill.name}
          className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/10 px-4 py-3 transition-colors hover:bg-muted/20"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {skill.displayName || skill.name}
              </span>
              {skill.category && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                    CATEGORY_COLORS[skill.category] ?? "bg-muted text-muted-foreground"
                  )}
                >
                  {t(`skills.category_${skill.category}` as Parameters<typeof t>[0])}
                </span>
              )}
              {skill.always && (
                <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                  {t("skills.always")}
                </span>
              )}
            </div>
            {skill.description && (
              <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{skill.description}</p>
            )}
            {!skill.envSatisfied && (
              <p className="mt-0.5 text-[11px] text-amber-400">{t("skills.envMissing")}</p>
            )}
          </div>

          {!skill.always && (
            <Toggle
              checked={skill.isEnabled}
              onChange={() => handleToggle(skill.name, skill.isEnabled)}
            />
          )}
        </div>
      ))}
    </div>
  );
}
