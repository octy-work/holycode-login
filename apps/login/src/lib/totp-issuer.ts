/**
 * The issuer an authenticator app (Google Authenticator, 1Password, …) shows next to a
 * TOTP entry comes from the otpauth URI that ZITADEL builds server-side from the global
 * `SystemDefaults.Multifactors.OTP.Issuer` ("ZITADEL" by default, or the requested domain).
 * The login rewrites that URI before rendering so the app shows the brand instead.
 *
 * Key URI format: https://github.com/google/google-authenticator/wiki/Key-Uri-Format
 *   otpauth://totp/<issuer>:<account>?secret=…&issuer=<issuer>&algorithm=…&digits=…&period=…
 */

const OTPAUTH_URI = /^otpauth:\/\/([^/?#]+)\/([^?#]*)(?:\?([^#]*))?(#.*)?$/i;

/** RFC 3986 path segment: "@" may stay literal, as in ZITADEL's own label ("ZITADEL:alice@example.com"). */
function encodeLabelPart(value: string): string {
  return encodeURIComponent(value).replace(/%40/g, "@");
}

/**
 * Sets the issuer of an otpauth URI to `issuer`: the `issuer` query parameter and the label
 * prefix (`<issuer>:<account>`). Every other parameter (secret, algorithm, digits, period)
 * is kept byte for byte. Anything that is not an otpauth URI, or an empty issuer, passes through.
 */
export function brandTotpUri(uri: string, issuer: string): string {
  const brand = issuer?.trim();
  if (!brand || typeof uri !== "string") {
    return uri;
  }

  const match = OTPAUTH_URI.exec(uri);
  if (!match) {
    return uri;
  }
  const [, type, rawLabel, rawQuery = "", fragment = ""] = match;

  let label: string;
  try {
    label = decodeURIComponent(rawLabel);
  } catch {
    return uri;
  }

  const colon = label.indexOf(":");
  const account = (colon >= 0 ? label.slice(colon + 1) : label).trim();
  if (!account) {
    return uri;
  }

  const issuerParam = `issuer=${encodeURIComponent(brand)}`;
  const params: string[] = [];
  let issuerSet = false;
  for (const param of rawQuery.split("&")) {
    if (!param) {
      continue;
    }
    if (param.split("=", 1)[0] === "issuer") {
      if (!issuerSet) {
        params.push(issuerParam);
        issuerSet = true;
      }
      continue;
    }
    params.push(param);
  }
  if (!issuerSet) {
    params.push(issuerParam);
  }

  return `otpauth://${type}/${encodeLabelPart(brand)}:${encodeLabelPart(account)}?${params.join("&")}${fragment}`;
}

/**
 * Brand name for the TOTP issuer:
 * HC_TOTP_ISSUER (non-empty) → NEXT_PUBLIC_BRAND_WORDMARK without "|" ("Holy|Code" → "HolyCode")
 * → "HolyCode". NEXT_PUBLIC_BRAND_WORDMARK="" means a tenant without the HolyCode word-mark
 * (see BrandMark); then this returns "" and the URI keeps ZITADEL's own issuer.
 */
export function totpIssuerFromEnv(env: { HC_TOTP_ISSUER?: string; NEXT_PUBLIC_BRAND_WORDMARK?: string }): string {
  const explicit = env.HC_TOTP_ISSUER?.trim();
  if (explicit) {
    return explicit;
  }
  return (env.NEXT_PUBLIC_BRAND_WORDMARK ?? "Holy|Code").replace(/\|/g, "").trim();
}
