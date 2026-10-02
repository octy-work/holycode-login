"use client";

import { startSignup } from "@/lib/server/signup";
import { SignupWho } from "@/lib/signup";
import { ArrowLeftIcon, BuildingOffice2Icon, UserIcon } from "@heroicons/react/24/solid";
import { LegalAndSupportSettings } from "@zitadel/proto/zitadel/settings/v2/legal_settings_pb";
import { IdentityProvider } from "@zitadel/proto/zitadel/settings/v2/login_settings_pb";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "./alert";
import { Button, ButtonVariants } from "./button";
import { OptionCardButton } from "./option-card";
import { SignInWithIdp } from "./sign-in-with-idp";
import { SignupConsents } from "./signup-consents";
import { Spinner } from "./spinner";

type Props = {
  identityProviders: IdentityProvider[];
  legal?: LegalAndSupportSettings;
  requestId?: string;
  organization?: string;
};

/**
 * HolyCode registration, steps 1–2 (02.10.2026):
 *
 * 1. Who the account is for (myself / a team or a company) and the two consents.
 * 2. "Confirm it's you": an account the person already has at a provider. It is the
 *    anchor against mass registrations (owner's decision Q5); a phone joins once an
 *    SMS gateway is connected. The provider brings the person back to
 *    /idp/…/complete-registration — the e-mail step.
 */
export function SignupStart({ identityProviders, legal, requestId, organization }: Props) {
  const t = useTranslations("signup");
  const router = useRouter();
  const [step, setStep] = useState<"who" | "anchor">("who");
  const [who, setWho] = useState<SignupWho>("personal");
  const [consents, setConsents] = useState({ terms: false, pd: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function next() {
    setError("");
    if (!consents.terms || !consents.pd) {
      setError(t("errors.consents"));
      return;
    }
    setLoading(true);
    try {
      const res = await startSignup({ who, terms: consents.terms, pd: consents.pd, requestId, organization });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setStep("anchor");
    } catch {
      setError(t("errors.generic"));
    } finally {
      setLoading(false);
    }
  }

  const signInLink = (
    <div className="mt-3 flex justify-center">
      <button
        type="button"
        className="text-hc-link hover:text-hc-p500 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors"
        onClick={() => {
          const params = new URLSearchParams();
          if (requestId) params.set("requestId", requestId);
          if (organization) params.set("organization", organization);
          router.push("/loginname" + (params.size ? `?${params}` : ""));
        }}
        data-testid="signin-link"
      >
        {t("haveAccount")}
      </button>
    </div>
  );

  if (step === "anchor") {
    return (
      <>
        <button
          type="button"
          onClick={() => setStep("who")}
          className="text-hc-link hover:text-hc-p500 -mt-1 mb-3 inline-flex items-center gap-1.5 self-start rounded-md text-[13px] font-medium transition-colors"
          data-testid="signup-back"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {t("back")}
        </button>
        <div className="flex w-full flex-col space-y-1 text-left">
          <h1>{t("anchor.title")}</h1>
          <p className="ztdl-p">{t("anchor.description")}</p>
        </div>
        <div className="mt-4 w-full" data-testid="signup-anchor">
          {identityProviders.length > 0 ? (
            <SignInWithIdp
              identityProviders={identityProviders}
              requestId={requestId}
              organization={organization}
              postErrorRedirectUrl="/register"
              layout="list"
              showLabel={false}
              listLabel={(name) => t("anchor.continueWith", { provider: name })}
            />
          ) : (
            <Alert>{t("anchor.noProviders")}</Alert>
          )}
          <p className="text-hc-muted mt-3 text-center text-xs leading-5">{t("anchor.phoneLater")}</p>
        </div>
        {signInLink}
      </>
    );
  }

  return (
    <>
      <div className="flex w-full flex-col space-y-1 text-left">
        <h1>{t("who.title")}</h1>
        <p className="ztdl-p">{t("who.description")}</p>
      </div>
      <div className="mt-4 flex w-full flex-col gap-2.5" role="radiogroup" data-testid="signup-who">
        <OptionCardButton
          icon={<UserIcon />}
          title={t("who.personal")}
          description={t("who.personalDescription")}
          selected={who === "personal"}
          onClick={() => setWho("personal")}
          trailing={null}
          role="radio"
          aria-checked={who === "personal"}
          data-testid="who-personal"
        />
        <OptionCardButton
          icon={<BuildingOffice2Icon />}
          title={t("who.team")}
          description={t("who.teamDescription")}
          selected={who === "team"}
          onClick={() => setWho("team")}
          trailing={null}
          role="radio"
          aria-checked={who === "team"}
          data-testid="who-team"
        />
      </div>

      <SignupConsents legal={legal} terms={consents.terms} pd={consents.pd} onChange={setConsents} />

      {error && (
        <div className="mt-3 w-full" data-testid="error">
          <Alert>{error}</Alert>
        </div>
      )}

      <Button
        type="button"
        className="mt-4"
        variant={ButtonVariants.Primary}
        disabled={loading || !consents.terms || !consents.pd}
        onClick={next}
        data-testid="signup-continue"
      >
        {loading && <Spinner className="h-5 w-5" />}
        {t("continue")}
      </Button>
      {signInLink}
    </>
  );
}
