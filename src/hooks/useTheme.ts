import { useState, useEffect } from "react";

export type Theme = "arctic" | "obsidian" | "sage" | "plum";

const VALID_THEMES: Theme[] = ["arctic", "obsidian", "sage", "plum"];
const STORAGE_KEY = "reactionchain-theme";
const DEFAULT: Theme = "obsidian";

export const THEME_META: Record<Theme, { label: string; swatch: string; emoji: string }> = {
  arctic:   { label: "Arctic",   swatch: "#2255D6", emoji: "❄" },
  obsidian: { label: "Obsidian", swatch: "#F4A92A", emoji: "◼" },
  sage:     { label: "Sage",     swatch: "#3A7D54", emoji: "🌿" },
  plum:     { label: "Plum",     swatch: "#7C3AED", emoji: "◆" },
};

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    const t = stored && VALID_THEMES.includes(stored) ? stored : DEFAULT;
    // Apply before first render to avoid flash
    document.documentElement.setAttribute("data-theme", t);
    return t;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, theme);
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return { theme, setTheme: setThemeState };
}
