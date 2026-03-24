"use client";

import { createContext, useContext, useState } from "react";

export type ColorTheme = "light" | "dark";

const COOKIE_KEY = "lyra:theme";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

interface ThemeContextValue {
  theme: ColorTheme;
  setTheme: (theme: ColorTheme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  setTheme: () => {},
});

function writeCookie(value: ColorTheme) {
  document.cookie = `${COOKIE_KEY}=${value}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

function applyTheme(theme: ColorTheme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function ThemeProvider({
  children,
  defaultTheme,
}: {
  children: React.ReactNode;
  defaultTheme: ColorTheme;
}) {
  const [theme, setThemeState] = useState<ColorTheme>(defaultTheme);

  const setTheme = (newTheme: ColorTheme) => {
    setThemeState(newTheme);
    writeCookie(newTheme);
    applyTheme(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
