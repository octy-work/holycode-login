"use client";

import { ComputerDesktopIcon, MoonIcon, SunIcon } from "@heroicons/react/24/solid";
import { ThemeMode } from "@zitadel/proto/zitadel/settings/v2/branding_settings_pb";
import clsx from "clsx";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useThemeMode } from "./branding-context";

export default function ThemeSwitch() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();
  const themeMode = useThemeMode();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reserve the space before mount so the footer does not jump.
  if (!mounted) return <div className="h-7 w-[86px]" aria-hidden="true" />;

  // Hide toggle when theme is forced to light or dark only
  if (themeMode === ThemeMode.LIGHT || themeMode === ThemeMode.DARK) {
    return null;
  }

  const options: { value: string; label: string; icon: typeof SunIcon }[] = [
    { value: "light", label: "Switch to light mode", icon: SunIcon },
    { value: "system", label: "Switch to system mode", icon: ComputerDesktopIcon },
    { value: "dark", label: "Switch to dark mode", icon: MoonIcon },
  ];

  return (
    <div
      className="border-hc-border inline-flex items-center gap-0.5 rounded-full border p-0.5"
      role="group"
      aria-label="Theme"
    >
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          className={clsx(
            "flex h-6 w-6 items-center justify-center rounded-full transition-colors",
            theme === value ? "bg-hc-soft text-hc-text" : "text-hc-muted hover:text-hc-text",
          )}
          onClick={() => setTheme(value)}
          aria-label={label}
          aria-pressed={theme === value}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
