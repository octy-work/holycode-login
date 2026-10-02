"use client";

import { BrandMark } from "@/components/brand-mark";
import { LanguageSwitcher } from "@/components/language-switcher";
import { usePageChrome } from "@/components/page-chrome-context";
import ThemeSwitch from "@/components/theme-switch";
import { BrandingSettings } from "@zitadel/proto/zitadel/settings/v2/branding_settings_pb";
import React, { Children, ReactNode } from "react";
import { Card } from "./card";
import { CookieBanner } from "./cookie-banner";
import { ThemeWrapper } from "./theme-wrapper";
import { Translated } from "./translated";

/**
 * HolyCode page frame: one centered card (max 420px) with
 *   header  — brand mark + language (desktop),
 *   body    — first child: title/description/user, second child: the form,
 *   footer  — legal links / language (mobile) + theme toggle.
 *
 * The upstream side-by-side layout (NEXT_PUBLIC_THEME_LAYOUT) is not supported here:
 * the design is a single card on every screen size.
 */
export function DynamicTheme({
  branding,
  children,
}: {
  children: ReactNode | ((isSideBySide: boolean) => ReactNode);
  branding?: BrandingSettings;
}) {
  const chrome = usePageChrome();

  const actualChildren: ReactNode = React.useMemo(() => {
    if (typeof children === "function") {
      return (children as (isSideBySide: boolean) => ReactNode)(false);
    }
    return children;
  }, [children]);

  const childArray = Children.toArray(actualChildren);
  const titleContent = childArray[0] || null;
  const formContent = childArray[1] || null;
  const hasMultipleChildren = childArray.length > 1;

  const hasLegal = !!(chrome.helpLink || chrome.privacyPolicyLink);
  const showLanguages = chrome.languages.length > 1;

  return (
    <ThemeWrapper branding={branding}>
      <div className="relative mx-auto w-full max-w-[420px] px-4 py-4 sm:px-0">
        <Card>
          <div className="mb-5 flex items-center gap-3">
            <BrandMark branding={branding} />
            <span className="flex-1" />
            {showLanguages && (
              <div className="hidden sm:block">
                <LanguageSwitcher languages={chrome.languages} />
              </div>
            )}
          </div>

          {hasMultipleChildren ? (
            <>
              <div className="flex w-full flex-col text-left">{titleContent}</div>
              <div className="mt-4 w-full">{formContent}</div>
            </>
          ) : (
            <div className="w-full">{actualChildren}</div>
          )}

          <CookieBanner />

          <div className="text-hc-muted mt-5 flex items-center justify-between gap-3 text-xs">
            <div className="flex min-w-0 items-center gap-2">
              {showLanguages && (
                <div className="sm:hidden">
                  <LanguageSwitcher languages={chrome.languages} />
                </div>
              )}
              {hasLegal && (
                <div className={showLanguages ? "hidden items-center gap-1.5 sm:flex" : "flex items-center gap-1.5"}>
                  {chrome.helpLink && (
                    <a
                      href={chrome.helpLink}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-hc-text transition-colors"
                    >
                      <Translated i18nKey="help" namespace="common" />
                    </a>
                  )}
                  {chrome.helpLink && chrome.privacyPolicyLink && <span aria-hidden="true">·</span>}
                  {chrome.privacyPolicyLink && (
                    <a
                      href={chrome.privacyPolicyLink}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-hc-text transition-colors"
                    >
                      <Translated i18nKey="privacy" namespace="common" />
                    </a>
                  )}
                </div>
              )}
            </div>
            <ThemeSwitch />
          </div>
        </Card>
      </div>
    </ThemeWrapper>
  );
}
