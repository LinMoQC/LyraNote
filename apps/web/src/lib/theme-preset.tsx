"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type ThemePreset = "lyra" | "notion";

const COOKIE_KEY = "lyra:theme-preset";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

interface ThemePresetContextValue {
  themePreset: ThemePreset;
  setThemePreset: (preset: ThemePreset) => void;
}

const ThemePresetContext = createContext<ThemePresetContextValue>({
  themePreset: "lyra",
  setThemePreset: () => {},
});

function readCookiePreset(): ThemePreset {
  if (typeof window === "undefined") return "lyra";
  try {
    const match = document.cookie.match(/(?:^|;\s*)lyra:theme-preset=([^;]*)/);
    return match?.[1] === "notion" ? "notion" : "lyra";
  } catch {
    return "lyra";
  }
}

function applyPreset(preset: ThemePreset) {
  const root = document.documentElement;
  if (preset === "lyra") {
    root.removeAttribute("data-theme-preset");
  } else {
    root.setAttribute("data-theme-preset", preset);
  }
}

export function ThemePresetProvider({ children }: { children: React.ReactNode }) {
  const [themePreset, setThemePresetState] = useState<ThemePreset>(readCookiePreset);

  useEffect(() => {
    applyPreset(themePreset);
  }, [themePreset]);

  const setThemePreset = (preset: ThemePreset) => {
    setThemePresetState(preset);
    document.cookie = `${COOKIE_KEY}=${preset}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
    applyPreset(preset);
  };

  return (
    <ThemePresetContext.Provider value={{ themePreset, setThemePreset }}>
      {children}
    </ThemePresetContext.Provider>
  );
}

export function useThemePreset() {
  return useContext(ThemePresetContext);
}
