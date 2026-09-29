"use client";

import { Alert } from "@/components/alert";
import { normalizeUserCode } from "@/lib/device-code";
import { getDeviceAuthorizationRequest } from "@/lib/server/oidc";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { BackButton } from "./back-button";
import { Button, ButtonVariants } from "./button";
import { FormActions } from "./form-actions";
import { TextInput } from "./input";
import { Spinner } from "./spinner";
import { Translated } from "./translated";

type Inputs = {
  userCode: string;
};

export function DeviceCodeForm({ userCode, codeNotFound }: { userCode?: string; codeNotFound?: boolean }) {
  const router = useRouter();

  const { register, handleSubmit, formState } = useForm<Inputs>({
    mode: "onChange",
    defaultValues: {
      userCode: userCode || "",
    },
  });

  const t = useTranslations("device");

  const [error, setError] = useState<string>(codeNotFound ? t("confirm.expired") : "");

  const [loading, setLoading] = useState<boolean>(false);

  async function submitCodeAndContinue(value: Inputs): Promise<boolean | void> {
    setLoading(true);
    setError("");
    const code = normalizeUserCode(value.userCode);

    const response = await getDeviceAuthorizationRequest(code)
      .catch(() => {
        setError("Could not continue the request");
        return;
      })
      .finally(() => {
        setLoading(false);
      });

    if (!response || !response.deviceAuthorizationRequest?.id) {
      setError(t("confirm.expired"));
      return;
    }

    return router.push(
      `/device/consent?` +
        new URLSearchParams({
          requestId: `device_${response.deviceAuthorizationRequest.id}`,
          user_code: code,
        }).toString(),
    );
  }

  return (
    <>
      <form className="w-full" onSubmit={handleSubmit(submitCodeAndContinue)}>
        <TextInput
          type="text"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          {...register("userCode", { required: t("usercode.required.code") })}
          label={t("usercode.labels.code")}
          data-testid="code-text-input"
          inputClassName="h-[60px] rounded-[14px] border-dashed text-center font-mono text-[28px] font-extrabold tracking-[0.26em] uppercase"
          hideErrorLine
        />

        {error && (
          <div className="pt-3" data-testid="error">
            <Alert>{error}</Alert>
          </div>
        )}

        <FormActions
          className="mt-4"
          primary={
            <Button
              type="submit"
              variant={ButtonVariants.Primary}
              disabled={loading || !formState.isValid}
              data-testid="submit-button"
            >
              {loading && <Spinner className="h-5 w-5" />}
              <Translated i18nKey="usercode.submit" namespace="device" />
            </Button>
          }
          secondary={<BackButton />}
        />
      </form>
    </>
  );
}
