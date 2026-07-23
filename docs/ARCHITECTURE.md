# C4-архитектура Magnit Translator

## Стек

| Слой | Технологии |
|---|---|
| Web UI | React, Vite |
| API | Node.js, встроенный `http` |
| Данные | SQLite (`node:sqlite`), Apache Kafka |
| AI | OpenAI Responses API |
| Доставка | Nginx, Docker Compose |

## C4 Level 1 — System Context

```mermaid
flowchart LR
  user[Пользователь] -->|HTTPS/HTTP| system[Magnit Translator]
  system -->|Responses API / HTTPS| openai[OpenAI API]
```

Пользователь описывает работу, получает формулировку вклада и делится результатом. OpenAI доступен только backend-сервису.

В production frontend и backend могут находиться на разных серверах. Frontend принимает браузерные запросы `/api/*` на том же HTTPS-домене и проксирует их к Node.js API через `API_UPSTREAM`. Сетевой порт backend разрешён только для frontend-сервера; браузер и OpenAI-ключ к нему прямого доступа не имеют.

## C4 Level 2 — Containers

```mermaid
flowchart LR
  browser[Browser]
  nginx[Nginx + React static files]
  api[Node.js API]
  kafka[(Apache Kafka)]
  worker[Translation workers]
  sqlite[(SQLite volume)]
  openai[OpenAI Responses API]

  browser -->|UI и /api| nginx
  nginx -->|proxy /api| api
  api -->|job| kafka
  kafka --> worker
  worker -->|server-side HTTPS| openai
  api -->|jobs и product events| sqlite
  worker -->|result| sqlite
```

## C4 Level 3 — Backend Components

```mermaid
flowchart LR
  router[HTTP Router]
  validator[Input validation]
  queue[Kafka producer]
  worker[Kafka worker]
  translator[Translation service]
  logs[Log repository]
  sqlite[(SQLite)]
  openai[OpenAI API]

  router --> validator
  validator --> queue
  queue --> worker
  worker --> translator
  translator --> openai
  router --> logs
  logs --> sqlite
```

## Поток перевода

```mermaid
sequenceDiagram
  participant U as Пользователь
  participant R as React
  participant N as Node.js API
  participant K as Kafka
  participant W as Worker
  participant O as OpenAI API

  U->>R: Нажимает «Перевести»
  R->>N: POST /api/translate
  N->>N: Проверка 2–200 символов
  N->>K: Ставит задание в очередь
  N-->>R: 202 + jobId
  K->>W: Выдаёт задание
  W->>O: POST /v1/responses
  O-->>W: Результат классификации
  W->>N: Сохраняет утверждённый текст
  R->>N: GET /api/translate/jobs/:jobId
  N-->>R: completed + translatedText
  R->>R: Посимвольная анимация
  U->>R: Нажимает «Поделиться»
  R->>R: Подставляет sourceText + translatedText
```

## Безопасность

- `OPENAI_API_KEY` находится только в `.env`/Docker secret backend-сервиса.
- `.env` исключён из репозитория.
- Backend ограничивает вход до 200, а ответ до 100 символов.
- Kafka хранит очередь 24 часа; восемь разделов позволяют обрабатывать до восьми переводов параллельно.
- Неуспешные обращения к OpenAI повторяются до пяти раз с увеличивающейся задержкой.
- В продуктовые логи передаются длины и статусы, а не API-ключ.
- Для production нужны rate limit, корпоративная авторизация административного endpoint и HTTPS.
