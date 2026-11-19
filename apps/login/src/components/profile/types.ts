import type { Contour } from "@/lib/contour";
import { AuthMethodsSummary, ProfileSection, Recommendation, ThemePreference } from "@/lib/profile";
import { ServiceEntry } from "@/lib/services";
import { IdentityProviderType } from "@zitadel/proto/zitadel/settings/v2/login_settings_pb";

/** A provider linked to the account (Zitadel IDPLink + the provider's name/type). */
export type LinkedIdp = {
  idpId: string;
  name: string;
  type: IdentityProviderType;
  linkedUserId: string;
  linkedUserName: string;
};

/** A provider the instance offers for linking and the account has not linked yet. */
export type AvailableIdp = {
  id: string;
  name: string;
  type: IdentityProviderType;
};

export type PasskeyView = { id: string; name: string };

export type SecondFactorKind = "totp" | "u2f" | "otpEmail" | "otpSms";

/**
 * Everything the profile screens show, resolved on the server and handed to the
 * client shell as plain data (no protobuf messages cross the boundary).
 */
export type ProfileView = {
  section: ProfileSection;
  /** `/me` behind traefik, `<basePath>/me` elsewhere — where the section links point. */
  prefix: string;
  basePath: string;
  publicHost: string;
  user: {
    id: string;
    loginName: string;
    username: string;
    handle: string;
    givenName: string;
    familyName: string;
    displayName: string;
    fullName: string;
    salutation: string;
    email: string;
    emailVerified: boolean;
    avatarUrl: string;
    preferredLanguage: string;
    organizationId: string;
  };
  methods: AuthMethodsSummary;
  passkeys: PasskeyView[];
  linkedIdps: LinkedIdp[];
  availableIdps: AvailableIdp[];
  factors: { totp: boolean; u2f: number; otpEmail: boolean; otpSms: boolean };
  settings: {
    passkeysAllowed: boolean;
    secondFactors: SecondFactorKind[];
    allowExternalIdp: boolean;
    hidePasswordReset: boolean;
    allowLocalAuthentication: boolean;
  };
  recommendations: Recommendation[];
  theme: ThemePreference | null;
  /** Контур «Все · Россия · США»: метаданные holycode.contour → cookie hc_contour → all (19.11.2026). */
  contour?: Contour;
  /** Палитра: метаданные holycode.palette → cookie hc_palette → classic (19.11.2026). */
  palette?: string;
  /** Есть ли значения в самом профиле ID — тогда страница дописывает их в общие cookie. */
  profilePrefs?: { contour: Contour | null; palette: string | null };
  sessionId: string;
  daenerysUrl: string;
  links: {
    /** The switcher's fallback list (HC_PROFILE_SERVICES / production addresses) until Daenerys answers `GET /api/services`. */
    services: ServiceEntry[];
    adminUrl: string;
    mailAdminUrl: string;
    keysUrl: string;
  };
};
