"use client";

import { Avatar } from "@/components/avatar";
import { BrandMark } from "@/components/brand-mark";
import { LanguageSwitcher } from "@/components/language-switcher";
import { usePageChrome } from "@/components/page-chrome-context";
import { ThemeWrapper } from "@/components/theme-wrapper";
import { Translated } from "@/components/translated";
import { PROFILE_SECTIONS, profilePath, profilePrefixFromPathname, ProfileSection } from "@/lib/profile";
import { canOpenAdmin } from "@/lib/services";
import {
  AdjustmentsHorizontalIcon,
  BuildingOffice2Icon,
  HomeIcon,
  IdentificationIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { BrandingSettings } from "@zitadel/proto/zitadel/settings/v2/branding_settings_pb";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { ComponentType, useEffect, useState } from "react";
import { AvatarMenu } from "./avatar-menu";
import { DataSection } from "./data";
import { HomeSection } from "./home";
import { OrgsSection } from "./orgs";
import { SecuritySection } from "./security";
import { ServiceSwitcher } from "./service-switcher";
import { SettingsSection } from "./settings";
import { ProfileView } from "./types";
import { useDaenerys } from "./use-daenerys";
import { useServices } from "./use-services";

const ICONS: Record<ProfileSection, ComponentType<{ className?: string }>> = {
  home: HomeIcon,
  data: IdentificationIcon,
  security: ShieldCheckIcon,
  orgs: BuildingOffice2Icon,
  settings: AdjustmentsHorizontalIcon,
};

export type SectionProps = {
  view: ProfileView;
  prefix: string;
  daenerys: ReturnType<typeof useDaenerys>;
};

/**
 * The profile frame (id.holycode.org/me): header with the service switcher
 * (the grid button next to the brand, from 768 px), the brand and the avatar —
 * on phones the avatar opens a menu with the same services; five sections in a
 * sidebar on wide screens and as tabs along the bottom on phones; one section
 * rendered at a time.
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
    orgs: OrgsSection,
    settings: SettingsSection,
  }[view.section];

  const showLanguages = chrome.languages.length > 1;

  return (
    <ThemeWrapper branding={branding}>
      {/* min-height keeps short sections at the top: the root layout centers its children vertically. */}
      <div
        className="mx-auto min-h-[calc(100dvh-3rem)] w-full max-w-[1100px] px-4 pb-24 md:pb-10"
        data-testid="profile-shell"
        data-daenerys-status={daenerys.status}
        data-daenerys-failure={daenerys.failure ?? undefined}
        data-services-source={directory.source}
      >
        <header className="mb-4 flex min-w-0 items-center gap-3 py-1">
          <ServiceSwitcher
            className="hidden md:block"
            services={directory.services}
            org={directory.org}
            current="profile"
            adminUrl={view.links.adminUrl}
            canOpenAdmin={adminAllowed}
            prefsSummary={prefsSummary}
            prefsHref={profilePath(prefix, "settings")}
          />
          <a href={profilePath(prefix, "home")} className="flex shrink-0 items-center gap-2" aria-label="HolyCode ID">
            <BrandMark branding={branding} />
            <span className="rounded-md bg-linear-to-br from-[#7c3aed] to-[#06b6d4] px-1.5 py-0.5 text-[10px] font-extrabold tracking-[0.08em] text-white">
              ID
            </span>
          </a>
          <span className="flex-1" />
          {showLanguages && (
            <div className="hidden md:block">
              <LanguageSwitcher languages={chrome.languages} />
            </div>
          )}
          <a
            href={profilePath(prefix, "data")}
            className="hidden shrink-0 md:block"
            aria-label={view.user.fullName}
            data-testid="avatar-link"
          >
            <Avatar
              size="small"
              name={view.user.fullName}
              loginName={view.user.loginName}
              imageUrl={view.user.avatarUrl || undefined}
            />
          </a>
          <AvatarMenu
            className="md:hidden"
            view={view}
            dataHref={profilePath(prefix, "data")}
            services={directory.services}
            org={directory.org}
            adminUrl={view.links.adminUrl}
            canOpenAdmin={adminAllowed}
          />
        </header>

        <div className="grid gap-4 md:grid-cols-[210px_minmax(0,1fr)]">
          <aside className="hidden md:block">
            <nav
              className="bg-hc-card border-hc-border sticky top-4 rounded-[16px] border p-2"
              aria-label="HolyCode ID"
              data-testid="profile-nav"
            >
              <div className="text-hc-muted px-2.5 pt-1 pb-2 text-[10.5px] font-semibold tracking-[0.12em] uppercase">
                <Translated i18nKey="title" namespace="profile" />
              </div>
              {PROFILE_SECTIONS.map((section) => {
                const Icon = ICONS[section];
                const active = section === view.section;
                return (
                  <a
                    key={section}
                    href={profilePath(prefix, section)}
                    aria-current={active ? "page" : undefined}
                    className={clsx(
                      "flex items-center gap-2 rounded-[10px] px-2.5 py-2 text-[13.5px] transition-colors",
                      active
                        ? "bg-hc-soft text-hc-text font-semibold shadow-[inset_2px_0_0_var(--hc-p500)]"
                        : "text-hc-text-2 hover:bg-hc-card-2 hover:text-hc-text",
                    )}
                  >
                    <Icon className="text-hc-p400 h-4 w-4 shrink-0" />
                    <span className="flex-1">
                      <Translated i18nKey={`nav.${section}`} namespace="profile" />
                    </span>
                    {counters[section] ? (
                      <span className="border-hc-warn/35 text-hc-warn rounded-full border px-1.5 text-[10.5px] leading-4">
                        {counters[section]}
                      </span>
                    ) : null}
                  </a>
                );
              })}
            </nav>
          </aside>

          <main className="min-w-0">
            <Section view={view} prefix={prefix} daenerys={daenerys} />
          </main>
        </div>

        <footer className="text-hc-muted mt-8 flex items-center gap-3 text-xs">
          {showLanguages && (
            <div className="md:hidden">
              <LanguageSwitcher languages={chrome.languages} />
            </div>
          )}
          <div className="flex items-center gap-1.5">
            {chrome.helpLink && (
              <a href={chrome.helpLink} target="_blank" rel="noreferrer" className="hover:text-hc-text transition-colors">
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

      <nav
        className="border-hc-border bg-hc-card/95 fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t px-1 pt-1.5 pb-[max(6px,env(safe-area-inset-bottom))] backdrop-blur md:hidden"
        aria-label="HolyCode ID"
        data-testid="profile-dock"
      >
        {PROFILE_SECTIONS.map((section) => {
          const Icon = ICONS[section];
          const active = section === view.section;
          return (
            <a
              key={section}
              href={profilePath(prefix, section)}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "relative flex flex-col items-center gap-0.5 rounded-lg py-1 text-[10.5px] leading-tight",
                active ? "text-hc-text font-semibold" : "text-hc-muted",
              )}
            >
              <Icon className={clsx("h-5 w-5", active ? "text-hc-p400" : "")} />
              <Translated i18nKey={`nav.short.${section}`} namespace="profile" />
              {counters[section] ? (
                <span className="bg-hc-warn absolute top-0.5 right-[22%] h-1.5 w-1.5 rounded-full" aria-hidden="true" />
              ) : null}
            </a>
          );
        })}
      </nav>
    </ThemeWrapper>
  );
}
