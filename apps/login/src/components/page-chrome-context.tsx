"use client";

import { Lang } from "@/lib/i18n";
import { createContext, ReactNode, useContext } from "react";

export type PageChrome = {
  languages: Lang[];
  helpLink?: string;
  privacyPolicyLink?: string;
  tosLink?: string;
  /** Word-mark of this container (lib/brand.ts); "" — tenant mode: logo and colours from the label policy. */
  brandWordmark?: string;
};

const PageChromeContext = createContext<PageChrome>({ languages: [] });

/**
 * Carries what the card header/footer need (allowed languages, legal links) from the
 * root layout down to DynamicTheme without threading it through every page.
 */
export function PageChromeProvider({ value, children }: { value: PageChrome; children: ReactNode }) {
  return <PageChromeContext.Provider value={value}>{children}</PageChromeContext.Provider>;
}

export function usePageChrome(): PageChrome {
  return useContext(PageChromeContext);
}
