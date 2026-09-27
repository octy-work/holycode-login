"use client";

import { clsx } from "clsx";
import { ButtonHTMLAttributes, ReactNode } from "react";
import { Spinner } from "../spinner";

/**
 * Building blocks of the profile screens, in the HolyCode tokens: a panel
 * (card), a titled group, a list row with an icon and a trailing slot, pills,
 * compact buttons, the protection tiles and the "unavailable" notice.
 */

export function Panel({
  children,
  className,
  tone = "card",
}: {
  children: ReactNode;
  className?: string;
  tone?: "card" | "danger";
}) {
  return (
    <div
      className={clsx(
        "rounded-[14px] border",
        tone === "danger" ? "border-hc-err-border bg-hc-err-bg/40" : "border-hc-border bg-hc-card",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Group({
  title,
  aside,
  children,
  id,
  className,
}: {
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <section id={id} className={clsx("scroll-mt-20", className)} aria-labelledby={id ? `${id}-title` : undefined}>
      <h2
        id={id ? `${id}-title` : undefined}
        className="text-hc-text mt-6 mb-2 flex items-center gap-2 text-[15px] font-semibold"
      >
        <span>{title}</span>
        {aside && <span className="text-hc-link ml-auto text-[12.5px] font-medium">{aside}</span>}
      </h2>
      <div className="flex flex-col gap-1.5">{children}</div>
    </section>
  );
}

export type PillTone = "ok" | "warn" | "bad" | "pur" | "dim";

export function Pill({ tone = "dim", children, className }: { tone?: PillTone; children: ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-px text-[11px] leading-[18px] font-semibold whitespace-nowrap",
        {
          "border-hc-ok/35 bg-hc-ok/10 text-hc-ok": tone === "ok",
          "border-hc-warn/35 bg-hc-warn/10 text-hc-warn": tone === "warn",
          "border-hc-err-border bg-hc-err-bg text-hc-err": tone === "bad",
          "border-hc-p500/40 bg-hc-soft text-hc-p400": tone === "pur",
          "border-hc-border text-hc-muted": tone === "dim",
        },
        className,
      )}
    >
      {children}
    </span>
  );
}

export function RowIcon({
  children,
  tone = "soft",
  className,
}: {
  children: ReactNode;
  tone?: "soft" | "ok" | "warn" | "bad" | "brand";
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-[13px] font-bold [&>svg]:h-5 [&>svg]:w-5",
        {
          "bg-hc-soft text-hc-p400": tone === "soft",
          "bg-hc-ok/12 text-hc-ok": tone === "ok",
          "bg-hc-warn/12 text-hc-warn": tone === "warn",
          "bg-hc-err-bg text-hc-err": tone === "bad",
          "bg-hc-card-2 text-hc-text": tone === "brand",
        },
        className,
      )}
    >
      {children}
    </span>
  );
}

/** One line of a list: icon · title/subtitle · trailing (pill, button). Wraps on narrow screens. */
export function Row({
  icon,
  title,
  subtitle,
  trailing,
  dashed,
  tone,
  className,
  "data-testid": testId,
}: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  dashed?: boolean;
  tone?: "danger";
  className?: string;
  "data-testid"?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={clsx(
        "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-[12px] border px-3 py-2.5",
        dashed ? "border-hc-border border-dashed bg-transparent" : "border-hc-border bg-hc-card",
        className,
      )}
    >
      {icon}
      <div className="min-w-0 flex-1 basis-[140px]">
        <div
          className={clsx(
            "truncate text-[14px] leading-tight font-semibold",
            tone === "danger" ? "text-hc-err" : "text-hc-text",
          )}
        >
          {title}
        </div>
        {subtitle && <div className="text-hc-muted mt-0.5 text-[12.5px] leading-snug">{subtitle}</div>}
      </div>
      {trailing && <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-1.5">{trailing}</div>}
    </div>
  );
}

export type RowButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "default" | "primary" | "danger";
  busy?: boolean;
};

export const rowButtonClasses = (tone: RowButtonProps["tone"] = "default") =>
  clsx(
    "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-[9px] px-3 text-[12.5px] font-semibold whitespace-nowrap transition-all duration-200",
    "focus-visible:ring-hc-ring focus-visible:ring-[3px] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
    {
      "border-hc-border bg-hc-card-2 text-hc-text hover:border-hc-p500 border": tone === "default",
      "hc-btn-primary text-white": tone === "primary",
      "border-hc-err-border text-hc-err hover:bg-hc-err-bg border bg-transparent": tone === "danger",
    },
  );

export function RowButton({
  tone = "default",
  busy,
  children,
  className,
  disabled,
  type = "button",
  ...props
}: RowButtonProps) {
  return (
    <button type={type} disabled={disabled || busy} className={clsx(rowButtonClasses(tone), className)} {...props}>
      {busy && <Spinner className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}

export function RowLink({
  href,
  tone = "default",
  children,
  external,
  className,
}: {
  href: string;
  tone?: RowButtonProps["tone"];
  children: ReactNode;
  external?: boolean;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={clsx(rowButtonClasses(tone), className)}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
    >
      {children}
    </a>
  );
}

/** "Account protection" tile: an icon, a short title and a line under it, a plus for what is missing. */
export function Tile({
  icon,
  title,
  subtitle,
  state,
  onClick,
  href,
  "data-testid": testId,
}: {
  icon: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  state: "todo" | "done" | "info";
  onClick?: () => void;
  href?: string;
  "data-testid"?: string;
}) {
  const body = (
    <>
      <span
        className={clsx("absolute top-1.5 right-2 text-[13px] leading-none font-bold", {
          "text-hc-warn": state === "todo",
          "text-hc-ok": state === "done",
          "text-hc-muted": state === "info",
        })}
        aria-hidden="true"
      >
        {state === "todo" ? "+" : state === "done" ? "✓" : "›"}
      </span>
      <span
        className={clsx("mx-auto mb-1.5 flex h-10 w-10 items-center justify-center rounded-full [&>svg]:h-5 [&>svg]:w-5", {
          "border-hc-warn/60 text-hc-warn border border-dashed": state === "todo",
          "bg-hc-ok/12 text-hc-ok": state === "done",
          "bg-hc-card-2 text-hc-text-2": state === "info",
        })}
      >
        {icon}
      </span>
      <span className="text-hc-text block text-[12.5px] leading-tight font-semibold">{title}</span>
      {subtitle && <span className="text-hc-muted mt-0.5 block text-[11px] leading-snug">{subtitle}</span>}
    </>
  );
  const classes =
    "border-hc-border bg-hc-card relative block w-full rounded-[12px] border px-2.5 py-2.5 text-center transition-colors";
  if (href) {
    return (
      <a href={href} className={clsx(classes, "hover:border-hc-p500")} data-testid={testId}>
        {body}
      </a>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={clsx(classes, "hover:border-hc-p500 cursor-pointer")}
        data-testid={testId}
      >
        {body}
      </button>
    );
  }
  return (
    <div className={classes} data-testid={testId}>
      {body}
    </div>
  );
}

export function Note({
  tone = "info",
  children,
  className,
}: {
  tone?: "info" | "warn" | "error";
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={clsx(
        "rounded-[11px] border px-3 py-2 text-[12.5px] leading-snug",
        {
          "border-hc-p500/35 bg-hc-soft text-hc-text-2": tone === "info",
          "border-hc-warn/35 bg-hc-warn/10 text-hc-text-2": tone === "warn",
          "border-hc-err-border bg-hc-err-bg text-hc-err-text": tone === "error",
        },
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Rows of a Daenerys block while it loads. */
export function RowSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-1.5" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="border-hc-border skeleton h-[52px] rounded-[12px] border" />
      ))}
    </div>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="text-hc-text-2 mb-1 block text-[12.5px] leading-4 font-semibold">{children}</span>;
}

export const fieldClasses =
  "bg-hc-input text-hc-text border-hc-input-border hover:border-hc-p400/60 focus:border-hc-p500 focus:ring-hc-ring h-10 w-full rounded-[10px] border px-3 text-[14px] transition-all duration-200 outline-none focus:ring-[3px] disabled:opacity-60";
