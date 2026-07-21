# Magnit Translator API

Node.js backend хранит продуктовые события в SQLite и обращается к OpenAI. React никогда не получает `OPENAI_API_KEY`.

## Base URL

- Docker Compose: `http://localhost:8080/api`
- backend напрямую: `http://localhost:3001/api`

## Переменные окружения

```dotenv
OPENAI_API_KEY=your-key
OPENAI_MODEL=gpt-5.4-mini
```

## `GET /api/health`

```json
{ "ok": true, "openaiConfigured": true }
```

## `POST /api/translate`

Запрос:

```json
{
  "text": "Я работаю в логистике",
  "userId": "5de4b13e-0c25-42f1-9c7d-f17601f519d8"
}
```

`text` — строка от 2 до 200 символов. Backend просит модель вернуть одну русскую фразу длиной до 100 символов.

Ответ:

```json
{
  "sourceText": "Я работаю в логистике",
  "translatedText": "Я помогаю миллионам людей получать нужные товары вовремя"
}
```

Коды ошибок: `400` — некорректный текст, `429` — лимит OpenAI, `502` — ошибка модели, `503` — ключ не настроен, `504` — timeout.

## `POST /api/logs`

Сохраняет продуктовое событие в SQLite.

```json
{
  "userId": "5de4b13e-0c25-42f1-9c7d-f17601f519d8",
  "eventType": "translation_succeeded",
  "page": "next",
  "metadata": { "resultLength": 61 }
}
```

## `GET /api/users/{userId}/logs?limit=100`

Возвращает события пользователя, начиная с новых. Максимальный `limit` — 500.

[Официальное руководство OpenAI по моделям](https://developers.openai.com/api/docs/models).
