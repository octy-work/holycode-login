"use client";

import { CONTOUR_CHOICES, Contour } from "@/lib/contour";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";

/**
 * Переключатель контура «Все · Россия · США» в общей полосе (решение владельца
 * 19.11.2026) — один компонент, полоса показывает его и на телефоне (< 768 px —
 * короткие «Все · РФ · США»). Вид — `.hcs-contour*` из switcher.css эталона на
 * токенах форка: пилюля-рамка, текущий пункт — подсветка акцента (`hc-soft`).
 *
 * В профиле ID данных по контурам нет: `disabled` — выбор виден, кнопки
 * неактивны, подсказка «В этом сервисе данные не делятся по контурам».
 * Показывать ли вовсе — PROFILE_CONTOUR_MODE в lib/contour.ts.
 */
export function ContourSwitch({
  value,
  onChange,
  disabled = false,
  className,
}: {
  value: Contour;
  onChange?: (contour: Contour) => void;
  disabled?: boolean;
  className?: string;
}) {
  const t = useTranslations("profile.topbar.contour");
  const lockedTitle = t("disabled");
  return (
    <nav
      aria-label={t("label")}
      aria-disabled={disabled || undefined}
      title={disabled ? lockedTitle : undefined}
      className={clsx(
        "border-hc-border inline-flex shrink-0 gap-0.5 rounded-full border p-0.5",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
      data-testid="contour-switch"
      data-disabled={disabled ? "true" : undefined}
    >
      {CONTOUR_CHOICES.map((key) => {
        const current = key === value;
        const name = t(key);
        return (
          <button
            key={key}
            type="button"
            aria-pressed={current}
            aria-label={name}
            title={disabled ? lockedTitle : name}
            disabled={disabled || undefined}
            onClick={() => {
              if (!disabled && !current) onChange?.(key);
            }}
            className={clsx(
              "rounded-full px-2 py-[3px] text-[11px] leading-[1.3] whitespace-nowrap transition-colors md:px-[11px] md:text-[11.5px]",
              "focus-visible:ring-hc-ring focus-visible:ring-2 focus-visible:outline-none",
              current ? "bg-hc-soft text-hc-text font-semibold" : "text-hc-muted",
              disabled ? "pointer-events-none" : current ? "cursor-default" : "hover:bg-hc-card-2 hover:text-hc-text",
            )}
            data-testid={`contour-switch-${key}`}
            data-current={current ? "true" : undefined}
          >
            <span className="hidden md:inline">{name}</span>
            <span className="md:hidden" aria-hidden="true">
              {t(`short.${key}`)}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
