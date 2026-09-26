# HolyCode Login — форк Login V2

Этот репозиторий (`octy-work/holycode-login`, ветка `holycode`) — форк
`zitadel/zitadel`, в котором изменён только `apps/login` (Next.js-приложение
Login V2). Логика потоков — session API, passkey, OTP, IdP, device flow,
регистрация, MFA — апстримная; переделаны тема, компоненты и раскладка под
дизайн HolyCode (26.09.2026). Тексты по-прежнему приходят из
`hosted_login_translation` инстанса; новые ключи (ниже) лежат в
`locales/{ru,en}.json` как значения по умолчанию и тоже переопределяются.

## Токены

`src/styles/globals.scss` — CSS-переменные `--hc-*` (светлая тема в `:root`,
тёмная в `.dark`), `tailwind.config.mjs` — цвета `hc-*` поверх них.

| Токен | Тёмная | Светлая |
| --- | --- | --- |
| фон страницы | `#0a0a1a` + фиолетовое свечение | `#f6f4ff` |
| карточка / рамка | `#151525` / `#2a2a45`, r=20 | `#fff` / `#e2e8f0` |
| текст / вторичный / приглушённый | `#f6f4ff` / `#b4b0cc` / `#8494ab` | `#1e1b3a` / `#475569` / `#64748b` |
| поле | `#101020`, рамка `#2f2f4a`, h=44, r=12 | `#fff`, рамка `#cbd5e1` |
| акцент | кнопка — градиент `#7c3aed → #8b5cf6`, ссылки `#a78bfa` | ссылки `#6d28d9` |
| ошибка | `#f87171` | `#dc2626` |

Шрифт — Inter (`next/font/google`, latin + cyrillic). Знак в шапке —
эмблема сайта (`src/components/brand-mark.tsx`, inline SVG) + слово HolyCode с
градиентом на «Holy».

## Компоненты

- `dynamic-theme.tsx` — каркас: одна карточка 420px, шапка (знак + язык),
  подвал (язык на телефоне / ссылки «Помощь · Конфиденциальность» + переключатель
  темы). Раскладка side-by-side апстрима не поддерживается.
- `button.tsx` — `Primary` (градиент, на всю ширину), `Secondary` (контур),
  `Ghost` (тихая ссылка: «Назад», «Войти по паролю»).
- `input.tsx` — поле 44px, кольцо фокуса, глазок у пароля, `inputClassName`
  для кода устройства.
- `code-input.tsx` — шесть ячеек кода поверх одного настоящего `<input>`
  (автозаполнение one-time-code, вставка целиком).
- `option-card.tsx` — карточка-вариант (способы входа, аккаунты, выбор почты).
- `sign-in-with-idp.tsx` + `idps/` — ряд «или войти через»: иконки-плитки;
  встроенные провайдеры по типу, generic OAuth/OIDC/JWT — по имени
  (`Yandex`, `Telegram`, `VK` → свои иконки, иначе первая буква).
- `form-actions.tsx` — низ формы: основная кнопка, под ней вторичные ссылки.
- `invite-banner.tsx` — плашка приглашения на регистрации; данные пока из
  query `hc_inviter`, `hc_org`, `hc_role`, `hc_until` (место под Daenerys).
- `register-form.tsx` — выбор почты «завести у нас / своя», включается
  переменной `HC_MAIL_DOMAINS`; согласие с условиями — текстом, не чекбоксами.

## Переменные окружения (сверх апстримных)

| Переменная | Что делает |
| --- | --- |
| `UI_LANGUAGES=ru,en` | какие языки показывать в переключателе (порядок как в списке) |
| `HC_MAIL_DOMAINS=oggo.app` | домены для «Завести почту в …» на регистрации; пусто — обычное поле e-mail |
| `NEXT_PUBLIC_BRAND_WORDMARK=Holy\|Code` | текст знака; часть до `\|` с градиентом; пустая строка — логотип из label policy (сборочная) |
| `CUSTOM_REQUEST_HEADERS=x-zitadel-instance-host:id.holycode.org,x-zitadel-public-host:id.holycode.org` | только для локального запуска против удалённого инстанса |

## Локальный запуск

```bash
pnpm install --filter "@zitadel/login..." --frozen-lockfile
pnpm nx run @zitadel/proto:generate && pnpm nx run @zitadel/client:build
# apps/login/.env.local: ZITADEL_API_URL, ZITADEL_SERVICE_USER_TOKEN, NEXT_PUBLIC_BASE_PATH=/ui/v2/login,
#   CUSTOM_REQUEST_HEADERS (см. выше), UI_LANGUAGES, HC_MAIL_DOMAINS
cd apps/login && pnpm exec next dev -H 127.0.0.1 -p 3011
```

## Сборка образа

```bash
pnpm nx run @zitadel/login:build            # .next/standalone
docker buildx build --platform linux/amd64 -f apps/login/Dockerfile \
  -t reg.oggo.app/holycode/login:<YYYYMMDD-sha8> --push apps/login
```

В compose почтового контура (`/opt/mail` на rumail) образ подставляется в
`image:` сервиса `zitadel-login`; переменные `UI_LANGUAGES`, `HC_MAIL_DOMAINS`
задаются там же.

## Обновление апстрима

```bash
git fetch upstream tag vX.Y.Z --no-tags
git checkout holycode && git merge vX.Y.Z      # конфликты — только в apps/login
pnpm nx run @zitadel/login:test-unit
```

Тег апстрима должен совпадать с версией `zitadel-api` на сервере: Login V2
и API ходят по одной версии proto.
