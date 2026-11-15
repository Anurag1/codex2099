# Prompt Arena

Prompt Arena is a controlled prompt-comparison workbench with a static demo mode and a Node.js live-provider backend.

## Features
- Edit, add and remove prompt variants.
- Run all variants against the same user input and objective.
- Live adapters for OpenAI Chat Completions, Anthropic Messages and Gemini generateContent.
- Cross-provider comparison and repeated trials (1–5).
- Per-result latency and provider token usage when returned.
- Transparent heuristic scoring with provenance; optional expected-answer term-overlap proxy.
- JSON/CSV export in the browser prototype, blind demo review, human preference selection and prompt evolution.
- Server-side API keys only; no key entry in browser UI.

## Run locally
Requirements: Node.js 20+.

```bash
cd apps/prompt-arena
cp .env.example .env
# Add one or more provider keys to .env
npm start
```

Open http://127.0.0.1:4173. The server binds to loopback by default. To use a different host/origin, configure `HOST` and `ALLOWED_ORIGIN` deliberately.

### Provider credentials
Set one or more of:
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`

Optional model defaults and OpenAI-compatible base URL are in `.env.example`. API keys are read only by the server process. Never commit a populated `.env` file or expose provider keys to client-side JavaScript.

## Run tests
```bash
npm test
```

## API
- `GET /api/health` — reports which provider credentials are configured (never returns secrets).
- `POST /api/compare` — executes prompt × provider × repetition tasks in parallel with bounded concurrency.

Example request:
```json
{
  "objective": "Extract invoice fields accurately",
  "input": "Invoice AR-12 total INR 500",
  "expected_output": "AR-12 INR 500",
  "variants": [
    {"name":"Strict JSON","prompt":"Extract only explicit facts. Return JSON."},
    {"name":"Verifier","prompt":"Extract fields and verify against source. Use null for missing."}
  ],
  "providers": [{"provider":"openai","model":"gpt-4o-mini"}],
  "repetitions": 2,
  "temperature": 0.2,
  "max_tokens": 1200
}
```

## Evaluation integrity
Scores are **heuristic proxies**, not a claim of semantic correctness and not an LLM-as-a-judge result. Without a reference answer, scoring uses observable output features. With a reference answer, the optional metric is expected-term overlap; it is not semantic equivalence. Validate with labelled datasets and human review before relying on rankings. Cost is not estimated because provider price schedules change; token usage is reported when supplied by the provider.

## Security and deployment limitations
- Server defaults to `127.0.0.1`, suitable for local development.
- This MVP has no user authentication, workspace isolation, persistent run database, or durable job queue. Do not expose it directly to the public internet.
- For hosted use, add authentication, HTTPS, a secret manager, persistent storage, audit logging, stricter quotas, provider spend caps and an async job queue.
- In-memory rate limiting is process-local and resets on restart.
- Avoid submitting credentials, personal data, confidential documents or regulated data.
- Provider terms, model availability, rate limits and billing are controlled by each provider.

See [architecture.md](architecture.md) and [schema.sql](schema.sql).
