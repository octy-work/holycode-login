import { Duration, Timestamp, timestampDate } from "@zitadel/client";
import { Session } from "@zitadel/proto/zitadel/session/v2/session_pb";

// Первый фактор сессии ещё действует по сроку политики: пароль —
// passwordCheckLifetime, провайдер — externalLoginCheckLifetime (HolyCode).
// Отдельный модуль: из файла "use server" можно экспортировать только async.
export function firstFactorStillValid(
  session: Session,
  loginSettings?: { passwordCheckLifetime?: Duration; externalLoginCheckLifetime?: Duration },
) {
  const within = (verifiedAt: Timestamp | undefined, lifetime?: Duration) => {
    if (!verifiedAt || !lifetime || !lifetime.seconds) return false;
    const checkedAt = timestampDate(verifiedAt).getTime();
    return Date.now() - checkedAt < Number(lifetime.seconds) * 1000;
  };
  return (
    within(session.factors?.password?.verifiedAt, loginSettings?.passwordCheckLifetime) ||
    within(session.factors?.intent?.verifiedAt, loginSettings?.externalLoginCheckLifetime)
  );
}
