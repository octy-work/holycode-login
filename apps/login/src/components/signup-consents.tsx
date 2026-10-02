"use client";

import { resolveLocalizedLegalLink } from "@/lib/legal-links";
import { LegalAndSupportSettings } from "@zitadel/proto/zitadel/settings/v2/legal_settings_pb";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { ReactNode } from "react";

/**
 * The two consents of the registration (owner's decision Q8, 02.10.2026): the terms
 * and privacy policy together, the consent to personal data processing as its own
 * box — 152-FZ since 01.09.2025 wants it separate from other documents. Both are
 * required; the boxes start empty.
 */
export function SignupConsents({
  legal,
  terms,
  pd,
  onChange,
}: {
  legal?: LegalAndSupportSettings;
  terms: boolean;
  pd: boolean;
  onChange: (next: { terms: boolean; pd: boolean }) => void;
}) {
  const locale = useLocale();
  const t = useTranslations("signup");
  const tosLink = resolveLocalizedLegalLink(legal?.tosLink, locale);
  const privacyLink = resolveLocalizedLegalLink(legal?.privacyPolicyLink, locale);
  const pdLink = privacyLink;
  const linkClass = "text-hc-link hover:text-hc-p500 underline decoration-hc-link/40 underline-offset-2";

  const link = (href: string | undefined, testId: string) => (chunks: ReactNode) =>
    href ? (
      <Link href={href} className={linkClass} target="_blank" data-testid={testId}>
        {chunks}
      </Link>
    ) : (
      <>{chunks}</>
    );

  const rich = (key: string) =>
    typeof (t as { rich?: unknown }).rich === "function"
      ? t.rich(key, {
          tos: link(tosLink, "tos-link"),
          privacy: link(privacyLink, "privacy-link"),
          pd: link(pdLink, "pd-link"),
        })
      : t(key);

  return (
    <div className="mt-4 flex flex-col gap-2.5" data-testid="signup-consents">
      <label className="text-hc-text-2 flex cursor-pointer items-start gap-2.5 text-left text-[12.5px] leading-snug">
        <input
          type="checkbox"
          className="accent-hc-p500 mt-0.5 h-4 w-4 shrink-0"
          checked={terms}
          onChange={(e) => onChange({ terms: e.target.checked, pd })}
          data-testid="consent-terms"
        />
        <span>{rich("consents.terms")}</span>
      </label>
      <label className="text-hc-text-2 flex cursor-pointer items-start gap-2.5 text-left text-[12.5px] leading-snug">
        <input
          type="checkbox"
          className="accent-hc-p500 mt-0.5 h-4 w-4 shrink-0"
          checked={pd}
          onChange={(e) => onChange({ terms, pd: e.target.checked })}
          data-testid="consent-pd"
        />
        <span>{rich("consents.pd")}</span>
      </label>
    </div>
  );
}
