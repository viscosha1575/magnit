# Magnit Translator

React/Vite-приложение с Node.js API, SQLite, генерацией формулировок через OpenAI Responses API и запуском через Docker Compose.

## Запуск

```bash
cp .env.example .env
```

Укажите в `.env` новый серверный ключ:

```dotenv
OPENAI_API_KEY=your-key
OPENAI_MODEL=gpt-5.4-mini
API_UPSTREAM=backend:3001
```

Затем запустите:

```bash
docker compose up --build -d
```

Приложение: `http://localhost:8080`  
Health check: `http://localhost:8080/api/health`

`API_UPSTREAM` задаёт backend, к которому frontend-контейнер проксирует `/api/`. Для обычного локального запуска оставьте `backend:3001`. В раздельном production-развёртывании укажите закрытый адрес удалённого backend, доступный только frontend-серверу.

Для отдельного API-сервера используется:

```bash
docker compose -f deploy/backend-compose.yml up --build -d
```

## Документация

- [REST API](./docs/API.md)
- [OpenAPI 3.1](./docs/openapi.yaml)
- [C4-архитектура](./docs/ARCHITECTURE.md)
