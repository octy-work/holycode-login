import { Logo } from "@/components/logo";
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
 * NEXT_PUBLIC_BRAND_WORDMARK="Holy|Code" — the part before "|" gets the gradient.
 * Set it to an empty string to fall back to the logo from the ZITADEL label policy
 * (for other tenants such as id.octy.ru).
 */
export function BrandMark({ branding }: { branding?: BrandingSettings }) {
  const wordmark = process.env.NEXT_PUBLIC_BRAND_WORDMARK ?? "Holy|Code";

  if (!wordmark) {
    return branding ? (
      <Logo lightSrc={branding.lightTheme?.logoUrl} darkSrc={branding.darkTheme?.logoUrl} height={36} width={140} />
    ) : null;
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
