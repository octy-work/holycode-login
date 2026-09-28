import "@/styles/globals.scss";

import { BackgroundWrapper } from "@/components/background-wrapper";
import { LanguageProvider } from "@/components/language-provider";
import { PageChromeProvider } from "@/components/page-chrome-context";
import { Skeleton } from "@/components/skeleton";
import { ThemeProvider } from "@/components/theme-provider";
import { LANGS, getLanguage } from "@/lib/i18n";
import { resolveLocalizedLegalLink } from "@/lib/legal-links";
import { getServiceConfig } from "@/lib/service-url";
import { getAllowedLanguages, getLegalAndSupportSettings } from "@/lib/zitadel";
import * as Tooltip from "@radix-ui/react-tooltip";
import type { Metadata, Viewport } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import React, { Suspense } from "react";

const inter = Inter({
  weight: ["400", "500", "600", "700", "800"],
  subsets: ["latin", "cyrillic"],
  variable: "--font-inter",
  display: "swap",
});

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// viewport-fit=cover: without it iOS reports env(safe-area-inset-*) as 0 and the
// profile's bottom bar would sit under the home indicator.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common");
  return {
    title: t("title"),
    icons: {
      icon: [
        { url: `${basePath}/favicon/favicon.svg`, type: "image/svg+xml" },
        { url: `${basePath}/favicon/favicon-32x32.png`, sizes: "32x32" },
      ],
      apple: `${basePath}/favicon/apple-touch-icon.png`,
    },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const _headers = await headers();
  const { serviceConfig } = getServiceConfig(_headers);
  const locale = await getLocale();

  let languages = LANGS;
  try {
    const settings = await getAllowedLanguages({ serviceConfig });
    if (settings.allowedLanguages?.length) {
      languages = settings.allowedLanguages
        .filter((code) => LANGS.find((l) => l.code === code))
        .map((code) => getLanguage(code));
    }
  } catch (e) {
    console.error("Failed to load supported languages", e);
  }

  // UI_LANGUAGES=ru,en narrows the switcher further than the instance restrictions
  // (the ZITADEL restriction API accepted our list but still reports all languages).
  const uiLanguages = (process.env.UI_LANGUAGES ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  if (uiLanguages.length) {
    const narrowed = languages.filter((l) => uiLanguages.includes(l.code));
    if (narrowed.length) {
      languages = uiLanguages.map((c) => narrowed.find((l) => l.code === c)).filter((l): l is NonNullable<typeof l> => !!l);
    }
  }

  // Instance-level help / privacy links for the card footer (per-org links are shown
  // on the register form where the organization is known).
  let helpLink: string | undefined;
  let privacyPolicyLink: string | undefined;
  let tosLink: string | undefined;
  try {
    const legal = await getLegalAndSupportSettings({ serviceConfig });
    helpLink = resolveLocalizedLegalLink(legal?.helpLink, locale) || undefined;
    privacyPolicyLink = resolveLocalizedLegalLink(legal?.privacyPolicyLink, locale) || undefined;
    tosLink = resolveLocalizedLegalLink(legal?.tosLink, locale) || undefined;
  } catch (e) {
    console.error("Failed to load legal settings", e);
  }

  return (
    <html lang={locale} className={`${inter.variable} ${inter.className}`} suppressHydrationWarning>
      <head />
      <body>
        <ThemeProvider>
          <Tooltip.Provider>
            <Suspense
              fallback={
                <BackgroundWrapper className="relative flex min-h-screen flex-col justify-center">
                  <div className="relative mx-auto w-full max-w-[420px] px-4 py-8 sm:px-0">
                    <Skeleton>
                      <div className="h-64"></div>
                    </Skeleton>
                  </div>
                </BackgroundWrapper>
              }
            >
              <LanguageProvider>
                <PageChromeProvider value={{ languages, helpLink, privacyPolicyLink, tosLink }}>
                  <BackgroundWrapper className="relative flex min-h-screen flex-col justify-center">
                    <div className="relative mx-auto w-full max-w-[1100px] py-6 sm:py-10">{children}</div>
                  </BackgroundWrapper>
                </PageChromeProvider>
              </LanguageProvider>
            </Suspense>
          </Tooltip.Provider>
        </ThemeProvider>
      </body>
    </html>
  );
}
