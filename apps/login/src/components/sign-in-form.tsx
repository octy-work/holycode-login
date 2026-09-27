"use client";

import { handleServerActionResponse } from "@/lib/client-utils";
import { RememberedPrimary, RememberedView } from "@/lib/last-login";
import { resetPassword } from "@/lib/server/password";
import { forgetLastLogin, PasskeyOffer, signIn } from "@/lib/server/sign-in";
import { FingerPrintIcon } from "@heroicons/react/24/outline";
import { IdentityProvider, LoginSettings } from "@zitadel/proto/zitadel/settings/v2/login_settings_pb";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Alert, AlertType } from "./alert";
import { AutoSubmitForm } from "./auto-submit-form";
import { Avatar } from "./avatar";
import { Button, ButtonVariants } from "./button";
import { IdpSignInButton } from "./idp-sign-in-button";
import { TextInput } from "./input";
import { RegisterLink } from "./register-link";
import { SignInWithIdp } from "./sign-in-with-idp";
import { Spinner } from "./spinner";
import { Translated } from "./translated";
import { usePasskeySignIn } from "./use-passkey-sign-in";

type Inputs = {
  loginName: string;
  password: string;
};

type Props = {
  /** Prefill (login_hint / loginName in the URL). */
  loginName?: string;
  requestId?: string;
  organization?: string;
  defaultOrganization?: string;
  loginSettings?: LoginSettings;
  suffix?: string;
  hideSuffix?: boolean;
  /** Auto-submit the prefilled login name (upstream `submit=true`). */
  submit: boolean;
  /** Active providers to offer (already filtered by the login policy). */
  identityProviders: IdentityProvider[];
  allowRegister: boolean;
  /** The account this browser signed in with last time (hc_last_login), when it applies. */
  remembered: RememberedView | null;
};

/**
 * HolyCode sign-in — the only screen of the ID (27.09.2026):
 *
 * - First visit: "E-mail or login", "Password · Forgot?", "Sign in", then "or" and the
 *   provider tiles, "No account? Create one". Submitting with a password checks it
 *   in one go; without one, the account's way in is looked up (provider → straight
 *   there, passkey → the passkey button here, password → the field gets the focus).
 * - Returning ("welcome back"): the remembered account with "Not me", its last way
 *   in first (password field, the provider's button or the passkey button), other
 *   ways below as secondary.
 */
export function SignInForm(props: Props) {
  const { requestId, organization, defaultOrganization, loginSettings, suffix, hideSuffix, identityProviders } = props;
  const t = useTranslations("loginname");
  const tPassword = useTranslations("password");
  const router = useRouter();
  const passwordInputId = useId();

  const [remembered, setRemembered] = useState<RememberedView | null>(props.remembered);
  // On the returning screen the person may switch to the password (or another way).
  const [primaryOverride, setPrimaryOverride] = useState<RememberedPrimary | null>(null);

  const { register, handleSubmit, setFocus, getValues, watch, reset } = useForm<Inputs>({
    mode: "onChange",
    defaultValues: { loginName: props.loginName ?? "", password: "" },
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [samlData, setSamlData] = useState<{ url: string; fields: Record<string, string> } | null>(null);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [passkeyOffer, setPasskeyOffer] = useState<PasskeyOffer | null>(null);

  const passkey = usePasskeySignIn({ requestId, onError: setError, onSamlData: setSamlData });
  const busy = loading || passkey.pending;

  const allowLocal = !!loginSettings?.allowLocalAuthentication;
  const showForgot = allowLocal && !loginSettings?.hidePasswordReset;

  const typedLoginName = watch("loginName");
  const withSuffix = useCallback((value: string) => (suffix ? `${value}@${suffix}` : value), [suffix]);

  // A different login name makes an earlier answer ("enter the password", "use the passkey") stale.
  useEffect(() => {
    setPasswordRequired(false);
    setPasskeyOffer(null);
  }, [typedLoginName]);

  const submitSignIn = useCallback(
    async (loginName: string, password: string, options: { suffix?: string } = {}) => {
      setError("");
      setInfo("");
      setLoading(true);
      try {
        const res = await signIn({
          loginName,
          password: password || undefined,
          requestId,
          organization,
          defaultOrganization,
          suffix: options.suffix,
        });

        if (res && "passwordRequired" in res) {
          setPasskeyOffer(null);
          setPasswordRequired(true);
          setFocus("password");
          return;
        }
        if (res && "passkey" in res) {
          setPasswordRequired(false);
          setPasskeyOffer(res.passkey);
          return;
        }
        if (!handleServerActionResponse(res, router, setSamlData, setError)) {
          setError(t("errors.internalError"));
        }
      } catch {
        setError(t("errors.internalError"));
      } finally {
        setLoading(false);
      }
    },
    [requestId, organization, defaultOrganization, router, setFocus, t],
  );

  // Upstream `submit=true`: continue with the prefilled login name right away.
  const autoSubmitted = useRef(false);
  useEffect(() => {
    if (autoSubmitted.current || remembered || !props.submit || !props.loginName) {
      return;
    }
    autoSubmitted.current = true;
    submitSignIn(props.loginName, "", { suffix });
  }, [props.submit, props.loginName, remembered, submitSignIn, suffix]);

  async function forgotPassword() {
    const typed = getValues("loginName")?.trim();
    const loginName = remembered ? remembered.loginName : typed ? withSuffix(typed) : "";
    if (!loginName) {
      setInfo("");
      setError(t("required.loginName"));
      setFocus("loginName");
      return;
    }

    setError("");
    setInfo("");
    setLoading(true);
    let response;
    try {
      response = await resetPassword({ loginName, organization, defaultOrganization, requestId });
    } catch {
      setError(tPassword("errors.couldNotSendResetLink"));
      return;
    } finally {
      setLoading(false);
    }

    if (response && "error" in response && response.error) {
      setError(response.error as string);
      return;
    }

    setInfo(tPassword("verify.info.passwordResetSent"));
    const params = new URLSearchParams({ loginName });
    if (organization) {
      params.append("organization", organization);
    }
    if (requestId) {
      params.append("requestId", requestId);
    }
    router.push("/password/set?" + params);
  }

  async function notMe() {
    setRemembered(null);
    setPrimaryOverride(null);
    setError("");
    setInfo("");
    setPasswordRequired(false);
    setPasskeyOffer(null);
    reset({ loginName: "", password: "" });
    try {
      await forgetLastLogin();
    } catch {
      // The screen is already the empty form; the cookie only affects the next visit.
    }
  }

  let inputLabel = t("labels.loginname");
  if (loginSettings?.disableLoginWithEmail && loginSettings?.disableLoginWithPhone) {
    inputLabel = t("labels.username");
  } else if (loginSettings?.disableLoginWithEmail) {
    inputLabel = t("labels.usernameOrPhoneNumber");
  } else if (loginSettings?.disableLoginWithPhone) {
    inputLabel = t("labels.usernameOrEmail");
  }

  const messages = (
    <>
      {passwordRequired && !error && (
        <p className="text-hc-text-2 mt-2 text-[12.5px] leading-snug" role="status" data-testid="password-required">
          {t("signIn.passwordRequired")}
        </p>
      )}
      {info && (
        <div className="pt-3">
          <Alert type={AlertType.INFO}>{info}</Alert>
        </div>
      )}
      {error && (
        <div className="pt-3" data-testid="error">
          <Alert>{error}</Alert>
        </div>
      )}
    </>
  );

  const passwordField = (autoFocus: boolean) => (
    <div className={clsx(error && "animate-shake transform-gpu")}>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label htmlFor={passwordInputId} aria-hidden="true" className="text-hc-text-2 text-[12.5px] leading-4 font-semibold">
          {tPassword("verify.labels.password")}
        </label>
        {showForgot && (
          <button
            type="button"
            onClick={forgotPassword}
            disabled={busy}
            className="text-hc-link hover:text-hc-p500 rounded-md text-[12.5px] leading-4 font-medium transition-colors disabled:opacity-60"
            data-testid="reset-button"
          >
            {t("signIn.forgotPassword")}
          </button>
        )}
      </div>
      <TextInput
        id={passwordInputId}
        type="password"
        autoComplete="current-password"
        autoFocus={autoFocus}
        {...register("password")}
        label={tPassword("verify.labels.password")}
        hideLabel
        data-testid="password-text-input"
        hideErrorLine
      />
    </div>
  );

  const passkeyButton = (variant: ButtonVariants, loginName: string, passkeyOrganization?: string) => (
    <Button
      type="button"
      variant={variant}
      disabled={busy}
      onClick={() => passkey.start({ loginName, organization: passkeyOrganization ?? organization })}
      data-testid="passkey-button"
    >
      {passkey.pending ? <Spinner className="h-5 w-5" /> : <FingerPrintIcon className="h-5 w-5" aria-hidden="true" />}
      {t("signIn.passkey")}
    </Button>
  );

  const header = (titleKey: string, descriptionKey: string) => (
    <div className="flex w-full flex-col text-left">
      <div className="flex flex-col space-y-1">
        <h1>
          <Translated i18nKey={titleKey} namespace="loginname" />
        </h1>
        <p className="ztdl-p">
          <Translated i18nKey={descriptionKey} namespace="loginname" />
        </p>
      </div>
    </div>
  );

  if (remembered) {
    // The account turned out to sign in with a passkey (no password any more): lead with it.
    const primary: RememberedPrimary = passkeyOffer ? { kind: "passkey" } : (primaryOverride ?? remembered.primary);
    const idpById = (id: string) => identityProviders.find((idp) => idp.id === id);
    const primaryIdp = primary.kind === "idp" ? idpById(primary.idpId) : undefined;

    // Remembered providers other than the one leading now, as full-width secondary buttons.
    const secondaryIdpIds = [
      ...(remembered.primary.kind === "idp" ? [remembered.primary.idpId] : []),
      ...remembered.rememberedIdpIds,
    ].filter((id, i, all) => all.indexOf(id) === i && !(primary.kind === "idp" && primary.idpId === id) && !!idpById(id));
    const shownIds = new Set([...secondaryIdpIds, ...(primaryIdp ? [primaryIdp.id] : [])]);
    const otherIdps = identityProviders.filter((idp) => !shownIds.has(idp.id));
    const passkeySecondary =
      primary.kind !== "passkey" && (remembered.passkeyRemembered || remembered.primary.kind === "passkey");

    return (
      <>
        {header("returning.title", "returning.description")}
        <div className="mt-4 w-full">
          {samlData && <AutoSubmitForm url={samlData.url} fields={samlData.fields} />}

          <div
            className="bg-hc-input border-hc-input-border flex items-center gap-3 rounded-[14px] border px-3 py-2.5"
            data-testid="remembered-account"
          >
            <Avatar size="base" name={remembered.displayName ?? ""} loginName={remembered.loginName} />
            <div className="min-w-0 flex-1 text-left">
              <div className="text-hc-text truncate text-[15px] leading-tight font-semibold">
                {remembered.displayName || remembered.loginName.split("@")[0]}
              </div>
              <div className="text-hc-muted truncate text-[12.5px]">{remembered.loginName}</div>
            </div>
            <button
              type="button"
              onClick={notMe}
              className="text-hc-link hover:text-hc-p500 shrink-0 rounded-lg px-1.5 py-1 text-[13px] font-medium transition-colors"
              data-testid="not-me"
            >
              {t("returning.notMe")}
            </button>
          </div>

          <div className="mt-4">
            {primary.kind === "password" && (
              <form
                className="w-full"
                onSubmit={handleSubmit((values) => {
                  if (!values.password) {
                    // The account is known: just ask for the password.
                    setError("");
                    setPasswordRequired(true);
                    setFocus("password");
                    return;
                  }
                  return submitSignIn(remembered.loginName, values.password);
                })}
              >
                <input type="hidden" name="username" autoComplete="username" value={remembered.loginName} readOnly />
                {passwordField(true)}
                {messages}
                <Button
                  type="submit"
                  className="mt-4"
                  variant={ButtonVariants.Primary}
                  disabled={busy}
                  data-testid="submit-button"
                >
                  {loading && <Spinner className="h-5 w-5" />}
                  {t("signIn.submit")}
                </Button>
              </form>
            )}

            {primary.kind === "idp" && primaryIdp && (
              <IdpSignInButton
                idp={primaryIdp}
                variant={ButtonVariants.Primary}
                requestId={requestId}
                organization={organization}
                loginHint={remembered.loginName}
              />
            )}

            {primary.kind === "passkey" && (
              <>
                {passkeyButton(ButtonVariants.Primary, remembered.loginName)}
                {messages}
              </>
            )}

            {primary.kind === "idp" && messages}
          </div>

          <div className="mt-3 flex flex-col gap-2.5">
            {primary.kind !== "password" && allowLocal && (
              <Button
                type="button"
                variant={ButtonVariants.Secondary}
                disabled={busy}
                onClick={() => {
                  setError("");
                  setInfo("");
                  setPasskeyOffer(null);
                  setPrimaryOverride({ kind: "password" });
                }}
                data-testid="use-password-button"
              >
                {t("returning.usePassword")}
              </Button>
            )}
            {passkeySecondary && passkeyButton(ButtonVariants.Secondary, remembered.loginName)}
            {secondaryIdpIds.map((id) => (
              <IdpSignInButton
                key={id}
                idp={idpById(id) as IdentityProvider}
                variant={ButtonVariants.Secondary}
                requestId={requestId}
                organization={organization}
                loginHint={remembered.loginName}
              />
            ))}
          </div>

          {otherIdps.length > 0 && (
            <div className="mt-4">
              <SignInWithIdp
                identityProviders={otherIdps}
                requestId={requestId}
                organization={organization}
                postErrorRedirectUrl="/loginname"
                loginHint={remembered.loginName}
                label={t("signIn.or")}
              />
            </div>
          )}

          <p className="text-hc-muted mt-3 text-center text-xs leading-5">{t("returning.hint")}</p>
        </div>
      </>
    );
  }

  const showPasswordField = !passkeyOffer || passkeyOffer.altPassword;
  const idpLoginHint = typedLoginName?.trim() ? withSuffix(typedLoginName.trim()) : undefined;

  return (
    <>
      {header("title", "description")}
      <div className="mt-4 w-full">
        {samlData && <AutoSubmitForm url={samlData.url} fields={samlData.fields} />}

        {allowLocal && (
          <form
            className="w-full"
            noValidate
            onSubmit={handleSubmit((values) => submitSignIn(values.loginName.trim(), values.password, { suffix }))}
          >
            <TextInput
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus={!props.loginName}
              {...register("loginName", { required: t("required.loginName") })}
              label={inputLabel}
              data-testid="username-text-input"
              suffix={hideSuffix ? undefined : suffix}
              hideErrorLine
            />

            {showPasswordField && <div className="mt-3">{passwordField(!!props.loginName)}</div>}

            {messages}

            {passkeyOffer ? (
              <div className="mt-4 flex flex-col gap-2.5">
                {passkeyButton(ButtonVariants.Primary, passkeyOffer.loginName, passkeyOffer.organization)}
                {passkeyOffer.altPassword && (
                  <Button type="submit" variant={ButtonVariants.Secondary} disabled={busy} data-testid="submit-button">
                    {loading && <Spinner className="h-5 w-5" />}
                    {t("signIn.submit")}
                  </Button>
                )}
              </div>
            ) : (
              <Button
                type="submit"
                className="mt-4"
                variant={ButtonVariants.Primary}
                disabled={busy || !typedLoginName?.trim()}
                data-testid="submit-button"
              >
                {loading && <Spinner className="h-5 w-5" />}
                {t("signIn.submit")}
              </Button>
            )}
          </form>
        )}

        {!allowLocal && messages}

        {identityProviders.length > 0 && (
          <div className={clsx(allowLocal && "mt-4")}>
            <SignInWithIdp
              identityProviders={identityProviders}
              requestId={requestId}
              organization={organization}
              postErrorRedirectUrl="/loginname"
              loginHint={idpLoginHint}
              showLabel={allowLocal}
              label={t("signIn.or")}
            />
          </div>
        )}

        {props.allowRegister && (
          <div className="mt-2">
            <RegisterLink organization={organization} requestId={requestId} />
          </div>
        )}
      </div>
    </>
  );
}
