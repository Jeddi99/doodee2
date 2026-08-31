"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/use-theme";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const light = theme === "light";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={light ? "Switch to dark mode" : "Switch to light mode"}
      className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl border border-white/45 bg-white/75 text-[#241f1a] shadow-[0_12px_28px_-22px_rgba(36,31,26,0.48)] transition active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/35 dark:border-white/10 dark:bg-white/[0.08] dark:text-[#f8fafc]"
    >
      {light ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
    </button>
  );
}
