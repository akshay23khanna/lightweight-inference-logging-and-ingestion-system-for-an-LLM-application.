# LLM Inference Logging and Ingestion System

A lightweight full-stack demo for logging LLM inference metadata in near real time. The project includes a React chatbot UI, an Express API, a small Gemini wrapper SDK, an ingestion endpoint, JSON-file persistence, and an analytics dashboard for latency, token usage, status, sessions, and raw log inspection.

## GitHub Repository

Source code: [akshay23khanna/lightweight-inference-logging-and-ingestion-system-for-an-LLM-application.](https://github.com/akshay23khanna/lightweight-inference-logging-and-ingestion-system-for-an-LLM-application.)

## Features

- Multi-turn chatbot UI with session list and conversation resume.
- Server-side LLM calls through Google Gemini using `@google/genai`.
- Lightweight SDK wrapper around inference calls.
- Near real-time log ingestion through `/api/logs/ingest`.
- Captures provider, model, latency, token usage, timestamps, status, errors, conversation ID, and input/output previews.
- Stores chat messages and inference logs in a local JSON database.
- Dashboard with total requests, average latency, success/error rate, token totals, model distribution, latency history, and searchable raw logs.
- Simulated error ingestion for testing failure paths.

## Tech Stack

- Frontend: React 19, Vite, Tailwind CSS, lucide-react
- Backend: Node.js, Express, TypeScript
- Deployment API: Vercel serverless functions in `api/`
- LLM Provider: Google Gemini via `@google/genai`
- Storage: Local JSON file at `data/db.json`

## Architecture Overview

```text
User Chat UI
  |
  | POST /api/chat
  v
Express Backend
  |
  | saves user message
  | loads conversation history
  v
LlmLoggerSdk wrapper
  |
  | calls Gemini model
  | measures latency and token usage
  | sends async telemetry payload
  v
POST /api/logs/ingest
  |
  | validates payload
  | extracts metadata
  | stores processed record
  v
JSON Database
  |
  v
Dashboard / Logs UI
```

## Setup Instructions

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file or export these environment variables:

```bash
GEMINI_API_KEY="your_gemini_api_key"
APP_URL="http://localhost:3000"
```

`GEMINI_API_KEY` is required for live LLM responses. `APP_URL` is used by the SDK to send logs to the ingestion endpoint. If omitted, it defaults to `http://localhost:3000`.

For Vercel deployments, add `GEMINI_API_KEY` in Project Settings > Environment Variables. The `api/` directory provides Vercel serverless versions of the chat, ingestion, logs, messages, sessions, stats, and clear endpoints.

3. Start the development server:

```bash
npm run dev
```

4. Open the app:

```text
http://localhost:3000
```

## Production Build

```bash
npm run build
npm start
```

## API Endpoints

### `POST /api/chat`

Runs a chatbot inference and saves both the user message and model response.

Request body:

```json
{
  "conversationId": "session_abc123",
  "prompt": "Explain inference logging",
  "model": "gemini-1.5-flash"
}
```

### `POST /api/logs/ingest`

Receives telemetry from the SDK, validates it, derives latency and token totals, then stores a processed inference log.

### `GET /api/logs`

Returns ingested logs. Supports optional `model`, `status`, `search`, and `limit` query parameters.

### `GET /api/messages/:conversationId`

Returns chat messages for a conversation.

### `GET /api/sessions`

Returns conversation sessions with last-active timestamp and message count.

### `GET /api/stats`

Returns aggregate dashboard metrics.

### `POST /api/clear`

Clears stored messages and logs.

## Schema Design

### Chat Messages

```ts
interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'model';
  content: string;
  timestamp: string;
}
```

Chat messages are stored separately from inference logs so conversations can be resumed without coupling the UI to telemetry records.

### Inference Logs

```ts
interface InferenceLog {
  id: string;
  conversationId: string;
  model: string;
  provider: string;
  latencyMs: number;
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  timestamp: string;
  status: 'success' | 'error';
  errorMsg: string | null;
  inputPreview: string;
  outputPreview: string;
}
```

The ingestion endpoint stores only previews of inputs and outputs. This keeps log records compact and reduces accidental exposure of long prompt or response bodies.

## Logging Strategy

The `LlmLoggerSdk` wraps Gemini calls and records:

- start and end timestamps
- latency in milliseconds
- selected model and provider
- conversation/session ID
- success or error status
- API error message when present
- prompt and completion token counts
- input and output previews

Log transmission is asynchronous, so the user-facing chat request is not delayed by telemetry storage. If the HTTP call to the ingestion endpoint fails locally, the SDK falls back to directly writing a processed log through the database module.

## Ingestion Flow

1. SDK sends a structured telemetry payload to `/api/logs/ingest`.
2. The ingestion route validates required fields.
3. Latency is calculated from `startTime` and `endTime`.
4. Token totals are extracted from provider metadata or estimated when unavailable.
5. Input/output previews are truncated.
6. The processed log is appended to `data/db.json`.
7. The dashboard reads aggregate stats and raw logs from API endpoints.

## Tradeoffs

- JSON-file storage keeps the demo easy to run with no external services, but it is not suitable for high-concurrency production workloads.
- Vercel serverless endpoints use warm-instance memory for demo telemetry, so data can reset across cold starts. A hosted production version should use a managed database.
- The SDK currently supports Google Gemini only. The UI offers multiple Gemini model names, but not multiple providers.
- Logging is near real time and asynchronous, but there is no durable retry queue.
- Input/output previews are truncated, but there is no full PII redaction pipeline.
- Dashboard metrics are computed in process from the JSON file, which is fine for a demo but should move to a real analytical store at scale.

## Scaling Considerations

For production usage, the ingestion path should be separated from the chat API:

- Put Kafka, RabbitMQ, Pub/Sub, or another queue between the SDK and storage layer.
- Batch inserts into PostgreSQL, ClickHouse, BigQuery, or another analytics-friendly datastore.
- Add schema validation with a dedicated library such as Zod.
- Use a retry buffer or dead-letter queue for failed telemetry writes.
- Add provider adapters for OpenAI, Anthropic, Gemini, and others behind one SDK interface.
- Add authentication and rate limiting to ingestion endpoints.
- Add PII redaction before persistence.

## Failure Handling Assumptions

- Missing or invalid `GEMINI_API_KEY` returns a chat error message and records an error log.
- Invalid ingestion payloads are rejected with HTTP 400.
- Local storage write failures are logged to the server console.
- The current implementation prioritizes demo simplicity over guaranteed delivery.

## What I Would Improve With More Time

- Add Docker Compose with API, frontend, and PostgreSQL.
- Add streaming responses with cancellation using `AbortController`.
- Add true multi-provider adapters.
- Add OpenTelemetry-compatible spans and metrics.
- Add PII redaction and configurable retention.
- Add automated tests for SDK logging, ingestion validation, and dashboard stats.
- Deploy to a self-hosted Kubernetes environment.

## Demo Notes

Run the app locally with `npm run dev`, enter a prompt in the chatbot, and watch the dashboard update with latency, token usage, status, model distribution, and raw ingestion records.
