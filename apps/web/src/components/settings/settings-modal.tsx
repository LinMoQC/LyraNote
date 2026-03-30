"use client";

import { AnimatePresence, m } from "framer-motion";
import {
  Bell,
  Blocks,
  BookOpen,
  Bot,
  Globe,
  HardDrive,
  Lightbulb,
  Palette,
  Shield,
  Sparkles,
  User,
  Unplug,
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
  MCPSection,
  PublicHomeSection,
} from "./settings-sections";

// ── Nav config ────────────────────────────────────────────────────────────────

const NAV_IDS = ["general", "appearance", "account", "ai", "personality", "publicHome", "memory", "skills", "mcp", "storage", "notify", "security"] as const;
type SectionId = (typeof NAV_IDS)[number];

const NAV_ICONS: Record<SectionId, React.ComponentType<{ size?: number; className?: string }>> = {
  general: Globe,
  appearance: Palette,
  account: User,
  ai: Bot,
  personality: Sparkles,
  publicHome: Lightbulb,
  memory: BookOpen,
  skills: Blocks,
  mcp: Unplug,
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
  publicHome: "sections.publicHome",
  memory: "sections.memory",
  skills: "sections.skills",
  mcp: "sections.mcp",
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
  publicHome: PublicHomeSection,
  memory: MemorySection,
  skills: SkillsSection,
  mcp: MCPSection,
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
          className="pointer-events-auto flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl md:flex-row"
          style={{ height: "min(600px, calc(100dvh - 2rem))" }}
        >
          {/* 左侧导航 — 桌面端垂直排列，移动端水平 Tab 栏 */}
          <nav className="flex w-full flex-shrink-0 flex-row items-center gap-0.5 overflow-x-auto border-b border-border/50 p-2 no-scrollbar md:w-44 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r md:p-3">
            <p className="mb-0 hidden px-3 text-base font-semibold md:mb-2 md:block">{t("title")}</p>
            {NAV_IDS.map((id) => {
              const Icon = NAV_ICONS[id];
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActive(id)}
                  className={cn(
                    "flex flex-shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors md:w-full",
                    active === id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  )}
                >
                  <Icon size={14} className="flex-shrink-0" />
                  <span className="hidden md:inline">{t(NAV_LABEL_KEYS[id])}</span>
                  <span className="md:hidden">{t(NAV_LABEL_KEYS[id])}</span>
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
