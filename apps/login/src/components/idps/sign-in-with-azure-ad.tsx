"use client";

import { useTranslations } from "next-intl";
import { forwardRef } from "react";
import { BaseButton, SignInWithIdentityProviderProps } from "./base-button";
import { MicrosoftIcon } from "./idp-icons";

export const SignInWithAzureAd = forwardRef<HTMLButtonElement, SignInWithIdentityProviderProps>(
  function SignInWithAzureAd(props, ref) {
    const { children, name, ...restProps } = props;
    const t = useTranslations("idp");

    return (
      <BaseButton {...restProps} ref={ref} name={name || t("signInWithAzureAD")}>
        {children ?? <MicrosoftIcon className="h-5 w-5" />}
      </BaseButton>
    );
  },
);
