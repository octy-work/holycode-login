"use client";

import { handleServerActionResponse } from "@/lib/client-utils";
import { ProfileSection } from "@/lib/profile";
import { ActionResult, beginFlow, FlowResult, ProfileFlow } from "@/lib/server/profile";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ReactNode, useCallback, useState } from "react";
import { Note, RowButton, RowLink } from "./ui";
import { DaenerysState, ResourceStatus } from "./use-daenerys";

/** Starts one of the login app's flows (passkey, second factor, password, e-mail) from the profile. */
export function useFlowStarter() {
  const router = useRouter();
  const [pending, setPending] = useState<ProfileFlow | null>(null);
  const [error, setError] = useState("");

  const start = useCallback(
    async (kind: ProfileFlow, section: ProfileSection) => {
      setPending(kind);
      setError("");
      try {
        const result = await beginFlow(kind, section);
        if ("redirect" in result) {
          handleServerActionResponse(result, router, () => undefined, setError);
          return;
        }
        setError(result.error);
      } catch {
        setError("");
      } finally {
        setPending(null);
      }
    },
    [router],
  );

  return { start, pending, error };
}

/** Runs a server action, keeps busy/error/done state and refreshes the page on success. */
export function useRunner() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const run = useCallback(
    async (action: () => Promise<ActionResult | FlowResult>, onOk?: () => void): Promise<boolean> => {
      setBusy(true);
      setError("");
      setDone(false);
      try {
        const result = await action();
        if ("error" in result) {
          setError(result.error);
          return false;
        }
        if ("redirect" in result) {
          handleServerActionResponse(result, router, () => undefined, setError);
          return true;
        }
        setDone(true);
        onOk?.();
        // Zitadel answers before its projections catch up: give them a moment, so
        // the refreshed page shows what was just saved rather than the old value.
        await new Promise((resolve) => setTimeout(resolve, 800));
        router.refresh();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [router],
  );

  const reset = useCallback(() => {
    setError("");
    setDone(false);
  }, []);

  return { run, busy, error, done, reset };
}

/** What a Daenerys block shows instead of its rows when the platform cannot be reached. */
export function DaenerysNotice({
  daenerys,
  status,
  message,
  onRetry,
}: {
  daenerys: DaenerysState;
  status: ResourceStatus | "unauthorized" | "unavailable";
  message?: string;
  onRetry?: () => void;
}) {
  const t = useTranslations("profile.daenerys");
  if (status === "unauthorized") {
    return (
      <Note tone="warn">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex-1">{t("unauthorized")}</span>
          {daenerys.signInUrl && (
            <RowLink href={daenerys.signInUrl} tone="primary">
              {t("signIn")}
            </RowLink>
          )}
        </div>
      </Note>
    );
  }
  if (status === "missing") {
    return <Note tone="info">{t("missing")}</Note>;
  }
  return (
    <Note tone="warn">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1">
          {t("unavailable")}
          {message ? ` (${message})` : ""}
        </span>
        {onRetry && <RowButton onClick={onRetry}>{t("retry")}</RowButton>}
      </div>
    </Note>
  );
}

/** Title + lead of a section. */
export function SectionHeader({ title, description }: { title: ReactNode; description?: ReactNode }) {
  return (
    <div className="mb-1">
      <h1 className="text-hc-text text-[22px] leading-tight font-bold tracking-tight">{title}</h1>
      {description && <p className="text-hc-muted mt-1 text-[13px]">{description}</p>}
    </div>
  );
}

/** Confirmation inline under a row: a question and two buttons. */
export function Confirm({
  question,
  yes,
  no,
  onYes,
  onNo,
  busy,
  tone = "danger",
}: {
  question: ReactNode;
  yes: ReactNode;
  no: ReactNode;
  onYes: () => void;
  onNo: () => void;
  busy?: boolean;
  tone?: "danger" | "primary";
}) {
  return (
    <Note tone={tone === "danger" ? "error" : "info"}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1">{question}</span>
        <RowButton tone={tone} onClick={onYes} busy={busy} data-testid="confirm-yes">
          {yes}
        </RowButton>
        <RowButton onClick={onNo} disabled={busy}>
          {no}
        </RowButton>
      </div>
    </Note>
  );
}
