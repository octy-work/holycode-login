"use client";

import { Avatar } from "@/components/avatar";
import { ServiceEntry, ServiceOrg } from "@/lib/services";
import { ArrowsRightLeftIcon, IdentificationIcon } from "@heroicons/react/24/outline";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useCallback, useId, useRef, useState } from "react";
import { ServiceLinks, useSwitcherDismiss } from "./service-switcher";
import { ProfileView } from "./types";

/**
 * The avatar menu of the profile on phones (< 768 px), where the grid button is
 * not shown (owner's decision of 28.09.2026: on the phone the services live in
 * the avatar menu). Who you are → "My data", the section "Other services" with
 * the same tiles as the switcher (plus "Admin" for owners and admins), and
 * "Switch user". On wide screens the avatar stays a plain link to the data.
 */
export function AvatarMenu({
  view,
  dataHref,
  services,
  org,
  adminUrl,
  canOpenAdmin,
  className,
}: {
  view: ProfileView;
  dataHref: string;
  services: ServiceEntry[];
  org: ServiceOrg | null;
  adminUrl: string;
  canOpenAdmin: boolean;
  className?: string;
}) {
  const t = useTranslations("profile.switcher");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const close = useCallback(() => setOpen(false), []);
  useSwitcherDismiss(open, rootRef, close, triggerRef);

  return (
    <div ref={rootRef} className={clsx("relative shrink-0", className)} data-testid="avatar-menu">
      <button
        ref={triggerRef}
        type="button"
        className={clsx(
          "focus-visible:ring-hc-ring flex items-center justify-center rounded-full focus-visible:ring-[3px] focus-visible:outline-none",
          open && "ring-hc-p500 ring-2",
        )}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={t("menu.open")}
        data-testid="avatar-menu-trigger"
      >
        <Avatar
          size="small"
          name={view.user.fullName}
          loginName={view.user.loginName}
          imageUrl={view.user.avatarUrl || undefined}
        />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={t("menu.open")}
          className="border-hc-border bg-hc-card text-hc-text shadow-hc-card absolute top-[calc(100%+8px)] right-0 z-50 w-[320px] max-w-[calc(100vw-2rem)] rounded-[14px] border p-2 text-[13px] leading-[1.4]"
          data-testid="avatar-menu-panel"
        >
          <a
            role="menuitem"
            href={dataHref}
            className="hover:bg-hc-card-2 flex items-center gap-2.5 rounded-[10px] px-2 py-2 transition-colors"
            onClick={close}
            data-testid="avatar-menu-data"
          >
            <Avatar
              size="small"
              name={view.user.fullName}
              loginName={view.user.loginName}
              imageUrl={view.user.avatarUrl || undefined}
            />
            <span className="min-w-0 flex-1">
              <span className="text-hc-text block truncate text-[13.5px] font-semibold">{view.user.fullName}</span>
              <span className="text-hc-muted block truncate text-[11.5px]">{view.user.email || view.user.loginName}</span>
            </span>
            <IdentificationIcon className="text-hc-p400 h-4 w-4 shrink-0" aria-hidden="true" />
          </a>
          <hr className="border-hc-border-subtle my-1.5 border-0 border-t" />
          <ServiceLinks
            services={services}
            org={org}
            current="profile"
            adminUrl={adminUrl}
            canOpenAdmin={canOpenAdmin}
            onSelect={close}
          />
          <hr className="border-hc-border-subtle my-1.5 border-0 border-t" />
          <Link
            role="menuitem"
            href="/accounts"
            className="hover:bg-hc-card-2 flex min-h-[34px] items-center gap-[9px] rounded-[9px] px-2 py-[7px] transition-colors"
            onClick={close}
            data-testid="avatar-menu-switch-user"
          >
            <span className="text-hc-p400 flex w-5 shrink-0 items-center justify-center">
              <ArrowsRightLeftIcon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1 truncate">{t("menu.switchUser")}</span>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
