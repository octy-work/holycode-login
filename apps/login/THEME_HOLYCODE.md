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
  (автозаполнение one-time-code, вставка целиком — код вынимается и из фразы письма,
  буквы заглавными; код из ссылки письма рисуется в ячейках).
- `consent.tsx` + `/device`, `/device/consent` — вход на устройстве (HolyAgent, CLI) одним
  экраном: ссылка из приложения с `?user_code=` сразу ведёт к подтверждению (без формы);
  браузер уже вошёл в ID → «Разрешить вход» с этой сессией (`approveDeviceWithSession`),
  без пароля и списка разрешений; иначе «Войти и разрешить» — после входа `/signedin`
  завершает запрос сам. Код показан для сверки: без неё чужая ссылка с кодом впустила бы
  чужое устройство в аккаунт — поэтому одна кнопка остаётся (владелец 29.09 просил «сразу»).
- `lib/device-handoff.ts`, `/device-handoff`, `/me/enter?handoff=` — сессия ID для окна
  приложения после входа по коду (HolyAgent): одобрение в браузере запоминается, Daenerys
  своим свежим id_token клиента устройства получает одноразовую ссылку, окно приложения
  открывает её, берёт ту же сессию и возвращается (`return_to` — только agent/app.holycode.org
  и локальный 127.0.0.1). Без этого «Профиль» внутри HolyAgent снова просил войти.
- `option-card.tsx` — карточка-вариант (способы входа, аккаунты, выбор почты).
- `sign-in-with-idp.tsx` + `idps/` — ряд «или войти через»: иконки-плитки;
  встроенные провайдеры по типу, generic OAuth/OIDC/JWT — по имени
  (`Yandex`, `Telegram`, `VK` → свои иконки, иначе первая буква).
- `form-actions.tsx` — низ формы: основная кнопка, под ней вторичные ссылки.
- `sign-in-form.tsx`, `idp-sign-in-button.tsx`, `use-passkey-sign-in.ts` — экран входа
  (см. «Вход — один экран»).
- `invite-banner.tsx` — плашка приглашения на регистрации; данные пока из
  query `hc_inviter`, `hc_org`, `hc_role`, `hc_until` (место под Daenerys).
- `register-form.tsx` — выбор почты «завести у нас / своя», включается
  переменной `HC_MAIL_DOMAINS`; согласие с условиями — текстом, не чекбоксами.

## Вход — один экран (27.09.2026)

Решение владельца: логин → «аккаунт входит через Apple» → пароль — это бред; вход —
один экран. `/loginname` рисует `sign-in-form.tsx`:

- **Первый вход**: «Логин или e-mail», «Пароль · Забыли?», «Войти», «или» и плитки
  провайдеров из login policy, «Нет аккаунта? Создать».
- **С паролем** — server action `signIn` (`lib/server/sign-in.ts`): одна сессия с
  проверками user + password, дальше те же ветки, что у `/password`
  (`lib/server/password-continue.ts`, вынесено из `sendPassword` без изменений):
  смена пароля, подтверждение почты, второй фактор, завершение
  `requestId`/default redirect. Неверная пара и незнакомый логин при
  `ignoreUnknownUsernames` отвечают одинаково («Неверный логин или пароль»).
- **Без пароля** (или у аккаунта его нет) — прежний шаг логина `sendLoginname` с
  `preferPassword`: только провайдер → сразу к нему (экрана выбора нет); passkey →
  кнопка passkey на этом же экране; есть пароль → «Введите пароль» и фокус в поле.
  Ответ `/password?…` апстрима превращается в фокус на поле, а там, где он уходит
  редиректом (login_hint в `flow-initiation`, выбор аккаунта, повторный вход по
  истёкшей сессии в `oidc.ts`/`saml.ts`), — в `/loginname?…` с теми же параметрами
  (`lib/one-screen.ts`). Страница `/password` осталась только как запасной путь
  («Войти по паролю» со страницы passkey).
- **«С возвращением»**: cookie `hc_last_login` (HttpOnly, SameSite=Lax, Secure в
  проде, 180 дней, path `/`) — `{v,l: loginName, n: имя, m: способ, o: прошлые способы}`,
  способ `password` | `passkey` | `idp:<idpId>`. Пишется только сервером после
  успешного входа: пароль (`finishPasswordLogin`), IdP-колбэк
  (`createNewSessionFromIdpIntent`), passkey как первый фактор (`sendPasskey`).
  Экран: карточка «кто» и «Не я» (стирает cookie, пустая форма), первым — последний
  способ (поле пароля в фокусе / кнопка провайдера / кнопка passkey), остальные ниже.
  `login_hint` из запроса важнее cookie. Cookie — только подсказка интерфейса:
  ничему в потоке она не доверяет.
- **Passkey без логина невозможен в Zitadel v4.19**: `CreateWebAuthNChallenge`
  строит вызов по ключам пользователя сессии и без проверки user отвечает
  `Errors.User.UserIDMissing` (`internal/command/session_webauhtn.go`,
  `session.go`), так что discoverable credentials / conditional UI в поле почты
  не сделать без правки API. Кнопка passkey появляется, когда аккаунт известен:
  после ввода логина (если у него есть passkey) или на экране «С возвращением».
- Тексты — `loginname.signIn.*`, `loginname.returning.*` в `locales/{ru,en}.json`;
  перекрываются `hosted_login_translation` инстанса, как остальные.

## Профиль — `/me` (27.09.2026)

Решение владельца: профиль пользователя живёт на `id.holycode.org/me`, в том же
приложении, что и вход. Traefik почтового контура переписывает
`Host(id.holycode.org) && Path(/me…)` → `/ui/v2/login/me…`; страница работает под
обоими префиксами (`src/lib/profile.ts`: `resolveProfilePrefix` по заголовку
`x-replaced-path`, на клиенте — по адресной строке), ссылки между разделами — обычные
`<a href>` с короткими путями, чтобы `<Link>` не удлинял адрес basePath'ом.

- **Сессия.** `lib/server/profile-session.ts`: самая свежая сессия из cookie `sessions`
  Login V2, проверенная `isSessionValid` (первичный фактор + второй, если он есть у
  аккаунта). Без сессии → `/me/enter` (route handler): кладёт cookie `hc_return_to`
  и уводит на `/loginname`. Первым стоит **гейт в `proxy.ts`** (`lib/profile-gate.ts`):
  для GET/HEAD `/me*` он читает cookie, спрашивает Zitadel `GetSession` сырым
  Connect-JSON fetch (в proxy-runtime нет connect-node, как и у security-settings) и без
  живой сессии отвечает настоящим **303** на `/me/enter` — иначе `redirect()` страницы
  срабатывал бы за Suspense-границей layout'а и уходил как 200 со стримовым редиректом,
  которого curl и превью ссылок не видят. Сбой самого запроса к Zitadel гейт пропускает
  (решает страница), чтобы не выкидывать вошедшего на заминке; `resolveRedirectUri` (lib/client.ts) в конце любого
  потока — входа, passkey, второго фактора, смены пароля, привязки провайдера —
  возвращает на профиль, если cookie есть (`lib/server/return-to.ts`; значение —
  только сам профиль на этом хосте, 15 минут, HttpOnly).
- **Разделы** (`src/app/(login)/me/[[...section]]/page.tsx` → `components/profile/*`):
  Главная (карточка, «Защита аккаунта», сводка), Данные (имя и «как обращаться» —
  `UpdateHumanUser`, почта и её смена — `SetEmail` со ссылкой подтверждения,
  связанные аккаунты — `listIDPLinks`/`removeIDPLink` и привязка через
  `redirectToIdp` с sessionId, @логин, доступы, удаление профиля), Безопасность
  (пароль, passkey — `/passkey/set`, второй фактор — `/mfa/set`, провайдеры,
  устройства и сессии, активность, «Если забудете пароль», пароли приложений),
  Организации, Настройки (язык — `preferredLanguage`, тема — метаданные пользователя
  `holycode.theme` = light|dark|system). На телефоне (< 768 px) — нижняя панель (ниже).
- **Аватар** — только буква: assets API Zitadel принимает загрузку лишь как
  `/assets/v1/users/me/avatar` токеном самого пользователя, служебному пользователю
  чужой аватар не залить. Картинка из `profile.avatarUrl`, если она есть, показывается.
- **Daenerys** (`lib/daenerys.ts`, `components/profile/use-daenerys.ts`): организации,
  сессии сервисов с устройством, активность, ключи, создание организации и удаление
  профиля — из браузера напрямую по cookie `.holycode.org` (`credentials: include`,
  на 401 один `POST /api/auth/refresh`). Без cookie — один тихий вход
  `oidc/start?prompt=none&return_to=https://id.holycode.org/me` (отметка в
  sessionStorage), иначе блоки показываются как «недоступно», остальное работает.
  Контракт — `apps/daenerys-api/docs/profile-api.md` в репозитории holycode.
  Каждый вызов идёт с дедлайном 20 с (`withDeadline`): ответ, который не пришёл, отказ
  промиса или ответ, который нормализатор не смог прочитать, заканчиваются состоянием
  «недоступно» с причиной (таймаут / ответ не разобран / сеть) и строкой
  `[profile] daenerys/<блок>: …` в консоли — скелетон никогда не остаётся навсегда.
  Состояние видно и в DOM: `data-daenerys-status`/`data-daenerys-failure` на
  `[data-testid=profile-shell]`, `data-status` на `#sessions` и `#activity`.
  Короткий и длинный адреса для клиента равнозначны: от пути зависят только ссылки
  (`profilePrefixFromPathname`), не загрузка данных — `shell.test.tsx` проверяет оба.
  «Выйти везде» = `POST /api/auth/logout-all` + завершение сессий ID этого браузера
  (`signOutEverywhere`).
- **Переключатель сервисов** (28.09.2026, решения владельца о переходах между
  сервисами): в шапке профиля слева от знака — кнопка-сетка (девять точек), как в
  чате; меню — плитки HolyCode (чат), HolyBuild, HolyAgent, Панель (только если
  сервер её отдал — владельцам и админам), Профиль («вы здесь»), Почта; под плиткой
  `status.text` от сервера, иначе подсказка по ключу. Ниже — «Админка организации —
  домены · почта · люди» (владельцам и админам, → `HC_PROFILE_ADMIN_URL` с той же
  организацией) и «Тема и язык — из профиля ID» (→ `/me/settings`, справа «тёмная ·
  RU»). Список — Daenerys `GET /api/services` тем же клиентом (cookie, один refresh на
  401; контракт — `apps/daenerys-api/docs/services-api.md` в репозитории holycode);
  без сессии или при ошибке — запасной список из `HC_PROFILE_SERVICES` или прод-адреса
  без панели, организация для ссылок — из `/api/auth/me`, если он ответил. Ссылка
  плитки — `url?org=<account_id>&return_to=<адрес профиля>` (`lib/services.ts`,
  логика 1:1 с `apps/holychat-web/src/switcher/href.js` чата). На телефоне (< 768 px)
  сетки нет — сервисы в листе нижней панели. Разметка и SVG-значки — из `switcher/` чата на токенах `hc-*`
  (`service-switcher.tsx`); тексты — `profile.switcher.*`. Состояние в DOM:
  `data-services-source=server|fallback` на `[data-testid=profile-shell]`.
- **Общая верхняя полоса** (02.10.2026, решение владельца «вариант A — одна полоса во всех
  сервисах HolyCode»; `top-bar.tsx`, вид — `.hcs-bar` чата на токенах `hc-*`): 52 px во всю
  ширину, `fixed` сверху (корневой layout держит контент в 1100 px — полоса из него выходит
  фиксацией, под ней в оболочке распорка той же высоты). Слева — сетка (с 768 px), знак и
  «Профиль» + «ID», «← Назад в …» по `return_to` (только домен платформы и поддомены, не свой
  origin; `backToService` в `lib/services.ts`; параметр снимается с адреса и живёт в
  sessionStorage вкладки — разделы профиля открываются полной загрузкой, а ссылки плиток
  не вкладывают прежний `return_to`). Справа — облако HolyAgent и аватар с меню. На телефоне
  полоса 48 px + safe-area: знак, имя, аватар.
- **Боковое меню** (02.10.2026, решение владельца «как в HolyAgent и Daenerys»; `sidebar.tsx`):
  у левого края во всю высоту под полосой, а не карточкой рядом с контентом. С 768 px оболочка
  `[data-testid=profile-shell]` — `fixed` от 52 px до низа окна (корневой layout держит детей в
  центрированной колонке 1100 px, меню из неё выходит так же, как полоса), внутри меню 240 px и
  справа контент со своей прокруткой, колонка до 980 px по центру правой области. Свернуть в иконки
  (64 px) — «‹‹» внизу меню, выбор в `localStorage` `holycode-profile-nav-collapsed` (`1`/`0`, как
  `holybuild-nav-collapsed`); сервер рисует развёрнутым, браузер применяет выбор после монтирования,
  анимация ширины включается только после этого. Фон и правая граница — как у `.app-sidebar`
  Daenerys; пункт `.hc-sidenav-item` в `globals.scss` — числа `.sidebar-tab` HolyAgent/Daenerys
  (`.hcs-nav-item` в `switcher.css` монорепо): активный — заливка с рамкой, **без боковой полоски**
  (прежняя `shadow-[inset_2px_0_0_…]` убрана); светлая тема — свои значения, тёмная — под `.dark`.
  На телефоне меню нет — нижняя панель.
- **Меню аватара** (`account-menu.tsx`, пункты и порядок — `lib/account-menu.ts`, как
  `switcher/account.js` монорепо): шапка (имя, @логин · почта) → обновление HolyAgent (внутри
  десктопа) → Профиль, Вход и безопасность (плашка «нет 2FA»/«нет Touch ID»), Ключи доступа →
  Язык (RU · EN) → Все настройки → «Скачать HolyAgent» (браузер) → Сменить пользователя
  (`/accounts`) → Выйти (`/logout`). Тексты — `profile.account.*`, `profile.topbar.*`.
- **HolyAgent** (`lib/holyagent-release.ts` — порт 1:1 `switcher/holyagentRelease.js`):
  последний релиз — `GET <Daenerys API>/api/releases/public?app_id=com.holyagent.desktop&latest_only=1`
  без cookie (origin `NEXT_PUBLIC_DAENERYS_API_URL` уже в CSP `connect-src`; чат ходит на
  daenerys.<домен>, профилю это потребовало бы правки CSP). В браузере — «Скачать HolyAgent
  X.Y.Z» (DMG). Внутри окна HolyAgent (мост Tauri: `__HOLYAGENT_DESKTOP__` / `__TAURI__.core` /
  `__TAURI_INTERNALS__`) и релиз новее оболочки (`desktop_get_app_version`) — облако в полосе,
  жёлтая точка на аватаре и «Обновление HolyAgent X.Y.Z» первым пунктом; установка —
  `desktop_install_update {url: .app.zip, version}` и опрос `desktop_get_update_status`.
  Плитки и «Назад» внутри окна открываются вкладкой HolyAgent (`desktop_open_service`,
  `lib/topbar.ts`). В CSP `connect-src` добавлены `ipc: http://ipc.localhost` — IPC Tauri.
- **Нижняя панель на телефоне** (28.09.2026, решение владельца: во всех сервисах HolyCode
  одна панель; `mobile-nav.tsx`, вёрстка и числа — как `switcher/mobile-nav.*` в
  монорепо, на токенах `hc-*`). Брейкпоинт 768 px, на десктопе ничего не меняется.
  56 px + `env(safe-area-inset-bottom)` (в `app/(login)/layout.tsx` —
  `viewport-fit=cover`, без него iOS отдаёт отступ 0). Пять мест: Главная · Данные ·
  Защита · Команды (`MOBILE_NAV_SECTIONS` в `lib/profile.ts`) и справа «Сервисы» —
  сетка из 9 точек. Прячется только при открытой клавиатуре (`use-keyboard-open.ts`:
  `visualViewport` ниже окна на max(150 px, 18 %), при прокрутке — нет). «Сервисы»
  открывает лист снизу: плитки справочника (Профиль — «вы здесь», под остальными
  `status.text`), «Админка» владельцам и админам, «Ещё в Профиле» — Настройки
  (`MOBILE_MORE_SECTIONS`; «Выйти везде» остаётся на «Безопасности»), аккаунт →
  «Данные», организация → «Команды», «Сменить пользователя». Открыт раздел из «Ещё» —
  на «Сервисах» точка. Лист закрывается свайпом вниз (72 px или рывком), тапом мимо,
  Esc, ручкой и «назад»: при открытии кладёт свою запись в историю
  (`history.state.hcServicesSheet`), ссылка из листа уходит `location.replace`, чтобы
  «назад» со следующей страницы вёл в профиль, а не в лист. Тексты —
  `profile.mobileNav.*` и `profile.nav.short.*`.
- Тексты — `profile.*` в `locales/{ru,en}.json`, перекрываются `hosted_login_translation`.

## Переменные окружения (сверх апстримных)

| Переменная | Что делает |
| --- | --- |
| `UI_LANGUAGES=ru,en` | какие языки показывать в переключателе (порядок как в списке) |
| `HC_MAIL_DOMAINS=oggo.app` | домены для «Завести почту в …» на регистрации; пусто — обычное поле e-mail |
| `HC_BRAND_WORDMARK=Holy\|Code` | бренд контейнера (рантайм, `src/lib/brand.ts`): текст знака, часть до `\|` с градиентом. Пустая строка — режим организации: логотип, акцентный цвет и значок вкладки из label policy инстанса. Не задан — `NEXT_PUBLIC_BRAND_WORDMARK`, затем `Holy\|Code` |
| `NEXT_PUBLIC_BRAND_WORDMARK=Holy\|Code` | то же на этапе сборки (запасное значение, если `HC_BRAND_WORDMARK` не задан) |
| `CUSTOM_REQUEST_HEADERS=x-zitadel-instance-host:id.holycode.org,x-zitadel-public-host:id.holycode.org` | только для локального запуска против удалённого инстанса |
| `NEXT_PUBLIC_DAENERYS_API_URL` | адрес Daenerys для профиля (сборочная); пусто — `https://daenerys-api.holycode.org` |
| `HC_PROFILE_SERVICES=chat\|HolyCode\|https://chat.holycode.org,build\|HolyBuild\|https://build.holycode.org,…` | запасной список переключателя сервисов, пока Daenerys не ответил `GET /api/services`: `key\|Имя\|url[\|icon[\|kind]]` через запятую, либо JSON-массив как у `DAENERYS_SERVICES`; старая форма `Имя\|url` тоже читается (ключ — по хосту: `chat.` → chat, `id.` → profile). Пусто — прод-адреса без панели |
| `HC_PROFILE_ADMIN_URL`, `HC_PROFILE_MAIL_ADMIN_URL`, `HC_PROFILE_KEYS_URL` | кабинет организации и пароли приложений (по умолчанию — app.holycode.org/admin, /admin/mail); ключи доступа — пусто = свой раздел профиля `/me/keys` (28.09.2026: раньше вёл в настройки чата, а чат с профилем ID шлёт обратно — круг) |

## Вход организаций — `id.octy.ru` и другие (29.09.2026)

Вход организации — отдельный виртуальный инстанс того же Zitadel (кабинет HolyCode →
«Безопасность → Вход», код в монорепо `apps/daenerys-api/src/org-admin/signin.js`). Его
хосты обслуживает сервис `zitadel-login-orgs` в compose почтового контура на rumail
(`ZITADEL_ORG_HOSTS_RULE`). До 29.09.2026 там стоял апстримный Login V2, поэтому
`id.octy.ru` показывал стандартную форму Zitadel, а не нашу.

Тот же образ форка обслуживает и организации: бренд теперь выбирается при запуске, а не при
сборке. Для `zitadel-login-orgs`:

| Переменная | Значение |
| --- | --- |
| `image` | тот же `reg.oggo.app/holycode/login:<тег>`, что у `zitadel-login` |
| `HC_BRAND_WORDMARK` | пустая строка — режим организации |
| `HC_TOTP_ISSUER` | имя организации для приложения-аутентификатора, например `Octy` (пусто — issuer Zitadel) |
| `HC_MAIL_DOMAINS` | пусто: «Завести почту у нас» на регистрации — только HolyCode |
| `UI_LANGUAGES` | как у `zitadel-login` |

В режиме организации (`HC_BRAND_WORDMARK=""`):

- **знак** в карточке — логотип из label policy инстанса (светлый и тёмный; есть только один —
  он для обеих тем), высота 36 px, ширина по логотипу;
- **акцент** — основной цвет label policy: кнопка, ссылки, фокус, выделение и свечение фона
  (`tenantAccentCss` в `src/lib/brand.ts`, `<style>` рисуется вместе со страницей, без
  мигания). Текст на кнопке тёмный, если цвет светлый (лайм Octy), ссылки на белом —
  темнее акцента;
- **значок вкладки** и значок приложения на согласии устройства — `iconUrl` label policy;
- тексты — из `hosted_login_translation` инстанса, как и раньше; раскладка, поля и потоки —
  те же, что у HolyCode ID.

Профиль `/me` на хостах организаций не открывается: Traefik переписывает `/me` только для
`id.holycode.org`.

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

## Ключи доступа — раздел `/me/keys` (28.09.2026)

Владелец: ссылка «Ключи доступа (API)» из карточки пользователя и «Доступ к
данным · Открыть» вели по кругу (профиль → настройки чата → профиль), выпустить
персональный ключ было негде. Теперь это раздел профиля (`keys` в
`PROFILE_SECTIONS`, на телефоне — в «Ещё»): список ключей Daenerys
(`GET /api/auth/api-keys`), выпуск (`POST`, название и срок 30/90/365/бессрочно,
токен показывается один раз) и отзыв (`DELETE`). Daenerys выпускает ключ только
после свежего входа в ID (≤ 10 минут): на `403 reauth_required, reauth: "id"`
профиль сохраняет черновик во вкладке (`hc_profile_key_draft`), ведёт через
Daenerys `oidc/start?prompt=login` и, вернувшись на `/me/keys`, выпускает ключ сам.
Карточка пользователя во всех сервисах (holycode `switcher/account.js`) ведёт
сюда путём `/me/keys`, «Вход и безопасность» — `/me/security` (якоря `#…`
профиль не понимает).

