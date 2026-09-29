export type CodeMode = "numeric" | "text";

/** Codes from e-mail (verification, reset, invite) are upper-case letters and digits. */
export function normalizeCode(value: string, mode: CodeMode): string {
  return mode === "text" ? value.toUpperCase() : value;
}

/**
 * Picks the code out of whatever was pasted: the bare code, the code with spaces or
 * dashes ("FQ6 US6", "123-456"), or a whole sentence copied from the e-mail
 * ("… (Code FQ6US6) …"). Returns undefined when nothing that looks like a code is there.
 */
export function extractCode(text: string, length: number, mode: CodeMode): string | undefined {
  const charset = mode === "numeric" ? "0-9" : "0-9A-Za-z";

  const compact = text.trim().replace(/[\s-]/g, "");
  if (compact.length === length && new RegExp(`^[${charset}]+$`).test(compact)) {
    return normalizeCode(compact, mode);
  }

  const tokens = text.match(new RegExp(`(?<![${charset}])[${charset}]{${length}}(?![${charset}])`, "g")) ?? [];
  if (tokens.length === 0) {
    return undefined;
  }
  // "Verify FQ6US6": prefer the token that looks like a generated code.
  const upper = (t: string) => t === t.toUpperCase();
  const pick = tokens.find((t) => upper(t) && /[0-9]/.test(t)) ?? tokens.find(upper) ?? tokens[0]!;
  return normalizeCode(pick, mode);
}
