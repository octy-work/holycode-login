"use client";

import { forwardRef } from "react";
import { BaseButton, SignInWithIdentityProviderProps } from "./base-button";
import { IdpBrand, IdpIcon } from "./idp-icons";

/**
 * Generic OAuth/OIDC/JWT/SAML/LDAP providers. The icon is chosen from the configured
 * name (Yandex ID, Telegram via the HolyCode bridge, VK ID …), otherwise the initial.
 */
export const SignInWithGeneric = forwardRef<HTMLButtonElement, SignInWithIdentityProviderProps & { brand?: IdpBrand }>(
  function SignInWithGeneric(props, ref) {
    const { children, name = "", brand = "generic", ...restProps } = props;
    return (
      <BaseButton {...restProps} ref={ref} name={name}>
        {children ?? <IdpIcon brand={brand} name={name} className="h-5 w-5" />}
      </BaseButton>
    );
  },
);
