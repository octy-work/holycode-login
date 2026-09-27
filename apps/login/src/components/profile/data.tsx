"use client";

import { Avatar } from "@/components/avatar";
import { detectIdpBrand, IdpIcon } from "@/components/idps/idp-icons";
import { blockingAccounts, normalizeApiKeys, normalizePendingDeletion, PendingDeletion } from "@/lib/daenerys";
import { idpTypeToSlug } from "@/lib/idp";
import { canRemoveSignInMethod } from "@/lib/profile";
import { beginProviderLink, changeEmail, saveName, unlinkProvider } from "@/lib/server/profile";
import {
  ArrowDownTrayIcon,
  AtSymbolIcon,
  DevicePhoneMobileIcon,
  EnvelopeIcon,
  KeyIcon,
  LinkIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { useLocale, useTranslations } from "next-intl";
import { FormEvent, useActionState, useState } from "react";
import { AutoSubmitForm } from "../auto-submit-form";
import { formatDate } from "./format";
import { Confirm, DaenerysNotice, SectionHeader, useFlowStarter, useRunner } from "./shared";
import type { SectionProps } from "./shell";
import { AvailableIdp, LinkedIdp } from "./types";
import { fieldClasses, FieldLabel, Group, Note, Panel, Pill, Row, RowButton, RowIcon, RowLink, RowSkeleton } from "./ui";
import { useDaenerysResource } from "./use-daenerys";

function displayLanguage(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Data: name and salutation, contacts, linked accounts, public handle, data management. */
export function DataSection({ view, daenerys }: SectionProps) {
  const t = useTranslations("profile");
  const locale = useLocale();
  const flow = useFlowStarter();
  const keys = useDaenerysResource(daenerys, (c) => c.apiKeys(), normalizeApiKeys);

  // No language in the ID → "not set" (the page itself still follows the browser/cookie locale).
  const languageName = view.user.preferredLanguage
    ? displayLanguage(view.user.preferredLanguage, locale)
    : t("data.languageUnset");

  return (
    <div className="flex flex-col">
      <SectionHeader title={t("data.title")} description={t("data.description")} />

      <Group id="personal" title={t("data.personal")}>
        <NameCard view={view} languageName={languageName} />
      </Group>

      <Group id="contacts" title={t("data.contacts")}>
        <EmailRow
          view={view}
          onVerify={() => flow.start("verifyEmail", "data")}
          verifying={flow.pending === "verifyEmail"}
        />
        <Row
          icon={
            <RowIcon>
              <DevicePhoneMobileIcon />
            </RowIcon>
          }
          title={t("data.phone.title")}
          subtitle={t("data.phone.later")}
          trailing={<Pill>{t("common.later")}</Pill>}
        />
        {flow.error && <Note tone="error">{flow.error}</Note>}
      </Group>

      <Group
        id="linked"
        title={t("data.linked.title")}
        aside={<span className="text-hc-muted">{t("data.linked.hint")}</span>}
      >
        {view.linkedIdps.map((idp) => (
          <LinkedIdpRow key={idp.idpId} idp={idp} view={view} />
        ))}
        {view.availableIdps.map((idp) => (
          <AvailableIdpRow key={idp.id} idp={idp} />
        ))}
        {!view.linkedIdps.length && !view.availableIdps.length && <Note tone="info">{t("data.linked.none")}</Note>}
      </Group>

      <Group id="public" title={t("data.public")}>
        <Row
          icon={
            <RowIcon>
              <AtSymbolIcon />
            </RowIcon>
          }
          title={view.user.handle || view.user.username}
          subtitle={t("data.handle.subtitle")}
          trailing={<Pill>{t("data.handle.readOnly")}</Pill>}
        />
      </Group>

      <Group id="manage" title={t("data.manage")}>
        <Row
          icon={
            <RowIcon>
              <KeyIcon />
            </RowIcon>
          }
          title={t("data.access.title")}
          subtitle={
            keys.status === "ready" && keys.data
              ? t("data.access.subtitle", { keys: keys.data.active, orgs: daenerys.orgs.length })
              : keys.status === "loading"
                ? "…"
                : t("data.access.unavailable")
          }
          trailing={<RowLink href={view.links.keysUrl}>{t("common.open")}</RowLink>}
        />
        <Row
          icon={
            <RowIcon>
              <ArrowDownTrayIcon />
            </RowIcon>
          }
          title={t("data.export.title")}
          subtitle={t("data.export.subtitle")}
          trailing={<Pill>{t("common.later")}</Pill>}
        />
        <DeleteProfileRow view={view} daenerys={daenerys} />
      </Group>
    </div>
  );
}

function NameCard({ view, languageName }: { view: SectionProps["view"]; languageName: string }) {
  const t = useTranslations("profile");
  const runner = useRunner();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    givenName: view.user.givenName,
    familyName: view.user.familyName,
    displayName: view.user.displayName,
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await runner.run(
      () => saveName(form),
      () => setEditing(false),
    );
    if (!ok) return;
  };

  return (
    <Panel className="p-4" data-testid="name-card">
      <div className="flex min-w-0 flex-wrap items-center gap-4">
        <Avatar
          size="large"
          name={view.user.fullName}
          loginName={view.user.loginName}
          imageUrl={view.user.avatarUrl || undefined}
        />
        <div className="min-w-0 flex-1">
          <div className="text-hc-text text-[17px] leading-tight font-bold break-words" data-testid="full-name">
            {view.user.fullName}
          </div>
          <div className="text-hc-muted mt-0.5 text-[12.5px]">
            {[
              view.user.salutation && t("data.salutation", { name: view.user.salutation }),
              t("data.language", { language: languageName }),
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
          <div className="text-hc-muted mt-0.5 text-[11.5px]">{t("data.avatarNote")}</div>
        </div>
        {!editing && (
          <RowButton onClick={() => setEditing(true)} data-testid="edit-name">
            {t("common.edit")}
          </RowButton>
        )}
      </div>
      {editing && (
        <form
          onSubmit={submit}
          className="border-hc-border mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2"
          data-testid="name-form"
        >
          <label className="block">
            <FieldLabel>{t("data.form.givenName")}</FieldLabel>
            <input
              className={fieldClasses}
              value={form.givenName}
              onChange={(e) => setForm({ ...form, givenName: e.target.value })}
              autoComplete="given-name"
              required
              maxLength={200}
              data-testid="given-name"
            />
          </label>
          <label className="block">
            <FieldLabel>{t("data.form.familyName")}</FieldLabel>
            <input
              className={fieldClasses}
              value={form.familyName}
              onChange={(e) => setForm({ ...form, familyName: e.target.value })}
              autoComplete="family-name"
              required
              maxLength={200}
              data-testid="family-name"
            />
          </label>
          <label className="block sm:col-span-2">
            <FieldLabel>{t("data.form.displayName")}</FieldLabel>
            <input
              className={fieldClasses}
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              autoComplete="nickname"
              maxLength={200}
              placeholder={`${form.givenName} ${form.familyName}`.trim()}
              data-testid="display-name"
            />
            <span className="text-hc-muted mt-1 block text-[11.5px]">{t("data.form.displayNameHint")}</span>
          </label>
          {runner.error && (
            <div className="sm:col-span-2">
              <Note tone="error">{runner.error}</Note>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <RowButton type="submit" tone="primary" busy={runner.busy} data-testid="save-name">
              {t("common.save")}
            </RowButton>
            <RowButton type="button" onClick={() => setEditing(false)} disabled={runner.busy}>
              {t("common.cancel")}
            </RowButton>
          </div>
        </form>
      )}
      {!editing && runner.done && (
        <div className="mt-3">
          <Note tone="info">{t("common.saved")}</Note>
        </div>
      )}
    </Panel>
  );
}

function EmailRow({ view, onVerify, verifying }: { view: SectionProps["view"]; onVerify: () => void; verifying: boolean }) {
  const t = useTranslations("profile");
  const runner = useRunner();
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const target = email.trim();
    const ok = await runner.run(
      () => changeEmail(target),
      () => {
        setSentTo(target);
        setEditing(false);
      },
    );
    if (!ok) return;
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Row
        icon={
          <RowIcon tone={view.user.emailVerified ? "soft" : "warn"}>
            <EnvelopeIcon />
          </RowIcon>
        }
        title={t("data.email.title")}
        subtitle={view.user.email || t("home.tiles.emailMissing")}
        data-testid="email-row"
        trailing={
          <>
            {view.user.email &&
              (view.user.emailVerified ? (
                <Pill tone="ok">{t("data.email.verified")}</Pill>
              ) : (
                <Pill tone="warn">{t("data.email.unverified")}</Pill>
              ))}
            {view.user.email && !view.user.emailVerified && (
              <RowButton tone="primary" onClick={onVerify} busy={verifying} data-testid="verify-email">
                {t("data.email.verify")}
              </RowButton>
            )}
            {!editing && (
              <RowButton onClick={() => setEditing(true)} data-testid="change-email">
                {t("data.email.change")}
              </RowButton>
            )}
          </>
        }
      />
      {editing && (
        <form onSubmit={submit} className="border-hc-border bg-hc-card rounded-[12px] border p-3" data-testid="email-form">
          <label className="block">
            <FieldLabel>{t("data.email.form.label")}</FieldLabel>
            <input
              type="email"
              className={fieldClasses}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              autoFocus
              data-testid="new-email"
            />
          </label>
          <p className="text-hc-muted mt-1.5 text-[11.5px]">{t("data.email.form.hint")}</p>
          {runner.error && (
            <div className="mt-2">
              <Note tone="error">{runner.error}</Note>
            </div>
          )}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <RowButton type="submit" tone="primary" busy={runner.busy} data-testid="save-email">
              {t("data.email.form.submit")}
            </RowButton>
            <RowButton type="button" onClick={() => setEditing(false)} disabled={runner.busy}>
              {t("common.cancel")}
            </RowButton>
          </div>
        </form>
      )}
      {sentTo && !editing && <Note tone="info">{t("data.email.sent", { email: sentTo })}</Note>}
    </div>
  );
}

function LinkedIdpRow({ idp, view }: { idp: LinkedIdp; view: SectionProps["view"] }) {
  const t = useTranslations("profile");
  const runner = useRunner();
  const [confirming, setConfirming] = useState(false);
  const brand = detectIdpBrand(idp.type, idp.name);
  const removable = canRemoveSignInMethod(view.methods, "idp", {
    passkeys: view.passkeys.length,
    idps: view.linkedIdps.length,
  });

  return (
    <div className="flex flex-col gap-1.5">
      <Row
        icon={
          <RowIcon tone="brand">
            <IdpIcon brand={brand} name={idp.name} />
          </RowIcon>
        }
        title={idp.name}
        subtitle={[t("data.linked.linked"), idp.linkedUserName].filter(Boolean).join(" · ")}
        data-testid={`linked-idp-${idp.idpId}`}
        trailing={
          <RowButton
            onClick={() => setConfirming(true)}
            disabled={!removable || confirming}
            title={!removable ? t("errors.lastMethod") : undefined}
            data-testid={`unlink-${idp.idpId}`}
          >
            {t("data.linked.unlink")}
          </RowButton>
        }
      />
      {confirming && (
        <Confirm
          question={t("data.linked.unlinkConfirm", { name: idp.name })}
          yes={t("data.linked.unlink")}
          no={t("common.cancel")}
          busy={runner.busy}
          onNo={() => setConfirming(false)}
          onYes={() =>
            runner.run(
              () => unlinkProvider({ idpId: idp.idpId, linkedUserId: idp.linkedUserId }),
              () => setConfirming(false),
            )
          }
        />
      )}
      {runner.error && <Note tone="error">{runner.error}</Note>}
    </div>
  );
}

/** "Link" posts to the same server action as the provider tiles on the sign-in screen, with the current session. */
function AvailableIdpRow({ idp }: { idp: AvailableIdp }) {
  const t = useTranslations("profile");
  const [state, action, pending] = useActionState(beginProviderLink, {});
  const brand = detectIdpBrand(idp.type, idp.name);

  return (
    <form action={action} className="flex flex-col gap-1.5" data-testid={`link-idp-${idp.id}`}>
      {state?.samlData && <AutoSubmitForm url={state.samlData.url} fields={state.samlData.fields} />}
      <input type="hidden" name="id" value={idp.id} />
      <input type="hidden" name="provider" value={idpTypeToSlug(idp.type)} />
      <Row
        icon={
          <RowIcon tone="brand">
            <IdpIcon brand={brand} name={idp.name} />
          </RowIcon>
        }
        title={idp.name}
        trailing={
          <RowButton type="submit" busy={pending}>
            <LinkIcon className="h-3.5 w-3.5" />
            {t("data.linked.link")}
          </RowButton>
        }
      />
      {state?.error && <Note tone="error">{state.error}</Note>}
    </form>
  );
}

function DeleteProfileRow({ view, daenerys }: Pick<SectionProps, "view" | "daenerys">) {
  const t = useTranslations("profile");
  const locale = useLocale();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState<{ id: string; name: string; members: number }[]>([]);
  const [pending, setPending] = useState<PendingDeletion | null | undefined>(undefined);
  const [missing, setMissing] = useState(false);

  const current = pending === undefined ? (daenerys.user?.pendingDeletion ?? null) : pending;
  const reachable = daenerys.status === "ready";

  const request = async () => {
    setBusy(true);
    setError("");
    setBlocked([]);
    const result = await daenerys.client.requestDeletion();
    setBusy(false);
    if (result.ok) {
      setPending(normalizePendingDeletion((result.data as { pending_deletion?: unknown })?.pending_deletion ?? result.data));
      setConfirming(false);
      return;
    }
    if (result.reason === "missing") {
      setMissing(true);
      setConfirming(false);
      return;
    }
    if (result.code === "transfer_ownership_first") {
      setBlocked(blockingAccounts(result.data));
      setError(t("data.delete.transferFirst"));
      return;
    }
    if (result.code === "system_admin") {
      setError(t("data.delete.systemAdmin"));
      return;
    }
    setError(result.message || t("daenerys.unavailable"));
  };

  const cancel = async () => {
    setBusy(true);
    setError("");
    const result = await daenerys.client.cancelDeletion();
    setBusy(false);
    if (result.ok) {
      setPending(null);
      return;
    }
    setError(result.message || t("daenerys.unavailable"));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Row
        icon={
          <RowIcon tone="bad">
            <TrashIcon />
          </RowIcon>
        }
        tone="danger"
        title={t("data.delete.title")}
        subtitle={
          current
            ? t("data.delete.pending", { date: formatDate(current.deleteAt, locale) })
            : missing
              ? t("data.delete.unavailable")
              : t("data.delete.subtitle")
        }
        data-testid="delete-row"
        trailing={
          current ? (
            <RowButton onClick={cancel} busy={busy} data-testid="cancel-deletion">
              {t("data.delete.cancel")}
            </RowButton>
          ) : (
            <RowButton
              tone="danger"
              onClick={() => setConfirming(true)}
              disabled={!reachable || missing || confirming}
              title={!reachable ? t("daenerys.unavailable") : undefined}
              data-testid="request-deletion"
            >
              {t("data.delete.button")}
            </RowButton>
          )
        }
      />
      {daenerys.status === "unauthorized" && !current && <DaenerysNotice daenerys={daenerys} status="unauthorized" />}
      {confirming && (
        <Confirm
          question={t("data.delete.confirm", { email: view.user.email })}
          yes={t("data.delete.confirmButton")}
          no={t("common.cancel")}
          busy={busy}
          onYes={request}
          onNo={() => setConfirming(false)}
        />
      )}
      {error && (
        <Note tone="error">
          {error}
          {blocked.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {blocked.map((a) => (
                <li key={a.id}>
                  {a.name} — {t("data.delete.members", { count: a.members })}
                </li>
              ))}
            </ul>
          )}
        </Note>
      )}
      {daenerys.status === "loading" && <RowSkeleton rows={0} />}
    </div>
  );
}
