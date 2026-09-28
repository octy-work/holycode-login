"use client";

import { normalizeAccounts, Organization } from "@/lib/daenerys";
import { ArrowsRightLeftIcon, EnvelopeOpenIcon, PlusIcon } from "@heroicons/react/24/solid";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { DaenerysNotice, SectionHeader } from "./shared";
import type { SectionProps } from "./shell";
import { fieldClasses, FieldLabel, Group, Note, Pill, Row, RowButton, rowButtonClasses, RowIcon, RowSkeleton } from "./ui";

const ROLE_KEYS = new Set(["owner", "admin", "member"]);

const ORG_GRADIENTS = [
  "linear-gradient(135deg,#f59e0b,#ef4444)",
  "linear-gradient(135deg,#7c3aed,#6366f1)",
  "linear-gradient(135deg,#0ea5e9,#2563eb)",
  "linear-gradient(135deg,#10b981,#0d9488)",
  "linear-gradient(135deg,#ec4899,#8b5cf6)",
  "linear-gradient(135deg,#f97316,#eab308)",
];

/** The same colour rule as the organization switcher in HolyChat: stable by id. */
export function orgGradient(accountId: string): string {
  let hash = 0;
  for (let i = 0; i < accountId.length; i += 1) hash = (hash * 31 + accountId.charCodeAt(i)) >>> 0;
  return ORG_GRADIENTS[hash % ORG_GRADIENTS.length];
}

export function orgInitial(name: string): string {
  const text = name.trim();
  if (!text) return "?";
  const chars = Array.from(text);
  const first = chars.find((ch) => /[0-9A-Za-zÀ-ɏЀ-ӿ]/.test(ch)) ?? chars[0];
  return first.toLocaleUpperCase();
}

/** Organizations: the teams the person belongs to (from Daenerys), a new one, invitations, another user. */
export function OrgsSection({ view, daenerys }: SectionProps) {
  const t = useTranslations("profile");
  const [orgs, setOrgs] = useState<Organization[] | null>(null);
  const list = orgs ?? daenerys.orgs;

  const roleLabel = (role: string) => (ROLE_KEYS.has(role) ? t(`orgs.role.${role}`) : role);

  return (
    <div className="flex flex-col">
      <SectionHeader title={t("orgs.title")} description={t("orgs.description")} />

      <Group id="list" title={t("orgs.mine")}>
        {daenerys.status === "loading" && <RowSkeleton rows={2} />}
        {(daenerys.status === "unauthorized" || daenerys.status === "unavailable") && (
          <DaenerysNotice
            daenerys={daenerys}
            status={daenerys.status}
            failure={daenerys.failure}
            message={daenerys.message}
            onRetry={daenerys.reload}
          />
        )}
        {daenerys.status === "ready" && list.length === 0 && <Note tone="info">{t("orgs.empty")}</Note>}
        {daenerys.status === "ready" &&
          list.map((org) => (
            <Row
              key={org.id}
              icon={
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-[14px] font-extrabold text-white"
                  style={{ backgroundImage: orgGradient(org.id) }}
                  aria-hidden="true"
                >
                  {orgInitial(org.name)}
                </span>
              }
              title={org.name}
              subtitle={roleLabel(org.role)}
              data-testid={`org-${org.id}`}
              trailing={
                <>
                  {org.active && <Pill tone="pur">{t("orgs.active")}</Pill>}
                  {(org.role === "owner" || org.role === "admin") && (
                    <a href={view.links.adminUrl} target="_blank" rel="noreferrer" className={rowButtonClasses("default")}>
                      {t("orgs.admin")} ↗
                    </a>
                  )}
                </>
              }
            />
          ))}
        {daenerys.status === "ready" && <CreateOrgRow daenerys={daenerys} onCreated={(next) => setOrgs(next)} />}
      </Group>

      <Group id="invites" title={t("orgs.invites.title")}>
        <Row
          icon={
            <RowIcon>
              <EnvelopeOpenIcon />
            </RowIcon>
          }
          title={t("orgs.invites.none.title")}
          subtitle={t("orgs.invites.none.subtitle")}
        />
      </Group>

      <Group id="switch" title={t("orgs.switch.title")}>
        <Row
          icon={
            <RowIcon>
              <ArrowsRightLeftIcon />
            </RowIcon>
          }
          title={t("orgs.switch.row.title")}
          subtitle={t("orgs.switch.row.subtitle")}
          trailing={
            <Link href="/accounts" className={rowButtonClasses("default")} data-testid="switch-user">
              {t("orgs.switch.button")}
            </Link>
          }
        />
      </Group>
    </div>
  );
}

function CreateOrgRow({
  daenerys,
  onCreated,
}: Pick<SectionProps, "daenerys"> & { onCreated: (orgs: Organization[]) => void }) {
  const t = useTranslations("profile");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState("");
  const [missing, setMissing] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = name.replace(/\s+/g, " ").trim();
    if (!value || value.length > 80) {
      setError(t("orgs.create.invalidName"));
      return;
    }
    setBusy(true);
    setError("");
    const result = await daenerys.client.createAccount(value);
    setBusy(false);
    if (result.ok) {
      setCreated(value);
      setOpen(false);
      setName("");
      onCreated(normalizeAccounts(result.data));
      // The answer rotated the session cookies (the session now points at the new organization).
      daenerys.reload();
      return;
    }
    if (result.reason === "missing") {
      setMissing(true);
      setOpen(false);
      return;
    }
    if (result.code === "too_many_accounts") {
      setError(t("orgs.create.tooMany"));
      return;
    }
    if (result.code === "invalid_name") {
      setError(t("orgs.create.invalidName"));
      return;
    }
    setError(result.message || t("daenerys.unavailable"));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Row
        dashed
        icon={
          <RowIcon>
            <PlusIcon />
          </RowIcon>
        }
        title={t("orgs.create.title")}
        subtitle={missing ? t("daenerys.missing") : t("orgs.create.subtitle")}
        data-testid="create-org-row"
        trailing={
          !open && (
            <RowButton tone="primary" onClick={() => setOpen(true)} disabled={missing} data-testid="create-org">
              {t("orgs.create.button")}
            </RowButton>
          )
        }
      />
      {open && (
        <form
          onSubmit={submit}
          className="border-hc-border bg-hc-card rounded-[12px] border p-3"
          data-testid="create-org-form"
        >
          <label className="block">
            <FieldLabel>{t("orgs.create.name")}</FieldLabel>
            <input
              className={fieldClasses}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              required
              autoFocus
              data-testid="org-name"
            />
          </label>
          {error && (
            <div className="mt-2">
              <Note tone="error">{error}</Note>
            </div>
          )}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <RowButton type="submit" tone="primary" busy={busy} data-testid="submit-org">
              {t("orgs.create.submit")}
            </RowButton>
            <RowButton type="button" onClick={() => setOpen(false)} disabled={busy}>
              {t("common.cancel")}
            </RowButton>
          </div>
        </form>
      )}
      {created && !open && <Note tone="info">{t("orgs.create.done", { name: created })}</Note>}
    </div>
  );
}
