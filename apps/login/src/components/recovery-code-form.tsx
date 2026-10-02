"use client";

import { handleServerActionResponse } from "@/lib/client-utils";
import { sendRecoveryCode } from "@/lib/server/recovery-code";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "./alert";
import { AutoSubmitForm } from "./auto-submit-form";
import { Button, ButtonVariants } from "./button";
import { TextInput } from "./input";
import { Spinner } from "./spinner";

type Props = { loginName?: string; sessionId?: string; organization?: string; requestId?: string };

/** HolyCode: the recovery-code step — one of the codes saved at registration, instead of the second factor. */
export function RecoveryCodeForm(props: Props) {
  const t = useTranslations("recoveryCode");
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [samlData, setSamlData] = useState<{ url: string; fields: Record<string, string> } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await sendRecoveryCode({ ...props, code });
      if (!handleServerActionResponse(res, router, setSamlData, setError)) {
        setError(t("errors.invalid"));
      }
    } catch {
      setError(t("errors.invalid"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="flex w-full flex-col space-y-1 text-left">
        <h1>{t("title")}</h1>
        <p className="ztdl-p">{t("description")}</p>
      </div>
      <form className="mt-4 w-full" onSubmit={submit}>
        {samlData && <AutoSubmitForm url={samlData.url} fields={samlData.fields} />}
        <TextInput
          type="text"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          label={t("label")}
          hideErrorLine
          data-testid="recovery-code-input"
        />
        {error && (
          <div className="mt-3" data-testid="error">
            <Alert>{error}</Alert>
          </div>
        )}
        <Button
          type="submit"
          className="mt-4"
          variant={ButtonVariants.Primary}
          disabled={loading || !code.trim()}
          data-testid="recovery-code-submit"
        >
          {loading && <Spinner className="h-5 w-5" />}
          {t("submit")}
        </Button>
      </form>
    </>
  );
}
