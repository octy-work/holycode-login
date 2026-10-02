import {
  CheckIcon,
  ClockIcon,
  DevicePhoneMobileIcon,
  EnvelopeIcon,
  FingerPrintIcon,
  KeyIcon,
  LifebuoyIcon,
  LockClosedIcon,
} from "@heroicons/react/24/solid";
import { ReactNode } from "react";
import { OptionCard, OptionCardLink } from "./option-card";
import { OptionalTranslated } from "./optional-translated";
import { BadgeState, StateBadge } from "./state-badge";
import { Translated } from "./translated";

/**
 * Authentication method cards (login, second factor, setup). Titles come from
 * `authenticator.methods.*`; the optional subtitle from `authenticator.methodDescriptions.*`
 * (both overridable through hosted_login_translation).
 */
function MethodCard({
  alreadyAdded,
  link,
  icon,
  methodKey,
}: {
  alreadyAdded: boolean;
  link: string;
  icon: ReactNode;
  methodKey: string;
}) {
  const title = <Translated i18nKey={`methods.${methodKey}`} namespace="authenticator" />;
  const description = <OptionalTranslated i18nKey={`methodDescriptions.${methodKey}`} namespace="authenticator" />;

  return alreadyAdded ? (
    <OptionCard key={link} icon={icon} title={title} description={description} disabled trailing={<Setup />} />
  ) : (
    <OptionCardLink key={link} href={link} icon={icon} title={title} description={description} />
  );
}

export const TOTP = (alreadyAdded: boolean, link: string) => (
  <MethodCard key={link} alreadyAdded={alreadyAdded} link={link} methodKey="totp" icon={<ClockIcon />} />
);

export const U2F = (alreadyAdded: boolean, link: string) => (
  <MethodCard key={link} alreadyAdded={alreadyAdded} link={link} methodKey="u2f" icon={<KeyIcon />} />
);

export const EMAIL = (alreadyAdded: boolean, link: string) => (
  <MethodCard key={link} alreadyAdded={alreadyAdded} link={link} methodKey="otpEmail" icon={<EnvelopeIcon />} />
);

export const SMS = (alreadyAdded: boolean, link: string) => (
  <MethodCard key={link} alreadyAdded={alreadyAdded} link={link} methodKey="otpSms" icon={<DevicePhoneMobileIcon />} />
);

export const RECOVERY_CODE = (alreadyAdded: boolean, link: string) => (
  <MethodCard key={link} alreadyAdded={alreadyAdded} link={link} methodKey="recoveryCode" icon={<LifebuoyIcon />} />
);

export const PASSKEYS = (alreadyAdded: boolean, link: string) => (
  <MethodCard key={link} alreadyAdded={alreadyAdded} link={link} methodKey="passkey" icon={<FingerPrintIcon />} />
);

export const PASSWORD = (alreadyAdded: boolean, link: string) => (
  <MethodCard key={link} alreadyAdded={alreadyAdded} link={link} methodKey="password" icon={<LockClosedIcon />} />
);

function Setup() {
  return (
    <StateBadge evenPadding={true} state={BadgeState.Success}>
      <CheckIcon className="h-4 w-4" />
    </StateBadge>
  );
}
