"use client";

import { idpTypeToSlug } from "@/lib/idp";
import { redirectToIdp } from "@/lib/server/idp";
import { IdentityProvider } from "@zitadel/proto/zitadel/settings/v2/login_settings_pb";
import { clsx } from "clsx";
import { Loader2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "./alert";
import { AutoSubmitForm } from "./auto-submit-form";
import { ButtonColors, ButtonSizes, ButtonVariants, getButtonClasses } from "./button";
import { detectIdpBrand, IdpIcon } from "./idps/idp-icons";

/**
 * Full-width "Continue with Apple" button (the returning-person screen leads with
 * the provider used last time). Posts to the same server action as the provider
 * tiles (SignInWithIdp), so the flow behind it is identical.
 */
export function IdpSignInButton({
  idp,
  requestId,
  organization,
  loginHint,
  variant = ButtonVariants.Secondary,
}: {
  idp: IdentityProvider;
  requestId?: string;
  organization?: string;
  loginHint?: string;
  variant?: ButtonVariants.Primary | ButtonVariants.Secondary;
}) {
  const [state, action] = useActionState(redirectToIdp, {});

  return (
    <form action={action} className="w-full" data-testid={`idp-button-${idp.id}`}>
      {state?.samlData && <AutoSubmitForm url={state.samlData.url} fields={state.samlData.fields} />}
      <input type="hidden" name="id" value={idp.id} />
      <input type="hidden" name="provider" value={idpTypeToSlug(idp.type)} />
      {requestId && <input type="hidden" name="requestId" value={requestId} />}
      {organization && <input type="hidden" name="organization" value={organization} />}
      <input type="hidden" name="postErrorRedirectUrl" value="/loginname" />
      {loginHint && <input type="hidden" name="loginHint" value={loginHint} />}
      <SubmitButton idp={idp} variant={variant} />
      {state?.error && (
        <div className="pt-2">
          <Alert>{state.error}</Alert>
        </div>
      )}
    </form>
  );
}

function SubmitButton({ idp, variant }: { idp: IdentityProvider; variant: ButtonVariants }) {
  const t = useTranslations("loginname");
  const { pending } = useFormStatus();
  const brand = detectIdpBrand(idp.type, idp.name);

  return (
    <button
      type="submit"
      disabled={pending}
      className={clsx(getButtonClasses(ButtonSizes.Small, variant, ButtonColors.Primary), "disabled:opacity-70")}
    >
      {pending ? (
        <Loader2Icon className="h-5 w-5 animate-spin" aria-hidden="true" />
      ) : (
        <IdpIcon brand={brand} name={idp.name} className="h-5 w-5" />
      )}
      <span className="truncate">{t("signIn.continueWith", { provider: idp.name })}</span>
    </button>
  );
}
