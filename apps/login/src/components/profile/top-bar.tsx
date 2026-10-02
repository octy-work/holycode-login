"use client";

import { AppEmblem, BrandEmblem } from "@/components/brand-mark";
import { usePageChrome } from "@/components/page-chrome-context";
import { SecurityAttention } from "@/lib/account-menu";
import { DEFAULT_WORDMARK } from "@/lib/brand";
import { createHolyAgentMenu, HolyAgentMenuController, holyagentReleasesUrl, HolyAgentState } from "@/lib/holyagent-release";
import { backToService, platformDomainOf, ServiceEntry, ServiceOrg } from "@/lib/services";
import { backName, openServiceInDesktop } from "@/lib/topbar";
import { BrandingSettings } from "@zitadel/proto/zitadel/settings/v2/branding_settings_pb";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import { ReactNode, useEffect, useRef, useState } from "react";
import { AccountMenu, AccountMenuLinks } from "./account-menu";
import { ServiceSwitcher, SwitcherIcon } from "./service-switcher";

/**
 * The common HolyCode top bar in the profile (owner's decision of 02.10.2026,
 * option A — the same bar in every service, `.hcs-bar` of the chat's
 * switcher.css on the fork's `hc-*` tokens): 52 px across the whole width,
 * fixed at the top.
 *
 *  - left: the services grid (from 768 px; on phones the services are in the
 *    bottom bar's sheet), the mark and the service's name ("Profile"), and
 *    "← Back to …" when the profile was opened from another service
 *    (`return_to`);
 *  - middle: `children` (empty in the profile);
 *  - right: the HolyAgent cloud — only inside the desktop shell and only when a
 *    newer release is out (a click installs) — and the avatar with its menu.
 *
 * One HolyAgent controller per page lives here: the cloud and the menu row show
 * the same state and the same install.
 */

export function AgentUpdateButton({ state, onInstall }: { state: HolyAgentState | null; onInstall: () => void }) {
  const t = useTranslations("profile.account");
  if (!state || (state.state !== "update" && state.state !== "installing")) return null;
  const installing = state.state === "installing";
  const title = t(installing ? "holyagent.installing" : "holyagent.update", {
    version: state.version,
    installed: state.installedVersion || "?",
  });
  return (
    <button
      type="button"
      onClick={onInstall}
      disabled={installing}
      title={state.statusText ? `${title} — ${state.statusText}` : title}
      aria-label={title}
      className={clsx(
        "border-hc-p500/70 bg-hc-soft text-hc-p400 relative inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors",
        "hover:border-hc-p500 focus-visible:ring-hc-ring focus-visible:ring-[3px] focus-visible:outline-none",
        installing && "cursor-progress opacity-75",
      )}
      data-testid="topbar-holyagent-update"
      data-state={state.state}
    >
      <SwitcherIcon name="download" size={17} />
      <span
        aria-hidden="true"
        className={clsx(
          "bg-hc-warn border-hc-card absolute -top-px -right-px h-[9px] w-[9px] rounded-full border-2",
          installing && "animate-pulse motion-reduce:animate-none",
        )}
      />
    </button>
  );
}

/**
 * "← Back to HolyCode" — `return_to` from the platform's domain, not our own origin.
 * No display utility of its own: the host decides (`hidden md:inline-flex` — an own
 * `inline-flex` would beat the host's `hidden` and show the link on phones).
 */
export function BackLink({
  returnTo,
  services,
  domain,
  className,
}: {
  returnTo: string;
  services: ServiceEntry[];
  domain: string;
  className?: string;
}) {
  const t = useTranslations("profile");
  const ownOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const back = backToService(returnTo, services, { ownOrigin, domain });
  if (!back) return null;
  const name = backName(back, (key) => t(`switcher.name.${key}`));
  const label = t("topbar.backTo", { name });
  return (
    <a
      href={back.href}
      title={label}
      onClick={(event) => openServiceInDesktop({ key: back.key, name: label }, back.href, event)}
      className={clsx(
        "text-hc-muted hover:text-hc-text hover:bg-hc-card-2 min-w-0 items-center gap-1.5 rounded-[8px] px-2 py-1 text-[12.5px] font-medium whitespace-nowrap transition-colors",
        "focus-visible:ring-hc-ring focus-visible:ring-[3px] focus-visible:outline-none",
        className,
      )}
      data-testid="service-back-link"
      data-service={back.key || undefined}
    >
      <SwitcherIcon name="back" size={13} />
      <span className="max-w-[220px] truncate">{label}</span>
    </a>
  );
}

export function TopBar({
  branding,
  homeHref,
  services,
  org,
  adminUrl,
  canOpenAdmin,
  prefsSummary,
  prefsHref,
  returnTo,
  publicHost,
  daenerysUrl,
  user,
  accountLinks,
  securityAttention,
  children,
}: {
  branding?: BrandingSettings;
  homeHref: string;
  services: ServiceEntry[];
  org: ServiceOrg | null;
  adminUrl: string;
  canOpenAdmin: boolean;
  prefsSummary: string;
  prefsHref: string;
  returnTo: string;
  publicHost: string;
  daenerysUrl: string;
  user: { fullName: string; loginName: string; email: string; handle?: string; avatarUrl: string };
  accountLinks: AccountMenuLinks;
  securityAttention: SecurityAttention;
  children?: ReactNode;
}) {
  const t = useTranslations("profile.topbar");
  const chrome = usePageChrome();
  const wordmark = chrome.brandWordmark ?? process.env.NEXT_PUBLIC_BRAND_WORDMARK ?? DEFAULT_WORDMARK;

  // HolyAgent: the release, the shell's version and the install — one controller for the cloud and the menu.
  const [holyagent, setHolyagent] = useState<HolyAgentState | null>(null);
  const controllerRef = useRef<HolyAgentMenuController | null>(null);
  useEffect(() => {
    const controller = createHolyAgentMenu(setHolyagent, { url: holyagentReleasesUrl(daenerysUrl) });
    controllerRef.current = controller;
    return () => controller.dispose();
  }, [daenerysUrl]);
  const install = () => {
    void controllerRef.current?.install();
  };

  return (
    <header
      role="banner"
      className={clsx(
        "border-hc-border bg-hc-card text-hc-text fixed inset-x-0 top-0 z-40 flex items-center gap-2 border-b",
        "h-[calc(48px+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] pr-[max(10px,env(safe-area-inset-right))] pl-[max(10px,env(safe-area-inset-left))]",
        "md:h-[52px] md:gap-3 md:px-3.5 md:pt-0",
      )}
      data-testid="profile-topbar"
    >
      <div className="flex min-w-0 shrink-0 items-center gap-2.5">
        <ServiceSwitcher
          className="hidden md:block"
          compact
          services={services}
          org={org}
          current="profile"
          adminUrl={adminUrl}
          canOpenAdmin={canOpenAdmin}
          prefsSummary={prefsSummary}
          prefsHref={prefsHref}
        />
        <a
          href={homeHref}
          className="focus-visible:ring-hc-ring flex min-w-0 items-center gap-2 rounded-[8px] focus-visible:ring-[3px] focus-visible:outline-none"
          aria-label={t("brandLabel")}
          data-testid="topbar-brand"
        >
          {wordmark ? (
            <BrandEmblem className="h-[26px] w-[26px] shrink-0 rounded-[7px]" />
          ) : (
            <AppEmblem branding={branding} className="h-[26px] w-[26px] shrink-0 rounded-[7px]" />
          )}
          <span
            className="truncate text-[15px] leading-none font-bold tracking-[-0.01em] md:text-[16px]"
            data-testid="app-title"
          >
            {t("name")}
          </span>
          <span className="rounded-md bg-linear-to-br from-[#7c3aed] to-[#06b6d4] px-1.5 py-0.5 text-[10px] font-extrabold tracking-[0.08em] text-white">
            ID
          </span>
        </a>
        <BackLink
          className="hidden md:inline-flex"
          returnTo={returnTo}
          services={services}
          domain={platformDomainOf(publicHost)}
        />
      </div>
      <div className="hidden min-w-0 flex-1 items-center gap-2 md:flex">{children}</div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <AgentUpdateButton state={holyagent} onInstall={install} />
        <AccountMenu
          user={user}
          links={accountLinks}
          securityAttention={securityAttention}
          holyagent={holyagent}
          onInstallHolyAgent={install}
        />
      </div>
    </header>
  );
}
