"use client";

import { completeFlowOrGetUrl } from "@/lib/client";
import { handleServerActionResponse } from "@/lib/client-utils";
import { verifyTOTP } from "@/lib/server/verify";
import { LoginSettings } from "@zitadel/proto/zitadel/settings/v2/login_settings_pb";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "./alert";
import { AutoSubmitForm } from "./auto-submit-form";
import { Button, ButtonVariants } from "./button";
import { CodeInput } from "./code-input";
import { CopyToClipboard } from "./copy-to-clipboard";
import { FormActions } from "./form-actions";
import { Spinner } from "./spinner";
import { Translated } from "./translated";

type Inputs = {
  code: string;
};

type Props = {
  uri: string;
  secret: string;
  loginName?: string;
  sessionId?: string;
  requestId?: string;
  organization?: string;
  checkAfter?: boolean;
  loginSettings?: LoginSettings;
};
export function TotpRegister({ uri, loginName, sessionId, requestId, organization, checkAfter, loginSettings }: Props) {
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [samlData, setSamlData] = useState<{ url: string; fields: Record<string, string> } | null>(null);
  const router = useRouter();

  const { register, handleSubmit, formState } = useForm<Inputs>({
    mode: "onChange",
    defaultValues: {
      code: "",
    },
  });

  const t = useTranslations("otp");

  async function continueWithCode(values: Inputs) {
    setLoading(true);
    return verifyTOTP(values.code, loginName, organization)
      .then(async () => {
        // if attribute is set, validate MFA after it is setup, otherwise proceed as usual (when mfa is enforced to login)
        if (checkAfter) {
          const params = new URLSearchParams({});

          if (loginName) {
            params.append("loginName", loginName);
          }
          if (requestId) {
            params.append("requestId", requestId);
          }
          if (organization) {
            params.append("organization", organization);
          }

          return router.push(`/otp/time-based?` + params);
        } else {
          if (requestId && sessionId) {
            const callbackResponse = await completeFlowOrGetUrl(
              {
                sessionId: sessionId,
                requestId: requestId,
                organization: organization,
              },
              loginSettings?.defaultRedirectUri,
            );

            handleServerActionResponse(callbackResponse, router, setSamlData, setError);
          } else if (loginName) {
            const callbackResponse = await completeFlowOrGetUrl(
              {
                loginName: loginName,
                organization: organization,
              },
              loginSettings?.defaultRedirectUri,
            );

            handleServerActionResponse(callbackResponse, router, setSamlData, setError);
          }
        }
      })
      .catch((e) => {
        setError(e.message);
        return;
      })
      .finally(() => {
        setLoading(false);
      });
  }

  return (
    <div className="flex flex-col items-center">
      {samlData && <AutoSubmitForm url={samlData.url} fields={samlData.fields} />}
      {uri && (
        <>
          <div className="border-hc-input-border mb-3 rounded-2xl border bg-white p-2">
            <QRCodeSVG className="h-40 w-40" value={uri} />
          </div>
          <div className="border-hc-input-border bg-hc-input text-hc-text-2 mb-4 flex w-full items-center rounded-xl border px-3 py-2 text-xs">
            <Link href={uri} target="_blank" className="flex-1 overflow-x-auto font-mono whitespace-nowrap">
              {uri}
            </Link>

            <CopyToClipboard value={uri}></CopyToClipboard>
          </div>
          <form className="w-full" onSubmit={handleSubmit(continueWithCode)}>
            <CodeInput
              autoFocus
              mode="numeric"
              autoComplete="one-time-code"
              {...register("code", { required: t("set.required.code") })}
              label={t("set.labels.code")}
              data-testid="code-text-input"
            />

            {error && (
              <div className="pb-3">
                <Alert>{error}</Alert>
              </div>
            )}

            <FormActions
              className="mt-1"
              primary={
                <Button
                  type="submit"
                  variant={ButtonVariants.Primary}
                  disabled={loading || !formState.isValid}
                  data-testid="submit-button"
                >
                  {loading && <Spinner className="h-5 w-5" />}
                  <Translated i18nKey="set.submit" namespace="otp" />
                </Button>
              }
            />
          </form>
        </>
      )}
    </div>
  );
}
