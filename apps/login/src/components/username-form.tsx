"use client";

import { handleServerActionResponse } from "@/lib/client-utils";
import { sendLoginname } from "@/lib/server/loginname";
import { LoginSettings } from "@zitadel/proto/zitadel/settings/v2/login_settings_pb";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { IdentityProviderType } from "@zitadel/proto/zitadel/settings/v2/login_settings_pb";
import { Alert } from "./alert";
import { AutoSubmitForm } from "./auto-submit-form";
import { detectIdpBrand, IdpIcon } from "./idps/idp-icons";
import { Button, ButtonVariants } from "./button";
import { TextInput } from "./input";
import { Spinner } from "./spinner";
import { Translated } from "./translated";

type Inputs = {
  loginName: string;
};

type Props = {
  loginName: string | undefined;
  requestId: string | undefined;
  loginSettings: LoginSettings | undefined;
  organization?: string;
  defaultOrganization?: string;
  suffix?: string;
  hideSuffix?: boolean;
  submit: boolean;
  /** Kept for API compatibility; the register link is rendered by the page (RegisterLink). */
  allowRegister: boolean;
};

/**
 * Screen 1: one field, one full-width button. No "Back" — there is nowhere to go.
 */
export function UsernameForm({
  loginName,
  requestId,
  organization,
  defaultOrganization,
  suffix,
  hideSuffix,
  loginSettings,
  submit,
}: Props) {
  const { register, handleSubmit, formState } = useForm<Inputs>({
    mode: "onChange",
    defaultValues: {
      loginName: loginName ? loginName : "",
    },
  });

  const t = useTranslations("loginname");

  const router = useRouter();

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [samlData, setSamlData] = useState<{ url: string; fields: Record<string, string> } | null>(null);
  // A known account whose only way in is a linked provider (see sendLoginname).
  const [idpChoice, setIdpChoice] = useState<{
    url: string;
    name: string;
    type: IdentityProviderType;
    loginName: string;
    passwordUrl?: string;
  } | null>(null);

  const submitLoginName = useCallback(
    async (values: Inputs, organization?: string) => {
      setLoading(true);

      try {
        const res = await sendLoginname({
          loginName: values.loginName,
          organization,
          defaultOrganization,
          requestId,
          suffix,
        });

        if (res && typeof res === "object" && "idpChoice" in res && res.idpChoice) {
          setIdpChoice(res.idpChoice as NonNullable<typeof idpChoice>);
          return res;
        }
        handleServerActionResponse(res, router, setSamlData, setError);
        return res;
      } catch {
        setError(t("errors.internalError"));
      } finally {
        setLoading(false);
      }
    },
    [defaultOrganization, requestId, suffix, router, t],
  );

  useEffect(() => {
    if (submit && loginName) {
      // When we navigate to this page, we always want to be redirected if submit is true and the parameters are valid.
      submitLoginName({ loginName }, organization);
    }
  }, [submit, loginName, organization, submitLoginName]);

  let inputLabel = t("labels.loginname");
  if (loginSettings?.disableLoginWithEmail && loginSettings?.disableLoginWithPhone) {
    inputLabel = t("labels.username");
  } else if (loginSettings?.disableLoginWithEmail) {
    inputLabel = t("labels.usernameOrPhoneNumber");
  } else if (loginSettings?.disableLoginWithPhone) {
    inputLabel = t("labels.usernameOrEmail");
  }

  if (idpChoice) {
    const brand = detectIdpBrand(idpChoice.type, idpChoice.name);
    return (
      <div className="w-full" data-testid="idp-choice">
        <div className="bg-hc-soft border-hc-p500/35 text-hc-text-2 rounded-[14px] border px-3.5 py-3 text-left text-[14px] leading-snug">
          {t("idpOnly.description", { loginName: idpChoice.loginName, provider: idpChoice.name })}
        </div>
        <a
          href={idpChoice.url}
          className="hc-btn-primary mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold text-white"
          data-testid="idp-choice-continue"
        >
          <IdpIcon brand={brand} name={idpChoice.name} />
          {t("idpOnly.continue", { provider: idpChoice.name })}
        </a>
        {idpChoice.passwordUrl ? (
          <Button
            type="button"
            className="mt-3"
            variant={ButtonVariants.Secondary}
            onClick={() => router.push(idpChoice.passwordUrl as string)}
            data-testid="idp-choice-password"
          >
            {t("idpOnly.usePassword")}
          </Button>
        ) : (
          <p className="text-hc-muted mt-3 text-center text-xs leading-5">{t("idpOnly.passkeyHint", { provider: idpChoice.name })}</p>
        )}
        <button
          type="button"
          className="text-hc-p400 mt-2 h-9 w-full text-sm font-medium"
          onClick={() => setIdpChoice(null)}
          data-testid="idp-choice-other"
        >
          {t("idpOnly.otherAccount")}
        </button>
      </div>
    );
  }

  return (
    <>
      {samlData && <AutoSubmitForm url={samlData.url} fields={samlData.fields} />}
      <form className="w-full" onSubmit={handleSubmit((e) => submitLoginName(e, organization))}>
        <TextInput
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          {...register("loginName", { required: t("required.loginName") })}
          label={inputLabel}
          data-testid="username-text-input"
          suffix={hideSuffix ? undefined : suffix}
          hideErrorLine
        />

        {error && (
          <div className="pt-3" data-testid="error">
            <Alert>{error}</Alert>
          </div>
        )}

        <Button
          data-testid="submit-button"
          type="submit"
          className="mt-4"
          variant={ButtonVariants.Primary}
          disabled={loading || !formState.isValid}
        >
          {loading && <Spinner className="h-5 w-5" />}
          <Translated i18nKey="submit" namespace="loginname" />
        </Button>
      </form>
    </>
  );
}
