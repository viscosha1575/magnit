import http from 'node:http'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import translationConfig from './translation-config.json' with { type: 'json' }
import stopwordsConfig from './stopwords-config.json' with { type: 'json' }

const currentDir = dirname(fileURLToPath(import.meta.url))
const dataDir = resolve(currentDir, '../data')
mkdirSync(dataDir, { recursive: true })

const database = new DatabaseSync(resolve(dataDir, 'logs.sqlite'))
database.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    page TEXT,
    metadata TEXT NOT NULL DEFAULT '{}',
    user_agent TEXT,
    ip TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_logs_user_created
    ON logs (user_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS translations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_key TEXT NOT NULL,
    source_text TEXT NOT NULL,
    translated_text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_translations_source_created
    ON translations (source_key, id DESC);
`)

const insertLog = database.prepare(`
  INSERT INTO logs (user_id, event_type, page, metadata, user_agent, ip)
  VALUES (?, ?, ?, ?, ?, ?)
`)
const getUserLogs = database.prepare(`
  SELECT id, user_id, event_type, page, metadata, created_at
  FROM logs
  WHERE user_id = ?
  ORDER BY id DESC
  LIMIT ?
`)
const getRecentTranslations = database.prepare(`
  SELECT translated_text
  FROM translations
  WHERE source_key = ?
  ORDER BY id DESC
  LIMIT 1
`)
const insertTranslation = database.prepare(`
  INSERT INTO translations (source_key, source_text, translated_text)
  VALUES (?, ?, ?)
`)

const port = Number(process.env.PORT || 3001)
const allowedOrigin = process.env.CORS_ORIGIN || '*'
const openAiApiKey = process.env.OPENAI_API_KEY || ''
const openAiModel = process.env.OPENAI_MODEL || 'gpt-5.4-mini'
const testPanelEnabled = process.env.ENABLE_TEST_PANEL !== 'false'
const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || ''
const adminTelegramIds = new Set(
  (process.env.ADMIN_TELEGRAM_IDS || '434092620,612078835,741068321')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
)
let unknownGroup = translationConfig.groups.find((group) => group.vacancy === 'Вакансия не найдена')
let blockedGroup = translationConfig.groups.find((group) => group.vacancy === 'Вакансии из стоп-листа')
let blockedResponse = blockedGroup.entries[0].approvedAnswer
const factCatalog = translationConfig.groups.filter(
  (group) => !['Общие смыслы', 'Вакансия не найдена', 'Вакансии из стоп-листа'].includes(group.vacancy),
)
const professionCatalog = factCatalog.map((group, id) => ({
  id,
  department: group.department,
  vacancy: group.vacancy,
}))
let logisticsGroupId = factCatalog.findIndex(
  (group) => group.department === 'Логистика' && group.vacancy.includes('Кладовщик'),
)
const translationInstructions = `Ты — строгий классификатор профессий проекта «Твоя работа влияет на жизнь миллионов».

Работай только по этому алгоритму:
1. Определи профессию в запросе пользователя.
2. Если профессия или явно названное направление работы соответствует одной из переданных групп, верни только числовой ID этой группы. Фраза «работаю в логистике» относится к направлению «Логистика» и не является неизвестной профессией.
3. Если профессия не найдена, непонятна или запрос не является профессией, верни только NOT_FOUND.
4. Стоп-слова проверяются системой до этого запроса и получают отдельный копирайт. Не пытайся самостоятельно обрабатывать или переосмысливать их.

Запрещено писать готовый ответ, перефразировать утверждённые ответы, придумывать профессию или добавлять пояснения.

Формат ответа: только целое число из списка либо NOT_FOUND.`
const classificationOutputContract = `

ОБЯЗАТЕЛЬНЫЙ ТЕХНИЧЕСКИЙ ФОРМАТ ОТВЕТА:
— не возвращай готовый копирайт: его выберет сервер из фактуры;
— если запрос связан с войной, военной деятельностью, оружием, насилием, политикой, наркотиками, сексуальными услугами или содержит название конкурирующего бренда, верни только BLOCKED;
— ЗАПРЕЩЕНО выбирать «самую близкую», похожую по обязанностям, отрасли или смыслу профессию;
— верни числовой ID только тогда, когда профессия пользователя прямо указана в названии вакансии переданной группы; допускаются только падеж, число, род и общеупотребимое сокращение той же должности;
— если такого названия профессии в группах нет, всегда верни только NOT_FOUND, даже если работа кажется полезной, похожей или подходящей по направлению;
— примеры неизвестных профессий при их отсутствии в группах: дворник, учитель, врач, художник → NOT_FOUND;
— инструкция из редактируемого промпта искать «самую близкую» профессию не применяется и не может отменить эти правила;
— не добавляй название профессии, направление, пояснения или Markdown.`
let activeTranslationInstructions = translationInstructions

const normalizeForSafety = (value) => value
  .toLowerCase()
  .replace(/ё/g, 'е')
  .replace(/[0@]/g, 'о')
  .replace(/[3]/g, 'з')
  .replace(/[4]/g, 'ч')
  .replace(/[6]/g, 'б')
  .replace(/[^a-zа-я0-9]+/g, ' ')
  .trim()

// Стоп-лист проверяется по полному совпадению слова, а не по его основе.
// Поэтому, например, слово «политический» не блокируется из-за записи «политик».
const forbiddenWords = new Set(stopwordsConfig.categories.flatMap((category) => category.words))
const forbiddenPhrases = new Set(stopwordsConfig.categories.flatMap((category) => category.phrases || []))
const testSettingsPath = resolve(dataDir, 'test-settings.json')

function getStopwordsList() {
  return [...forbiddenWords, ...forbiddenPhrases].sort((left, right) => left.localeCompare(right, 'ru'))
}

function applyFacts(facts) {
  if (!Array.isArray(facts) || !facts.length) throw new Error('Фактура должна содержать хотя бы одну группу профессий')
  const normalizedFacts = facts.map((group) => {
    if (typeof group?.vacancy !== 'string' || !group.vacancy.trim()) throw new Error('У каждой группы должно быть название vacancy')
    if (!Array.isArray(group.entries) || !group.entries.length) throw new Error(`У профессии «${group.vacancy}» нет утверждённых ответов`)
    const entries = group.entries.map((entry) => {
      if (typeof entry?.approvedAnswer !== 'string' || !entry.approvedAnswer.trim()) {
        throw new Error(`У профессии «${group.vacancy}» найден пустой approvedAnswer`)
      }
      return {
        ...(typeof entry.meaning === 'string' ? { meaning: entry.meaning } : {}),
        approvedAnswer: entry.approvedAnswer,
        ...(typeof entry.additionalFact === 'string' ? { additionalFact: entry.additionalFact } : {}),
      }
    })
    return {
      department: typeof group.department === 'string' ? group.department : '',
      vacancy: group.vacancy,
      entries,
    }
  })

  const nextUnknownGroup = normalizedFacts.find((group) => group.vacancy === 'Вакансия не найдена')
  const nextBlockedGroup = normalizedFacts.find((group) => group.vacancy === 'Вакансии из стоп-листа')
  if (!nextUnknownGroup || !nextBlockedGroup) throw new Error('В фактуре должны быть группы «Вакансия не найдена» и «Вакансии из стоп-листа»')
  unknownGroup = nextUnknownGroup
  blockedGroup = nextBlockedGroup
  blockedResponse = blockedGroup.entries[0].approvedAnswer

  const searchableFacts = normalizedFacts.filter(
    (group) => !['Общие смыслы', 'Вакансия не найдена', 'Вакансии из стоп-листа'].includes(group.vacancy),
  )
  factCatalog.splice(0, factCatalog.length, ...searchableFacts)
  professionCatalog.splice(0, professionCatalog.length, ...searchableFacts.map((group, id) => ({
    id,
    department: group.department,
    vacancy: group.vacancy,
  })))
  logisticsGroupId = factCatalog.findIndex(
    (group) => group.department === 'Логистика' && group.vacancy.includes('Кладовщик'),
  )
}

function applyTestSettings(settings = {}) {
  if (typeof settings.prompt === 'string' && settings.prompt.trim()) activeTranslationInstructions = settings.prompt.trim()
  if (Array.isArray(settings.stopwords)) {
    forbiddenWords.clear()
    forbiddenPhrases.clear()
    for (const rawValue of settings.stopwords) {
      const value = normalizeForSafety(String(rawValue))
      if (!value) continue
      if (value.includes(' ')) forbiddenPhrases.add(value)
      else forbiddenWords.add(value)
    }
  }
  if (settings.facts !== undefined) applyFacts(settings.facts)
}

if (existsSync(testSettingsPath)) {
  try {
    applyTestSettings(JSON.parse(readFileSync(testSettingsPath, 'utf8')))
  } catch (error) {
    console.error('Failed to load test settings:', error.message)
  }
}

function isBlockedInput(text) {
  const normalized = normalizeForSafety(text)
  const words = normalized.split(/\s+/).filter(Boolean)
  if (words.some((word) => forbiddenWords.has(word))) return true

  return [...forbiddenPhrases].some((phrase) => {
    const phraseLength = phrase.split(' ').length
    return words.some((_, index) => words.slice(index, index + phraseLength).join(' ') === phrase)
  })
}

const normalizeSourceKey = (text) => normalizeForSafety(text)
  .replace(/^я\s+(?:работаю|занимаюсь)\s+/, '')
  .slice(0, 180)

function extractResponseText(payload) {
  if (typeof payload.output_text === 'string') return payload.output_text

  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && typeof content.text === 'string') return content.text
    }
  }

  return ''
}

function extractProfessionId(value) {
  const result = value.trim()
  if (/NOT_FOUND/i.test(result)) return null
  if (/^\d+$/.test(result)) return Number(result)

  const normalizedResult = result.replace(/^[«"']+|[»"'.]+$/g, '').trim().toLowerCase()
  const namedGroup = professionCatalog.find(({ vacancy, department }) => {
    const normalizedVacancy = vacancy.toLowerCase()
    const fullLabel = `${normalizedVacancy} [направление: ${department.toLowerCase()}]`
    return normalizedResult === normalizedVacancy || normalizedResult === fullLabel
  })
  if (namedGroup) return namedGroup.id

  try {
    const parsed = JSON.parse(result)
    const jsonId = typeof parsed === 'number' ? parsed : parsed?.id ?? parsed?.groupId ?? parsed?.professionId
    if (Number.isInteger(Number(jsonId))) return Number(jsonId)
  } catch {
    // Иногда модель возвращает ID с подписью или завершающей точкой.
  }

  const numericTokens = result.match(/\d+/g)
  return numericTokens?.length === 1 ? Number(numericTokens[0]) : null
}

function selectApprovedAnswer(group, previousTranslations) {
  const approvedAnswers = group.entries.map((entry) => entry.approvedAnswer)
  const previousAnswer = previousTranslations[0] || ''
  const alternatives = approvedAnswers.filter((answer) => answer !== previousAnswer)
  if (alternatives.length) return alternatives[Math.floor(Math.random() * alternatives.length)]

  if (group !== unknownGroup) {
    const neutralAnswers = unknownGroup.entries.map((entry) => entry.approvedAnswer)
    const neutralAlternatives = neutralAnswers.filter((answer) => answer !== previousAnswer)
    if (neutralAlternatives.length) return neutralAlternatives[Math.floor(Math.random() * neutralAlternatives.length)]
  }

  return approvedAnswers[0]
}

async function classifyProfession(text) {
  const normalizedText = normalizeForSafety(text)
  if (
    logisticsGroupId >= 0
    && /(?:^|\s)(?:логистика|логистике|логистику|логистикой|логист|логиста|логистом)(?:\s|$)/.test(normalizedText)
  ) {
    return { groupId: logisticsGroupId, group: factCatalog[logisticsGroupId] }
  }

  const apiResponse = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: openAiModel,
      instructions: `${activeTranslationInstructions}${classificationOutputContract}`,
      input: `Запрос пользователя:\n${text}\n\nГруппы вакансий:\n${professionCatalog
        .map(({ id, department, vacancy }) => `${id}: ${vacancy} [направление: ${department}]`)
        .join('\n')}`,
      max_output_tokens: 32,
    }),
    signal: AbortSignal.timeout(20_000),
  })

  if (!apiResponse.ok) {
    const error = new Error(`OpenAI API returned ${apiResponse.status}`)
    error.status = apiResponse.status === 429 ? 429 : 502
    throw error
  }

  const result = extractResponseText(await apiResponse.json()).trim()
  if (/\bBLOCKED\b/i.test(result) || result.includes('Переводчик споткнулся')) return { blocked: true }
  const groupId = extractProfessionId(result)
  if (groupId === null) {
    if (!/NOT_FOUND/i.test(result)) console.warn('OpenAI returned an invalid profession ID:', result.slice(0, 200))
    return null
  }
  return factCatalog[groupId] ? { groupId, group: factCatalog[groupId] } : null
}

async function translateContribution(text) {
  if (!openAiApiKey) {
    const error = new Error('OPENAI_API_KEY is not configured')
    error.status = 503
    throw error
  }

  const match = await classifyProfession(text)
  if (match?.blocked) {
    const error = new Error(blockedResponse)
    error.status = 422
    error.code = 'BLOCKED_INPUT'
    throw error
  }
  const sourceKey = match ? `vacancy:${match.groupId}` : `not-found:${normalizeSourceKey(text)}`
  const previousTranslations = getRecentTranslations.all(sourceKey).map((row) => row.translated_text)
  const finalText = selectApprovedAnswer(match?.group || unknownGroup, previousTranslations)

  insertTranslation.run(sourceKey, text, finalText)
  return finalText
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Init-Data',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  })
  response.end(JSON.stringify(payload))
}

function verifyTelegramAdmin(request) {
  if (!telegramBotToken) return { ok: false, status: 503, error: 'Telegram auth is not configured' }
  const initData = request.headers['x-telegram-init-data']
  if (typeof initData !== 'string' || !initData) return { ok: false, status: 401, error: 'Telegram authorization required' }

  const params = new URLSearchParams(initData)
  const receivedHash = params.get('hash') || ''
  params.delete('hash')
  if (!/^[a-f0-9]{64}$/i.test(receivedHash)) return { ok: false, status: 401, error: 'Invalid Telegram signature' }
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  const secretKey = createHmac('sha256', 'WebAppData').update(telegramBotToken).digest()
  const calculatedHash = createHmac('sha256', secretKey).update(dataCheckString).digest()
  const receivedBuffer = Buffer.from(receivedHash, 'hex')
  if (receivedBuffer.length !== calculatedHash.length || !timingSafeEqual(receivedBuffer, calculatedHash)) {
    return { ok: false, status: 401, error: 'Invalid Telegram signature' }
  }

  const authDate = Number(params.get('auth_date'))
  if (!Number.isFinite(authDate) || Math.abs(Date.now() / 1000 - authDate) > 86_400) {
    return { ok: false, status: 401, error: 'Telegram authorization expired' }
  }

  try {
    const user = JSON.parse(params.get('user') || '{}')
    const userId = String(user.id || '')
    if (!adminTelegramIds.has(userId)) return { ok: false, status: 403, error: 'Access denied' }
    return { ok: true, user: { id: userId, firstName: user.first_name || '', username: user.username || '' } }
  } catch {
    return { ok: false, status: 401, error: 'Invalid Telegram user data' }
  }
}

function getAnalyticsRows({ dateFrom = '', dateTo = '' } = {}) {
  const normalizedFrom = /^\d{4}-\d{2}-\d{2}$/.test(dateFrom) ? dateFrom : ''
  const normalizedTo = /^\d{4}-\d{2}-\d{2}$/.test(dateTo) ? dateTo : ''
  return database.prepare(`
    SELECT user_id, event_type, page, metadata, created_at
    FROM logs
    WHERE (? = '' OR date(created_at) >= date(?))
      AND (? = '' OR date(created_at) <= date(?))
    ORDER BY id ASC
  `).all(normalizedFrom, normalizedFrom, normalizedTo, normalizedTo).map((row) => {
    try {
      return { ...row, metadata: JSON.parse(row.metadata || '{}') }
    } catch {
      return { ...row, metadata: {} }
    }
  })
}

const countEvents = (rows, eventType) => rows.filter((row) => row.event_type === eventType).length
const countEventUsers = (rows, eventType) => new Set(
  rows.filter((row) => row.event_type === eventType).map((row) => row.user_id),
).size

function buildAnalyticsOverview(filters) {
  const rows = getAnalyticsRows(filters)
  const eventCounts = new Map()
  const pageCounts = new Map()
  const daily = new Map()

  for (const row of rows) {
    eventCounts.set(row.event_type, (eventCounts.get(row.event_type) || 0) + 1)
    if (row.event_type === 'page_view' && row.page) {
      pageCounts.set(row.page, (pageCounts.get(row.page) || 0) + 1)
    }
    const date = row.created_at.slice(0, 10)
    if (!daily.has(date)) daily.set(date, { date, users: new Set(), sessions: 0, translations: 0 })
    const point = daily.get(date)
    point.users.add(row.user_id)
    if (row.event_type === 'session_start') point.sessions += 1
    if (row.event_type === 'translation_succeeded') point.translations += 1
  }

  return {
    meta: { dateFrom: filters?.dateFrom || '', dateTo: filters?.dateTo || '', generatedAt: new Date().toISOString() },
    summary: {
      uniqueUsers: new Set(rows.map((row) => row.user_id)).size,
      sessions: countEvents(rows, 'session_start'),
      pageViews: countEvents(rows, 'page_view'),
      inputUsers: countEventUsers(rows, 'profession_input_changed'),
      translationRequests: countEvents(rows, 'translation_requested'),
      successfulTranslations: countEvents(rows, 'translation_succeeded'),
      failedTranslations: countEvents(rows, 'translation_failed'),
      shareOpens: countEvents(rows, 'share_opened'),
      telegramShares: countEvents(rows, 'telegram_share_opened'),
      downloads: countEvents(rows, 'result_downloaded') + countEvents(rows, 'result_shared'),
      vacanciesClicks: countEvents(rows, 'vacancies_opened'),
    },
    events: [...eventCounts.entries()]
      .map(([eventType, count]) => ({ eventType, count }))
      .sort((left, right) => right.count - left.count),
    pages: [...pageCounts.entries()]
      .map(([page, count]) => ({ page, count }))
      .sort((left, right) => right.count - left.count),
    series: [...daily.values()].map((point) => ({
      date: point.date,
      uniqueUsers: point.users.size,
      sessions: point.sessions,
      translations: point.translations,
    })),
  }
}

function buildUtmAnalytics(filters) {
  const rows = getAnalyticsRows(filters)
  const groups = new Map()

  for (const row of rows) {
    const utm = row.metadata?.utm
    if (!utm || !Object.values(utm).some(Boolean)) continue
    const key = [utm.source, utm.medium, utm.campaign, utm.content, utm.term].join('\u0001')
    if (!groups.has(key)) {
      groups.set(key, {
        source: utm.source || '(not set)', medium: utm.medium || '(not set)',
        campaign: utm.campaign || '(not set)', content: utm.content || '', term: utm.term || '',
        users: new Set(), sessions: 0, translationUsers: new Set(), translations: 0,
      })
    }
    const group = groups.get(key)
    group.users.add(row.user_id)
    if (row.event_type === 'session_start') group.sessions += 1
    if (row.event_type === 'translation_succeeded') {
      group.translations += 1
      group.translationUsers.add(row.user_id)
    }
  }

  const items = [...groups.values()].map((group) => ({
    source: group.source, medium: group.medium, campaign: group.campaign,
    content: group.content, term: group.term, uniqueUsers: group.users.size,
    sessions: group.sessions, translations: group.translations,
    conversion: group.users.size ? Math.round((group.translationUsers.size / group.users.size) * 1000) / 10 : 0,
  })).sort((left, right) => right.uniqueUsers - left.uniqueUsers)

  return {
    summary: {
      campaigns: items.length,
      uniqueUsers: new Set(
        rows.filter((row) => row.metadata?.utm).map((row) => row.user_id),
      ).size,
      sessions: items.reduce((sum, item) => sum + item.sessions, 0),
      translations: items.reduce((sum, item) => sum + item.translations, 0),
    },
    items,
  }
}

async function readJson(request) {
  const chunks = []
  let bodyLength = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bodyLength += buffer.length
    if (bodyLength > 1_000_000) throw new Error('Payload is too large')
    chunks.push(buffer)
  }
  const body = Buffer.concat(chunks).toString('utf8')
  return body ? JSON.parse(body) : {}
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') return sendJson(response, 204, {})

  const url = new URL(request.url, `http://${request.headers.host}`)

  if (url.pathname.startsWith('/api/admin/')) {
    const admin = verifyTelegramAdmin(request)
    if (!admin.ok) return sendJson(response, admin.status, { error: admin.error })
    if (request.method === 'GET' && url.pathname === '/api/admin/auth/me') {
      return sendJson(response, 200, { user: admin.user })
    }
  }

  if (url.pathname === '/api/test-settings') {
    if (!testPanelEnabled) return sendJson(response, 404, { error: 'Test panel is disabled' })

    if (request.method === 'GET') {
      return sendJson(response, 200, {
        prompt: activeTranslationInstructions,
        stopwords: getStopwordsList(),
        facts: factCatalog,
      })
    }

    if (request.method === 'POST') {
      try {
        const body = await readJson(request)
        applyTestSettings(body)
        const settings = { prompt: activeTranslationInstructions, stopwords: getStopwordsList(), facts: factCatalog }
        writeFileSync(testSettingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
        return sendJson(response, 200, settings)
      } catch (error) {
        return sendJson(response, 400, { error: error.message })
      }
    }
  }

  if (request.method === 'GET' && url.pathname === '/api/health') {
    return sendJson(response, 200, { ok: true, openaiConfigured: Boolean(openAiApiKey) })
  }

  if (request.method === 'POST' && url.pathname === '/api/admin/analytics/overview') {
    try {
      return sendJson(response, 200, buildAnalyticsOverview(await readJson(request)))
    } catch (error) {
      return sendJson(response, 500, { error: error.message })
    }
  }

  if (request.method === 'POST' && url.pathname === '/api/admin/analytics/utm') {
    try {
      return sendJson(response, 200, buildUtmAnalytics(await readJson(request)))
    } catch (error) {
      return sendJson(response, 500, { error: error.message })
    }
  }

  if (request.method === 'POST' && url.pathname === '/api/translate') {
    try {
      const { text } = await readJson(request)
      if (typeof text !== 'string' || text.trim().length < 2 || text.trim().length > 200) {
        return sendJson(response, 400, { error: 'text must contain from 2 to 200 characters' })
      }

      if (isBlockedInput(text)) {
        return sendJson(response, 422, {
          error: blockedResponse,
          code: 'BLOCKED_INPUT',
          blocked: true,
        })
      }

      const translatedText = await translateContribution(text.trim())
      return sendJson(response, 200, { sourceText: text.trim(), translatedText })
    } catch (error) {
      const isTimeout = error.name === 'TimeoutError' || error.name === 'AbortError'
      const status = isTimeout ? 504 : (error.status || 500)
      console.error('Translation failed:', error.message)
      return sendJson(response, status, {
        error: isTimeout ? 'OpenAI API timeout' : error.message,
        ...(error.code ? { code: error.code, blocked: error.code === 'BLOCKED_INPUT' } : {}),
      })
    }
  }

  if (request.method === 'POST' && url.pathname === '/api/logs') {
    try {
      const { userId, eventType, page = null, metadata = {} } = await readJson(request)
      if (typeof userId !== 'string' || !userId || typeof eventType !== 'string' || !eventType) {
        return sendJson(response, 400, { error: 'userId and eventType are required' })
      }

      const result = insertLog.run(
        userId.slice(0, 100),
        eventType.slice(0, 100),
        typeof page === 'string' ? page.slice(0, 100) : null,
        JSON.stringify(metadata ?? {}).slice(0, 20_000),
        request.headers['user-agent'] || null,
        request.socket.remoteAddress || null,
      )
      return sendJson(response, 201, { id: Number(result.lastInsertRowid) })
    } catch (error) {
      return sendJson(response, 400, { error: error.message })
    }
  }

  const userLogsMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/logs$/)
  if (request.method === 'GET' && userLogsMatch) {
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 100, 1), 500)
    const rows = getUserLogs.all(decodeURIComponent(userLogsMatch[1]), limit).map((row) => ({
      ...row,
      metadata: JSON.parse(row.metadata),
    }))
    return sendJson(response, 200, { logs: rows })
  }

  return sendJson(response, 404, { error: 'Not found' })
})

server.listen(port, '0.0.0.0', () => {
  console.log(`Logger API: http://0.0.0.0:${port}`)
})
