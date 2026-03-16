"use client";

import { AnimatePresence, m } from "framer-motion";
import {
  Bell,
  Blocks,
  BookOpen,
  Bot,
  Globe,
  HardDrive,
  Palette,
  Shield,
  Sparkles,
  User,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/use-ui-store";
import {
  GeneralSection,
  AppearanceSection,
  AccountSection,
  AIConfigSection,
  PersonalitySection,
  StorageSection,
  NotifySection,
  SecuritySection,
  MemorySection,
  SkillsSection,
} from "./settings-sections";

// ── Nav config ────────────────────────────────────────────────────────────────

const NAV_IDS = ["general", "appearance", "account", "ai", "personality", "memory", "skills", "storage", "notify", "security"] as const;
type SectionId = (typeof NAV_IDS)[number];

const NAV_ICONS: Record<SectionId, React.ComponentType<{ size?: number; className?: string }>> = {
  general: Globe,
  appearance: Palette,
  account: User,
  ai: Bot,
  personality: Sparkles,
  memory: BookOpen,
  skills: Blocks,
  storage: HardDrive,
  notify: Bell,
  security: Shield,
};

const NAV_LABEL_KEYS: Record<SectionId, string> = {
  general: "sections.general",
  appearance: "sections.appearance",
  account: "sections.account",
  ai: "sections.ai",
  personality: "sections.personality",
  memory: "sections.memory",
  skills: "sections.skills",
  storage: "sections.storage",
  notify: "sections.notify",
  security: "sections.security",
};

const SECTION_COMPONENTS: Record<SectionId, React.ComponentType> = {
  general: GeneralSection,
  appearance: AppearanceSection,
  account: AccountSection,
  ai: AIConfigSection,
  personality: PersonalitySection,
  memory: MemorySection,
  skills: SkillsSection,
  storage: StorageSection,
  notify: NotifySection,
  security: SecuritySection,
};

// ── Modal ─────────────────────────────────────────────────────────────────────

export function SettingsModal() {
  const t = useTranslations("settings");
  const isOpen = useUiStore((s) => s.settingsOpen);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const initialSection = useUiStore((s) => s.settingsInitialSection);
  const [active, setActive] = useState<SectionId>(() => {
    if (initialSection && NAV_IDS.includes(initialSection as SectionId)) {
      return initialSection as SectionId;
    }
    return "general";
  });

  const close = () => setSettingsOpen(false);
  const ActiveSection = SECTION_COMPONENTS[active];

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <m.div
        key="settings-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={close}
      />

      <m.div
        key="settings-panel"
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ type: "spring", stiffness: 340, damping: 30, mass: 0.8 }}
        className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="pointer-events-auto flex h-[600px] w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        >
          <nav className="flex w-44 flex-shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border/50 p-3">
            <p className="mb-2 px-3 text-base font-semibold">{t("title")}</p>
            {NAV_IDS.map((id) => {
              const Icon = NAV_ICONS[id];
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActive(id)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                    active === id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  )}
                >
                  <Icon size={14} className="flex-shrink-0" />
                  {t(NAV_LABEL_KEYS[id])}
                </button>
              );
            })}
          </nav>

          <div className="relative flex flex-1 flex-col overflow-hidden">
            <button
              type="button"
              onClick={close}
              className="absolute right-4 top-4 z-10 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
            >
              <X size={15} />
            </button>

            <div className="flex-shrink-0 border-b border-border/50 px-6 py-4">
              <h2 className="text-sm font-semibold">{t(NAV_LABEL_KEYS[active])}</h2>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <AnimatePresence mode="wait">
                <m.div
                  key={active}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.15 }}
                >
                  <ActiveSection />
                </m.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </m.div>
    </AnimatePresence>
  );
}
