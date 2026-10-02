// @ts-nocheck — копия общего модуля holycode (apps/holychat-web/src/switcher/debugSnapshot.js), правка там.
// Сквозной отладочный снимок HolyCode (решение владельца 02.10.2026: «снапшот —
// в профиль, а не кнопкой в меню агента; один снимок на каждом продукте, чтобы
// оперативно собирать данные»).
//
// Пункт «Отладочный снимок» в меню профиля (account.js, id debugSnapshot) есть
// в каждом сервисе, который позвал configureDebugSnapshot(). Клик собирает:
//   • сервис и версию (release-NNN-sha), адрес и раздел, пользователя и
//     организацию;
//   • скриншот видимой области: в оболочке HolyAgent — нативный снимок окна,
//     в браузере — DOM через SVG foreignObject; поля data-private и пароли
//     перед этим прячутся и в снимок не попадают;
//   • последние ошибки консоли, необработанные исключения и неуспешные
//     запросы (кольцевые буферы, перехват ставит installDebugCapture);
//   • состояние, которое сервис сам считает важным (registerDebugState и
//     collect в конфиге — у HolyAgent его прежний богатый снимок).
// Отчёт уходит в POST /api/debug-reports Daenerys с сессией пользователя;
// в ответ — номер (dbg_…), карточка показывает его и ссылку на просмотр в
// Daenerys (раздел «Отладочные снимки», #/debug-reports/<номер>).
//
// Без разметки фреймворка: карточка — свой DOM со своими стилями, поэтому один
// и тот же файл работает в React-панелях, JSX чата, TSX HolyBuild и DOM почты.
// Файл байт в байт во всех копиях: правка здесь (apps/holychat-web/src/switcher),
// разнести `node scripts/check-switcher-sync.mjs --fix`; почта и профиль ID —
// копией руками (они вне сверки).

// Копия в форке профиля ID: домен — holycode.org (форк обслуживает только
// id.holycode.org); адрес приёма хост передаёт сам (endpoint).
const platformUrl = (sub, path = '/') => `https://${sub}.holycode.org${path}`

export const DEBUG_REPORTS_PATH = '/api/debug-reports'
// Daenerys отдаёт CORS '*' с Authorization: любой сервис шлёт сюда с Bearer.
export const DEBUG_REPORTS_URL = platformUrl('daenerys', DEBUG_REPORTS_PATH)
export const DEBUG_REPORT_VIEW_BASE = platformUrl('daenerys', '/#/debug-reports/')
export const DEBUG_LOG_LIMIT = 40
export const DEBUG_TEXT_LIMIT = 600
export const DEBUG_STACK_LIMIT = 1500
// Картинка больше — перекодируется в JPEG: сервер принимает тело до 24 МБ, но
// мобильная сеть и место на диске дороже лишних мегабайт PNG.
export const SCREENSHOT_SOFT_LIMIT = 5 * 1024 * 1024
export const SNAPSHOT_SKIP_ATTR = 'data-hc-snapshot-skip'
// Экраны с полями data-private (ключ OGGO в HolyAgent) по этому событию снова
// прячут значение — сбрасывают «Показать».
export const PRIVATE_INPUTS_CONCEAL_EVENT = 'holycode:conceal-private-inputs'

const GLOBAL_KEY = '__holycodeDebugSnapshot'
const SECRET_PARAM_RE = /(token|code|key|secret|pass|auth|session|state|sig|jwt|otp|pin)/i

const RU = {
  menu: 'Отладочный снимок',
  capturing: 'Снимаю экран и состояние…',
  sending: 'Отправляю в Daenerys…',
  doneTitle: 'Снимок сохранён',
  doneBody: 'Назовите номер агенту — по нему откроют экран, ошибки и состояние.',
  copy: 'Скопировать номер',
  copied: 'Скопировано',
  open: 'Открыть',
  close: 'Закрыть',
  retry: 'Ещё раз',
  errorTitle: 'Снимок не сохранился',
  signIn: 'Нужно войти в HolyCode — без входа снимок некому отправить.',
  noImage: 'Без картинки: {reason}',
  tooBig: 'Картинка оказалась слишком большой — отчёт ушёл без неё.',
  copyLine: 'Отладочный снимок {id}',
}

const EN = {
  menu: 'Debug snapshot',
  capturing: 'Capturing the screen and state…',
  sending: 'Sending to Daenerys…',
  doneTitle: 'Snapshot saved',
  doneBody: 'Give this number to the agent — it opens the screen, errors and state.',
  copy: 'Copy number',
  copied: 'Copied',
  open: 'Open',
  close: 'Close',
  retry: 'Try again',
  errorTitle: 'Snapshot was not saved',
  signIn: 'Sign in to HolyCode first — there is nobody to send the snapshot to.',
  noImage: 'No picture: {reason}',
  tooBig: 'The picture was too large — the report went without it.',
  copyLine: 'Debug snapshot {id}',
}

export const DEBUG_SNAPSHOT_TEXT = Object.freeze({ ru: Object.freeze(RU), en: Object.freeze(EN) })

export function debugSnapshotText(lang) {
  return lang === 'ru' ? RU : EN
}

function fill(template, values = {}) {
  return String(template || '').replace(/\{(\w+)\}/g, (match, key) => (values[key] == null ? match : String(values[key])))
}

// ---------- чистые функции (node:test зовёт их как есть) ----------

export function clipText(value, limit = DEBUG_TEXT_LIMIT) {
  const text = String(value ?? '')
  return text.length > limit ? `${text.slice(0, limit)}… (+${text.length - limit})` : text
}

// Токены в тексте ошибок и адресах: Bearer …, JWT (три base64url-части).
export function redactSecrets(value) {
  return String(value ?? '')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, '$1…')
    .replace(/\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g, 'jwt…')
    .replace(/\b(dgit|hcak|sk|pk)_[A-Za-z0-9_-]{12,}\b/g, '$1_…')
    .replace(/("(?:access_|refresh_)?token"|"accessToken"|"refreshToken"|"password"|"secret"|"api_?key")\s*:\s*"[^"]*"/gi, '$1:"…"')
}

// Адрес без секретов: значения похожих на токен параметров — «…», без
// #фрагмента (там бывают токены входа) и без user:pass@.
export function sanitizeUrl(raw, base = '') {
  const text = String(raw ?? '').trim()
  if (!text) return ''
  let url
  try {
    url = base ? new URL(text, base) : new URL(text)
  } catch (_) {
    return clipText(redactSecrets(text.split('#')[0]), 300)
  }
  url.username = ''
  url.password = ''
  url.hash = ''
  for (const key of [...url.searchParams.keys()]) {
    if (SECRET_PARAM_RE.test(key)) url.searchParams.set(key, '…')
  }
  const sameOrigin = base && (() => {
    try { return new URL(base).origin === url.origin } catch (_) { return false }
  })()
  const out = sameOrigin ? `${url.pathname}${url.search}` : url.toString()
  return clipText(redactSecrets(out), 300)
}

// Аргумент console.error → строка: Error — сообщение и стек, объект — JSON.
export function describeValue(value) {
  if (value instanceof Error || (value && typeof value === 'object' && typeof value.message === 'string' && typeof value.stack === 'string')) {
    return redactSecrets(`${value.name || 'Error'}: ${value.message}`)
  }
  if (typeof value === 'string') return redactSecrets(value)
  if (value === undefined) return 'undefined'
  try {
    return redactSecrets(JSON.stringify(value))
  } catch (_) {
    return redactSecrets(String(value))
  }
}

export function createRingBuffer(limit = DEBUG_LOG_LIMIT) {
  const items = []
  let dropped = 0
  return {
    push(item) {
      items.push(item)
      if (items.length > limit) {
        items.splice(0, items.length - limit)
        dropped += 1
      }
    },
    list() {
      return items.slice()
    },
    dropped() {
      return dropped
    },
    clear() {
      items.length = 0
      dropped = 0
    },
  }
}

function nowIso() {
  return new Date().toISOString()
}

function scopeOf(scope) {
  if (scope) return scope
  return typeof window !== 'undefined' ? window : globalThis
}

function hubOf(scope) {
  const target = scopeOf(scope)
  if (!target[GLOBAL_KEY]) {
    target[GLOBAL_KEY] = {
      config: {},
      providers: new Map(),
      log: { console: createRingBuffer(), errors: createRingBuffer(), network: createRingBuffer() },
      installed: false,
      busy: false,
      dialog: null,
    }
  }
  return target[GLOBAL_KEY]
}

// ---------- перехват ошибок ----------

function isOwnReportUrl(url) {
  return /\/api\/(agents\/[^/]+\/)?debug-reports(\?|$)|\/api\/debug\/snapshot(\?|$)/.test(String(url || ''))
}

/**
 * Ставит перехват один раз на страницу: console.error/warn, window error,
 * unhandledrejection, неуспешные fetch и XMLHttpRequest. Исходное поведение не
 * меняется — только запись в кольцевые буферы по DEBUG_LOG_LIMIT записей.
 */
export function installDebugCapture(scope) {
  const target = scopeOf(scope)
  const hub = hubOf(target)
  if (hub.installed) return hub
  hub.installed = true
  const origin = (() => {
    try { return String(target.location?.href || '') } catch (_) { return '' }
  })()

  const consoleRef = target.console
  if (consoleRef) {
    for (const level of ['error', 'warn']) {
      const original = consoleRef[level]
      if (typeof original !== 'function') continue
      consoleRef[level] = function patchedConsole(...args) {
        try {
          hub.log.console.push({ at: nowIso(), level, message: clipText(args.map(describeValue).join(' ')) })
        } catch (_) {
          // запись в буфер не должна ломать вывод
        }
        return original.apply(this, args)
      }
    }
  }

  if (typeof target.addEventListener === 'function') {
    target.addEventListener('error', (event) => {
      try {
        // Ошибка загрузки ресурса (img, script) — без message, с target.
        const element = event?.target && event.target !== target ? event.target : null
        if (element && element.tagName) {
          hub.log.errors.push({
            at: nowIso(),
            kind: 'resource',
            message: `${String(element.tagName).toLowerCase()} failed to load`,
            source: sanitizeUrl(element.src || element.href || '', origin),
          })
          return
        }
        hub.log.errors.push({
          at: nowIso(),
          kind: 'error',
          message: clipText(redactSecrets(event?.message || describeValue(event?.error))),
          source: sanitizeUrl(event?.filename || '', origin),
          line: Number(event?.lineno) || 0,
          column: Number(event?.colno) || 0,
          stack: clipText(redactSecrets(event?.error?.stack || ''), DEBUG_STACK_LIMIT),
        })
      } catch (_) {
        // без записи
      }
    }, true)
    target.addEventListener('unhandledrejection', (event) => {
      try {
        const reason = event?.reason
        hub.log.errors.push({
          at: nowIso(),
          kind: 'rejection',
          message: clipText(describeValue(reason)),
          stack: clipText(redactSecrets(reason?.stack || ''), DEBUG_STACK_LIMIT),
        })
      } catch (_) {
        // без записи
      }
    })
  }

  const pushNetwork = (entry) => {
    try {
      hub.log.network.push({ at: nowIso(), ...entry, url: sanitizeUrl(entry.url, origin) })
    } catch (_) {
      // без записи
    }
  }

  if (typeof target.fetch === 'function') {
    const originalFetch = target.fetch
    target.fetch = function patchedFetch(input, init) {
      const url = typeof input === 'string' ? input : (input && (input.url || input.href)) || String(input || '')
      const method = String(init?.method || (input && typeof input === 'object' && input.method) || 'GET').toUpperCase()
      const started = Date.now()
      const result = originalFetch.call(target, input, init)
      if (isOwnReportUrl(url) || !result || typeof result.then !== 'function') return result
      return result.then((response) => {
        if (response && !response.ok && response.type !== 'opaque') {
          pushNetwork({ kind: 'fetch', method, url, status: Number(response.status) || 0, ms: Date.now() - started })
        }
        return response
      }, (error) => {
        if (String(error?.name || '') !== 'AbortError') {
          pushNetwork({ kind: 'fetch', method, url, status: 0, error: clipText(describeValue(error), 200), ms: Date.now() - started })
        }
        throw error
      })
    }
  }

  const Xhr = target.XMLHttpRequest
  if (Xhr && Xhr.prototype && typeof Xhr.prototype.open === 'function') {
    const originalOpen = Xhr.prototype.open
    const originalSend = Xhr.prototype.send
    Xhr.prototype.open = function patchedOpen(method, url, ...rest) {
      this.__hcDebug = { method: String(method || 'GET').toUpperCase(), url: String(url || '') }
      return originalOpen.call(this, method, url, ...rest)
    }
    Xhr.prototype.send = function patchedSend(...args) {
      const info = this.__hcDebug
      if (info && !isOwnReportUrl(info.url) && typeof this.addEventListener === 'function') {
        const started = Date.now()
        this.addEventListener('loadend', () => {
          const status = Number(this.status) || 0
          if (status === 0 || status >= 400) pushNetwork({ kind: 'xhr', method: info.method, url: info.url, status, ms: Date.now() - started })
        })
      }
      return originalSend.apply(this, args)
    }
  }
  return hub
}

export function debugLogSnapshot(scope) {
  const hub = hubOf(scope)
  return {
    console: hub.log.console.list(),
    errors: hub.log.errors.list(),
    network: hub.log.network.list(),
    dropped: {
      console: hub.log.console.dropped(),
      errors: hub.log.errors.dropped(),
      network: hub.log.network.dropped(),
    },
  }
}

// ---------- настройка сервисом ----------

/**
 * Сервис включает снимок и говорит, что знает о себе. Поля — значения или
 * функции без аргументов (зовутся в момент снимка):
 *   service   — ключ: 'daenerys' | 'holyagent' | 'holycode' | 'holybuild' | 'mail' | 'id';
 *   name      — имя для людей; version — release-NNN-sha;
 *   lang      — 'ru' | 'en' для карточки;
 *   user      — { user_id, name, email }; org — { account_id, name, role };
 *   token     — сессия Daenerys (JWT); без него — запрос с cookie;
 *   state     — состояние сервиса (объект);
 *   endpoint  — куда слать (по умолчанию DEBUG_REPORTS_URL);
 *   canViewReports — показать ссылку «Открыть» (админам платформы);
 *   collect   — async () => поля отчёта сверху (HolyAgent: агент, ui_state…);
 *   capture   — async (target) => { dataUrl, warning } вместо общего снимка;
 *   send      — async (payload) => ответ сервера вместо общего POST.
 * Повторный вызов дополняет конфиг. Ставит перехват ошибок.
 */
export function configureDebugSnapshot(options = {}, scope) {
  const hub = installDebugCapture(scope)
  const next = options && typeof options === 'object' ? options : {}
  hub.config = { ...hub.config, ...next }
  return hub.config
}

export function debugSnapshotAvailable(scope) {
  try {
    const hub = hubOf(scope)
    return Boolean(hub.config && hub.config.service)
  } catch (_) {
    return false
  }
}

// Состояние раздела: registerDebugState('console', () => ({ … })) → функция снятия.
export function registerDebugState(name, provider, scope) {
  const hub = hubOf(scope)
  const key = String(name || '').trim()
  if (!key || typeof provider !== 'function') return () => {}
  hub.providers.set(key, provider)
  return () => {
    if (hub.providers.get(key) === provider) hub.providers.delete(key)
  }
}

async function resolveValue(value) {
  try {
    return typeof value === 'function' ? await value() : value
  } catch (error) {
    return { error: describeValue(error) }
  }
}

function plainJson(value, depth = 0) {
  // Безопасная копия: без функций и циклов, строки обрезаны, глубина ≤ 8.
  const seen = new WeakSet()
  const walk = (current, level) => {
    if (current === null || current === undefined) return current ?? null
    if (typeof current === 'string') return redactSecrets(clipText(current, 4000))
    if (typeof current === 'number' || typeof current === 'boolean') return current
    if (typeof current === 'bigint') return String(current)
    if (typeof current === 'function' || typeof current === 'symbol') return undefined
    if (current instanceof Error) return describeValue(current)
    if (typeof current !== 'object') return String(current)
    if (seen.has(current)) return '[Circular]'
    if (level >= 8) return '[…]'
    seen.add(current)
    if (Array.isArray(current)) return current.slice(0, 200).map((item) => walk(item, level + 1))
    const out = {}
    for (const [key, item] of Object.entries(current)) {
      if (/^(token|access_token|refresh_token|accessToken|refreshToken|password|secret|api_key|apiKey)$/i.test(key)) {
        out[key] = item ? '…' : item
        continue
      }
      const next = walk(item, level + 1)
      if (next !== undefined) out[key] = next
    }
    return out
  }
  return walk(value, depth)
}

function pickUser(user) {
  if (!user || typeof user !== 'object') return null
  const field = (...keys) => {
    for (const key of keys) {
      const value = String(user[key] ?? '').trim()
      if (value) return value
    }
    return ''
  }
  return {
    user_id: field('user_id', 'userId', 'id', 'username'),
    name: field('display_name', 'displayName', 'name', 'username'),
    email: field('email'),
  }
}

function pickOrg(org) {
  if (!org) return null
  if (typeof org === 'string') return { account_id: org, name: '' }
  if (typeof org !== 'object') return null
  return {
    account_id: String(org.account_id || org.accountId || org.id || '').trim(),
    name: String(org.name || org.slug || '').trim(),
    role: String(org.role || '').trim(),
  }
}

function pageInfo(scope) {
  const target = scopeOf(scope)
  const info = {}
  try {
    const href = String(target.location?.href || '')
    info.url = sanitizeUrl(href)
    info.title = clipText(target.document?.title || '', 200)
    info.viewport = {
      width: Number(target.innerWidth) || 0,
      height: Number(target.innerHeight) || 0,
      dpr: Number(target.devicePixelRatio) || 1,
      scroll_x: Math.round(Number(target.scrollX) || 0),
      scroll_y: Math.round(Number(target.scrollY) || 0),
    }
    info.user_agent = String(target.navigator?.userAgent || '')
    info.language = String(target.navigator?.language || '')
    info.online = target.navigator?.onLine !== false
    info.visibility = String(target.document?.visibilityState || '')
    info.desktop_shell = Boolean(desktopInvokeOf(target))
    try {
      info.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    } catch (_) {
      info.timezone = ''
    }
  } catch (_) {
    // что успели
  }
  return info
}

/**
 * Отчёт в формате POST /api/debug-reports. Чистая функция: всё, что нужно,
 * приходит аргументами (тест собирает отчёт без браузера).
 */
export function buildDebugReport({
  service = '',
  name = '',
  version = '',
  user = null,
  org = null,
  page = {},
  route = '',
  screenshot = '',
  captureWarning = '',
  log = { console: [], errors: [], network: [] },
  state = {},
  extra = {},
  createdAt = nowIso(),
} = {}) {
  const serviceKey = String(service || '').trim() || 'unknown'
  const counts = {
    console_errors: (log.console || []).filter((item) => item.level === 'error').length,
    console_warnings: (log.console || []).filter((item) => item.level === 'warn').length,
    errors: (log.errors || []).length,
    network_failures: (log.network || []).length,
  }
  const extraObject = extra && typeof extra === 'object' ? extra : {}
  const routeText = String(route || '').trim()
  const summary = [
    `service=${serviceKey}`,
    version ? `version=${version}` : '',
    routeText ? `route=${routeText}` : '',
    `errors=${counts.console_errors + counts.errors}`,
    `network=${counts.network_failures}`,
    extraObject.summary ? String(extraObject.summary) : '',
  ].filter(Boolean).join(' · ')
  const report = {
    ...extraObject,
    created_at: createdAt,
    source: String(extraObject.source || serviceKey),
    service: serviceKey,
    service_name: String(name || '').trim(),
    service_version: String(version || '').trim(),
    route: routeText,
    summary,
    page: plainJson(page),
    user: pickUser(user),
    org: pickOrg(org),
    client_log: plainJson({ ...log, counts }),
    screenshot_data_url: String(screenshot || ''),
    program_state: plainJson({ ...(state && typeof state === 'object' ? state : {}), ...(extraObject.program_state || {}) }),
    metadata: plainJson({ ...(extraObject.metadata || {}), capture_warning: captureWarning || '' }),
  }
  if (extraObject.ui_state) report.ui_state = plainJson(extraObject.ui_state)
  if (extraObject.monitoring_report) report.monitoring_report = plainJson(extraObject.monitoring_report)
  return report
}

// ---------- скриншот ----------

const XHTML_NS = 'http://www.w3.org/1999/xhtml'

function desktopInvokeOf(scope) {
  const target = scopeOf(scope)
  const invoke = target.__HOLYAGENT_DESKTOP__?.invoke || target.__TAURI__?.core?.invoke || target.__TAURI_INTERNALS__?.invoke
  return typeof invoke === 'function' ? invoke : null
}

/**
 * Спрятать поля data-private перед снимком: экранам — событие, самим полям —
 * type=password сразу, не дожидаясь перерисовки. true — в каком-то из них
 * что-то введено (или проверить не удалось): нативный снимок окна снимает
 * экран как есть, такое значение в нём не стереть — тогда только DOM-снимок.
 */
export function concealPrivateInputs(scope) {
  const target = scopeOf(scope)
  try {
    target.dispatchEvent(new target.CustomEvent(PRIVATE_INPUTS_CONCEAL_EVENT))
  } catch (_) {
    // без события поле всё равно скрыто ниже
  }
  try {
    let holdsValue = false
    target.document.querySelectorAll('[data-private]').forEach((node) => {
      const fields = node.matches('input, textarea') ? [node] : Array.from(node.querySelectorAll('input, textarea'))
      fields.forEach((field) => {
        if (field instanceof target.HTMLInputElement && field.type !== 'password' && field.type !== 'hidden') field.type = 'password'
        if (String(field.value || '')) holdsValue = true
      })
    })
    return holdsValue
  } catch (_) {
    return true
  }
}

function collectDocumentCssText(doc) {
  const chunks = []
  for (const sheet of Array.from(doc.styleSheets || [])) {
    try {
      for (const rule of Array.from(sheet.cssRules || [])) {
        if (rule && typeof rule.cssText === 'string' && rule.cssText.trim()) chunks.push(rule.cssText)
      }
    } catch (_) {
      const href = String(sheet?.href || '').trim()
      if (href) chunks.push(`@import url("${href}");`)
    }
  }
  return chunks.join('\n')
}

function isPrivateField(source) {
  return typeof source.closest === 'function' && Boolean(source.closest('[data-private]'))
}

function syncFormControl(win, source, clone) {
  // Снимок уходит в Daenerys: значение поля data-private и паролей не
  // попадает в разметку, даже пока «Показать» держит его открытым текстом.
  if ((source instanceof win.HTMLInputElement || source instanceof win.HTMLTextAreaElement)
    && (isPrivateField(source) || (source instanceof win.HTMLInputElement && source.type === 'password'))) {
    clone.removeAttribute('value')
    clone.value = ''
    if (clone instanceof win.HTMLTextAreaElement) clone.textContent = ''
    return
  }
  if (source instanceof win.HTMLTextAreaElement && clone instanceof win.HTMLTextAreaElement) {
    clone.textContent = source.value
    clone.value = source.value
    return
  }
  if (source instanceof win.HTMLInputElement && clone instanceof win.HTMLInputElement) {
    clone.setAttribute('value', source.value)
    clone.value = source.value
    if (source.checked) clone.setAttribute('checked', 'checked')
    else clone.removeAttribute('checked')
    return
  }
  if (source instanceof win.HTMLSelectElement && clone instanceof win.HTMLSelectElement) {
    const sourceOptions = Array.from(source.options || [])
    Array.from(clone.options || []).forEach((option, index) => {
      if (sourceOptions[index]?.selected) option.setAttribute('selected', 'selected')
      else option.removeAttribute('selected')
    })
  }
}

// Картинку внутри SVG браузер не догрузит: своя (или с CORS) — встраиваем
// data URL через canvas; чужая без CORS — остаётся пустой.
function inlineImage(win, source, clone, cache) {
  const src = String(source.currentSrc || source.src || '').trim()
  if (!src) return
  if (src.startsWith('data:')) {
    clone.setAttribute('src', src)
    return
  }
  if (cache.has(src)) {
    const cached = cache.get(src)
    if (cached) clone.setAttribute('src', cached)
    else clone.removeAttribute('src')
    return
  }
  let dataUrl = ''
  try {
    const width = source.naturalWidth || source.width
    const height = source.naturalHeight || source.height
    if (source.complete && width && height && width * height <= 4000000) {
      const canvas = win.document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(source, 0, 0)
      dataUrl = canvas.toDataURL('image/png')
    }
  } catch (_) {
    dataUrl = ''
  }
  cache.set(src, dataUrl)
  if (dataUrl) clone.setAttribute('src', dataUrl)
  else clone.removeAttribute('src')
}

function syncCanvas(win, source, clone) {
  try {
    const dataUrl = source.toDataURL('image/png')
    if (!dataUrl || !clone.parentNode) return
    const img = win.document.createElement('img')
    img.setAttribute('src', dataUrl)
    img.setAttribute('class', source.getAttribute('class') || '')
    img.style.width = `${source.clientWidth || source.width || 0}px`
    img.style.height = `${source.clientHeight || source.height || 0}px`
    clone.parentNode.replaceChild(img, clone)
  } catch (_) {
    // испорченный чужой картинкой canvas — остаётся пустым
  }
}

function syncTree(win, source, clone, cache) {
  if (source && source.nodeType === 1 && clone && clone.nodeType === 1) {
    if (source.hasAttribute && source.hasAttribute(SNAPSHOT_SKIP_ATTR)) {
      clone.remove()
      return
    }
    const tag = String(source.tagName || '').toLowerCase()
    if (tag === 'script' || tag === 'noscript') {
      clone.remove()
      return
    }
    if (tag === 'iframe') {
      const box = win.document.createElement('div')
      box.style.cssText = `width:${source.clientWidth}px;height:${source.clientHeight}px;background:repeating-linear-gradient(45deg,#1b1830,#1b1830 8px,#221e3c 8px,#221e3c 16px)`
      clone.parentNode?.replaceChild(box, clone)
      return
    }
    syncFormControl(win, source, clone)
    if (source instanceof win.HTMLImageElement) inlineImage(win, source, clone, cache)
    if (source.scrollTop || source.scrollLeft) {
      // Прокрутка внутренних колонок: клону её не задать — сдвигаем содержимое.
      clone.setAttribute('data-hc-scroll', `${source.scrollLeft},${source.scrollTop}`)
    }
    if (source instanceof win.HTMLCanvasElement) {
      syncCanvas(win, source, clone)
      return
    }
  }
  const sourceChildren = Array.from(source?.childNodes || [])
  const cloneChildren = Array.from(clone?.childNodes || [])
  const count = Math.min(sourceChildren.length, cloneChildren.length)
  for (let index = 0; index < count; index += 1) syncTree(win, sourceChildren[index], cloneChildren[index], cache)
}

// Прокрученные колонки (чат, списки): у клона scrollTop нет, поэтому первые
// дети сдвигаются вверх на величину прокрутки.
function applyScrollOffsets(root) {
  root.querySelectorAll('[data-hc-scroll]').forEach((node) => {
    const [left, top] = String(node.getAttribute('data-hc-scroll') || '0,0').split(',').map((part) => Number(part) || 0)
    node.removeAttribute('data-hc-scroll')
    node.style.overflow = 'hidden'
    for (const child of Array.from(node.children || [])) {
      const shift = `translate(${-left}px, ${-top}px)`
      child.style.transform = child.style.transform ? `${shift} ${child.style.transform}` : shift
    }
  })
}

function copyAttributes(from, to, skip = []) {
  for (const attr of Array.from(from?.attributes || [])) {
    if (skip.includes(attr.name)) continue
    try {
      to.setAttribute(attr.name, attr.value)
    } catch (_) {
      // недопустимое для XML имя — пропускаем
    }
  }
}

// SVG с foreignObject — через data: URL, не blob: Chrome помечает холст
// «испорченным» после blob:-картинки с foreignObject, и toDataURL падает
// (так падал прежний DOM-снимок HolyAgent в браузере).
function renderSvgToDataUrl(win, svgMarkup, width, height, scale, background) {
  return new Promise((resolve, reject) => {
    const img = new win.Image()
    img.decoding = 'async'
    img.onload = () => {
      try {
        const canvas = win.document.createElement('canvas')
        canvas.width = Math.max(1, Math.ceil(width * scale))
        canvas.height = Math.max(1, Math.ceil(height * scale))
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas 2D context is unavailable')
        ctx.scale(scale, scale)
        ctx.fillStyle = background || '#090d19'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)
        let dataUrl = canvas.toDataURL('image/png')
        if (dataUrl.length > SCREENSHOT_SOFT_LIMIT) dataUrl = canvas.toDataURL('image/jpeg', 0.82)
        resolve(dataUrl)
      } catch (error) {
        reject(error)
      }
    }
    img.onerror = () => reject(new Error('Failed to render the DOM snapshot'))
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`
  })
}

/**
 * Снимок элемента (по умолчанию — видимая область страницы) через SVG
 * foreignObject. Safari запрещает читать такой canvas — тогда ошибка, и отчёт
 * уходит без картинки.
 */
export async function captureElementScreenshotDataUrl(target, options = {}, scope) {
  const win = scopeOf(scope)
  const doc = win.document
  const viewport = !target || target === doc.body || target === doc.documentElement
  const element = viewport ? doc.body : target
  const rect = element.getBoundingClientRect()
  const width = Math.max(1, Math.ceil(options.width || (viewport ? win.innerWidth : rect.width) || 1))
  const height = Math.max(1, Math.ceil(options.height || (viewport ? win.innerHeight : rect.height) || 1))
  const scale = Math.max(1, Math.min(Number(options.scale) || win.devicePixelRatio || 1, 2))
  if (doc.fonts?.ready) {
    try { await doc.fonts.ready } catch (_) { /* шрифты как есть */ }
  }

  const clone = element.cloneNode(true)
  syncTree(win, element, clone, new Map())
  const bodyStyle = win.getComputedStyle(doc.body)
  const rootStyle = win.getComputedStyle(doc.documentElement)
  const background = [bodyStyle.backgroundColor, rootStyle.backgroundColor]
    .find((value) => value && value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent') || '#090d19'

  // <html> в SVG не вложить: его класс и data-атрибуты (тема, палитра,
  // Tailwind .dark) — на обёртку, стили body — на корень клона.
  const wrapper = doc.createElementNS(XHTML_NS, 'div')
  copyAttributes(doc.documentElement, wrapper, ['xmlns', 'style', 'lang'])
  wrapper.setAttribute('xmlns', XHTML_NS)
  const offsetX = viewport ? Math.round(win.scrollX || 0) : 0
  const offsetY = viewport ? Math.round(win.scrollY || 0) : 0
  wrapper.setAttribute('style', [
    `width:${width}px`, `height:${height}px`, 'margin:0', 'padding:0', 'overflow:hidden', 'position:relative',
    `background:${background}`,
  ].join(';'))
  const style = doc.createElementNS(XHTML_NS, 'style')
  style.textContent = collectDocumentCssText(doc)
  wrapper.appendChild(style)

  let root = clone
  if (viewport) {
    root = doc.createElementNS(XHTML_NS, 'div')
    copyAttributes(doc.body, root, ['style'])
    for (const child of Array.from(clone.childNodes)) root.appendChild(child)
    root.setAttribute('style', [
      doc.body.getAttribute('style') || '',
      `font-family:${bodyStyle.fontFamily}`, `font-size:${bodyStyle.fontSize}`, `line-height:${bodyStyle.lineHeight}`,
      `color:${bodyStyle.color}`, `background:${background}`, 'margin:0',
      `min-height:${height}px`, `width:${width}px`,
      offsetX || offsetY ? `transform:translate(${-offsetX}px, ${-offsetY}px)` : '',
    ].filter(Boolean).join(';'))
  } else if (root.style) {
    root.style.margin = '0'
  }
  wrapper.appendChild(root)
  applyScrollOffsets(wrapper)
  const markup = new win.XMLSerializer().serializeToString(wrapper)
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<foreignObject x="0" y="0" width="${width}" height="${height}">`,
    markup,
    '</foreignObject>',
    '</svg>',
  ].join('')
  return renderSvgToDataUrl(win, svg, width, height, scale, background)
}

function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    Promise.resolve(promise).then((value) => { clearTimeout(timer); resolve(value) }, (error) => { clearTimeout(timer); reject(error) })
  })
}

function nextFrames(win, count = 2) {
  return new Promise((resolve) => {
    if (typeof win.requestAnimationFrame !== 'function') {
      setTimeout(resolve, 32)
      return
    }
    let left = count
    const step = () => {
      left -= 1
      if (left <= 0) resolve()
      else win.requestAnimationFrame(step)
    }
    win.requestAnimationFrame(step)
  })
}

/**
 * Скриншот видимой области: в оболочке HolyAgent — нативный снимок окна
 * (desktop_capture_window_snapshot), если в приватных полях пусто; иначе и
 * при ошибке — DOM. Возвращает { dataUrl, warning, method }.
 */
export async function captureVisibleScreenshot(scope) {
  const win = scopeOf(scope)
  const privateHoldsValue = concealPrivateInputs(win)
  const invoke = desktopInvokeOf(win)
  let warning = ''
  if (invoke && !privateHoldsValue) {
    try {
      const label = String(win.__TAURI_INTERNALS__?.metadata?.currentWindow?.label || 'main')
      const response = await withTimeout(invoke('desktop_capture_window_snapshot', { windowLabel: label }), 5000, 'Desktop screenshot timed out')
      const dataUrl = String(response?.data_url || response?.dataUrl || '').trim()
      if (dataUrl) return { dataUrl, warning: '', method: 'desktop' }
      warning = String(response?.message || 'Desktop screenshot was empty')
    } catch (error) {
      warning = describeValue(error)
    }
  }
  try {
    const dataUrl = await withTimeout(captureElementScreenshotDataUrl(null, {}, win), 8000, 'DOM screenshot timed out')
    return { dataUrl, warning: '', method: 'dom' }
  } catch (error) {
    return { dataUrl: '', warning: [warning, describeValue(error)].filter(Boolean).join('; '), method: 'none' }
  }
}

// ---------- отправка ----------

/**
 * POST отчёта в Daenerys. token — Bearer сессии; без него — с cookie
 * (профиль ID и почта живут на cookie .holycode.org). Ответ сервера
 * ({ ok, report: { report_id, … } }) или ошибка с status.
 */
export async function sendDebugReport(payload, { endpoint = DEBUG_REPORTS_URL, token = '', fetcher = null, timeoutMs = 30000 } = {}, scope) {
  const win = scopeOf(scope)
  const doFetch = fetcher || win.fetch.bind(win)
  const headers = { 'Content-Type': 'application/json' }
  const bearer = String(token || '').trim()
  if (bearer) headers.Authorization = `Bearer ${bearer}`
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
  let response
  try {
    response = await doFetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      credentials: bearer ? 'omit' : 'include',
      signal: controller?.signal,
    })
  } catch (error) {
    const failure = new Error(String(error?.name || '') === 'AbortError' ? 'Upload timed out' : describeValue(error))
    failure.status = 0
    throw failure
  } finally {
    if (timer) clearTimeout(timer)
  }
  let data = null
  try {
    data = await response.json()
  } catch (_) {
    data = null
  }
  if (!response.ok) {
    const failure = new Error(String(data?.message || data?.error || `HTTP ${response.status}`))
    failure.status = response.status
    failure.code = String(data?.error || '')
    throw failure
  }
  return data || {}
}

export function reportViewUrl(reportId) {
  const id = String(reportId || '').trim()
  return id ? `${DEBUG_REPORT_VIEW_BASE}${encodeURIComponent(id)}` : ''
}

// ---------- карточка результата ----------

const STYLE_ID = 'hcd-snap-style'
const STYLE_TEXT = `
.hcd-snap{position:fixed;right:16px;bottom:16px;z-index:2147483000;width:340px;max-width:calc(100vw - 32px);box-sizing:border-box;
padding:14px 14px 12px;border:1px solid #3a3266;border-radius:14px;background:#14112a;color:#ece7ff;
box-shadow:0 18px 50px rgba(0,0,0,.45);font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif;text-align:left}
.hcd-snap *{box-sizing:border-box}
.hcd-snap-head{display:flex;align-items:center;gap:8px;margin:0 0 6px}
.hcd-snap-ic{display:inline-flex;width:22px;height:22px;align-items:center;justify-content:center;border-radius:7px;background:#2a2450;color:#b9a8ff;flex:none}
.hcd-snap[data-state="error"] .hcd-snap-ic{background:#4a1d2a;color:#ff9db0}
.hcd-snap[data-state="done"] .hcd-snap-ic{background:#173a2c;color:#7ee2b0}
.hcd-snap-title{flex:1;font-weight:650;font-size:14px}
.hcd-snap-x{flex:none;width:26px;height:26px;border:0;border-radius:8px;background:transparent;color:#9f96cf;font-size:18px;line-height:1;cursor:pointer}
.hcd-snap-x:hover{background:#221e3c;color:#fff}
.hcd-snap-body{color:#c9c2ee;margin:0 0 8px}
.hcd-snap-warn{color:#f3d58a;margin:0 0 8px;font-size:12px}
.hcd-snap-id{display:block;margin:0 0 10px;padding:8px 10px;border-radius:9px;background:#0d0b1d;border:1px solid #2a2450;
font:600 13px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;color:#fff;user-select:all;word-break:break-all}
.hcd-snap-actions{display:flex;gap:8px;flex-wrap:wrap}
.hcd-snap-btn{display:inline-flex;align-items:center;justify-content:center;height:32px;padding:0 12px;border-radius:9px;border:1px solid #3a3266;
background:#221e3c;color:#ece7ff;font:600 13px/1 inherit;font-family:inherit;text-decoration:none;cursor:pointer}
.hcd-snap-btn:hover{background:#2c2652}
.hcd-snap-btn--main{background:#7c5cff;border-color:#7c5cff;color:#fff}
.hcd-snap-btn--main:hover{background:#8d6fff}
.hcd-snap-spin{width:14px;height:14px;border-radius:50%;border:2px solid #4b4380;border-top-color:#b9a8ff;animation:hcd-spin .8s linear infinite}
@keyframes hcd-spin{to{transform:rotate(360deg)}}
@media (max-width:767.98px){.hcd-snap{right:12px;left:12px;width:auto;max-width:none;bottom:calc(76px + env(safe-area-inset-bottom,0px))}}
`

const CAMERA_PATH = 'M9.4 4.2c.3-.6.9-1 1.6-1h2c.7 0 1.3.4 1.6 1l.6 1.1h2.3A2.5 2.5 0 0 1 20 7.8v9.7a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5V7.8a2.5 2.5 0 0 1 2.5-2.5h2.3l.6-1.1ZM12 8.6a3.9 3.9 0 1 0 0 7.8 3.9 3.9 0 0 0 0-7.8Zm0 1.6a2.3 2.3 0 1 1 0 4.6 2.3 2.3 0 0 1 0-4.6Z'

function ensureStyle(doc) {
  if (doc.getElementById(STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = STYLE_TEXT
  ;(doc.head || doc.documentElement).appendChild(style)
}

function el(doc, tag, attrs = {}, children = []) {
  const node = doc.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue
    if (key === 'text') node.textContent = String(value)
    else if (key === 'onClick') node.addEventListener('click', value)
    else node.setAttribute(key, String(value))
  }
  for (const child of children) if (child) node.appendChild(child)
  return node
}

function cameraIcon(doc) {
  const span = el(doc, 'span', { class: 'hcd-snap-ic', 'aria-hidden': 'true' })
  span.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="${CAMERA_PATH}"/></svg>`
  return span
}

async function copyToClipboard(win, text) {
  try {
    if (win.navigator?.clipboard?.writeText) {
      await win.navigator.clipboard.writeText(text)
      return true
    }
  } catch (_) {
    // запасной путь ниже
  }
  try {
    const area = win.document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.cssText = 'position:fixed;left:-9999px;top:0'
    win.document.body.appendChild(area)
    area.select()
    const ok = win.document.execCommand('copy')
    area.remove()
    return ok
  } catch (_) {
    return false
  }
}

function renderDialog(win, hub, view) {
  const doc = win.document
  ensureStyle(doc)
  const t = view.t
  let node = hub.dialog
  if (!node || !node.isConnected) {
    node = el(doc, 'div', { class: 'hcd-snap', role: 'status', 'aria-live': 'polite', [SNAPSHOT_SKIP_ATTR]: '', 'data-testid': 'debug-snapshot-card' })
    doc.body.appendChild(node)
    hub.dialog = node
    const onKey = (event) => {
      if (event.key === 'Escape' && hub.dialog === node && !hub.busy) closeDialog(hub)
    }
    doc.addEventListener('keydown', onKey)
    node.__hcdCleanup = () => doc.removeEventListener('keydown', onKey)
  }
  node.setAttribute('data-state', view.state)
  node.style.visibility = view.hidden ? 'hidden' : ''
  node.textContent = ''
  const head = el(doc, 'div', { class: 'hcd-snap-head' }, [
    view.state === 'busy' ? el(doc, 'span', { class: 'hcd-snap-ic' }, [el(doc, 'span', { class: 'hcd-snap-spin' })]) : cameraIcon(doc),
    el(doc, 'span', { class: 'hcd-snap-title', text: view.title }),
    view.state === 'busy' ? null : el(doc, 'button', { type: 'button', class: 'hcd-snap-x', 'aria-label': t.close, title: t.close, text: '×', onClick: () => closeDialog(hub) }),
  ])
  node.appendChild(head)
  if (view.body) node.appendChild(el(doc, 'div', { class: 'hcd-snap-body', text: view.body }))
  for (const warning of view.warnings || []) node.appendChild(el(doc, 'div', { class: 'hcd-snap-warn', text: warning }))
  if (view.reportId) node.appendChild(el(doc, 'code', { class: 'hcd-snap-id', 'data-testid': 'debug-snapshot-id', text: view.reportId }))
  const actions = []
  if (view.state === 'done' && view.reportId) {
    const copyButton = el(doc, 'button', { type: 'button', class: 'hcd-snap-btn hcd-snap-btn--main', 'data-testid': 'debug-snapshot-copy', text: t.copy })
    copyButton.addEventListener('click', async () => {
      const line = [fill(t.copyLine, { id: view.reportId }), view.viewUrl].filter(Boolean).join(' — ')
      if (await copyToClipboard(win, line)) copyButton.textContent = t.copied
    })
    actions.push(copyButton)
    if (view.viewUrl) actions.push(el(doc, 'a', { class: 'hcd-snap-btn', href: view.viewUrl, target: '_blank', rel: 'noopener noreferrer', 'data-testid': 'debug-snapshot-open', text: t.open }))
  }
  if (view.state === 'error' && view.retry) {
    actions.push(el(doc, 'button', { type: 'button', class: 'hcd-snap-btn hcd-snap-btn--main', text: t.retry, onClick: view.retry }))
  }
  if (actions.length) node.appendChild(el(doc, 'div', { class: 'hcd-snap-actions' }, actions))
  return node
}

function closeDialog(hub) {
  const node = hub.dialog
  hub.dialog = null
  if (!node) return
  try { node.__hcdCleanup?.() } catch (_) { /* нет */ }
  node.remove()
}

// Раздел: путь и запрос без секретов; хеш — только маршрут вида #/builds/….
export function routeOf(location = {}) {
  const base = String(location.origin || '') || 'http://localhost'
  const path = sanitizeUrl(`${location.pathname || '/'}${location.search || ''}`, base)
  const hash = String(location.hash || '')
  return hash.startsWith('#/') ? `${path}${clipText(redactSecrets(hash.split('?')[0]), 200)}` : path
}

function langOf(win, config) {
  const raw = String(config.lang || win.document?.documentElement?.lang || win.navigator?.language || 'en').toLowerCase()
  return raw.startsWith('ru') ? 'ru' : 'en'
}

/**
 * Снимок по клику из меню профиля: карточка «Снимаю…» → скриншот → сбор →
 * отправка → номер отчёта. Возвращает ответ сервера или null при ошибке.
 */
export async function takeDebugSnapshot(overrides = {}, scope) {
  const win = scopeOf(scope)
  const hub = hubOf(win)
  if (hub.busy) return null
  const config = { ...hub.config, ...(overrides && typeof overrides === 'object' ? overrides : {}) }
  const values = {}
  for (const key of ['service', 'name', 'version', 'lang', 'user', 'org', 'token', 'state', 'endpoint', 'canViewReports']) {
    values[key] = await resolveValue(config[key])
  }
  const t = debugSnapshotText(langOf(win, values))
  hub.busy = true
  const retry = () => { takeDebugSnapshot(overrides, win) }
  try {
    // Меню профиля закрывается в этом же клике: два кадра — и его нет на снимке.
    renderDialog(win, hub, { state: 'busy', t, title: t.capturing, hidden: true })
    await nextFrames(win, 2)
    const shot = typeof config.capture === 'function'
      ? await Promise.resolve().then(() => config.capture(win.document.body)).catch((error) => ({ dataUrl: '', warning: describeValue(error) }))
      : await captureVisibleScreenshot(win)
    renderDialog(win, hub, { state: 'busy', t, title: t.sending })

    const providers = {}
    for (const [key, provider] of hub.providers.entries()) providers[key] = await resolveValue(provider)
    const extra = typeof config.collect === 'function' ? (await resolveValue(config.collect)) || {} : {}
    const location = win.location || {}
    const payload = buildDebugReport({
      service: values.service,
      name: values.name,
      version: values.version,
      user: values.user,
      org: values.org,
      page: pageInfo(win),
      route: routeOf(location),
      screenshot: shot?.dataUrl || '',
      captureWarning: shot?.warning || '',
      log: debugLogSnapshot(win),
      state: { ...(values.state && typeof values.state === 'object' ? values.state : {}), ...providers },
      extra: { ...extra, metadata: { ...(extra.metadata || {}), capture_method: shot?.method || (config.capture ? 'service' : 'none') } },
    })
    const warnings = []
    if (!payload.screenshot_data_url && shot?.warning) warnings.push(fill(t.noImage, { reason: clipText(shot.warning, 140) }))
    const send = typeof config.send === 'function'
      ? (body) => config.send(body)
      : (body) => sendDebugReport(body, { endpoint: values.endpoint || DEBUG_REPORTS_URL, token: values.token }, win)
    let result
    try {
      result = await send(payload)
    } catch (error) {
      // Слишком большой снимок — второй раз без картинки, лишь бы номер был.
      if (error?.status === 413 && payload.screenshot_data_url) {
        payload.screenshot_data_url = ''
        payload.metadata = { ...(payload.metadata || {}), screenshot_dropped: 'too_large' }
        warnings.push(t.tooBig)
        result = await send(payload)
      } else {
        throw error
      }
    }
    const report = result?.report || result || {}
    const reportId = String(report.report_id || '').trim()
    hub.busy = false
    renderDialog(win, hub, {
      state: 'done',
      t,
      title: t.doneTitle,
      body: t.doneBody,
      warnings,
      reportId,
      viewUrl: values.canViewReports ? reportViewUrl(reportId) : '',
    })
    return result
  } catch (error) {
    hub.busy = false
    const status = Number(error?.status) || 0
    renderDialog(win, hub, {
      state: 'error',
      t,
      title: t.errorTitle,
      body: status === 401 ? t.signIn : clipText(describeValue(error), 220),
      retry,
    })
    return null
  } finally {
    hub.busy = false
  }
}
