import http from 'node:http'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { Kafka, logLevel, Partitioners } from 'kafkajs'
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
  CREATE TABLE IF NOT EXISTS translation_jobs (
    id TEXT PRIMARY KEY,
    source_text TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    translated_text TEXT,
    error_code TEXT,
    error_message TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_translation_jobs_status_created
    ON translation_jobs (status, created_at);
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
const insertTranslationJob = database.prepare(`
  INSERT INTO translation_jobs (id, source_text, status)
  VALUES (?, ?, 'queued')
`)
const getTranslationJob = database.prepare(`
  SELECT id, source_text, status, translated_text, error_code, error_message, attempts, created_at, updated_at
  FROM translation_jobs
  WHERE id = ?
`)
const markTranslationJobProcessing = database.prepare(`
  UPDATE translation_jobs
  SET status = 'processing', attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP
  WHERE id = ? AND status IN ('queued', 'processing')
`)
const completeTranslationJob = database.prepare(`
  UPDATE translation_jobs
  SET status = 'completed', translated_text = ?, error_code = NULL, error_message = NULL, updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`)
const failTranslationJob = database.prepare(`
  UPDATE translation_jobs
  SET status = ?, error_code = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`)
const requeueTranslationJob = database.prepare(`
  UPDATE translation_jobs
  SET status = 'queued', error_code = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`)

const port = Number(process.env.PORT || 3001)
const allowedOrigin = process.env.CORS_ORIGIN || '*'
const openAiApiKey = process.env.OPENAI_API_KEY || ''
const openAiModel = process.env.OPENAI_MODEL || 'gpt-5.4-mini'
const kafkaBrokers = (process.env.KAFKA_BROKERS || '').split(',').map((value) => value.trim()).filter(Boolean)
const kafkaTopic = process.env.KAFKA_TRANSLATION_TOPIC || 'magnit.translation.requests.v1'
const kafkaPartitions = Math.max(1, Number(process.env.KAFKA_PARTITIONS) || 8)
const translationWorkerConcurrency = Math.max(1, Math.min(Number(process.env.TRANSLATION_WORKER_CONCURRENCY) || 8, kafkaPartitions))
const translationMaxAttempts = Math.max(1, Math.min(Number(process.env.TRANSLATION_MAX_ATTEMPTS) || 5, 10))
const testPanelEnabled = process.env.ENABLE_TEST_PANEL === 'true'
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
let retailCashierGroupId = factCatalog.findIndex(
  (group) => group.vacancy.includes('Продавец-кассир'),
)
let serviceRoleGroupId = factCatalog.findIndex(
  (group) => group.vacancy.includes('Сторож') && group.vacancy.includes('Уборщик'),
)
const translationInstructions = `Ты — строгий классификатор профессий проекта «Твоя работа влияет на жизнь миллионов».

Работай только по этому алгоритму:
1. Сначала проверь весь запрос на запрещённую тематику, страну или национальность. Эта проверка имеет абсолютный приоритет: если запрещённый элемент встречается хотя бы в одной части запроса, верни только BLOCKED, даже когда рядом указана подходящая профессия.
2. Только если запрос не заблокирован, определи профессию пользователя.
3. Если профессия или явно названное направление работы соответствует одной из переданных групп, верни только числовой ID этой группы. Фраза «работаю в логистике» относится к направлению «Логистика» и не является неизвестной профессией.
4. Если профессия не найдена, непонятна или запрос не является профессией, верни только NOT_FOUND.
5. Стоп-слова также проверяются системой до этого запроса. Не пытайся переосмысливать или пропускать их из-за наличия профессии.

Запрещено писать готовый ответ, перефразировать утверждённые ответы, придумывать профессию или добавлять пояснения.

Формат ответа: только целое число из списка либо NOT_FOUND.`
const classificationOutputContract = `

ОБЯЗАТЕЛЬНЫЙ ТЕХНИЧЕСКИЙ ФОРМАТ ОТВЕТА:
— не возвращай готовый копирайт: его выберет сервер из фактуры;
— если запрос связан с войной, военной деятельностью, оружием, насилием, политикой, наркотиками, сексуальными услугами, содержит любую страну, национальность или название конкурирующего бренда (включая X5/Х5), верни только BLOCKED;
— проверяй на страну и национальность весь запрос целиком, включая любые падежи, род, число, дефисы и сочетания с профессией;
— наличие распознанной профессии никогда не отменяет блокировку. Примеры: «кассир русский», «русский кассир», «кассир — казах», «продавец из России», «уборщица украинка» → только BLOCKED;
— если страна или национальность написана с опечаткой, в том числе с одной пропущенной, лишней или заменённой буквой, считай её запрещённой и верни только BLOCKED;
— сначала ищи прямое совпадение профессии, включая падеж, число, род и общеупотребимые варианты названия;
— если прямого совпадения нет, выбери наиболее близкую группу по реальным обязанностям и направлению работы;
— выбирай похожую профессию только при ясном профессиональном соответствии, а не по одному случайному слову;
— примеры: «кассир» → группа «Продавец / Старший продавец / Продавец-кассир / Товаровед / Сотрудник зала»; «рекрутер» → «HR / специалист по подбору персонала»; «программист» или «фронтенд-разработчик» → «Разработчик (все форматы)»; «комплектовщик» → «Кладовщик / складской рабочий / сотрудник склада»;
— если профессию нельзя уверенно связать ни с одной группой, верни только NOT_FOUND;
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
const countryDisplayNames = new Intl.DisplayNames(['ru'], { type: 'region' })
const countryTerms = []
for (let first = 65; first <= 90; first += 1) {
  for (let second = 65; second <= 90; second += 1) {
    const code = `${String.fromCharCode(first)}${String.fromCharCode(second)}`
    const name = countryDisplayNames.of(code)
    if (name && name !== code) countryTerms.push(normalizeForSafety(name))
  }
}
const geographyTerms = [
  ...countryTerms,
  'россии', 'россию', 'россией', 'рф', 'украине', 'украину', 'украиной',
  'беларуси', 'белоруссии', 'казахстане', 'казахстаном', 'узбекистане',
  'таджикистане', 'кыргызстане', 'киргизии', 'арменией', 'грузией', 'азербайджане',
  'русский', 'русского', 'русскому', 'русским', 'русском',
  'русская', 'русской', 'русскую', 'русские', 'русских', 'русскими',
  'россиянин', 'россиянина', 'россиянину', 'россиянином', 'россиянине',
  'россиянка', 'россиянки', 'россиянке', 'россиянку', 'россиянкой',
  'россияне', 'россиян', 'россиянам', 'россиянами', 'россиянах',
  'украинец', 'украинца', 'украинцу', 'украинцем', 'украинце',
  'украинка', 'украинки', 'украинке', 'украинку', 'украинкой',
  'украинцы', 'украинцев', 'украинцам', 'украинцами', 'украинцах',
  'белорус', 'белоруса', 'белорусу', 'белорусом', 'белорусе',
  'белоруска', 'белоруски', 'белоруске', 'белоруску', 'белоруской',
  'белорусы', 'белорусов', 'белорусам', 'белорусами', 'белорусах',
  'казах', 'казаха', 'казаху', 'казахом', 'казахе',
  'казашка', 'казашки', 'казашке', 'казашку', 'казашкой',
  'казахи', 'казахов', 'казахам', 'казахами', 'казахах',
  'узбек', 'узбека', 'узбеку', 'узбеком', 'узбеке',
  'узбечка', 'узбечки', 'узбечке', 'узбечку', 'узбечкой',
  'узбеки', 'узбеков', 'узбекам', 'узбеками', 'узбеках',
  'таджик', 'таджика', 'таджику', 'таджиком', 'таджике',
  'таджичка', 'таджички', 'таджичке', 'таджичку', 'таджичкой',
  'таджики', 'таджиков', 'таджикам', 'таджиками', 'таджиках',
  'кыргыз', 'кыргызы', 'кыргыза', 'кыргызу', 'кыргызом',
  'киргиз', 'киргиза', 'киргизу', 'киргизом', 'киргизе',
  'армянин', 'армянина', 'армянину', 'армянином', 'армянине',
  'армянка', 'армянки', 'армянке', 'армянку', 'армянкой',
  'грузин', 'грузинка', 'азербайджанец', 'азербайджанка', 'молдаванин', 'молдаванка',
  'американец', 'американка', 'канадец', 'канадка', 'мексиканец', 'мексиканка',
  'китаец', 'китаянка', 'японец', 'японка', 'кореец', 'кореянка',
  'немец', 'немка', 'француз', 'француженка', 'британец', 'британка',
  'англичанин', 'англичанка', 'испанец', 'испанка', 'итальянец', 'итальянка',
  'поляк', 'полька', 'чех', 'чешка', 'словак', 'словачка', 'румын', 'румынка',
  'болгарин', 'болгарка', 'серб', 'сербка', 'хорват', 'хорватка',
  'турок', 'турчанка', 'грек', 'гречанка', 'еврей', 'еврейка',
  'араб', 'арабка', 'индиец', 'индианка', 'пакистанец', 'пакистанка',
  'афганец', 'афганка', 'иранец', 'иранка', 'иракец', 'иракчанка',
  'израильтянин', 'израильтянка', 'египтянин', 'египтянка',
  'бразилец', 'бразильянка', 'аргентинец', 'аргентинка',
  'африканец', 'африканка', 'австралиец', 'австралийка',
].map(normalizeForSafety)
const mandatoryForbiddenTerms = [
  ...geographyTerms,
  'x5', 'х5', 'x 5', 'х 5', 'x5 group', 'x5 групп', 'х5 групп', 'икс 5',
]
const configuredForbiddenTerms = stopwordsConfig.categories.flatMap((category) => [
  ...category.words,
  ...(category.phrases || []),
])
const forbiddenWords = new Set()
const forbiddenPhrases = new Set()
const fuzzyGeographyTerms = [...new Set(
  geographyTerms.filter((term) => !term.includes(' ') && term.length >= 5),
)]
for (const value of [...configuredForbiddenTerms, ...geographyTerms]) {
  if (!value) continue
  if (value.includes(' ')) forbiddenPhrases.add(value)
  else forbiddenWords.add(value)
}
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
  retailCashierGroupId = factCatalog.findIndex(
    (group) => group.vacancy.includes('Продавец-кассир'),
  )
  serviceRoleGroupId = factCatalog.findIndex(
    (group) => group.vacancy.includes('Сторож') && group.vacancy.includes('Уборщик'),
  )
}

function applyTestSettings(settings = {}) {
  if (typeof settings.prompt === 'string' && settings.prompt.trim()) activeTranslationInstructions = settings.prompt.trim()
  if (Array.isArray(settings.stopwords)) {
    forbiddenWords.clear()
    forbiddenPhrases.clear()
    for (const rawValue of [...mandatoryForbiddenTerms, ...settings.stopwords]) {
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
  if (words.some((word) => word.length >= 4 && fuzzyGeographyTerms.some((term) => {
    if (Math.abs(word.length - term.length) > 1) return false
    let left = 0
    let right = 0
    let edits = 0
    while (left < word.length && right < term.length) {
      if (word[left] === term[right]) {
        left += 1
        right += 1
        continue
      }
      edits += 1
      if (edits > 1) return false
      if (word.length > term.length) left += 1
      else if (term.length > word.length) right += 1
      else {
        left += 1
        right += 1
      }
    }
    return edits + (word.length - left) + (term.length - right) <= 1
  }))) return true

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
  if (approvedAnswers.length === 1) return approvedAnswers[0]

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
    serviceRoleGroupId >= 0
    && /(?:^|\s)(?:сторож[а-я]*|уборщ[а-я]*|дворник[а-я]*|вахтер[а-я]*|гардеробщ[а-я]*|клинер[а-я]*)(?:\s|$)/.test(normalizedText)
  ) {
    return { groupId: serviceRoleGroupId, group: factCatalog[serviceRoleGroupId] }
  }
  if (
    retailCashierGroupId >= 0
    && /(?:^|\s)(?:кассир|кассира|кассиру|кассиром|кассире|кассиры|кассиров|кассирам|кассирами|кассирах)(?:\s|$)/.test(normalizedText)
  ) {
    return { groupId: retailCashierGroupId, group: factCatalog[retailCashierGroupId] }
  }
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

let kafkaProducer = null
let kafkaConsumer = null
let kafkaReady = false

async function processTranslationJob(jobId) {
  const job = getTranslationJob.get(jobId)
  if (!job || ['completed', 'blocked'].includes(job.status)) return

  markTranslationJobProcessing.run(jobId)
  try {
    if (isBlockedInput(job.source_text)) {
      failTranslationJob.run('blocked', 'BLOCKED_INPUT', blockedResponse, jobId)
      return
    }

    const translatedText = await translateContribution(job.source_text)
    completeTranslationJob.run(translatedText, jobId)
  } catch (error) {
    const isTimeout = error.name === 'TimeoutError' || error.name === 'AbortError'
    const code = error.code || (isTimeout ? 'UPSTREAM_TIMEOUT' : 'TRANSLATION_FAILED')
    const message = isTimeout ? 'OpenAI API timeout' : error.message
    const nextAttempt = job.attempts + 1
    if (code !== 'BLOCKED_INPUT' && nextAttempt < translationMaxAttempts && kafkaProducer) {
      requeueTranslationJob.run(code, message, jobId)
      await new Promise((resolveDelay) => setTimeout(resolveDelay, Math.min(8000, 500 * (2 ** nextAttempt))))
      await kafkaProducer.send({
        topic: kafkaTopic,
        acks: -1,
        messages: [{ key: jobId, value: JSON.stringify({ jobId }) }],
      })
      return
    }
    failTranslationJob.run(code === 'BLOCKED_INPUT' ? 'blocked' : 'failed', code, message, jobId)
    console.error(`Translation job ${jobId} failed:`, message)
  }
}

async function startKafkaQueue() {
  if (!kafkaBrokers.length) return

  const kafka = new Kafka({
    clientId: `magnit-translator-${process.pid}`,
    brokers: kafkaBrokers,
    logLevel: logLevel.WARN,
  })
  const admin = kafka.admin()
  await admin.connect()
  const topics = await admin.listTopics()
  if (!topics.includes(kafkaTopic)) {
    await admin.createTopics({
      waitForLeaders: true,
      topics: [{
        topic: kafkaTopic,
        numPartitions: kafkaPartitions,
        replicationFactor: 1,
        configEntries: [
          { name: 'retention.ms', value: '86400000' },
          { name: 'cleanup.policy', value: 'delete' },
        ],
      }],
    })
  }
  await admin.disconnect()

  kafkaProducer = kafka.producer({
    allowAutoTopicCreation: false,
    idempotent: true,
    maxInFlightRequests: 1,
    createPartitioner: Partitioners.DefaultPartitioner,
  })
  kafkaConsumer = kafka.consumer({
    groupId: 'magnit-translation-workers-v1',
    allowAutoTopicCreation: false,
    sessionTimeout: 30_000,
  })
  await kafkaProducer.connect()
  await kafkaConsumer.connect()
  await kafkaConsumer.subscribe({ topic: kafkaTopic, fromBeginning: false })
  await kafkaConsumer.run({
    partitionsConsumedConcurrently: translationWorkerConcurrency,
    eachMessage: async ({ message }) => {
      try {
        const { jobId } = JSON.parse(message.value?.toString() || '{}')
        if (typeof jobId === 'string' && jobId) await processTranslationJob(jobId)
      } catch (error) {
        console.error('Invalid translation queue message:', error.message)
      }
    },
  })
  kafkaReady = true
  console.log(`Kafka translation queue ready: ${kafkaTopic}, concurrency=${translationWorkerConcurrency}`)
}

async function enqueueTranslation(text) {
  if (!kafkaReady || !kafkaProducer) {
    const error = new Error('Translation queue is temporarily unavailable')
    error.status = 503
    throw error
  }

  const jobId = randomUUID()
  insertTranslationJob.run(jobId, text)
  try {
    await kafkaProducer.send({
      topic: kafkaTopic,
      acks: -1,
      messages: [{ key: jobId, value: JSON.stringify({ jobId }) }],
    })
  } catch (error) {
    failTranslationJob.run('failed', 'QUEUE_UNAVAILABLE', error.message, jobId)
    throw error
  }
  return jobId
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Prefer, X-Telegram-Init-Data',
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

      if (kafkaBrokers.length && request.headers.prefer === 'respond-async') {
        const jobId = await enqueueTranslation(text.trim())
        return sendJson(response, 202, {
          jobId,
          status: 'queued',
          statusUrl: `/api/translate/jobs/${jobId}`,
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

  const translationJobMatch = url.pathname.match(/^\/api\/translate\/jobs\/([0-9a-f-]{36})$/i)
  if (request.method === 'GET' && translationJobMatch) {
    const job = getTranslationJob.get(translationJobMatch[1])
    if (!job) return sendJson(response, 404, { error: 'Translation job not found' })
    return sendJson(response, 200, {
      jobId: job.id,
      status: job.status,
      ...(job.translated_text ? { translatedText: job.translated_text } : {}),
      ...(job.error_code ? { code: job.error_code } : {}),
      ...(job.error_message ? { error: job.error_message } : {}),
    })
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

try {
  await startKafkaQueue()
  server.listen(port, '0.0.0.0', () => {
    console.log(`Logger API: http://0.0.0.0:${port}`)
  })
} catch (error) {
  console.error('Failed to start translation queue:', error.message)
  process.exit(1)
}

const shutdown = async () => {
  kafkaReady = false
  server.close()
  await Promise.allSettled([
    kafkaConsumer?.disconnect(),
    kafkaProducer?.disconnect(),
  ])
  database.close()
  process.exit(0)
}
process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
