"use client";

import {
  API_KEY_DEFAULT_EXPIRY,
  API_KEY_EXPIRY_CHOICES,
  ApiKeyExpiry,
  ApiKeyItem,
  ApiKeyList,
  buildReauthUrl,
  normalizeApiKeyList,
  saveKeyDraft,
  takeKeyDraft,
} from "@/lib/daenerys";
import { profilePath } from "@/lib/profile";
import { KeyIcon } from "@heroicons/react/24/solid";
import { useLocale, useTranslations } from "next-intl";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { dots, formatWhen } from "./format";
import { Confirm, DaenerysNotice, SectionHeader } from "./shared";
import type { SectionProps } from "./shell";
import { fieldClasses, FieldLabel, Group, Note, Pill, Row, RowButton, RowIcon, RowSkeleton } from "./ui";
import { useDaenerysResource } from "./use-daenerys";

function tabStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-10000px";
      document.body.append(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * Access keys (id.holycode.org/me/keys, owner's decision of 28.09.2026): the
 * personal dny_pat_… keys for the API and the CLI — the list, issuing and
 * revoking, through Daenerys (/api/auth/api-keys) with the .holycode.org
 * cookie. The token of a new key is shown once, with "Copy".
 *
 * Daenerys issues a key only after a fresh sign-in at the ID (not older than
 * 10 minutes): otherwise 403 reauth_required, reauth "id". Then the draft (name
 * and term) stays in this tab, the person signs in again at the ID (prompt=login)
 * and, back on this page, the key is issued without a second press.
 */
export function KeysSection({ view, prefix, daenerys }: SectionProps) {
  const t = useTranslations("profile");
  const locale = useLocale();
  const keys = useDaenerysResource<ApiKeyList>(daenerys, (c) => c.apiKeys(), normalizeApiKeyList, { label: "api-keys" });
  const reloadKeys = keys.reload;
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState<ApiKeyExpiry>(API_KEY_DEFAULT_EXPIRY);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [needReauth, setNeedReauth] = useState(false);
  const [created, setCreated] = useState<{ token: string; name: string } | null>(null);
  const [copied, setCopied] = useState<"" | "copied" | "failed">("");
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyItem | null>(null);
  const [revoking, setRevoking] = useState(false);
  const draftTaken = useRef(false);

  const errorText = useCallback(
    (code: string | undefined, message: string | undefined) => {
      const known = ["invalid_name", "duplicate_name", "invalid_expires_days", "too_many_api_keys", "api_key_requires_interactive_session"];
      if (code && known.includes(code)) return t(`keys.errors.${code}`);
      return message ? t("keys.errors.generic", { message }) : t("keys.errors.unknown");
    },
    [t],
  );

  const issue = useCallback(
    async (keyName: string, keyExpiry: ApiKeyExpiry) => {
      setCreating(true);
      setError("");
      const result = await daenerys.client.createApiKey(keyName, keyExpiry);
      setCreating(false);
      if (!result.ok) {
        const reauth = String((result.data as { reauth?: unknown } | undefined)?.reauth ?? "");
        if (result.code === "reauth_required" && reauth === "id") {
          setNeedReauth(true);
          return;
        }
        setError(errorText(result.code, result.message));
        return;
      }
      const data = (result.data ?? {}) as { token?: unknown; key?: { name?: unknown } };
      setNeedReauth(false);
      setCreated({ token: String(data.token ?? ""), name: String(data.key?.name ?? keyName) });
      setCopied("");
      setName("");
      reloadKeys();
    },
    [daenerys.client, errorText, reloadKeys],
  );

  // Back from the fresh sign-in with a draft: issue the key without a second press.
  useEffect(() => {
    if (draftTaken.current || daenerys.status !== "ready") return;
    draftTaken.current = true;
    const draft = takeKeyDraft(tabStorage());
    if (!draft) return;
    setName(draft.name);
    setExpiry(draft.expiry);
    void issue(draft.name, draft.expiry);
  }, [daenerys.status, issue]);

  const reauth = () => {
    saveKeyDraft(tabStorage(), { name: name.trim(), expiry });
    const back = `${window.location.origin}${profilePath(prefix, "keys")}`;
    window.location.assign(buildReauthUrl(view.daenerysUrl, back));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (creating) return;
    if (!name.trim()) {
      setError(t("keys.errors.invalid_name"));
      return;
    }
    await issue(name.trim(), expiry);
  };

  const revoke = async () => {
    if (!revokeTarget || revoking) return;
    setRevoking(true);
    const result = await daenerys.client.revokeApiKey(revokeTarget.keyId);
    setRevoking(false);
    if (!result.ok) {
      setError(errorText(result.code, result.message));
      return;
    }
    setRevokeTarget(null);
    keys.reload();
  };

  const expiryLabel = (value: ApiKeyExpiry) =>
    value === "never" ? t("keys.expiry.never") : value === 365 ? t("keys.expiry.year") : t("keys.expiry.days", { n: value });

  const statusPill = (key: ApiKeyItem) =>
    key.status === "active" ? (
      <Pill tone="ok">{t("keys.status.active")}</Pill>
    ) : key.status === "expired" ? (
      <Pill>{t("keys.status.expired")}</Pill>
    ) : (
      <Pill>{t("keys.status.revoked")}</Pill>
    );

  const unavailable = keys.status === "unauthorized" || keys.status === "unavailable" || keys.status === "missing";
  const activeCount = keys.data?.items.filter((k) => k.status === "active").length ?? 0;

  return (
    <div data-testid="profile-keys">
      <SectionHeader title={t("keys.title")} description={t("keys.description")} />

      {created && (
        <Note tone="info" className="mt-4">
          <div data-testid="key-created">
            <p className="font-semibold">{t("keys.created.title", { name: created.name })}</p>
            <p className="mt-0.5">{t("keys.created.once")}</p>
            <code className="bg-hc-input border-hc-border mt-2 block rounded-[9px] border px-2.5 py-2 text-[12.5px] break-all select-all">
              {created.token}
            </code>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <RowButton
                tone="primary"
                onClick={async () => setCopied((await copyText(created.token)) ? "copied" : "failed")}
                data-testid="key-copy"
              >
                {copied === "copied" ? t("keys.created.copied") : t("keys.created.copy")}
              </RowButton>
              {copied === "failed" && <span>{t("keys.created.copyFailed")}</span>}
              <RowButton onClick={() => setCreated(null)}>{t("keys.created.done")}</RowButton>
            </div>
          </div>
        </Note>
      )}

      <Group id="issue" title={t("keys.issue.title")}>
        {unavailable ? (
          <DaenerysNotice
            daenerys={daenerys}
            status={keys.status}
            failure={keys.failure}
            message={keys.message}
            onRetry={keys.reload}
          />
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end" data-testid="key-form">
            <label className="min-w-0 flex-1">
              <FieldLabel>{t("keys.issue.name")}</FieldLabel>
              <input
                className={fieldClasses}
                value={name}
                maxLength={80}
                placeholder={t("keys.issue.namePlaceholder")}
                onChange={(event) => setName(event.target.value)}
                data-testid="key-name"
              />
            </label>
            <label className="sm:w-40">
              <FieldLabel>{t("keys.issue.term")}</FieldLabel>
              <select
                className={fieldClasses}
                value={String(expiry)}
                onChange={(event) => {
                  const raw = event.target.value;
                  setExpiry(raw === "never" ? "never" : (Number(raw) as ApiKeyExpiry));
                }}
                data-testid="key-term"
              >
                {API_KEY_EXPIRY_CHOICES.map((value) => (
                  <option key={String(value)} value={String(value)}>
                    {expiryLabel(value)}
                  </option>
                ))}
              </select>
            </label>
            <RowButton
              type="submit"
              tone="primary"
              busy={creating}
              disabled={keys.status !== "ready"}
              className="h-10"
              data-testid="key-issue"
            >
              {t("keys.issue.button")}
            </RowButton>
          </form>
        )}
        {needReauth && (
          <Confirm
            tone="primary"
            question={t("keys.reauth.question")}
            yes={t("keys.reauth.go")}
            no={t("common.cancel")}
            onYes={reauth}
            onNo={() => setNeedReauth(false)}
          />
        )}
        {error && <Note tone="error">{error}</Note>}
        <p className="text-hc-muted text-[12px] leading-snug">{t("keys.issue.note")}</p>
      </Group>

      <Group
        id="list"
        title={t("keys.list.title")}
        status={keys.status}
        aside={keys.data ? t("keys.list.count", { active: activeCount, max: keys.data.maxActive }) : undefined}
      >
        {keys.status === "loading" && <RowSkeleton rows={2} />}
        {keys.status === "ready" && keys.data && keys.data.items.length === 0 && <Note tone="info">{t("keys.list.empty")}</Note>}
        {keys.status === "ready" &&
          keys.data?.items.map((key) => (
            <div key={key.keyId} className="flex flex-col gap-1.5">
              <Row
                icon={
                  <RowIcon tone={key.status === "active" ? "soft" : undefined}>
                    <KeyIcon />
                  </RowIcon>
                }
                title={key.name || key.preview || key.keyId}
                subtitle={dots(
                  key.preview,
                  t("keys.list.created", { date: formatWhen(key.createdAt, locale) }),
                  key.status === "revoked" && key.revokedAt
                    ? t("keys.list.revokedAt", { date: formatWhen(key.revokedAt, locale) })
                    : key.expiresAt
                      ? t("keys.list.until", { date: formatWhen(key.expiresAt, locale) })
                      : t("keys.list.forever"),
                  key.lastUsedAt ? t("keys.list.lastUsed", { date: formatWhen(key.lastUsedAt, locale) }) : t("keys.list.neverUsed"),
                  key.scopes.length ? key.scopes.join(", ") : undefined,
                )}
                data-testid={`key-${key.keyId}`}
                trailing={
                  <span className="flex items-center gap-2">
                    {statusPill(key)}
                    {key.status === "active" && (
                      <RowButton tone="danger" onClick={() => setRevokeTarget(key)} data-testid={`key-revoke-${key.keyId}`}>
                        {t("keys.list.revoke")}
                      </RowButton>
                    )}
                  </span>
                }
              />
              {revokeTarget?.keyId === key.keyId && (
                <Confirm
                  question={t("keys.list.revokeConfirm", { name: key.name || key.preview })}
                  yes={t("keys.list.revoke")}
                  no={t("common.cancel")}
                  busy={revoking}
                  onYes={revoke}
                  onNo={() => setRevokeTarget(null)}
                />
              )}
            </div>
          ))}
      </Group>
    </div>
  );
}
