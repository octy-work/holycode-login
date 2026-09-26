"use client";

import { useTranslations } from "next-intl";

/** Renders a translation only when the key exists (used for optional descriptions). */
export function OptionalTranslated({ i18nKey, namespace, data }: { i18nKey: string; namespace?: string; data?: any }) {
  const t = useTranslations(namespace);
  // `has` is missing on simplified test mocks — then nothing optional is rendered.
  if (typeof (t as { has?: (k: string) => boolean }).has !== "function" || !t.has(i18nKey)) return null;
  return <span data-i18n-key={`${namespace ? `${namespace}.` : ""}${i18nKey}`}>{t(i18nKey, data)}</span>;
}

export function useHasTranslation(namespace?: string) {
  const t = useTranslations(namespace);
  return (key: string) => typeof (t as { has?: (k: string) => boolean }).has === "function" && t.has(key);
}
