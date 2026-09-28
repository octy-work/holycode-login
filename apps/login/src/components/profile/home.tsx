"use client";

import { Avatar } from "@/components/avatar";
import { isKeyEntry, normalizeSessions, ServiceSession } from "@/lib/daenerys";
import { profilePath, Recommendation } from "@/lib/profile";
import {
  AdjustmentsHorizontalIcon,
  BuildingOffice2Icon,
  ComputerDesktopIcon,
  EnvelopeIcon,
  FingerPrintIcon,
  IdentificationIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/solid";
import { useLocale, useTranslations } from "next-intl";
import { ReactNode } from "react";
import { useFlowStarter } from "./shared";
import type { SectionProps } from "./shell";
import { Group, Note, Panel, Pill, RowLink, Tile } from "./ui";
import { useDaenerysResource } from "./use-daenerys";

const ROLE_KEYS = new Set(["owner", "admin", "member"]);

function roleLabel(t: ReturnType<typeof useTranslations>, role: string): string {
  return ROLE_KEYS.has(role) ? t(`orgs.role.${role}`) : role;
}

/** Home: who you are, "account protection" with what is missing, and the sections at a glance. */
export function HomeSection({ view, prefix, daenerys }: SectionProps) {
  const t = useTranslations("profile");
  const locale = useLocale();
  const flow = useFlowStarter();
  const sessions = useDaenerysResource<ServiceSession[]>(daenerys, (c) => c.sessions(), normalizeSessions, {
    label: "sessions",
  });

  const activeOrg = daenerys.orgs.find((o) => o.active) ?? daenerys.orgs[0];
  const recommends = (r: Recommendation) => view.recommendations.includes(r);
  const count = view.recommendations.length;
  const sessionCount = sessions.data ? sessions.data.filter((s) => !isKeyEntry(s)).length : null;

  const themeLabel = view.theme ? t(`settings.theme.${view.theme}`) : t("settings.theme.system");
  const languageName = (() => {
    const code = view.user.preferredLanguage;
    if (!code) {
      return t("home.summary.languageUnset");
    }
    try {
      return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code;
    } catch {
      return code;
    }
  })();

  return (
    <div className="flex flex-col">
      <Panel className="flex min-w-0 flex-wrap items-center gap-4 p-4" data-testid="home-card">
        <Avatar
          size="large"
          name={view.user.fullName}
          loginName={view.user.loginName}
          imageUrl={view.user.avatarUrl || undefined}
        />
        <div className="min-w-0 flex-1">
          <div className="text-hc-text text-[17px] leading-tight font-bold break-words">{view.user.fullName}</div>
          <div className="text-hc-muted mt-0.5 truncate text-[12.5px]">
            {[view.user.handle, view.user.email].filter(Boolean).join(" · ")}
          </div>
          {activeOrg && (
            <div className="mt-1.5">
              <Pill tone="pur">
                {roleLabel(t, activeOrg.role)} {activeOrg.name}
              </Pill>
            </div>
          )}
        </div>
        <div className="hidden sm:block">
          <RowLink href={profilePath(prefix, "data")}>{t("common.edit")}</RowLink>
        </div>
      </Panel>

      <Group
        id="protection"
        title={
          <span className="flex items-center gap-2">
            {t("home.protection")}
            {count > 0 ? (
              <Pill tone="warn">{t("home.recommendations", { count })}</Pill>
            ) : (
              <Pill tone="ok">{t("home.allGood")}</Pill>
            )}
          </span>
        }
        aside={<a href={profilePath(prefix, "security")}>{t("home.checkAll")}</a>}
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="protection-tiles">
          <Tile
            icon={<FingerPrintIcon />}
            state={view.methods.passkey ? "done" : recommends("passkey") ? "todo" : "info"}
            title={view.methods.passkey ? t("home.tiles.passkeyDone") : t("home.tiles.passkey")}
            subtitle={
              view.methods.passkey
                ? t("home.tiles.passkeyCount", { count: view.passkeys.length })
                : view.settings.passkeysAllowed
                  ? t("home.tiles.passkeyHint")
                  : t("security.passkey.notAllowed")
            }
            onClick={
              !view.methods.passkey && view.settings.passkeysAllowed ? () => flow.start("passkey", "security") : undefined
            }
            href={
              view.methods.passkey || !view.settings.passkeysAllowed
                ? `${profilePath(prefix, "security")}#methods`
                : undefined
            }
            data-testid="tile-passkey"
          />
          <Tile
            icon={<ShieldCheckIcon />}
            state={view.methods.secondFactor || view.methods.passkey ? "done" : recommends("secondFactor") ? "todo" : "info"}
            title={t("home.tiles.secondFactor")}
            subtitle={
              view.methods.secondFactor
                ? t("home.tiles.secondFactorOn")
                : view.methods.passkey
                  ? t("home.tiles.secondFactorByPasskey")
                  : view.methods.idp
                    ? t("home.tiles.secondFactorIdp")
                    : t("home.tiles.secondFactorHint")
            }
            onClick={recommends("secondFactor") ? () => flow.start("secondFactor", "security") : undefined}
            href={!recommends("secondFactor") ? `${profilePath(prefix, "security")}#methods` : undefined}
            data-testid="tile-second-factor"
          />
          <Tile
            icon={<EnvelopeIcon />}
            state={view.user.emailVerified ? "done" : "todo"}
            title={view.user.emailVerified ? t("home.tiles.emailDone") : t("home.tiles.email")}
            subtitle={view.user.email || t("home.tiles.emailMissing")}
            onClick={!view.user.emailVerified && view.user.email ? () => flow.start("verifyEmail", "data") : undefined}
            href={view.user.emailVerified || !view.user.email ? `${profilePath(prefix, "data")}#contacts` : undefined}
            data-testid="tile-email"
          />
          <Tile
            icon={<ComputerDesktopIcon />}
            state="info"
            title={t("home.tiles.devices")}
            subtitle={
              sessionCount !== null
                ? t("home.tiles.sessions", { count: sessionCount })
                : sessions.status === "loading"
                  ? "…"
                  : t("home.tiles.sessionsUnavailable")
            }
            href={`${profilePath(prefix, "security")}#sessions`}
            data-testid="tile-devices"
          />
        </div>
        {flow.error && <Note tone="error">{flow.error}</Note>}
      </Group>

      <Group id="sections" title={t("home.sections")}>
        <div className="grid gap-2 sm:grid-cols-2">
          <SummaryCard
            href={profilePath(prefix, "data")}
            icon={<IdentificationIcon />}
            title={t("nav.data")}
            lines={[
              t("home.summary.data"),
              view.linkedIdps.length
                ? t("home.summary.linked", { list: view.linkedIdps.map((l) => l.name).join(", ") })
                : t("home.summary.linkedNone"),
              view.user.emailVerified ? t("home.summary.emailOk") : t("home.summary.emailTodo"),
            ]}
          />
          <SummaryCard
            href={profilePath(prefix, "security")}
            icon={<ShieldCheckIcon />}
            title={t("nav.security")}
            lines={[
              `${view.methods.password ? t("home.summary.passwordOn") : t("home.summary.passwordOff")} · ${
                view.methods.passkey ? t("home.summary.passkeyOn") : t("home.summary.passkeyOff")
              }`,
              view.methods.secondFactor ? t("home.summary.secondFactorOn") : t("home.summary.secondFactorOff"),
              sessionCount !== null
                ? t("home.tiles.sessions", { count: sessionCount })
                : t("home.tiles.sessionsUnavailable"),
            ]}
          />
          <SummaryCard
            href={profilePath(prefix, "orgs")}
            icon={<BuildingOffice2Icon />}
            title={t("nav.orgs")}
            lines={
              daenerys.status === "ready"
                ? daenerys.orgs.length
                  ? daenerys.orgs.slice(0, 3).map((o) => `${o.name} — ${roleLabel(t, o.role)}`)
                  : [t("orgs.empty")]
                : [daenerys.status === "loading" ? "…" : t("daenerys.short")]
            }
          />
          <SummaryCard
            href={profilePath(prefix, "settings")}
            icon={<AdjustmentsHorizontalIcon />}
            title={t("nav.settings")}
            lines={[`${languageName} · ${themeLabel}`, t("home.summary.settings")]}
          />
        </div>
      </Group>
    </div>
  );
}

function SummaryCard({ href, icon, title, lines }: { href: string; icon: ReactNode; title: ReactNode; lines: string[] }) {
  return (
    <a
      href={href}
      className="border-hc-border bg-hc-card hover:border-hc-p500 block rounded-[12px] border px-3 py-2.5 transition-colors"
    >
      <div className="text-hc-text [&>svg]:text-hc-p400 flex items-center gap-2 text-[13.5px] font-semibold [&>svg]:h-4 [&>svg]:w-4">
        {icon}
        {title}
      </div>
      {lines.map((line, i) => (
        <div key={i} className="text-hc-muted mt-0.5 truncate text-[12px]">
          {line}
        </div>
      ))}
    </a>
  );
}
