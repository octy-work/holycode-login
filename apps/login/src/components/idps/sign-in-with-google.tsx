"use client";

import { useTranslations } from "next-intl";
import { forwardRef } from "react";
import { BaseButton, SignInWithIdentityProviderProps } from "./base-button";
import { GoogleIcon } from "./idp-icons";

export const SignInWithGoogle = forwardRef<HTMLButtonElement, SignInWithIdentityProviderProps>(
  function SignInWithGoogle(props, ref) {
    const { children, name, ...restProps } = props;
    const t = useTranslations("idp");

    return (
      <BaseButton {...restProps} ref={ref} name={name || t("signInWithGoogle")}>
        {children ?? <GoogleIcon className="h-5 w-5" />}
      </BaseButton>
    );
  },
);
