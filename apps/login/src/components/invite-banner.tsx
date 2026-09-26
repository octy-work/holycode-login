import { Avatar } from "@/components/avatar";
import { Translated } from "@/components/translated";

export type InviteContext = {
  inviter?: string;
  organization?: string;
  role?: string;
  validUntil?: string;
};

/**
 * Invitation context on the register screen ("Rodion invites you to OGGO · role: member ·
 * link valid until …"). The data comes from Daenerys (`previewInviteToken`); until that
 * integration lands the values are read from optional query parameters:
 *   hc_inviter, hc_org, hc_role, hc_until
 * so the layout can be exercised end-to-end.
 */
export function inviteContextFromSearchParams(
  sp?: Record<string | number | symbol, string | undefined>,
): InviteContext | null {
  if (!sp) return null;
  const inviter = sp.hc_inviter;
  const organization = sp.hc_org;
  if (!inviter && !organization) return null;
  return { inviter, organization, role: sp.hc_role, validUntil: sp.hc_until };
}

export function InviteBanner({ invite }: { invite: InviteContext }) {
  const who = invite.inviter ?? "";
  return (
    <div
      className="bg-hc-soft border-hc-p500/35 flex items-center gap-3 rounded-[14px] border px-3.5 py-3 text-left"
      data-testid="invite-banner"
    >
      <Avatar size="base" name={who} loginName={who || (invite.organization ?? "")} />
      <div className="min-w-0">
        <div className="text-hc-text text-[14px] leading-tight font-semibold">
          <Translated
            i18nKey="invite.title"
            namespace="register"
            data={{ inviter: invite.inviter ?? "", organization: invite.organization ?? "" }}
          />
        </div>
        {(invite.role || invite.validUntil) && (
          <div className="text-hc-muted mt-0.5 text-[12.5px]">
            {invite.role && <Translated i18nKey="invite.role" namespace="register" data={{ role: invite.role }} />}
            {invite.role && invite.validUntil && <span aria-hidden="true"> · </span>}
            {invite.validUntil && (
              <Translated i18nKey="invite.validUntil" namespace="register" data={{ date: invite.validUntil }} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
