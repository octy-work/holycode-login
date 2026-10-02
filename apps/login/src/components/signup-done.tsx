"use client";

import { handleServerActionResponse } from "@/lib/client-utils";
import { continueAfterSignup, generateSignupRecoveryCodes } from "@/lib/server/signup";
import { CheckIcon } from "@heroicons/react/24/solid";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
  const [codes, setCodes] = useState<string[] | null>(null);
  const [codesNote, setCodesNote] = useState("");
  const [copied, setCopied] = useState(false);
  const asked = useRef(false);

  // The recovery codes are issued once, right here; a reload shows where to get new ones.
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    generateSignupRecoveryCodes()
      .then((res) => ("codes" in res ? setCodes(res.codes) : setCodesNote(res.error)))
      .catch(() => setCodesNote(t("done.codes.failed")));
  }, [t]);

  const codesText = codes ? `HolyCode ID — ${address}\n\n${codes.join("\n")}\n` : "";

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
      {codes && codes.length > 0 && (
        <div className="mt-4 w-full text-left" data-testid="recovery-codes">
          <div className="text-hc-text-2 mb-1.5 flex items-center justify-between text-[12.5px] font-semibold">
            <span>{t("done.codes.title")}</span>
            <span className="flex gap-3">
              <button
                type="button"
                className="text-hc-link hover:text-hc-p500 font-medium"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(codesText);
                    setCopied(true);
                  } catch {
                    setCopied(false);
                  }
                }}
                data-testid="codes-copy"
              >
                {copied ? t("done.codes.copied") : t("done.codes.copy")}
              </button>
              <a
                className="text-hc-link hover:text-hc-p500 font-medium"
                href={`data:text/plain;charset=utf-8,${encodeURIComponent(codesText)}`}
                download="holycode-recovery-codes.txt"
                data-testid="codes-download"
              >
                {t("done.codes.download")}
              </a>
            </span>
          </div>
          <div className="bg-hc-card-2 border-hc-border grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-xl border px-3.5 py-3 font-mono text-[12.5px]">
            {codes.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <p className="text-hc-muted mt-1.5 text-xs leading-5">{t("done.codes.hint")}</p>
        </div>
      )}
      {codesNote && <p className="text-hc-muted mt-3 text-xs leading-5">{codesNote}</p>}
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
