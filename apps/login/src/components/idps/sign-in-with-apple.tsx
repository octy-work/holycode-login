"use client";

import { useTranslations } from "next-intl";
import { forwardRef } from "react";
import { BaseButton, SignInWithIdentityProviderProps } from "./base-button";
import { AppleIcon } from "./idp-icons";

export const SignInWithApple = forwardRef<HTMLButtonElement, SignInWithIdentityProviderProps>(
  function SignInWithApple(props, ref) {
    const { children, name, ...restProps } = props;
    const t = useTranslations("idp");

    return (
      <BaseButton {...restProps} ref={ref} name={name || t("signInWithApple")}>
        {children ?? <AppleIcon className="h-5 w-5" />}
      </BaseButton>
    );
  },
);
