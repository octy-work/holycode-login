"use client";

import { completeDeviceAuthorization } from "@/lib/server/device";
import { CheckIcon } from "@heroicons/react/24/solid";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "./alert";
import { Button, ButtonVariants } from "./button";
import { FormActions } from "./form-actions";
import { Spinner } from "./spinner";
import { Translated } from "./translated";

export function ConsentScreen({
  scope,
  nextUrl,
  deviceAuthorizationRequestId,
  appName,
}: {
  scope?: string[];
  nextUrl: string;
  deviceAuthorizationRequestId: string;
  appName?: string;
}) {
  const t = useTranslations();
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const router = useRouter();

  async function denyDeviceAuth() {
    setLoading(true);
    const response = await completeDeviceAuthorization(deviceAuthorizationRequestId)
      .catch(() => {
        setError("Could not register user");
        return;
      })
      .finally(() => {
        setLoading(false);
      });

    if (response) {
      return router.push("/device");
    }
  }

  const scopes = scope?.filter((s) => !!s);

  const scopeRow = (key: string, text: string) => (
    <li key={key} className="border-hc-border-subtle flex items-center gap-2.5 border-b py-2 text-sm last:border-0">
      <span className="bg-hc-soft text-hc-p400 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md">
        <CheckIcon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <span>{text}</span>
    </li>
  );

  return (
    <div className="flex w-full flex-col space-y-4">
      <ul className="bg-hc-input border-hc-input-border w-full rounded-[14px] border px-3.5 py-1">
        {scopes?.length === 0 && scopeRow("openid", t("device.scope.openid"))}
        {scopes?.map((s) => {
          const translationKey = `device.scope.${s}`;
          const description = t(translationKey);

          // Check if the key itself is returned and provide a fallback
          const resolvedDescription = description === translationKey ? "" : description;

          return scopeRow(s, resolvedDescription);
        })}
      </ul>

      <p className="ztdl-p text-xs">
        <Translated i18nKey="request.disclaimer" namespace="device" data={{ appName: appName }} />
      </p>

      {error && (
        <div>
          <Alert>{error}</Alert>
        </div>
      )}

      <FormActions
        className="mt-1"
        primary={
          <Link href={nextUrl} className="block w-full">
            <Button data-testid="submit-button" type="submit" variant={ButtonVariants.Primary}>
              <Translated i18nKey="device.request.submit" namespace="device" />
            </Button>
          </Link>
        }
        secondary={
          <Button
            onClick={() => {
              denyDeviceAuth();
            }}
            variant={ButtonVariants.Ghost}
            data-testid="deny-button"
          >
            {loading && <Spinner className="h-4 w-4" />}
            <Translated i18nKey="device.request.deny" namespace="device" />
          </Button>
        }
      />
    </div>
  );
}
