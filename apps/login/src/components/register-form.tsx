"use client";

import { handleServerActionResponse } from "@/lib/client-utils";
import { registerUser } from "@/lib/server/register";
import { EnvelopeIcon, InboxIcon } from "@heroicons/react/24/outline";
import { LegalAndSupportSettings } from "@zitadel/proto/zitadel/settings/v2/legal_settings_pb";
import { LoginSettings, PasskeysType } from "@zitadel/proto/zitadel/settings/v2/login_settings_pb";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FieldValues, useForm } from "react-hook-form";
import { Alert, AlertType } from "./alert";
import { AuthenticationMethod, AuthenticationMethodRadio, methods } from "./authentication-method-radio";
import { AutoSubmitForm } from "./auto-submit-form";
import { BackButton } from "./back-button";
import { Button, ButtonVariants } from "./button";
import { FormActions } from "./form-actions";
import { TextInput } from "./input";
import { OptionCardButton } from "./option-card";
import { PrivacyPolicyCheckboxes } from "./privacy-policy-checkboxes";
import { Spinner } from "./spinner";
import { Translated } from "./translated";

type Inputs =
  | {
      firstname: string;
      lastname: string;
      email: string;
      mailbox?: string;
    }
  | FieldValues;

type Props = {
  legal: LegalAndSupportSettings;
  firstname?: string;
  lastname?: string;
  email?: string;
  organization: string;
  requestId?: string;
  loginSettings?: LoginSettings;
  idpCount: number;
  /**
   * Mail domains HolyCode can host for the user ("Create a mailbox at @oggo.app").
   * Empty → plain e-mail field. The mailbox itself is created by Daenerys after the
   * account exists; here the chosen address simply becomes the e-mail/login.
   */
  mailDomains?: string[];
  /** Label of the submit button when the form is opened from an invitation ("Join OGGO"). */
  submitLabel?: string;
};

export function RegisterForm({
  legal,
  email,
  firstname,
  lastname,
  organization,
  requestId,
  loginSettings,
  idpCount = 0,
  mailDomains = [],
  submitLabel,
}: Props) {
  const { register, handleSubmit, formState, watch } = useForm<Inputs>({
    mode: "onChange",
    defaultValues: {
      email: email ?? "",
      firstname: firstname ?? "",
      lastname: lastname ?? "",
      mailbox: "",
    },
  });

  const t = useTranslations("register");

  const [loading, setLoading] = useState<boolean>(false);
  const [selected, setSelected] = useState<AuthenticationMethod>(methods[0]);
  const [error, setError] = useState<string>("");
  const [samlData, setSamlData] = useState<{ url: string; fields: Record<string, string> } | null>(null);

  const hasHostedMail = mailDomains.length > 0;
  const [mailMode, setMailMode] = useState<"hosted" | "own">(hasHostedMail && !email ? "hosted" : "own");
  const [mailDomain, setMailDomain] = useState<string>(mailDomains[0] ?? "");

  const router = useRouter();

  function resolveEmail(values: Inputs): string {
    if (hasHostedMail && mailMode === "hosted") {
      return `${String(values.mailbox ?? "").trim()}@${mailDomain}`;
    }
    return values.email;
  }

  async function submitAndRegister(values: Inputs) {
    setLoading(true);
    try {
      const response = await registerUser({
        email: resolveEmail(values),
        firstName: values.firstname,
        lastName: values.lastname,
        organization: organization,
        requestId: requestId,
      });

      handleServerActionResponse(response, router, setSamlData, setError);

      return response;
    } catch {
      setError(t("errors.couldNotRegisterUser"));
    } finally {
      setLoading(false);
    }
  }

  async function submitAndContinue(value: Inputs, withPassword: boolean = false) {
    const registerParams: any = {
      firstname: value.firstname,
      lastname: value.lastname,
      email: resolveEmail(value),
    };

    if (organization) {
      registerParams.organization = organization;
    }

    if (requestId) {
      registerParams.requestId = requestId;
    }

    // redirect user to /register/password if password is chosen
    if (withPassword) {
      return router.push(`/register/password?` + new URLSearchParams(registerParams));
    } else {
      return submitAndRegister(value);
    }
  }

  const { errors } = formState;

  const [tosAndPolicyAccepted, setTosAndPolicyAccepted] = useState(false);

  // Check if legal acceptance is required
  const isLegalAcceptanceRequired = !!(legal?.tosLink || legal?.privacyPolicyLink);
  const mailbox = watch("mailbox");
  const mailValid =
    hasHostedMail && mailMode === "hosted" ? /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(String(mailbox ?? "")) : true;
  const canSubmit = formState.isValid && mailValid && (!isLegalAcceptanceRequired || tosAndPolicyAccepted);

  const emailField = (
    <TextInput
      type="email"
      autoComplete="email"
      required
      {...register("email", {
        required: hasHostedMail && mailMode === "hosted" ? false : t("required.email"),
      })}
      label={t("labels.email")}
      error={errors.email?.message as string}
      data-testid="email-text-input"
    />
  );

  return (
    <>
      {samlData && <AutoSubmitForm url={samlData.url} fields={samlData.fields} />}
      <form className="w-full">
        <div className="grid grid-cols-2 gap-x-3">
          <TextInput
            type="text"
            autoComplete="given-name"
            autoFocus
            required
            {...register("firstname", { required: t("required.firstname") })}
            label={t("labels.firstname")}
            error={errors.firstname?.message as string}
            data-testid="firstname-text-input"
          />
          <TextInput
            type="text"
            autoComplete="family-name"
            required
            {...register("lastname", { required: t("required.lastname") })}
            label={t("labels.lastname")}
            error={errors.lastname?.message as string}
            data-testid="lastname-text-input"
          />
        </div>

        {hasHostedMail ? (
          <div className="flex flex-col gap-2.5" data-testid="mail-choice">
            <span className="text-hc-text-2 text-[12.5px] leading-4 font-semibold">
              <Translated i18nKey="mail.title" namespace="register" />
            </span>
            <OptionCardButton
              icon={<InboxIcon />}
              title={<Translated i18nKey="mail.hosted" namespace="register" data={{ domain: mailDomain }} />}
              description={<Translated i18nKey="mail.hostedDescription" namespace="register" />}
              selected={mailMode === "hosted"}
              onClick={() => setMailMode("hosted")}
              trailing={null}
            />
            {mailMode === "hosted" && (
              <div className="flex items-end gap-2 pl-1">
                <TextInput
                  type="text"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  {...register("mailbox")}
                  label={t("mail.localPart")}
                  data-testid="mailbox-text-input"
                  hideErrorLine
                  className="flex-1"
                />
                {mailDomains.length > 1 ? (
                  <select
                    className="bg-hc-input border-hc-input-border text-hc-text focus:border-hc-p500 focus:ring-hc-ring h-11 rounded-xl border px-3 text-[15px] outline-none focus:ring-[3px]"
                    value={mailDomain}
                    onChange={(e) => setMailDomain(e.target.value)}
                    aria-label="domain"
                  >
                    {mailDomains.map((d) => (
                      <option key={d} value={d}>
                        @{d}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-hc-muted flex h-11 items-center text-[15px]">@{mailDomain}</span>
                )}
              </div>
            )}
            <OptionCardButton
              icon={<EnvelopeIcon />}
              title={<Translated i18nKey="mail.own" namespace="register" />}
              description={<Translated i18nKey="mail.ownDescription" namespace="register" />}
              selected={mailMode === "own"}
              onClick={() => setMailMode("own")}
              trailing={null}
            />
            {mailMode === "own" && <div className="pl-1">{emailField}</div>}
          </div>
        ) : (
          emailField
        )}

        {/* show chooser if both methods are allowed */}
        {loginSettings && loginSettings.allowLocalAuthentication && loginSettings.passkeysType == PasskeysType.ALLOWED && (
          <div className="mt-3 flex flex-col gap-2.5">
            <span className="text-hc-text-2 text-[12.5px] leading-4 font-semibold">
              <Translated i18nKey="selectMethod" namespace="register" />
            </span>
            <AuthenticationMethodRadio selected={selected} selectionChanged={setSelected} />
          </div>
        )}
        {!loginSettings?.allowLocalAuthentication &&
          loginSettings?.passkeysType !== PasskeysType.ALLOWED &&
          (!loginSettings?.allowExternalIdp || !idpCount) && (
            <div className="py-4">
              <Alert type={AlertType.INFO}>
                <Translated i18nKey="noMethodAvailableWarning" namespace="register" />
              </Alert>
            </div>
          )}

        {(legal?.tosLink || legal?.privacyPolicyLink) && (
          <PrivacyPolicyCheckboxes legal={legal} onChange={setTosAndPolicyAccepted} />
        )}

        {error && (
          <div className="pt-3">
            <Alert>{error}</Alert>
          </div>
        )}

        <FormActions
          className="mt-4"
          primary={
            <Button
              type="submit"
              variant={ButtonVariants.Primary}
              disabled={loading || !canSubmit}
              onClick={handleSubmit((values) => {
                const usePasswordToContinue: boolean =
                  loginSettings?.allowLocalAuthentication && loginSettings?.passkeysType == PasskeysType.ALLOWED
                    ? !(selected === methods[0]) // choose selection if both available
                    : !!loginSettings?.allowLocalAuthentication; // if password is chosen
                // set password as default if only password is allowed
                return submitAndContinue(values, usePasswordToContinue);
              })}
              data-testid="submit-button"
            >
              {loading && <Spinner className="h-5 w-5" />}
              {submitLabel ?? <Translated i18nKey="submit" namespace="register" />}
            </Button>
          }
          secondary={<BackButton data-testid="back-button" />}
        />
      </form>
    </>
  );
}
