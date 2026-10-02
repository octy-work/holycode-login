"use client";

import { handleServerActionResponse } from "@/lib/client-utils";
import { continueAfterSignup } from "@/lib/server/signup";
import { CheckIcon } from "@heroicons/react/24/solid";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "./alert";
import { AutoSubmitForm } from "./auto-submit-form";
import { Button, ButtonVariants } from "./button";
import { Spinner } from "./spinner";

/** HolyCode registration, step 6: the mailbox works — open the mail or go on to the service. */
export function SignupDone({ address, aliases, webmailUrl }: { address: string; aliases: string[]; webmailUrl: string }) {
  const t = useTranslations("signup");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [samlData, setSamlData] = useState<{ url: string; fields: Record<string, string> } | null>(null);

  async function go() {
    setError("");
    setLoading(true);
    try {
      const res = await continueAfterSignup({ address });
      if (!handleServerActionResponse(res, router, setSamlData, setError)) {
        setError(t("errors.generic"));
      }
    } catch {
      setError(t("errors.generic"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex w-full flex-col items-center text-center" data-testid="signup-done">
      {samlData && <AutoSubmitForm url={samlData.url} fields={samlData.fields} />}
      <div className="bg-hc-soft text-hc-ok mb-3 flex h-14 w-14 items-center justify-center rounded-full">
        <CheckIcon className="h-7 w-7" aria-hidden="true" />
      </div>
      <h1>{t("done.title")}</h1>
      <p className="text-hc-text mt-1 text-[16px] font-bold break-all" data-testid="done-address">
        {address}
      </p>
      {aliases.length > 0 && (
        <p className="text-hc-muted mt-1 text-[12.5px] break-all">{t("done.aliases", { aliases: aliases.join(", ") })}</p>
      )}
      <p className="ztdl-p mt-2">{t("done.description")}</p>
      {error && (
        <div className="mt-3 w-full" data-testid="error">
          <Alert>{error}</Alert>
        </div>
      )}
      <Button
        type="button"
        className="mt-4"
        variant={ButtonVariants.Primary}
        disabled={loading}
        onClick={go}
        data-testid="done-continue"
      >
        {loading && <Spinner className="h-5 w-5" />}
        {t("done.continue")}
      </Button>
      <a
        href={webmailUrl}
        target="_blank"
        rel="noreferrer"
        className="text-hc-link hover:text-hc-p500 mt-3 text-sm font-medium"
        data-testid="done-webmail"
      >
        {t("done.openMail")}
      </a>
    </div>
  );
}
