"use client";

import { handleServerActionResponse } from "@/lib/client-utils";
import { checkMailboxName, completeIdpSignup, MailboxNameStatus } from "@/lib/server/signup";
import { localPartProblem, MailboxDomain, MAX_MAILBOX_ALIASES, normalizeLocalPart, suggestLocalParts } from "@/lib/signup";
import { CheckIcon } from "@heroicons/react/24/solid";
import { LegalAndSupportSettings } from "@zitadel/proto/zitadel/settings/v2/legal_settings_pb";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "./alert";
import { AutoSubmitForm } from "./auto-submit-form";
import { Button, ButtonVariants } from "./button";
import { TextInput } from "./input";
import { SignupConsents } from "./signup-consents";
import { Spinner } from "./spinner";

type Props = {
  idpUserId: string;
  idpId: string;
  idpUserName?: string;
  idpIntent: { idpIntentId: string; idpIntentToken: string };
  organization: string;
  requestId?: string;
  defaultValues: { email: string; firstname: string; lastname: string };
  /** HolyCode domains a new mailbox can be in; empty — only the person's own e-mail. */
  domains: MailboxDomain[];
  /** The person came straight from a provider button, without step 1: ask for the consents here. */
  needConsents: boolean;
  legal?: LegalAndSupportSettings;
};

type Check = { status: MailboxNameStatus | "checking" | "idle"; aliases: { address: string; available: boolean }[] };

/**
 * HolyCode registration, steps 3–4 after the provider confirmed the person: the
 * e-mail — a new mailbox in a HolyCode domain (name, domain buttons, the same name as
 * aliases in other domains) or the address the provider gave — and the name.
 */
export function SignupComplete(props: Props) {
  const { domains } = props;
  const t = useTranslations("signup");
  const router = useRouter();
  const hosting = domains.length > 0;

  const [mode, setMode] = useState<"hosted" | "own">(hosting ? "hosted" : "own");
  const [firstName, setFirstName] = useState(props.defaultValues.firstname);
  const [lastName, setLastName] = useState(props.defaultValues.lastname);
  const [ownEmail, setOwnEmail] = useState(props.defaultValues.email);
  const suggestions = useMemo(() => suggestLocalParts(firstName, lastName), [firstName, lastName]);
  const [local, setLocal] = useState(() => suggestions[0] ?? "");
  const [domain, setDomain] = useState(domains[0]?.domain ?? "");
  const [aliases, setAliases] = useState<string[]>([]);
  const [check, setCheck] = useState<Check>({ status: "idle", aliases: [] });
  const [consents, setConsents] = useState({ terms: false, pd: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [samlData, setSamlData] = useState<{ url: string; fields: Record<string, string> } | null>(null);

  const normalized = normalizeLocalPart(local);
  const otherDomains = domains.map((d) => d.domain).filter((d) => d !== domain);
  const requestSeq = useRef(0);

  // Ask Daenerys whether the name is free — here and in the other domains (for aliases).
  useEffect(() => {
    if (mode !== "hosted" || !domain) {
      return;
    }
    const problem = localPartProblem(normalized);
    if (problem) {
      setCheck({ status: normalized ? problem : "idle", aliases: [] });
      return;
    }
    const seq = ++requestSeq.current;
    setCheck((c) => ({ ...c, status: "checking" }));
    const timer = setTimeout(async () => {
      try {
        const answer = await checkMailboxName({ local: normalized, domain, aliases: otherDomains });
        if (seq === requestSeq.current) {
          setCheck({ status: answer.status, aliases: answer.aliases });
          setAliases((current) =>
            current.filter((d) => answer.aliases.some((a) => a.address === `${normalized}@${d}` && a.available)),
          );
        }
      } catch {
        if (seq === requestSeq.current) setCheck({ status: "unavailable", aliases: [] });
      }
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, normalized, domain]);

  const aliasAvailable = (d: string) => check.aliases.some((a) => a.address === `${normalized}@${d}` && a.available);

  const canSubmit =
    !loading &&
    !!firstName.trim() &&
    !!lastName.trim() &&
    (!props.needConsents || (consents.terms && consents.pd)) &&
    (mode === "own" ? !!ownEmail.trim() : check.status === "available");

  async function submit() {
    setError("");
    setLoading(true);
    try {
      const res = await completeIdpSignup({
        idpId: props.idpId,
        idpUserId: props.idpUserId,
        idpUserName: props.idpUserName,
        idpIntent: props.idpIntent,
        organization: props.organization,
        requestId: props.requestId,
        firstName,
        lastName,
        ownEmail,
        mail: mode === "hosted" ? { kind: "hosted", local: normalized, domain, aliases } : { kind: "own" },
        ...(props.needConsents ? { consents } : {}),
      });
      if (!handleServerActionResponse(res, router, setSamlData, setError)) {
        setError(t("errors.generic"));
      }
    } catch {
      setError(t("errors.generic"));
    } finally {
      setLoading(false);
    }
  }

  const statusLine = (() => {
    const address = `${normalized}@${domain}`;
    switch (check.status) {
      case "available":
        return (
          <span className="text-hc-ok inline-flex items-center gap-1" data-testid="mailbox-status">
            <CheckIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {t("mailbox.available", { address })}
          </span>
        );
      case "checking":
        return (
          <span className="text-hc-muted" data-testid="mailbox-status">
            {t("mailbox.checking")}
          </span>
        );
      case "idle":
        return null;
      default:
        return (
          <span className="text-hc-err" data-testid="mailbox-status">
            {t(`mailbox.status.${check.status}`, { address })}
          </span>
        );
    }
  })();

  return (
    <>
      <div className="flex w-full flex-col space-y-1 text-left">
        <h1>{t("complete.title")}</h1>
        <p className="ztdl-p">{t("complete.description")}</p>
      </div>
      <div className="mt-4 w-full">
        {samlData && <AutoSubmitForm url={samlData.url} fields={samlData.fields} />}

        {hosting && (
          <div
            className="bg-hc-input border-hc-input-border mb-4 grid grid-cols-2 gap-1 rounded-xl border p-1"
            role="tablist"
            data-testid="mail-mode"
          >
            {(["hosted", "own"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={clsx(
                  "h-9 rounded-[9px] text-[13.5px] font-semibold transition-colors",
                  mode === m ? "bg-hc-card text-hc-text shadow-sm" : "text-hc-text-2 hover:text-hc-text",
                )}
                data-testid={`mail-mode-${m}`}
              >
                {t(m === "hosted" ? "mailbox.newTab" : "mailbox.ownTab")}
              </button>
            ))}
          </div>
        )}

        {mode === "hosted" ? (
          <div className="flex flex-col gap-2" data-testid="hosted-mail">
            <TextInput
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              label={t("mailbox.name")}
              suffix={domain}
              hideErrorLine
              data-testid="mailbox-input"
            />
            {domains.length > 1 && (
              <div className="mt-1 flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("mailbox.domain")}>
                {domains.map((d) => (
                  <button
                    key={d.domain}
                    type="button"
                    role="radio"
                    aria-checked={domain === d.domain}
                    onClick={() => {
                      setDomain(d.domain);
                      setAliases([]);
                    }}
                    className={clsx(
                      "rounded-[10px] border px-3 py-1.5 text-[13px] transition-colors",
                      domain === d.domain
                        ? "border-hc-p500 bg-hc-soft text-hc-link ring-hc-ring font-semibold ring-[3px]"
                        : "border-hc-input-border bg-hc-input text-hc-text hover:border-hc-p500",
                    )}
                    data-testid={`domain-${d.domain}`}
                  >
                    {d.domain}
                  </button>
                ))}
              </div>
            )}
            <div className="min-h-[18px] text-[12.5px] leading-snug">{statusLine}</div>
            {check.status !== "available" && suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5" data-testid="mailbox-suggestions">
                {suggestions
                  .filter((s) => s !== normalized)
                  .slice(0, 3)
                  .map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setLocal(s)}
                      className="border-hc-border text-hc-text-2 hover:border-hc-p500 rounded-full border border-dashed px-2.5 py-1 text-xs"
                    >
                      {s}@{domain}
                    </button>
                  ))}
              </div>
            )}
            {check.status === "available" && otherDomains.length > 0 && (
              <div className="mt-1 flex flex-col gap-1.5" data-testid="mailbox-aliases">
                <span className="text-hc-text-2 text-[12.5px] leading-4 font-semibold">{t("mailbox.aliasesTitle")}</span>
                {otherDomains.map((d) => {
                  const available = aliasAvailable(d);
                  const checked = aliases.includes(d);
                  const full = !checked && aliases.length >= MAX_MAILBOX_ALIASES;
                  return (
                    <label
                      key={d}
                      className={clsx(
                        "flex items-center gap-2.5 text-[13.5px]",
                        available && !full ? "cursor-pointer" : "opacity-55",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="accent-hc-p500 h-4 w-4"
                        disabled={!available || full}
                        checked={checked}
                        onChange={(e) =>
                          setAliases((current) => (e.target.checked ? [...current, d] : current.filter((x) => x !== d)))
                        }
                        data-testid={`alias-${d}`}
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {normalized}@{d}
                      </span>
                      <span className={clsx("text-xs font-semibold", available ? "text-hc-ok" : "text-hc-muted")}>
                        {available ? t("mailbox.free") : t("mailbox.busy")}
                      </span>
                    </label>
                  );
                })}
                <span className="text-hc-muted text-xs">{t("mailbox.aliasesHint")}</span>
              </div>
            )}
          </div>
        ) : (
          <div data-testid="own-mail">
            <TextInput
              type="email"
              autoComplete="email"
              value={ownEmail}
              onChange={(e) => setOwnEmail(e.target.value)}
              readOnly={!!props.defaultValues.email}
              label={t("mailbox.ownLabel")}
              hideErrorLine
              data-testid="own-email-input"
            />
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <TextInput
            type="text"
            autoComplete="given-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            label={t("name.first")}
            hideErrorLine
            data-testid="firstname-input"
          />
          <TextInput
            type="text"
            autoComplete="family-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            label={t("name.last")}
            hideErrorLine
            data-testid="lastname-input"
          />
        </div>

        {props.needConsents && (
          <SignupConsents legal={props.legal} terms={consents.terms} pd={consents.pd} onChange={setConsents} />
        )}

        {error && (
          <div className="mt-3" data-testid="error">
            <Alert>{error}</Alert>
          </div>
        )}

        <Button
          type="button"
          className="mt-4"
          variant={ButtonVariants.Primary}
          disabled={!canSubmit}
          onClick={submit}
          data-testid="signup-submit"
        >
          {loading && <Spinner className="h-5 w-5" />}
          {t("complete.submit")}
        </Button>
        {mode === "hosted" && <p className="text-hc-muted mt-2 text-center text-xs leading-5">{t("complete.nextStep")}</p>}
      </div>
    </>
  );
}
