"use client";

import { Avatar } from "@/components/avatar";
import { usePageChrome } from "@/components/page-chrome-context";
import {
  accountAttentionTone,
  AccountEntry,
  HolyAgentEntry,
  profileAccountEntries,
  SecurityAttention,
  TextRef,
} from "@/lib/account-menu";
import { setLanguageCookie } from "@/lib/cookies";
import { debugSnapshotAvailable, takeDebugSnapshot } from "@/lib/debug-snapshot";
import { HolyAgentState } from "@/lib/holyagent-release";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useId, useRef, useState, useTransition } from "react";
import { SwitcherIcon, useSwitcherDismiss } from "./service-switcher";

/**
 * The avatar in the top bar and its menu — the user card of every HolyCode
 * service (rows and order: `lib/account-menu.ts`, the same as account.js of the
 * chat) on the fork's `hc-*` tokens. The HolyAgent row comes from the bar
 * (`holyagent` — one controller per page, `top-bar.tsx`): in a browser
 * "Download HolyAgent" (the DMG in a new tab), inside the desktop shell
 * "HolyAgent X.Y.Z is available" — a click installs, the menu stays open to
 * show the progress.
 */

export type AccountMenuLinks = {
  profile: string;
  security: string;
  keys: string;
  settings: string;
  switchUser: string;
  signOut: string;
};

const ITEM_TEST_IDS: Record<string, string> = {
  profile: "user-menu-profile",
  security: "user-menu-security",
  keys: "user-menu-keys",
  settings: "user-menu-settings",
  switchUser: "user-menu-switch-user",
  signOut: "user-menu-sign-out",
};

const rowClasses =
  "flex min-h-[36px] gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[13.5px] text-inherit no-underline transition-colors";

export function AccountMenu({
  user,
  links,
  securityAttention = "",
  holyagent = null,
  onInstallHolyAgent,
}: {
  user: { fullName: string; loginName: string; email: string; handle?: string; avatarUrl: string };
  links: AccountMenuLinks;
  securityAttention?: SecurityAttention;
  holyagent?: HolyAgentState | null;
  onInstallHolyAgent?: () => void;
}) {
  const t = useTranslations("profile.account");
  const chrome = usePageChrome();
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const close = useCallback(() => setOpen(false), []);
  useSwitcherDismiss(open, rootRef, close, triggerRef);

  const languages = chrome.languages ?? [];
  const entries = profileAccountEntries({
    links,
    securityAttention,
    languages: languages.length,
    holyagent,
    debugSnapshot: debugSnapshotAvailable(),
  });
  const attention = Boolean(accountAttentionTone({ securityAttention, holyagent }));
  const subtitle = [user.handle, user.email].filter(Boolean).join(" · ");
  const text = (ref: TextRef) => t(ref.key, ref.values);

  const changeLanguage = async (code: string) => {
    if (code === locale) return;
    await setLanguageCookie(code);
    startTransition(() => router.refresh());
  };

  const renderHolyAgent = (entry: HolyAgentEntry) => {
    const sub = entry.sub ? ("raw" in entry.sub ? entry.sub.raw : text(entry.sub)) : "";
    const notice = entry.state !== "download";
    const inner = (
      <>
        <span
          className={clsx("mt-px flex w-5 shrink-0 items-center justify-center", notice ? "text-hc-warn" : "text-hc-p400")}
        >
          <SwitcherIcon name="download" size={16} />
        </span>
        <span className="grid min-w-0 flex-1 gap-px">
          <span className={clsx("[overflow-wrap:anywhere]", entry.state === "update" && "font-semibold")}>
            {text(entry.label)}
          </span>
          {sub ? <span className="text-hc-muted text-[11px] leading-[1.3] [overflow-wrap:anywhere]">{sub}</span> : null}
        </span>
      </>
    );
    const classes = clsx(
      rowClasses,
      "items-start",
      notice
        ? "border-hc-warn/35 bg-hc-warn/10 mx-1 w-[calc(100%-8px)] border"
        : "hover:bg-hc-card-2 w-full focus-visible:bg-hc-card-2 focus-visible:outline-none",
      entry.state === "installing" && "cursor-progress opacity-85",
    );
    if (entry.href) {
      return (
        <a
          key={entry.id}
          role="menuitem"
          href={entry.href}
          target="_blank"
          rel="noopener noreferrer"
          className={classes}
          onClick={close}
          data-testid="user-menu-holyagent"
          data-state={entry.state}
          data-href={entry.href}
        >
          {inner}
        </a>
      );
    }
    return (
      <button
        key={entry.id}
        type="button"
        role="menuitem"
        className={classes}
        disabled={entry.state === "installing"}
        onClick={() => onInstallHolyAgent?.()}
        data-testid="user-menu-holyagent"
        data-state={entry.state}
      >
        {inner}
      </button>
    );
  };

  const renderEntry = (entry: AccountEntry) => {
    if (entry.kind === "hr") {
      return <div key={entry.id} role="separator" className="border-hc-border-subtle mx-1 my-1 border-t" />;
    }
    if (entry.kind === "holyagent") return renderHolyAgent(entry);
    if (entry.kind === "language") {
      return (
        <div
          key={entry.id}
          className={clsx(rowClasses, "w-full cursor-default items-center")}
          data-testid="user-menu-language"
        >
          <span className="text-hc-p400 flex w-5 shrink-0 items-center justify-center">
            <SwitcherIcon name="language" size={16} />
          </span>
          <span className="min-w-0 flex-1 truncate">{t("language")}</span>
          <span
            className={clsx("border-hc-border inline-flex rounded-[8px] border p-0.5", pending && "opacity-60")}
            role="radiogroup"
            aria-label={t("language")}
          >
            {languages.map((lang) => (
              <button
                key={lang.code}
                type="button"
                role="radio"
                lang={lang.code}
                title={lang.name}
                aria-checked={lang.code === locale}
                onClick={() => changeLanguage(lang.code)}
                className={clsx(
                  "rounded-[6px] px-2 py-0.5 text-[11.5px] font-semibold uppercase transition-colors",
                  lang.code === locale ? "bg-hc-soft text-hc-text" : "text-hc-muted hover:text-hc-text",
                )}
                data-testid={`language-${lang.code}`}
              >
                {lang.code}
              </button>
            ))}
          </span>
        </div>
      );
    }
    const pill = entry.attention ? (
      <span className="border-hc-warn/35 text-hc-warn ml-auto shrink-0 rounded-full border px-1.5 text-[10.5px] leading-4">
        {t(`attention.${entry.attention}`)}
      </span>
    ) : null;
    if (entry.id === "debugSnapshot") {
      return (
        <button
          key={entry.id}
          type="button"
          role="menuitem"
          className={clsx(rowClasses, "hover:bg-hc-card-2 focus-visible:bg-hc-card-2 w-full items-center focus-visible:outline-none")}
          onClick={() => {
            close();
            void takeDebugSnapshot();
          }}
          data-testid="user-menu-debugSnapshot"
        >
          <span className="text-hc-p400 flex w-5 shrink-0 items-center justify-center">
            <SwitcherIcon name={entry.icon} size={16} />
          </span>
          <span className="min-w-0 flex-1 truncate">{t(entry.id)}</span>
        </button>
      );
    }
    return (
      <a
        key={entry.id}
        role="menuitem"
        href={entry.href}
        className={clsx(
          rowClasses,
          "hover:bg-hc-card-2 focus-visible:bg-hc-card-2 w-full items-center focus-visible:outline-none",
          entry.danger && "text-hc-err",
        )}
        onClick={close}
        data-testid={ITEM_TEST_IDS[entry.id] ?? `user-menu-${entry.id}`}
      >
        <span className={clsx("flex w-5 shrink-0 items-center justify-center", entry.danger ? "" : "text-hc-p400")}>
          <SwitcherIcon name={entry.icon} size={16} />
        </span>
        <span className="min-w-0 flex-1 truncate">{t(entry.id)}</span>
        {pill}
      </a>
    );
  };

  return (
    <div ref={rootRef} className="relative" data-testid="account-menu">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`${t("userMenu")}: ${user.fullName}`}
        title={user.fullName}
        className="focus-visible:ring-hc-ring relative block h-[34px] w-[34px] shrink-0 rounded-full focus-visible:ring-[3px] focus-visible:outline-none [&>div]:h-[34px] [&>div]:w-[34px]"
        data-testid="avatar-menu-trigger"
      >
        <Avatar size="small" name={user.fullName} loginName={user.loginName} imageUrl={user.avatarUrl || undefined} />
        {attention ? (
          <span
            className="bg-hc-warn border-hc-card absolute -top-px -right-px h-[10px] w-[10px] rounded-full border-2"
            data-testid="avatar-attention"
          />
        ) : null}
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={t("userMenu")}
          className="border-hc-border bg-hc-card text-hc-text shadow-hc-card absolute top-[calc(100%+8px)] right-0 z-50 max-h-[calc(100dvh-5rem)] w-[300px] max-w-[calc(100vw-1.5rem)] overflow-x-hidden overflow-y-auto overscroll-contain rounded-[14px] border p-1.5 text-left leading-[1.4]"
          data-testid="user-menu"
        >
          <div className="flex items-center gap-2.5 px-2.5 pt-2 pb-2.5">
            <Avatar name={user.fullName} loginName={user.loginName} imageUrl={user.avatarUrl || undefined} />
            <div className="grid min-w-0">
              <b className="truncate text-[14px]" data-testid="user-menu-name">
                {user.fullName}
              </b>
              {subtitle ? <small className="text-hc-muted truncate text-[12px]">{subtitle}</small> : null}
            </div>
          </div>
          <div role="separator" className="border-hc-border-subtle mx-1 mb-1 border-t" />
          {entries.map(renderEntry)}
        </div>
      ) : null}
    </div>
  );
}
