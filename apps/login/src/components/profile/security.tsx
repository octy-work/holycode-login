"use client";

import { detectIdpBrand, IdpIcon } from "@/components/idps/idp-icons";
import {
  ActivityEntry,
  ActivityPage,
  isKeyEntry,
  normalizeActivity,
  normalizeSessions,
  ServiceSession,
} from "@/lib/daenerys";
import { profilePath } from "@/lib/profile";
import { deletePasskey, disableTotp, sendPasswordResetToMe, signOutEverywhere } from "@/lib/server/profile";
import {
  ArrowRightStartOnRectangleIcon,
  ClockIcon,
  CommandLineIcon,
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
  EnvelopeIcon,
  FingerPrintIcon,
  KeyIcon,
  LockClosedIcon,
  ShieldCheckIcon,
  UserIcon,
} from "@heroicons/react/24/solid";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ReactNode, useState } from "react";
import { describeDevice, dots, formatWhen, isJustNow } from "./format";
import { Confirm, DaenerysNotice, SectionHeader, useFlowStarter, useRunner } from "./shared";
import type { SectionProps } from "./shell";
import { Group, Note, Pill, Row, RowButton, RowIcon, RowLink, RowSkeleton } from "./ui";
import { useDaenerysResource } from "./use-daenerys";

const ACTIVITY_KEYS: Record<string, string> = {
  login: "login",
  logout: "logout",
  "logout.all": "logoutAll",
  "session.revoked": "sessionRevoked",
  "api_key.created": "keyCreated",
  "api_key.revoked": "keyRevoked",
  "api_key.revoked_all": "keysRevokedAll",
  "account.created": "accountCreated",
  "profile.deletion_scheduled": "deletionScheduled",
  "profile.deletion_cancelled": "deletionCancelled",
  "password.changed": "passwordChanged",
};

const SOURCE_KEYS: Record<string, string> = {
  "auth.oidc": "oidc",
  "auth.oidc_device": "oidcDevice",
  "auth.login": "password",
  "auth.password": "password",
  "auth.invite": "invite",
  "auth.api_key": "apiKey",
};

/** Security: ways in with actions on the spot, devices and sessions, activity, recovery, app passwords. */
export function SecuritySection({ view, prefix, daenerys }: SectionProps) {
  const t = useTranslations("profile");
  const flow = useFlowStarter();

  return (
    <div className="flex flex-col">
      <SectionHeader title={t("security.title")} description={t("security.description")} />

      <Group id="methods" title={t("security.methods")}>
        <PasswordRow view={view} onChange={() => flow.start("password", "security")} busy={flow.pending === "password"} />
        <PasskeyRows view={view} onAdd={() => flow.start("passkey", "security")} busy={flow.pending === "passkey"} />
        <SecondFactorRow
          view={view}
          onAdd={() => flow.start("secondFactor", "security")}
          busy={flow.pending === "secondFactor"}
        />
        <Row
          icon={
            <RowIcon>
              <UserIcon />
            </RowIcon>
          }
          title={t("security.providers.title")}
          subtitle={view.linkedIdps.length ? view.linkedIdps.map((l) => l.name).join(", ") : t("security.providers.none")}
          trailing={<RowLink href={`${profilePath(prefix, "data")}#linked`}>{t("security.providers.manage")}</RowLink>}
        />
        {flow.error && <Note tone="error">{flow.error}</Note>}
      </Group>

      <SessionsGroup daenerys={daenerys} />
      <ActivityGroup daenerys={daenerys} onChangePassword={() => flow.start("password", "security")} />

      <Group id="recovery" title={t("security.recovery.title")}>
        <ResetMailRow view={view} />
        {view.linkedIdps.map((idp) => (
          <Row
            key={idp.idpId}
            icon={
              <RowIcon tone="brand">
                <IdpIcon brand={detectIdpBrand(idp.type, idp.name)} name={idp.name} />
              </RowIcon>
            }
            title={t("security.recovery.idp.title", { name: idp.name })}
            subtitle={t("security.recovery.idp.subtitle")}
            trailing={<Pill tone="ok">{t("security.recovery.has")}</Pill>}
          />
        ))}
        <Row
          icon={
            <RowIcon tone={view.methods.passkey ? "ok" : "soft"}>
              <FingerPrintIcon />
            </RowIcon>
          }
          title={t("security.recovery.passkey.title")}
          subtitle={t("security.recovery.passkey.subtitle")}
          trailing={
            view.methods.passkey ? (
              <Pill tone="ok">{t("security.recovery.has")}</Pill>
            ) : view.settings.passkeysAllowed ? (
              <RowButton onClick={() => flow.start("passkey", "security")} busy={flow.pending === "passkey"}>
                {t("security.passkey.add")}
              </RowButton>
            ) : (
              <Pill>{t("security.passkey.notAllowed")}</Pill>
            )
          }
        />
      </Group>

      <Group
        id="app-passwords"
        title={t("security.appPasswords.title")}
        aside={<span className="text-hc-muted">{t("security.appPasswords.hint")}</span>}
      >
        <Row
          icon={
            <RowIcon>
              <EnvelopeIcon />
            </RowIcon>
          }
          title={t("security.appPasswords.row.title")}
          subtitle={t("security.appPasswords.row.subtitle")}
          trailing={
            <RowLink href={view.links.mailAdminUrl} external>
              {t("common.open")} ↗
            </RowLink>
          }
        />
      </Group>
    </div>
  );
}

function PasswordRow({ view, onChange, busy }: { view: SectionProps["view"]; onChange: () => void; busy: boolean }) {
  const t = useTranslations("profile");
  const runner = useRunner();
  const canUseLocal = view.settings.allowLocalAuthentication;

  return (
    <div className="flex flex-col gap-1.5">
      <Row
        icon={
          <RowIcon tone={view.methods.password ? "soft" : "warn"}>
            <LockClosedIcon />
          </RowIcon>
        }
        title={t("security.password.title")}
        subtitle={view.methods.password ? t("security.password.subtitle") : t("security.password.noneHint")}
        data-testid="password-row"
        trailing={
          <>
            {view.methods.password ? (
              <Pill tone="ok">{t("security.password.on")}</Pill>
            ) : (
              <Pill tone="warn">{t("security.password.off")}</Pill>
            )}
            {canUseLocal && view.methods.password && (
              <RowButton onClick={onChange} busy={busy} data-testid="change-password">
                {t("security.password.change")}
              </RowButton>
            )}
            {canUseLocal && !view.methods.password && !view.settings.hidePasswordReset && (
              <RowButton
                onClick={() => runner.run(() => sendPasswordResetToMe())}
                busy={runner.busy}
                data-testid="set-password"
              >
                {t("security.password.setByMail")}
              </RowButton>
            )}
          </>
        }
      />
      {runner.done && <Note tone="info">{t("security.recovery.email.sent", { email: view.user.email })}</Note>}
      {runner.error && <Note tone="error">{runner.error}</Note>}
    </div>
  );
}

function PasskeyRows({ view, onAdd, busy }: { view: SectionProps["view"]; onAdd: () => void; busy: boolean }) {
  const t = useTranslations("profile");
  const runner = useRunner();
  const [removing, setRemoving] = useState<string | null>(null);
  const canRemove = view.methods.password || view.methods.idp || view.passkeys.length > 1;

  return (
    <div className="flex flex-col gap-1.5">
      <Row
        icon={
          <RowIcon tone={view.methods.passkey ? "ok" : "soft"}>
            <FingerPrintIcon />
          </RowIcon>
        }
        title={t("security.passkey.title")}
        subtitle={t("security.passkey.subtitle")}
        data-testid="passkey-row"
        trailing={
          <>
            {view.passkeys.length > 0 && (
              <Pill tone="ok">{t("security.passkey.count", { count: view.passkeys.length })}</Pill>
            )}
            {view.settings.passkeysAllowed ? (
              <RowButton
                tone={view.methods.passkey ? "default" : "primary"}
                onClick={onAdd}
                busy={busy}
                data-testid="add-passkey"
              >
                {t("security.passkey.add")}
              </RowButton>
            ) : (
              <Pill>{t("security.passkey.notAllowed")}</Pill>
            )}
          </>
        }
      />
      {view.passkeys.map((passkey) => (
        <div key={passkey.id} className="flex flex-col gap-1.5 pl-6">
          <Row
            icon={
              <RowIcon>
                <KeyIcon />
              </RowIcon>
            }
            title={passkey.name || t("security.passkey.unnamed")}
            data-testid={`passkey-${passkey.id}`}
            trailing={
              <RowButton
                onClick={() => setRemoving(passkey.id)}
                disabled={!canRemove || removing === passkey.id}
                title={!canRemove ? t("errors.lastMethod") : undefined}
              >
                {t("security.passkey.remove")}
              </RowButton>
            }
          />
          {removing === passkey.id && (
            <Confirm
              question={t("security.passkey.removeConfirm", { name: passkey.name || t("security.passkey.unnamed") })}
              yes={t("security.passkey.remove")}
              no={t("common.cancel")}
              busy={runner.busy}
              onNo={() => setRemoving(null)}
              onYes={() =>
                runner.run(
                  () => deletePasskey(passkey.id),
                  () => setRemoving(null),
                )
              }
            />
          )}
        </div>
      ))}
      {runner.error && <Note tone="error">{runner.error}</Note>}
    </div>
  );
}

function SecondFactorRow({ view, onAdd, busy }: { view: SectionProps["view"]; onAdd: () => void; busy: boolean }) {
  const t = useTranslations("profile");
  const runner = useRunner();
  const [confirming, setConfirming] = useState(false);
  const offered = view.settings.secondFactors.length > 0;
  const enabledKinds = (
    [
      view.factors.totp && t("security.secondFactor.totp"),
      view.factors.u2f > 0 && t("security.secondFactor.u2f", { count: view.factors.u2f }),
      view.factors.otpEmail && t("security.secondFactor.otpEmail"),
      view.factors.otpSms && t("security.secondFactor.otpSms"),
    ] as (string | false)[]
  ).filter((s): s is string => !!s);

  return (
    <div className="flex flex-col gap-1.5">
      <Row
        icon={
          <RowIcon tone={view.methods.secondFactor || view.methods.passkey ? "ok" : "soft"}>
            <ShieldCheckIcon />
          </RowIcon>
        }
        title={t("security.secondFactor.title")}
        subtitle={
          enabledKinds.length
            ? enabledKinds.join(", ")
            : view.methods.passkey
              ? t("security.secondFactor.byPasskey")
              : t("security.secondFactor.subtitle")
        }
        data-testid="second-factor-row"
        trailing={
          <>
            {view.methods.secondFactor ? (
              <Pill tone="ok">{t("security.secondFactor.on")}</Pill>
            ) : view.methods.passkey ? (
              <Pill tone="ok">{t("security.secondFactor.covered")}</Pill>
            ) : (
              <Pill tone="warn">{t("security.secondFactor.off")}</Pill>
            )}
            {offered && (
              <RowButton
                tone={view.methods.secondFactor || view.methods.passkey ? "default" : "primary"}
                onClick={onAdd}
                busy={busy}
                data-testid="add-second-factor"
              >
                {t("security.secondFactor.add")}
              </RowButton>
            )}
            {view.factors.totp && (
              <RowButton onClick={() => setConfirming(true)} disabled={confirming} data-testid="disable-totp">
                {t("security.secondFactor.disable")}
              </RowButton>
            )}
          </>
        }
      />
      {confirming && (
        <Confirm
          question={t("security.secondFactor.disableConfirm")}
          yes={t("security.secondFactor.disable")}
          no={t("common.cancel")}
          busy={runner.busy}
          onNo={() => setConfirming(false)}
          onYes={() =>
            runner.run(
              () => disableTotp(),
              () => setConfirming(false),
            )
          }
        />
      )}
      {runner.error && <Note tone="error">{runner.error}</Note>}
    </div>
  );
}

function ResetMailRow({ view }: { view: SectionProps["view"] }) {
  const t = useTranslations("profile");
  const runner = useRunner();
  const works = view.settings.allowLocalAuthentication && !view.settings.hidePasswordReset && !!view.user.email;

  return (
    <div className="flex flex-col gap-1.5">
      <Row
        icon={
          <RowIcon tone={works ? "soft" : "warn"}>
            <EnvelopeIcon />
          </RowIcon>
        }
        title={t("security.recovery.email.title")}
        subtitle={
          view.user.email ? t("security.recovery.email.subtitle", { email: view.user.email }) : t("home.tiles.emailMissing")
        }
        data-testid="reset-mail-row"
        trailing={
          <>
            {works ? (
              <Pill tone="ok">{t("security.recovery.email.works")}</Pill>
            ) : (
              <Pill tone="warn">{t("security.recovery.email.off")}</Pill>
            )}
            {works && (
              <RowButton
                onClick={() => runner.run(() => sendPasswordResetToMe())}
                busy={runner.busy}
                data-testid="send-reset"
              >
                {t("security.recovery.email.send")}
              </RowButton>
            )}
          </>
        }
      />
      {runner.done && <Note tone="info">{t("security.recovery.email.sent", { email: view.user.email })}</Note>}
      {runner.error && <Note tone="error">{runner.error}</Note>}
    </div>
  );
}

function sessionIcon(session: ServiceSession): ReactNode {
  if (isKeyEntry(session)) return <KeyIcon />;
  const kind = session.device?.kind ?? "";
  if (kind === "phone" || kind === "tablet") return <DevicePhoneMobileIcon />;
  if (kind === "cli" || kind === "bot" || kind === "app") return <CommandLineIcon />;
  return <ComputerDesktopIcon />;
}

function SessionsGroup({ daenerys }: Pick<SectionProps, "daenerys">) {
  const t = useTranslations("profile");
  const locale = useLocale();
  const router = useRouter();
  const sessions = useDaenerysResource<ServiceSession[]>(daenerys, (c) => c.sessions(), normalizeSessions, {
    label: "sessions",
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [confirmAll, setConfirmAll] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const revoke = async (session: ServiceSession) => {
    setBusyId(session.id);
    setError("");
    const result = isKeyEntry(session)
      ? await daenerys.client.revokeApiKey(session.apiKey?.keyId ?? session.id)
      : await daenerys.client.revokeSession(session.id);
    setBusyId(null);
    if (!result.ok) {
      setError(result.message || t("daenerys.unavailable"));
      return;
    }
    if (session.current && !isKeyEntry(session)) {
      // Ending the current Daenerys session signs this browser out of the services; the ID stays.
      daenerys.reload();
    }
    sessions.reload();
  };

  const signOutEverywhereNow = async () => {
    setSigningOut(true);
    setError("");
    const result = await daenerys.client.logoutAll({ revokeKeys: false });
    if (!result.ok && result.reason !== "unauthorized") {
      setSigningOut(false);
      setError(result.message || t("daenerys.unavailable"));
      return;
    }
    // Daenerys cannot end the ID session: the login app terminates this browser's sessions itself.
    const ended = await signOutEverywhere();
    setSigningOut(false);
    if ("redirect" in ended) {
      router.push(ended.redirect);
      return;
    }
    setError(ended.error);
  };

  const sourceLabel = (session: ServiceSession): string => {
    const key = SOURCE_KEYS[session.source];
    return key ? t(`security.session.via.${key}`) : session.source;
  };

  return (
    <Group
      id="sessions"
      status={sessions.status}
      title={t("security.sessions.title")}
      aside={
        sessions.status === "ready" && (
          <button
            type="button"
            className="hover:underline"
            onClick={() => setConfirmAll(true)}
            data-testid="sign-out-everywhere"
          >
            {t("security.sessions.signOutAll")}
          </button>
        )
      }
    >
      {confirmAll && (
        <Confirm
          question={t("security.sessions.signOutAllConfirm")}
          yes={t("security.sessions.signOutAll")}
          no={t("common.cancel")}
          busy={signingOut}
          onNo={() => setConfirmAll(false)}
          onYes={signOutEverywhereNow}
        />
      )}
      {sessions.status === "loading" && <RowSkeleton rows={2} />}
      {(sessions.status === "unauthorized" || sessions.status === "unavailable" || sessions.status === "missing") && (
        <DaenerysNotice
          daenerys={daenerys}
          status={sessions.status}
          failure={sessions.failure}
          message={sessions.message}
          onRetry={sessions.reload}
        />
      )}
      {sessions.status === "ready" && sessions.data && sessions.data.length === 0 && (
        <Note tone="info">{t("security.sessions.empty")}</Note>
      )}
      {sessions.status === "ready" &&
        sessions.data?.map((session) => {
          const key = isKeyEntry(session);
          const device = describeDevice(session.device);
          const when =
            session.current && !key
              ? t("common.now")
              : isJustNow(session.lastSeenAt)
                ? t("common.now")
                : formatWhen(session.lastSeenAt, locale);
          return (
            <Row
              key={session.id}
              icon={<RowIcon tone={key ? "soft" : session.current ? "ok" : "soft"}>{sessionIcon(session)}</RowIcon>}
              title={
                key
                  ? t("security.session.key", { name: session.apiKey?.name || session.apiKey?.tokenPreview || session.id })
                  : device || t("security.session.unknownDevice")
              }
              subtitle={dots(
                when,
                session.city,
                key
                  ? session.apiKey?.scopes.length
                    ? session.apiKey.scopes.join(", ")
                    : t("security.session.via.apiKey")
                  : sourceLabel(session),
                key && session.expiresAt
                  ? t("security.session.until", { date: formatWhen(session.expiresAt, locale) })
                  : undefined,
                session.ip,
              )}
              data-testid={`session-${session.id}`}
              trailing={
                session.current && !key ? (
                  <Pill tone="pur">{t("security.session.current")}</Pill>
                ) : (
                  <RowButton onClick={() => revoke(session)} busy={busyId === session.id}>
                    {key ? t("security.session.revoke") : t("security.session.signOut")}
                  </RowButton>
                )
              }
            />
          );
        })}
      {sessions.status === "ready" && sessions.data?.some((s) => !s.device && !isKeyEntry(s)) && (
        <Note tone="info">{t("security.sessions.note")}</Note>
      )}
      {error && <Note tone="error">{error}</Note>}
    </Group>
  );
}

function ActivityGroup({ daenerys, onChangePassword }: Pick<SectionProps, "daenerys"> & { onChangePassword: () => void }) {
  const t = useTranslations("profile");
  const locale = useLocale();
  const activity = useDaenerysResource<ActivityPage>(daenerys, (c) => c.activity({ limit: 50 }), normalizeActivity, {
    label: "activity",
  });
  const [expanded, setExpanded] = useState(false);
  const [notMe, setNotMe] = useState<ActivityEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const entries = activity.data?.entries ?? [];
  const shown = expanded ? entries : entries.slice(0, 6);

  const actionLabel = (entry: ActivityEntry): string => {
    const key = ACTIVITY_KEYS[entry.action];
    const base = key ? t(`security.activity.action.${key}`) : entry.action;
    return entry.detail ? `${base} · ${entry.detail}` : base;
  };

  const itWasNotMe = async () => {
    setBusy(true);
    setError("");
    const result = await daenerys.client.logoutAll({ revokeKeys: false });
    setBusy(false);
    if (!result.ok && result.reason !== "unauthorized") {
      setError(result.message || t("daenerys.unavailable"));
      return;
    }
    setDone(true);
    setNotMe(null);
    daenerys.reload();
  };

  return (
    <Group
      id="activity"
      status={activity.status}
      title={t("security.activity.title")}
      aside={
        entries.length > 6 && (
          <button type="button" className="hover:underline" onClick={() => setExpanded((v) => !v)}>
            {expanded ? t("security.activity.less") : t("security.activity.all", { count: entries.length })}
          </button>
        )
      }
    >
      {activity.status === "loading" && <RowSkeleton rows={2} />}
      {(activity.status === "unauthorized" || activity.status === "unavailable" || activity.status === "missing") && (
        <DaenerysNotice
          daenerys={daenerys}
          status={activity.status}
          failure={activity.failure}
          message={activity.message}
          onRetry={activity.reload}
        />
      )}
      {activity.status === "ready" && entries.length === 0 && <Note tone="info">{t("security.activity.empty")}</Note>}
      {done && (
        <Note tone="warn">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex-1">{t("security.activity.notMeDone")}</span>
            <RowButton tone="primary" onClick={onChangePassword}>
              {t("security.password.change")}
            </RowButton>
          </div>
        </Note>
      )}
      {shown.map((entry, index) => (
        <div key={`${entry.at}-${index}`} className="flex flex-col gap-1.5">
          <Row
            icon={
              <RowIcon tone={entry.action === "login" && !entry.self ? "warn" : "soft"}>
                {entry.action === "login" ? (
                  <ArrowRightStartOnRectangleIcon />
                ) : entry.action.startsWith("api_key") ? (
                  <KeyIcon />
                ) : (
                  <ClockIcon />
                )}
              </RowIcon>
            }
            title={actionLabel(entry)}
            subtitle={dots(formatWhen(entry.at, locale), describeDevice(entry.device), entry.city, entry.ip)}
            data-testid="activity-entry"
            trailing={
              entry.action === "login" && !done ? (
                <RowButton onClick={() => setNotMe(entry)} disabled={notMe === entry} data-testid="not-me">
                  {t("security.activity.notMe")}
                </RowButton>
              ) : undefined
            }
          />
          {notMe === entry && (
            <Confirm
              question={t("security.activity.notMeConfirm")}
              yes={t("security.activity.notMeYes")}
              no={t("common.cancel")}
              busy={busy}
              onNo={() => setNotMe(null)}
              onYes={itWasNotMe}
            />
          )}
        </div>
      ))}
      {error && <Note tone="error">{error}</Note>}
    </Group>
  );
}
