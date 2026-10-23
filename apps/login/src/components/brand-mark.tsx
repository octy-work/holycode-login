"use client";

import { BrandEmblem } from "@/components/brand-emblem";
import { usePageChrome } from "@/components/page-chrome-context";
import { DEFAULT_WORDMARK } from "@/lib/brand";
import { BrandingSettings } from "@zitadel/proto/zitadel/settings/v2/branding_settings_pb";

export { BrandEmblem };

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
