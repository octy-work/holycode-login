import { Avatar } from "@/components/avatar";
import Link from "next/link";
import { Translated } from "./translated";

type Props = {
  loginName?: string;
  displayName?: string;
  showDropdown: boolean;
  searchParams?: Record<string | number | symbol, string | undefined>;
};

/**
 * "Who is signing in" block: avatar, display name, login name and — when the user may
 * switch — a "not you?" link to the account chooser (this is the "Back" of the design).
 */
export function UserAvatar({ loginName, displayName, showDropdown, searchParams }: Props) {
  const params = new URLSearchParams({});

  if (searchParams?.sessionId) {
    params.set("sessionId", searchParams.sessionId);
  }

  if (searchParams?.organization) {
    params.set("organization", searchParams.organization);
  }

  if (searchParams?.requestId) {
    params.set("requestId", searchParams.requestId);
  }

  if (searchParams?.loginName) {
    params.set("loginName", searchParams.loginName);
  }

  const name = displayName && displayName !== loginName ? displayName : undefined;

  return (
    <div className="flex items-center gap-3 text-left" data-testid="user-avatar">
      <Avatar size="base" name={name ?? loginName ?? ""} loginName={loginName ?? ""} />
      <div className="min-w-0 flex-1">
        <div className="text-hc-text truncate text-[15px] leading-tight font-semibold">{name ?? loginName}</div>
        <div className="text-hc-muted mt-0.5 truncate text-[12.5px]">
          {name && <span>{loginName}</span>}
          {name && showDropdown && <span aria-hidden="true"> · </span>}
          {showDropdown && (
            <Link href={"/accounts?" + params} className="text-hc-link hover:underline" data-testid="switch-account">
              <Translated i18nKey="notYou" namespace="common" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
