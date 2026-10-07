// Вне cookies.ts: тот модуль — «use server», там можно экспортировать только
// асинхронные функции (next build падает на обычной функции и константе).

/** Потолок срока cookie сессий: сессия всё равно живёт не дольше, чем решит Zitadel. */
export const MAX_SESSIONS_COOKIE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Срок cookie сессий — по самой поздней сессии внутри (её срок задаёт Zitadel:
 * passwordCheckLifetime, по умолчанию 10 дней), не дольше 30 дней; сессия без
 * срока — потолок. Апстрим ставил cookie без срока, то есть сессионной: окно
 * HolyAgent (WKWebView) стирает такие при каждом выходе из программы, и вход
 * в HolyCode, Daenerys и админку просил пароль после каждого обновления
 * (владелец, 07.10.2026). Пустой список — без срока, как раньше.
 */
export function sessionsCookieExpiry(sessions: { expirationTs?: string }[], now: number = Date.now()): Date | undefined {
  if (!sessions.length) return undefined;
  const cap = now + MAX_SESSIONS_COOKIE_MS;
  let latest = 0;
  for (const session of sessions) {
    const expires = Number(session.expirationTs);
    latest = Math.max(latest, Number.isFinite(expires) && expires > 0 ? expires : cap);
  }
  if (latest <= now) return undefined;
  return new Date(Math.min(latest, cap));
}
