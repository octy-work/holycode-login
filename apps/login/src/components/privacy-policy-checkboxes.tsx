"use client";
import { resolveLocalizedLegalLink } from "@/lib/legal-links";
import { QuestionMarkCircleIcon } from "@heroicons/react/24/outline";
import { LegalAndSupportSettings } from "@zitadel/proto/zitadel/settings/v2/legal_settings_pb";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect } from "react";

type Props = {
  legal: LegalAndSupportSettings;
  onChange: (allAccepted: boolean) => void;
};

/**
 * Consent as text, not checkboxes (owner's decision, 26.09.2026): "By creating an
 * account you accept the terms and the privacy policy." Submitting the form is the
 * acceptance, so `onChange(true)` is reported as soon as the block is shown.
 * The component keeps its upstream name so the register forms need no other change.
 */
export function PrivacyPolicyCheckboxes({ legal, onChange }: Props) {
  const locale = useLocale();
  const t = useTranslations("register");
  const helpLink = resolveLocalizedLegalLink(legal?.helpLink, locale);
  const tosLink = resolveLocalizedLegalLink(legal?.tosLink, locale);
  const privacyPolicyLink = resolveLocalizedLegalLink(legal?.privacyPolicyLink, locale);

  useEffect(() => {
    onChange(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const linkClass = "text-hc-link hover:text-hc-p500 underline decoration-hc-link/40 underline-offset-2";
  const hasRich = typeof (t as { rich?: unknown }).rich === "function";

  return (
    <p
      className="text-hc-muted mt-3 flex items-start gap-1.5 text-left text-[12.5px] leading-snug"
      data-testid="legal-consent"
    >
      <span>
        {!hasRich && (
          <>
            {t("consent")}{" "}
            {tosLink && (
              <Link href={tosLink} className={linkClass} target="_blank" data-testid="tos-link">
                {t("termsOfService")}
              </Link>
            )}{" "}
            {privacyPolicyLink && (
              <Link href={privacyPolicyLink} className={linkClass} target="_blank" data-testid="privacy-policy-link">
                {t("privacyPolicy")}
              </Link>
            )}
          </>
        )}
        {hasRich &&
          t.rich("consent", {
            tos: (chunks) =>
              tosLink ? (
                <Link href={tosLink} className={linkClass} target="_blank" data-testid="tos-link">
                  {chunks}
                </Link>
              ) : (
                <>{chunks}</>
              ),
            privacy: (chunks) =>
              privacyPolicyLink ? (
                <Link href={privacyPolicyLink} className={linkClass} target="_blank" data-testid="privacy-policy-link">
                  {chunks}
                </Link>
              ) : (
                <>{chunks}</>
              ),
          })}
      </span>
      {helpLink && (
        <Link
          href={helpLink}
          target="_blank"
          aria-label="Open help in a new tab"
          data-testid="help-link"
          className="shrink-0"
        >
          <QuestionMarkCircleIcon className="h-4 w-4" />
        </Link>
      )}
    </p>
  );
}
