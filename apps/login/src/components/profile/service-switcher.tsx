"use client";

import { buildServiceHref, SERVICE_KEYS, ServiceEntry, ServiceOrg } from "@/lib/services";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import { MouseEvent, ReactNode, RefObject, useCallback, useEffect, useId, useRef, useState } from "react";

/**
 * The HolyCode service switcher of the profile: the grid button (nine dots)
 * next to the logo and the menu of services — the same markup as
 * apps/holychat-web/src/switcher/ in the holycode repository, on the fork's
 * `hc-*` tokens (owner's decisions of 28.09.2026).
 *
 * Tiles come from the directory (`services`): the chat, HolyBuild, HolyAgent,
 * the panel (when the server handed it out — owners and admins only), the
 * profile ("you are here"), mail; under a tile `status.text` from the server
 * when there is one. Below: "Organization admin" (owners and admins) and
 * "Theme and language — from your ID profile". A tile is a plain link in the
 * same tab: `<url>?org=<organization>&return_to=<where we are>`.
 *
 * On phones (< 768 px) there is no grid button: the same tiles are in the
 * services sheet of the bottom bar (`mobile-nav.tsx`).
 */

// ---------------------------------------------------------------------------
// Icons — the same SVG outlines as the chat's switcher/icons.jsx
// ---------------------------------------------------------------------------

const PATHS: Record<string, ReactNode> = {
  chat: <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />,
  build: (
    <>
      <path d="m15 12-8.5 8.5a2.12 2.12 0 0 1-3-3L12 9" />
      <path d="M17.64 15 22 10.64" />
      <path d="m20.91 11.7-1.25-1.25c-.6-.6-.93-1.4-.93-2.25v-.86L16.01 4.6a5.56 5.56 0 0 0-3.94-1.64H9l.92.82A6.18 6.18 0 0 1 12 8.4v1.56l2 2h2.47l2.26 1.91" />
    </>
  ),
  agent: (
    <>
      <path d="M12 8V4H8" />
      <rect x="4" y="8" width="16" height="12" rx="2" />
      <path d="M2 14h2M20 14h2M15 13v2M9 13v2" />
    </>
  ),
  panel: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="10" r="3" />
      <path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662" />
    </>
  ),
  mail: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </>
  ),
  admin: (
    <>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  prefs: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" />
    </>
  ),
};

export function SwitcherIcon({ name, size = 16, className }: { name: string; size?: number; className?: string }) {
  const paths = PATHS[name];
  if (!paths) return null;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths}
    </svg>
  );
}

/** The grid button: nine dots. */
export function GridIcon({ size = 16, className }: { size?: number; className?: string }) {
  const dots: ReactNode[] = [];
  for (const cy of [5, 12, 19]) {
    for (const cx of [5, 12, 19]) dots.push(<circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.9" />);
  }
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {dots}
    </svg>
  );
}

/** The service's icon: an SVG by `icon` or by key, an emoji as text, otherwise the first letter. */
export function ServiceIcon({
  service,
  size = 16,
}: {
  service: Pick<ServiceEntry, "key" | "name" | "icon">;
  size?: number;
}) {
  const icon = String(service.icon ?? "").trim();
  const key = String(service.key ?? "").trim();
  if (icon && PATHS[icon]) return <SwitcherIcon name={icon} size={size} />;
  if (icon && !PATHS[icon] && Array.from(icon).length <= 2 && /[^\w\s-]/.test(icon)) {
    return (
      <span className="text-[15px] leading-none" aria-hidden="true">
        {icon}
      </span>
    );
  }
  if (PATHS[key]) return <SwitcherIcon name={key} size={size} />;
  const letter = String(service.name || key || "?")
    .trim()
    .charAt(0)
    .toUpperCase();
  return (
    <span className="text-[13px] leading-none font-extrabold" aria-hidden="true">
      {letter}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Texts — profile.switcher.* in locales/{ru,en}.json (overridable by hosted_login_translation)
// ---------------------------------------------------------------------------

type SwitcherT = ReturnType<typeof useTranslations>;

const KNOWN = new Set<string>(SERVICE_KEYS);

/** The tile's name: from the server, else by key, else the key itself. */
export function serviceName(service: Pick<ServiceEntry, "key" | "name">, t: SwitcherT): string {
  const own = String(service.name ?? "").trim();
  if (own) return own;
  return KNOWN.has(service.key) ? t(`name.${service.key}`) : service.key;
}

/** Under the tile: "you are here" for the current service, else status.text from the server, else the hint by key. */
export function serviceHint(service: Pick<ServiceEntry, "key" | "status">, t: SwitcherT, current = false): string {
  if (current) return t("youAreHere");
  const status = String(service.status?.text ?? "").trim();
  if (status) return status;
  return KNOWN.has(service.key) ? t(`hint.${service.key}`) : "";
}

// ---------------------------------------------------------------------------
// Behaviour
// ---------------------------------------------------------------------------

/** Closes on a click outside and on Escape (focus back to the trigger). */
export function useSwitcherDismiss(
  open: boolean,
  rootRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  triggerRef?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open || typeof window === "undefined") return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current && !rootRef.current.contains(target)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
      triggerRef?.current?.focus?.();
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, onClose, rootRef, triggerRef]);
}

export function defaultReturnTo(): string {
  try {
    return typeof window !== "undefined" ? String(window.location.href || "") : "";
  } catch {
    return "";
  }
}

export function orgIdOf(org: ServiceOrg | string | null | undefined): string {
  if (!org) return "";
  if (typeof org === "string") return org.trim();
  return String(org.account_id ?? "").trim();
}

export function orgNameOf(org: ServiceOrg | string | null | undefined): string {
  if (!org || typeof org !== "object") return "";
  return String(org.name ?? "").trim();
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

const tileClasses =
  "border-hc-border bg-hc-card-2 flex min-w-0 flex-col items-center justify-start border text-center text-inherit no-underline transition-colors focus-visible:ring-hc-ring focus-visible:ring-[3px] focus-visible:outline-none";

/** The header menu's tile (switcher.css) and the phone sheet's, a little larger (mobile-nav.css `.hcm-tile`). */
const TILE = {
  menu: {
    box: "min-h-[78px] rounded-[11px] px-1.5 pt-[9px] pb-2",
    icon: "mb-[5px] h-[30px] w-[30px] rounded-[9px]",
    iconSize: 16,
    name: "text-[12px]",
    hint: "mt-px",
  },
  sheet: {
    box: "min-h-[84px] rounded-[13px] px-1.5 pt-2.5 pb-[9px]",
    icon: "mb-1.5 h-8 w-8 rounded-[10px]",
    iconSize: 18,
    name: "text-[12.5px]",
    hint: "mt-0.5",
  },
} as const;

/**
 * One tile: a link into the service, or (the current service) a button that says "you are here".
 * `variant` — "menu": the header menu (`role="menuitem"`); "sheet": the phone's services sheet (a dialog).
 */
export function ServiceTile({
  service,
  current = false,
  href = "",
  name,
  hint,
  variant = "menu",
  onSelect,
  testId,
}: {
  service: ServiceEntry;
  current?: boolean;
  href?: string;
  name: string;
  hint: string;
  variant?: keyof typeof TILE;
  onSelect?: (event: MouseEvent<HTMLElement>) => void;
  testId?: string;
}) {
  const size = TILE[variant];
  const role = variant === "menu" ? "menuitem" : undefined;
  const inner = (
    <>
      <span className={clsx("text-hc-p400 bg-hc-soft flex items-center justify-center", size.icon)}>
        <ServiceIcon service={service} size={size.iconSize} />
      </span>
      <span className={clsx("block max-w-full truncate font-bold", size.name)}>{name}</span>
      {hint ? (
        <span
          className={clsx(
            "line-clamp-2 max-w-full text-[10.5px] leading-[1.25] [overflow-wrap:anywhere]",
            size.hint,
            current ? "text-hc-p400" : "text-hc-muted",
            current && variant === "sheet" && "font-semibold",
          )}
        >
          {hint}
        </span>
      ) : null}
    </>
  );
  const classes = clsx(
    tileClasses,
    size.box,
    current ? "border-hc-p500 bg-hc-soft cursor-default" : "hover:border-hc-p500 hover:bg-hc-soft cursor-pointer",
    current && variant === "sheet" && "shadow-[inset_0_0_0_1px_var(--hc-p500)]",
  );
  if (current || !href) {
    return (
      <button
        type="button"
        role={role}
        className={classes}
        aria-current={current ? "page" : undefined}
        onClick={(event) => onSelect?.(event)}
        data-testid={testId}
        data-service={service.key}
      >
        {inner}
      </button>
    );
  }
  return (
    <a
      role={role}
      className={classes}
      href={href}
      onClick={(event) => onSelect?.(event)}
      data-testid={testId}
      data-service={service.key}
      data-href={href}
    >
      {inner}
    </a>
  );
}

const rowClasses =
  "flex min-h-[34px] w-full items-center gap-[9px] rounded-[9px] px-2 py-[7px] text-left text-inherit no-underline";

function MenuRow({
  icon,
  text,
  right,
  href,
  external,
  onSelect,
  testId,
}: {
  icon: string;
  text: string;
  right?: string;
  href: string;
  external?: boolean;
  onSelect?: () => void;
  testId?: string;
}) {
  return (
    <a
      role="menuitem"
      href={href}
      className={clsx(
        rowClasses,
        "hover:bg-hc-card-2 focus-visible:bg-hc-card-2 transition-colors focus-visible:outline-none",
      )}
      onClick={() => onSelect?.()}
      data-testid={testId}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
    >
      <span className="text-hc-p400 flex w-5 shrink-0 items-center justify-center">
        <SwitcherIcon name={icon} size={16} />
      </span>
      <span className="max-w-full min-w-0 flex-[1_0_auto] truncate">{text}</span>
      {right ? (
        <span className="text-hc-muted ml-auto min-w-0 flex-[0_1_auto] truncate pl-2 text-[11px]">{right}</span>
      ) : null}
    </a>
  );
}

/** Which services the switcher lists: those with a key and an address. */
export function listOf(services: ServiceEntry[] | undefined | null): ServiceEntry[] {
  return Array.isArray(services) ? services.filter((item) => item && item.key && item.url) : [];
}

// ---------------------------------------------------------------------------
// The switcher (grid button + menu)
// ---------------------------------------------------------------------------

export type ServiceSwitcherProps = {
  services: ServiceEntry[];
  org: ServiceOrg | null;
  /** The key of the service we are in: its tile says "you are here". */
  current?: string;
  /** Where a service should bring the person back to; read when the menu opens. */
  getReturnTo?: () => string;
  /** The organization admin (chat.holycode.org/admin) — shown to owners and admins. */
  adminUrl?: string;
  canOpenAdmin?: boolean;
  /** "dark · RU" next to "Theme and language — from your ID profile"; the row links to the settings. */
  prefsSummary?: string;
  prefsHref?: string;
  compact?: boolean;
  align?: "left" | "right";
  className?: string;
  onOpen?: () => void;
};

export function ServiceSwitcher({
  services,
  org,
  current = "profile",
  getReturnTo = defaultReturnTo,
  adminUrl = "",
  canOpenAdmin = false,
  prefsSummary = "",
  prefsHref = "",
  compact = false,
  align = "left",
  className,
  onOpen,
}: ServiceSwitcherProps) {
  const t = useTranslations("profile.switcher");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const close = useCallback(() => setOpen(false), []);
  useSwitcherDismiss(open, rootRef, close, triggerRef);

  const orgId = orgIdOf(org);
  const orgName = orgNameOf(org);
  const list = listOf(services);
  const returnTo = open ? String(getReturnTo?.() ?? "") : "";
  const adminHref = canOpenAdmin && adminUrl ? buildServiceHref(adminUrl, { org: orgId, returnTo }) : "";

  const toggle = () => {
    if (open) {
      close();
      return;
    }
    setOpen(true);
    onOpen?.();
  };

  return (
    <div
      ref={rootRef}
      // no display utility here: the host decides (the profile hides it under 768 px with `hidden md:block`)
      className={clsx("relative min-w-0", className)}
      data-testid="service-switcher"
      data-org={orgId || undefined}
    >
      <button
        ref={triggerRef}
        type="button"
        className={clsx(
          "border-hc-p500/70 bg-hc-soft text-hc-p400 inline-flex items-center justify-center border transition-colors",
          "hover:border-hc-p500 aria-expanded:border-hc-p500 focus-visible:ring-hc-ring focus-visible:ring-[3px] focus-visible:outline-none",
          compact ? "h-8 w-8 rounded-[9px]" : "h-10 w-10 rounded-[10px]",
        )}
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={t("trigger")}
        title={t("trigger")}
        data-testid="service-switcher-trigger"
      >
        <GridIcon size={compact ? 15 : 17} />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={t("title")}
          className={clsx(
            "border-hc-border bg-hc-card text-hc-text shadow-hc-card absolute top-[calc(100%+8px)] z-50 max-h-[calc(100vh-5rem)] w-[352px] max-w-[calc(100vw-1.5rem)] overflow-y-auto overscroll-contain rounded-[14px] border p-2.5 text-left text-[13px] leading-[1.4]",
            align === "right" ? "right-0 left-auto" : "left-0",
          )}
          data-testid="service-menu"
        >
          <div className="text-hc-muted truncate px-2 pt-1 pb-1.5 text-[10.5px] font-semibold tracking-[0.1em] uppercase">
            {orgName ? `${t("title")} · ${orgName}` : t("title")}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {list.map((service) => {
              const isCurrent = service.key === current;
              const href = isCurrent ? "" : buildServiceHref(service.url, { org: orgId, returnTo });
              return (
                <ServiceTile
                  key={service.key}
                  service={service}
                  current={isCurrent}
                  href={href}
                  name={serviceName(service, t)}
                  hint={serviceHint(service, t, isCurrent)}
                  onSelect={close}
                  testId={`service-tile-${service.key}`}
                />
              );
            })}
          </div>
          {adminHref || (prefsSummary && prefsHref) ? (
            <hr className="border-hc-border-subtle mt-2 mb-1.5 border-0 border-t" />
          ) : null}
          {adminHref ? (
            <MenuRow
              icon="admin"
              text={t("orgAdmin")}
              right={t("orgAdminHint")}
              href={adminHref}
              onSelect={close}
              testId="service-menu-admin"
            />
          ) : null}
          {prefsSummary && prefsHref ? (
            <MenuRow
              icon="prefs"
              text={t("prefsFromId")}
              right={prefsSummary}
              href={prefsHref}
              onSelect={close}
              testId="service-menu-prefs"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
