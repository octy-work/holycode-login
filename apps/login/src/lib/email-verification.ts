/**
 * EMAIL_VERIFICATION=true — для всех; иначе только для организаций с открытой регистрацией
 * по e-mail (HC_SIGNUP_EMAIL_ORGS, Wine Not в Vibedo ID): там адрес никто не проверял.
 */
export function emailVerificationRequired(organization?: string) {
  if (process.env.EMAIL_VERIFICATION === "true") return true;
  const orgs = (process.env.HC_SIGNUP_EMAIL_ORGS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return !!organization && orgs.includes(organization);
}
