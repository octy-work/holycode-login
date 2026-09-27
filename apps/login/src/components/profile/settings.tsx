"use client";

import { usePageChrome } from "@/components/page-chrome-context";
import { THEME_PREFERENCES, ThemePreference } from "@/lib/profile";
import { saveLanguage, saveTheme } from "@/lib/server/profile";
import { ComputerDesktopIcon, MoonIcon, SunIcon } from "@heroicons/react/24/outline";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { SectionHeader, useRunner } from "./shared";
import type { SectionProps } from "./shell";
import { Group, Note, Panel } from "./ui";

const THEME_ICONS = { light: SunIcon, system: ComputerDesktopIcon, dark: MoonIcon };

/** Settings: language and theme — kept in the ID, the same in every HolyCode service. */
export function SettingsSection({ view }: SectionProps) {
  const t = useTranslations("profile");
  const locale = useLocale();
  const chrome = usePageChrome();
  const { theme, setTheme } = useTheme();
  const language = useRunner();
  const appearance = useRunner();
  const [mounted, setMounted] = useState(false);
  // The choice just made wins over what the server read back: Zitadel's metadata
  // projection can lag a moment behind the write.
  const [chosen, setChosen] = useState<ThemePreference | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const currentTheme: ThemePreference =
    chosen ?? view.theme ?? ((mounted && (theme as ThemePreference | undefined)) || "system");
  const languages = chrome.languages.length ? chrome.languages : [{ code: locale, name: locale }];

  const pickTheme = (value: ThemePreference) => {
    setChosen(value);
    setTheme(value);
    void appearance.run(() => saveTheme(value));
  };

  return (
    <div className="flex flex-col">
      <SectionHeader title={t("settings.title")} description={t("settings.description")} />

      <Group id="language" title={t("settings.language.title")}>
        <Panel className="p-2" data-testid="language-options">
          <div role="radiogroup" aria-label={t("settings.language.title")} className="flex flex-col">
            {languages.map((lang) => {
              const active = lang.code === locale;
              return (
                <button
                  key={lang.code}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  lang={lang.code}
                  disabled={language.busy}
                  onClick={() => !active && language.run(() => saveLanguage(lang.code))}
                  className={clsx(
                    "flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-[14px] transition-colors",
                    active
                      ? "bg-hc-soft text-hc-text font-semibold"
                      : "text-hc-text-2 hover:bg-hc-card-2 hover:text-hc-text",
                  )}
                  data-testid={`language-${lang.code}`}
                >
                  <span
                    className={clsx(
                      "flex h-4 w-4 items-center justify-center rounded-full border",
                      active ? "border-hc-p500" : "border-hc-input-border",
                    )}
                    aria-hidden="true"
                  >
                    {active && <span className="bg-hc-p500 h-2 w-2 rounded-full" />}
                  </span>
                  <span className="flex-1">{lang.name}</span>
                  <span className="text-hc-muted text-xs uppercase">{lang.code}</span>
                </button>
              );
            })}
          </div>
        </Panel>
        <p className="text-hc-muted text-[12px]">{t("settings.language.hint")}</p>
        {language.done && <Note tone="info">{t("common.saved")}</Note>}
        {language.error && <Note tone="error">{language.error}</Note>}
      </Group>

      <Group id="theme" title={t("settings.theme.title")}>
        <div
          className="grid grid-cols-3 gap-2"
          role="radiogroup"
          aria-label={t("settings.theme.title")}
          data-testid="theme-options"
        >
          {THEME_PREFERENCES.map((value) => {
            const Icon = THEME_ICONS[value];
            const active = currentTheme === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={appearance.busy}
                onClick={() => pickTheme(value)}
                className={clsx(
                  "flex flex-col items-center gap-1.5 rounded-[12px] border px-2 py-3 text-[12.5px] transition-colors",
                  active
                    ? "border-hc-p500 bg-hc-soft text-hc-text ring-hc-ring font-semibold ring-[3px]"
                    : "border-hc-border bg-hc-card text-hc-text-2 hover:border-hc-p500",
                )}
                data-testid={`theme-${value}`}
              >
                <Icon className={clsx("h-5 w-5", active ? "text-hc-p400" : "text-hc-muted")} />
                {t(`settings.theme.${value}`)}
              </button>
            );
          })}
        </div>
        <p className="text-hc-muted text-[12px]">{t("settings.theme.hint")}</p>
        {appearance.done && <Note tone="info">{t("common.saved")}</Note>}
        {appearance.error && <Note tone="error">{appearance.error}</Note>}
      </Group>
    </div>
  );
}
