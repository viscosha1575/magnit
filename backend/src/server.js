import http from 'node:http'
import { mkdirSync } from 'node:fs'
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
  LIMIT 8
`)
const insertTranslation = database.prepare(`
  INSERT INTO translations (source_key, source_text, translated_text)
  VALUES (?, ?, ?)
`)

const port = Number(process.env.PORT || 3001)
const allowedOrigin = process.env.CORS_ORIGIN || '*'
const openAiApiKey = process.env.OPENAI_API_KEY || ''
const openAiModel = process.env.OPENAI_MODEL || 'gpt-5.4-mini'
const unknownGroup = translationConfig.groups.find((group) => group.vacancy === 'Вакансия не найдена')
const blockedGroup = translationConfig.groups.find((group) => group.vacancy === 'Вакансии из стоп-листа')
const blockedResponse = blockedGroup.entries[0].approvedAnswer
const factCatalog = translationConfig.groups.filter(
  (group) => !['Вакансия не найдена', 'Вакансии из стоп-листа'].includes(group.vacancy),
)
const professionCatalog = factCatalog.map((group, id) => ({ id, vacancy: group.vacancy }))
const translationInstructions = `Ты — строгий классификатор профессий проекта «Твоя работа влияет на жизнь миллионов».

Работай только по этому алгоритму:
1. Определи профессию в запросе пользователя.
2. Если профессия соответствует одной из переданных групп вакансий, верни только числовой ID этой группы.
3. Если профессия не найдена, непонятна или запрос не является профессией, верни только NOT_FOUND.
4. Стоп-слова проверяются системой до этого запроса и получают отдельный копирайт. Не пытайся самостоятельно обрабатывать или переосмысливать их.

Запрещено писать готовый ответ, перефразировать утверждённые ответы, придумывать профессию или добавлять пояснения.

Формат ответа: только целое число из списка либо NOT_FOUND.`

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

const groupsByVacancy = new Map(translationConfig.groups.map((group) => [group.vacancy, group]))

function extractSelection(payload) {
  const raw = extractResponseText(payload).trim()
  try {
    const selection = JSON.parse(raw)
    if (typeof selection?.vacancy === 'string' && typeof selection?.answer === 'string') return selection
  } catch {
    return null
  }
  return null
}

async function translateContribution(text) {
  if (!openAiApiKey) {
    const error = new Error('OPENAI_API_KEY is not configured')
    error.status = 503
    throw error
  }

  const sourceKey = normalizeSourceKey(text)
  const previousTranslations = getRecentTranslations.all(sourceKey).map((row) => row.translated_text)
  const lastTranslation = previousTranslations[0] || ''
  const excluded = previousTranslations.length
    ? `\nНе повторяй предыдущий ответ:\n— ${lastTranslation}`
    : ''
  const fallbackOffset = Math.floor(Math.random() * fallbackVariants.length)
  const rotatedFallbacks = fallbackVariants.map((_, index) => fallbackVariants[(index + fallbackOffset) % fallbackVariants.length])

  let finalText = ''
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const apiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: openAiModel,
        instructions: translationInstructions,
        input: `Описание работы сотрудника:\n${text}\n\nФактура по вакансиям из Excel. Разрешено возвращать только точный approvedAnswer из выбранной группы:\n${JSON.stringify([
          ...factCatalog,
          { ...unknownGroup, entries: rotatedFallbacks.map((approvedAnswer) => ({ approvedAnswer })) },
        ])}${excluded}\nИдентификатор выбора: ${randomUUID()}\nПопытка: ${attempt + 1}`,
        max_output_tokens: 320,
      }),
      signal: AbortSignal.timeout(20_000),
    })

    if (!apiResponse.ok) {
      const error = new Error(`OpenAI API returned ${apiResponse.status}`)
      error.status = apiResponse.status === 429 ? 429 : 502
      throw error
    }

    const payload = await apiResponse.json()
    const selection = extractSelection(payload)
    if (!selection) continue
    const selectedGroup = groupsByVacancy.get(selection.vacancy)
    if (!selectedGroup || selectedGroup === blockedGroup) continue
    const candidate = selectedGroup.entries
      .map((entry) => entry.approvedAnswer)
      .find((answer) => answer === selection.answer)
    if (!candidate) continue

    if (candidate !== lastTranslation) {
      finalText = candidate
      break
    }

    const alternative = selectedGroup.entries
      .map((entry) => entry.approvedAnswer)
      .find((answer) => answer !== lastTranslation)
    if (alternative) {
      finalText = alternative
      break
    }
  }

  // Если у найденной профессии закончились уникальные утверждённые варианты
  // (например, в Excel для неё пока только один ответ), не повторяем его:
  // возвращаем дословный нейтральный копирайт из группы «Вакансия не найдена».
  if (!finalText) {
    finalText = rotatedFallbacks.find((answer) => !previousTranslations.includes(answer)) || ''
  }
  if (!finalText) {
    const error = new Error('No unused approved answer is available for this profession')
    error.status = 409
    throw error
  }
  insertTranslation.run(sourceKey, text, finalText)
  return finalText
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  })
  response.end(JSON.stringify(payload))
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
  let body = ''
  for await (const chunk of request) {
    body += chunk
    if (body.length > 64_000) throw new Error('Payload is too large')
  }
  return body ? JSON.parse(body) : {}
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') return sendJson(response, 204, {})

  const url = new URL(request.url, `http://${request.headers.host}`)

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
      return sendJson(response, status, { error: isTimeout ? 'OpenAI API timeout' : error.message })
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
