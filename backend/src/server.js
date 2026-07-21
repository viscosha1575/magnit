import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import translationConfig from './translation-config.json' with { type: 'json' }

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
const fallbackVariants = unknownGroup.entries.map((entry) => entry.approvedAnswer)
const blockedResponse = blockedGroup.entries[0].approvedAnswer
const factCatalog = translationConfig.groups.filter(
  (group) => !['Вакансия не найдена', 'Вакансии из стоп-листа'].includes(group.vacancy),
)
const translationInstructions = `Ты — редактор проекта «Твоя работа влияет на жизнь миллионов».

Преобразуй описание профессии сотрудника в короткую фразу, строго опираясь на переданную фактуру из Excel.

Алгоритм:
1. Найди в фактуре наиболее подходящую вакансию или группу вакансий.
2. Выбери одну из связанных с ней записей «Ценности и смыслы».
3. Сформулируй ответ, который передаёт именно выбранные ценности и смыслы.
4. Утверждённый ответ и дополнительный факт из той же записи используй как ориентир по содержанию и тону.
5. Не смешивай смыслы разных вакансий и не добавляй ценности, которых нет в выбранной записи.

Требования:
— пиши от первого лица;
— начинай со слова «Я»;
— показывай не должность, а результат работы;
— используй конкретные и понятные формулировки;
— длина ответа — примерно от 55 до 130 символов;
— одно предложение без точки в конце;
— не используй списки, пояснения и рекламные лозунги;
— не повторяй исходное описание;
— не придумывай факты, цифры, аудитории или эффекты, которых нет в выбранной записи;
— слово «Магнит» используй только тогда, когда оно естественно следует из выбранной фактуры; обязательного упоминания бренда нет;
— для одной профессии каждый раз выбирай другую связанную запись или создавай новую формулировку того же смысла;
— если профессия непонятна, бессмысленна или не соответствует ни одной группе, верни ОДИН из fallback-вариантов, указанных во входе.

Верни только готовую фразу.`

const normalizeForSafety = (value) => value
  .toLowerCase()
  .replace(/ё/g, 'е')
  .replace(/[0@]/g, 'о')
  .replace(/[3]/g, 'з')
  .replace(/[4]/g, 'ч')
  .replace(/[6]/g, 'б')
  .replace(/[^a-zа-я0-9]+/g, ' ')
  .trim()

const forbiddenPatterns = [
  /(?:бля(?:д|т)?|сук[аи]|муд(?:ак|ил)|гандон|пидор|педик|шлюх|проститут|урод|дебил|идиот|кретин)[a-zа-я]*/i,
  /(?:пизд|хуй|хуе|хуя|ебан|ебат|ебут|ебуч|ебл|долбоеб|долбаеб|уеб|заеб|наеб|выеб|проеб|съеб|поеб)\w*/i,
  /(?:нацист|фашист|расист|террорист|экстремист)[a-zа-я]*/i,
  /(?:политик|президент|депутат|министр|госдум|правительств|путин|зеленск|трамп|навальн|единая\s*россия|кпрф|лдпр|войн)[a-zа-я]*/i,
  /(?:^|\s)сво(?:\s|$)/i,
]

function isBlockedInput(text) {
  const normalized = normalizeForSafety(text)
  const compact = normalized.replace(/\s+/g, '')
  return forbiddenPatterns.some((pattern) => pattern.test(normalized) || pattern.test(compact))
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

async function translateContribution(text) {
  if (!openAiApiKey) {
    const error = new Error('OPENAI_API_KEY is not configured')
    error.status = 503
    throw error
  }

  const sourceKey = normalizeSourceKey(text)
  const previousTranslations = getRecentTranslations.all(sourceKey).map((row) => row.translated_text)
  const excluded = previousTranslations.length
    ? `\nНе повторяй эти предыдущие ответы:\n${previousTranslations.map((value) => `— ${value}`).join('\n')}`
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
        input: `Описание работы сотрудника:\n${text}\n\nФактура по вакансиям из Excel (vacancy → meaning → approvedAnswer; additionalFact — крайний столбец):\n${JSON.stringify(factCatalog)}\n\nFallback-варианты для непонятной профессии:\n${rotatedFallbacks.map((value) => `— ${value}`).join('\n')}${excluded}\nИдентификатор нового варианта: ${randomUUID()}\nПопытка: ${attempt + 1}`,
        max_output_tokens: 160,
      }),
      signal: AbortSignal.timeout(20_000),
    })

    if (!apiResponse.ok) {
      const error = new Error(`OpenAI API returned ${apiResponse.status}`)
      error.status = apiResponse.status === 429 ? 429 : 502
      throw error
    }

    const payload = await apiResponse.json()
    const candidate = extractResponseText(payload)
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^[«"“]+|[»"”]+$/g, '')
      .replace(/[.!?]+$/g, '')
      .slice(0, 160)
      .trim()
    if (!candidate) continue

    const duplicate = previousTranslations.some((value) => value.toLowerCase() === candidate.toLowerCase())
    if (!duplicate) {
      finalText = candidate
      break
    }
  }

  if (!finalText) {
    const error = new Error('OpenAI API did not return a unique response')
    error.status = 502
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
