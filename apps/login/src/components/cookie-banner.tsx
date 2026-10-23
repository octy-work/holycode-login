"use client";

import { COOKIE_CONSENT_COOKIE_NAME, COOKIE_CONSENT_MAX_AGE_SECONDS, CookieConsent, parseCookieConsent } from "@/lib/signup";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

function readConsent(): CookieConsent | null {
  if (typeof document === "undefined") return null;
  const entry = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE_CONSENT_COOKIE_NAME}=`));
  return parseCookieConsent(entry ? decodeURIComponent(entry.split("=")[1] ?? "") : null);
}

/** The bar slides up this long after the page is on screen (owner's choice, 23.10.2026). */
const APPEAR_DELAY_MS = 300;

/**
 * Cookie notice of HolyCode ID (owner's decision Q8, 02.10.2026): shown once per
 * device, three buttons of equal weight. HolyCode ID has no analytics or ads — the
 * necessary cookies are the sign-in itself; "functional" is "welcome back" (the
 * remembered account), which "necessary only" switches off.
 *
 * Since 23.10.2026 it is a bar fixed to the bottom edge of the page, outside the
 * sign-in card (owner: the notice inside the card looked wrong): one row on wide
 * screens — text, two buttons, "settings" link; a bottom sheet on phones with the
 * safe-area inset. "Settings" expands a second row inside the same bar. The look
 * comes from the page tokens, so organisation sign-ins (id.octy.ru) get their own
 * accent automatically.
 */
export function CookieBanner() {
  const t = useTranslations("signup");
  const [visible, setVisible] = useState(false);
  const [shown, setShown] = useState(false);
  const [settings, setSettings] = useState(false);
  const [functional, setFunctional] = useState(true);

  useEffect(() => {
    setVisible(readConsent() === null);
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    const timer = setTimeout(() => setShown(true), APPEAR_DELAY_MS);
    return () => clearTimeout(timer);
  }, [visible]);

  if (!visible) {
    return null;
  }

  // Set right here in the browser, not by a server action: a cookie set in a server
  // action makes Next re-render the current page, and some pages cannot be rendered
  // twice (the device approval is gone once it is used) — 03.10.2026.
  const choose = (choice: CookieConsent) => {
    setVisible(false);
    try {
      const secure = window.location.protocol === "https:" ? "; secure" : "";
      document.cookie = `${COOKIE_CONSENT_COOKIE_NAME}=${choice}; path=/; max-age=${COOKIE_CONSENT_MAX_AGE_SECONDS}; samesite=lax${secure}`;
    } catch {
      // The notice comes back next time; nothing else depends on it.
    }
  };

  const button = "h-9 rounded-[10px] px-3 text-[13px] font-semibold transition-colors leading-tight whitespace-normal";

  return (
    <>
      {/* Keeps the card footer above the bar on short screens; gone with the bar. */}
      <div aria-hidden="true" className="h-28 sm:h-20" />
      <div
        role="region"
        aria-label={t("cookies.title")}
        data-testid="cookie-banner"
        data-shown={shown ? "1" : "0"}
        className={clsx(
          "border-hc-border fixed inset-x-0 bottom-0 z-40 rounded-t-[16px] border border-b-0 text-left shadow-[0_-12px_40px_rgba(0,0,0,0.25)]",
          "transition-transform duration-300 ease-out motion-reduce:transition-none sm:rounded-none sm:border-x-0",
          shown ? "translate-y-0" : "translate-y-full",
        )}
        style={{
          backgroundColor: "color-mix(in srgb, var(--hc-card) 94%, transparent)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <div className="mx-auto w-full max-w-[720px] px-4 pt-3 sm:px-5">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4">
            <p className="text-hc-text-2 min-w-0 flex-1 text-[12.5px] leading-snug">
              <b className="text-hc-text">{t("cookies.title")}.</b> {t("cookies.text")}
            </p>
            {!settings && (
              <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:items-center">
                <button
                  type="button"
                  className={`${button} bg-hc-input border-hc-input-border text-hc-text hover:border-hc-p500 border`}
                  onClick={() => choose("necessary")}
                  data-testid="cookie-necessary"
                >
                  {t("cookies.onlyNecessary")}
                </button>
                <button
                  type="button"
                  className={`${button} hc-btn-primary`}
                  onClick={() => choose("all")}
                  data-testid="cookie-all"
                >
                  {t("cookies.all")}
                </button>
                <button
                  type="button"
                  className="text-hc-link hover:text-hc-p500 col-span-2 h-7 text-[12.5px] font-medium sm:h-9 sm:px-1"
                  onClick={() => setSettings(true)}
                  data-testid="cookie-configure"
                >
                  {t("cookies.configure")}
                </button>
              </div>
            )}
          </div>
          {settings && (
            <div
              className="border-hc-border mt-2.5 grid gap-2 border-t border-dashed pt-2.5 text-[12.5px] sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-x-4"
              data-testid="cookie-settings"
            >
              <label className="text-hc-text-2 flex items-start gap-2">
                <input type="checkbox" checked disabled className="accent-hc-p500 mt-0.5 h-4 w-4" />
                <span>
                  <b className="text-hc-text">{t("cookies.necessary")}</b> — {t("cookies.necessaryHint")}
                </span>
              </label>
              <label className="text-hc-text-2 flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={functional}
                  onChange={(e) => setFunctional(e.target.checked)}
                  className="accent-hc-p500 mt-0.5 h-4 w-4"
                  data-testid="cookie-functional"
                />
                <span>
                  <b className="text-hc-text">{t("cookies.functional")}</b> — {t("cookies.functionalHint")}
                </span>
              </label>
              <button
                type="button"
                className={`${button} hc-btn-primary sm:px-4`}
                onClick={() => choose(functional ? "all" : "necessary")}
                data-testid="cookie-save"
              >
                {t("cookies.save")}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
