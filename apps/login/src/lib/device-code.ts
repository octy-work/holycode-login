/** User codes are shown as XXXX-XXXX; accept them typed in lower case or without the dash. */
export function normalizeUserCode(code: string): string {
  const compact = code.trim().toUpperCase().replace(/\s+/g, "");
  if (/^[A-Z0-9]{8}$/.test(compact)) {
    return `${compact.slice(0, 4)}-${compact.slice(4)}`;
  }
  return compact;
}
