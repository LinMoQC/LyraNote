"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export function ThemeToggle({ collapsed }: { collapsed?: boolean }) {
  const { theme, setTheme } = useTheme();
  const t = useTranslations("ui");
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return null;

  const isDark = theme === "dark";

  const handleToggle = () => {
    const newTheme = isDark ? "light" : "dark";

    // Browsers without View Transition API fall back to instant switch
    if (!("startViewTransition" in document)) {
      setTheme(newTheme);
      return;
    }

    (document as Document & { startViewTransition: (cb: () => void) => void })
      .startViewTransition(() => {
        // Sync the DOM class immediately so the API captures the new state
        document.documentElement.classList.toggle("dark", newTheme === "dark");
        setTheme(newTheme);
      });
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      title={isDark ? t("switchLight") : t("switchDark")}
      className={cn(
        "flex items-center gap-3 rounded-lg py-2.5 pl-3 pr-3 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
      )}
    >
      {isDark ? (
        <Sun size={20} className="flex-shrink-0" />
      ) : (
        <Moon size={20} className="flex-shrink-0" />
      )}
      {!collapsed && (
        <span className="whitespace-nowrap">
          {isDark ? t("lightMode") : t("darkMode")}
        </span>
      )}
    </button>
  );
}
