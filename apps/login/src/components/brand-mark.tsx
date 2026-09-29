"use client";

import { usePageChrome } from "@/components/page-chrome-context";
import { DEFAULT_WORDMARK } from "@/lib/brand";
import { BrandingSettings } from "@zitadel/proto/zitadel/settings/v2/branding_settings_pb";

/**
 * HolyCode emblem (apps/holycode-web/public/favicon.svg of the site), inlined so it
 * needs no extra request and works under any basePath.
 */
export function BrandEmblem({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 250 250" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <rect width="250" height="250" rx="59" fill="url(#hc-emblem-gradient)" />
      <path
        d="M163.196 83H90.125C67.1954 83 48.6072 101.588 48.6072 124.518C48.6072 147.448 67.1954 166.036 90.125 166.036H163.196C186.126 166.036 204.714 147.448 204.714 124.518C204.714 101.588 186.126 83 163.196 83Z"
        stroke="white"
        strokeOpacity="0.58"
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M103.411 83C126.661 83 126.661 166.036 149.911 166.036"
        stroke="white"
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M103.411 166.036C126.661 166.036 126.661 83 149.911 83"
        stroke="white"
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M178.143 83H71.8572C48.9275 83 30.3394 101.588 30.3394 124.518C30.3394 147.448 48.9275 166.036 71.8572 166.036H178.143C201.073 166.036 219.661 147.448 219.661 124.518C219.661 101.588 201.073 83 178.143 83Z"
        stroke="white"
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient id="hc-emblem-gradient" x1="3" y1="226" x2="234.5" y2="29.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7941FF" />
          <stop offset="1" stopColor="#6FA7FF" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/**
 * Word-mark shown in the card header: emblem + "HolyCode" with the gradient on "Holy",
 * exactly like Header.astro of the site.
 *
 * The word-mark is the container's runtime brand (lib/brand.ts: HC_BRAND_WORDMARK, handed
 * down by the root layout). An empty word-mark falls back to the logo from the ZITADEL
 * label policy — for organisation instances such as id.octy.ru.
 */
export function BrandMark({ branding }: { branding?: BrandingSettings }) {
  const chrome = usePageChrome();
  const wordmark = chrome.brandWordmark ?? process.env.NEXT_PUBLIC_BRAND_WORDMARK ?? DEFAULT_WORDMARK;

  if (!wordmark) {
    // One logo in the label policy serves both themes; the height is fixed, the width follows the logo.
    const light = branding?.lightTheme?.logoUrl || branding?.darkTheme?.logoUrl;
    const dark = branding?.darkTheme?.logoUrl || branding?.lightTheme?.logoUrl;
    if (!light || !dark) {
      return null;
    }
    return (
      <div className="flex items-center" data-testid="brand-logo">
        <img src={dark} alt="logo" className="hidden h-9 w-auto max-w-[200px] object-contain dark:block" />
        <img src={light} alt="logo" className="block h-9 w-auto max-w-[200px] object-contain dark:hidden" />
      </div>
    );
  }

  const [accent, rest] = wordmark.includes("|") ? wordmark.split("|", 2) : ["", wordmark];

  return (
    <div className="flex items-center gap-2.5" data-testid="brand-mark">
      <BrandEmblem className="h-9 w-9 shrink-0 rounded-[10px]" />
      <span className="text-hc-text text-[22px] leading-none font-extrabold tracking-[-0.02em]">
        {accent && <span className="hc-gradient-text">{accent}</span>}
        {rest}
      </span>
    </div>
  );
}

/**
 * Icon of the app on the device-consent card: the HolyCode emblem, or in tenant mode the
 * instance's own icon from the label policy (the emblem when it has none).
 */
export function AppEmblem({ branding, className }: { branding?: BrandingSettings; className?: string }) {
  const chrome = usePageChrome();
  const wordmark = chrome.brandWordmark ?? process.env.NEXT_PUBLIC_BRAND_WORDMARK ?? DEFAULT_WORDMARK;
  const icon = branding?.lightTheme?.iconUrl || branding?.darkTheme?.iconUrl;
  if (!wordmark && icon) {
    return <img src={icon} alt="" className={`${className ?? "h-9 w-9"} object-contain`} />;
  }
  return <BrandEmblem className={className} />;
}
