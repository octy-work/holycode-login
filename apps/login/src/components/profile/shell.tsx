"use client";

import { LanguageSwitcher } from "@/components/language-switcher";
import { usePageChrome } from "@/components/page-chrome-context";
import { ThemeWrapper } from "@/components/theme-wrapper";
import { Translated } from "@/components/translated";
import { securityAttentionOf } from "@/lib/account-menu";
import { daenerysApiUrl } from "@/lib/daenerys";
import { configureDebugSnapshot, registerDebugState } from "@/lib/debug-snapshot";
import { profilePath, profilePrefixFromPathname, ProfileSection } from "@/lib/profile";
import { canOpenAdmin } from "@/lib/services";
import { rememberReturnTo } from "@/lib/topbar";
import { BrandingSettings } from "@zitadel/proto/zitadel/settings/v2/branding_settings_pb";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { DataSection } from "./data";
import { HomeSection } from "./home";
import { KeysSection } from "./keys";
import { MobileNav } from "./mobile-nav";
import { OrgsSection } from "./orgs";
import { SecuritySection } from "./security";
import { SettingsSection } from "./settings";
import { ProfileSidebar, useProfileNavCollapsed } from "./sidebar";
import { TopBar } from "./top-bar";
import { ProfileView } from "./types";
import { useDaenerys } from "./use-daenerys";
import { useServices } from "./use-services";

export type SectionProps = {
  view: ProfileView;
  prefix: string;
  daenerys: ReturnType<typeof useDaenerys>;
};

/**
 * The profile frame (id.holycode.org/me): the common HolyCode top bar across
 * the whole width (`top-bar.tsx`, owner's decision of 02.10.2026 — the services
 * grid from 768 px, the mark and "Profile", "← Back to …" by `return_to`; on the
 * right the HolyAgent cloud inside the desktop shell and the avatar with its
 * menu); the sections in a sidebar at the left edge under the bar, the whole
 * height, collapsible to icons (`sidebar.tsx`, 02.10.2026); on phones the
 * bottom bar of every HolyCode service — four sections and "Services", whose
 * sheet holds the services, "More in Profile" and the account
 * (`mobile-nav.tsx`); one section rendered at a time.
 *
 * Section links are plain anchors with the SHORT public path (/me/security),
 * never <Link>: Next would prepend the basePath and lengthen the address bar.
 * The server guesses the prefix from the traefik rewrite header; the browser
 * corrects it from the address bar after mount, so the page works under both.
 */
export function ProfileShell({
  view,
  branding,
  counters,
}: {
  view: ProfileView;
  branding?: BrandingSettings;
  counters: Partial<Record<ProfileSection, number>>;
}) {
  const chrome = usePageChrome();
  const t = useTranslations("profile");
  const locale = useLocale();
  const { setTheme } = useTheme();
  const [prefix, setPrefix] = useState(view.prefix);
  const daenerys = useDaenerys(view.daenerysUrl);
  const directory = useServices(daenerys, view.links.services);
  const adminAllowed = canOpenAdmin(directory.org?.role);
  // "тёмная · RU" on the switcher's last row: what the ID keeps for every service (short labels — the row is narrow).
  const prefsSummary = `${t(`switcher.theme.${view.theme ?? "system"}`)} · ${locale.toUpperCase()}`;
  // "← Back to …": `return_to` of the address, kept for the tab (section links are full page loads).
  const [returnTo, setReturnTo] = useState("");
  useEffect(() => setReturnTo(rememberReturnTo()), []);
  const base = view.basePath.replace(/\/+$/, "");
  const accountLinks = {
    profile: profilePath(prefix, "home"),
    security: profilePath(prefix, "security"),
    keys: profilePath(prefix, "keys"),
    settings: profilePath(prefix, "settings"),
    switchUser: `${base}/accounts`,
    signOut: `${base}/logout`,
  };

  // "Debug snapshot" in the avatar menu (owner's decision of 02.10.2026, lib/debug-snapshot.js):
  // the report goes to Daenerys with the .holycode.org cookie, like the profile's own calls.
  useEffect(() => {
    configureDebugSnapshot({
      service: "id",
      name: "HolyCode ID",
      version: process.env.NEXT_PUBLIC_APP_VERSION || "",
      endpoint: `${daenerysApiUrl(view.daenerysUrl)}/api/debug-reports`,
      lang: locale,
      user: { user_id: view.user.loginName, name: view.user.fullName, email: view.user.email },
      org: directory.org ? { account_id: directory.org.account_id, name: directory.org.name, role: directory.org.role } : null,
      canViewReports: false,
    });
    return registerDebugState("profile", () => ({
      section: view.section,
      daenerys: daenerys.status,
      methods: view.methods ?? null,
      theme: view.theme ?? "",
      services: directory.services.length,
    }));
  }, [view, locale, directory, daenerys.status]);

  useEffect(() => {
    const actual = profilePrefixFromPathname(window.location.pathname, view.basePath);
    if (actual !== prefix) {
      setPrefix(actual);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.basePath]);

  // The theme kept in the ID is the person's choice for every service: apply it once
  // on arrival. Not on every refresh — right after a save the server may still read
  // the previous value (projection lag) and would undo the choice just made.
  useEffect(() => {
    if (view.theme) {
      setTheme(view.theme);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const Section = {
    home: HomeSection,
    data: DataSection,
    security: SecuritySection,
    keys: KeysSection,
    orgs: OrgsSection,
    settings: SettingsSection,
  }[view.section];

  const showLanguages = chrome.languages.length > 1;
  const nav = useProfileNavCollapsed();

  return (
    <ThemeWrapper branding={branding}>
      <TopBar
        branding={branding}
        homeHref={profilePath(prefix, "home")}
        services={directory.services}
        org={directory.org}
        adminUrl={view.links.adminUrl}
        canOpenAdmin={adminAllowed}
        prefsSummary={prefsSummary}
        prefsHref={profilePath(prefix, "settings")}
        returnTo={returnTo}
        publicHost={view.publicHost}
        daenerysUrl={view.daenerysUrl}
        user={view.user}
        accountLinks={accountLinks}
        securityAttention={securityAttentionOf(view.methods)}
      />
      {/*
        Wide screens: the shell fills the viewport under the fixed 52 px bar — the
        sidebar at the left edge for the whole height, the content scrolling on the
        right (as in HolyAgent and Daenerys). It is fixed, not in the flow: the root
        layout centers its children in a 1100 px column, and the sidebar must not be
        inside it. Phones: the content in the page's own scroll, the bottom bar below.
      */}
      <div
        className="md:fixed md:inset-x-0 md:top-[52px] md:bottom-0 md:flex"
        data-testid="profile-shell"
        data-daenerys-status={daenerys.status}
        data-daenerys-failure={daenerys.failure ?? undefined}
        data-services-source={directory.source}
      >
        <ProfileSidebar
          section={view.section}
          prefix={prefix}
          counters={counters}
          collapsed={nav.collapsed}
          animate={nav.ready}
          onToggle={nav.toggle}
        />

        <div className="min-w-0 flex-1 md:overflow-y-auto" data-testid="profile-content">
          {/* min-height keeps short sections at the top on phones: the root layout centers its children vertically. */}
          <div className="mx-auto min-h-[calc(100dvh-3rem)] w-full max-w-[980px] pr-[max(1rem,env(safe-area-inset-right))] pb-[calc(88px+env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] md:min-h-0 md:px-8 md:pt-6 md:pb-10">
            {/* the bar is fixed: this keeps the content below it (on wide screens the shell starts under it) */}
            <div aria-hidden="true" className="h-[calc(48px+env(safe-area-inset-top))] md:hidden" />

            <main className="min-w-0">
              <Section view={view} prefix={prefix} daenerys={daenerys} />
            </main>

            <footer className="text-hc-muted mt-8 flex items-center gap-3 text-xs">
              {showLanguages && (
                <div className="md:hidden">
                  <LanguageSwitcher languages={chrome.languages} />
                </div>
              )}
              <div className="flex items-center gap-1.5">
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
            </footer>
          </div>
        </div>
      </div>

      <MobileNav
        section={view.section}
        prefix={prefix}
        basePath={view.basePath}
        counters={counters}
        services={directory.services}
        org={directory.org}
        current="profile"
        adminUrl={view.links.adminUrl}
        canOpenAdmin={adminAllowed}
        user={view.user}
      />
    </ThemeWrapper>
  );
}
