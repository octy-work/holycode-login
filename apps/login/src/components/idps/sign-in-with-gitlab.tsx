"use client";

import { useTranslations } from "next-intl";
import { forwardRef } from "react";
import { BaseButton, SignInWithIdentityProviderProps } from "./base-button";
import { GitlabIcon } from "./idp-icons";

export const SignInWithGitlab = forwardRef<HTMLButtonElement, SignInWithIdentityProviderProps>(
  function SignInWithGitlab(props, ref) {
    const { children, name, ...restProps } = props;
    const t = useTranslations("idp");

    return (
      <BaseButton {...restProps} ref={ref} name={name || t("signInWithGitlab")}>
        {children ?? <GitlabIcon className="h-5 w-5" />}
      </BaseButton>
    );
  },
);
