"use client";

import { useTranslations } from "next-intl";
import { forwardRef } from "react";
import { BaseButton, SignInWithIdentityProviderProps } from "./base-button";
import { GitHubIcon } from "./idp-icons";

export const SignInWithGithub = forwardRef<HTMLButtonElement, SignInWithIdentityProviderProps>(
  function SignInWithGithub(props, ref) {
    const { children, name, ...restProps } = props;
    const t = useTranslations("idp");

    return (
      <BaseButton {...restProps} ref={ref} tone="dark" name={name || t("signInWithGithub")}>
        {children ?? <GitHubIcon className="h-5 w-5" />}
      </BaseButton>
    );
  },
);
