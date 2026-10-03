"use client";

import { COOKIE_CONSENT_COOKIE_NAME, COOKIE_CONSENT_MAX_AGE_SECONDS, CookieConsent, parseCookieConsent } from "@/lib/signup";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

function readConsent(): CookieConsent | null {
  if (typeof document === "undefined") return null;
  const entry = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE_CONSENT_COOKIE_NAME}=`));
  return parseCookieConsent(entry ? decodeURIComponent(entry.split("=")[1] ?? "") : null);
}

/**
 * Cookie notice of HolyCode ID (owner's decision Q8, 02.10.2026): shown once per
 * device, three buttons of equal weight. HolyCode ID has no analytics or ads — the
 * necessary cookies are the sign-in itself; "functional" is "welcome back" (the
 * remembered account), which "necessary only" switches off.
 */
export function CookieBanner() {
  const t = useTranslations("signup");
  const [visible, setVisible] = useState(false);
  const [settings, setSettings] = useState(false);
  const [functional, setFunctional] = useState(true);

  useEffect(() => {
    setVisible(readConsent() === null);
  }, []);

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
    <div
      className="bg-hc-card-2 border-hc-border mt-5 rounded-[14px] border p-3 text-left"
      role="region"
      aria-label={t("cookies.title")}
      data-testid="cookie-banner"
    >
      <p className="text-hc-text-2 text-[12.5px] leading-snug">
        <b className="text-hc-text">{t("cookies.title")}.</b> {t("cookies.text")}
      </p>
      {settings && (
        <div className="mt-2.5 flex flex-col gap-2 text-[12.5px]" data-testid="cookie-settings">
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
        </div>
      )}
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        {settings ? (
          <button
            type="button"
            className={`${button} hc-btn-primary col-span-2`}
            onClick={() => choose(functional ? "all" : "necessary")}
            data-testid="cookie-save"
          >
            {t("cookies.save")}
          </button>
        ) : (
          <>
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
              className={`${button} bg-hc-input border-hc-input-border text-hc-text hover:border-hc-p500 border`}
              onClick={() => choose("necessary")}
              data-testid="cookie-necessary"
            >
              {t("cookies.onlyNecessary")}
            </button>
            <button
              type="button"
              className="text-hc-link hover:text-hc-p500 col-span-2 h-7 text-[12.5px] font-medium"
              onClick={() => setSettings(true)}
              data-testid="cookie-configure"
            >
              {t("cookies.configure")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
