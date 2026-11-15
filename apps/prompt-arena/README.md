# Prompt Arena

Prompt Arena is a local-first prompt experimentation application. It compares prompt candidates across OpenAI, Anthropic and Gemini using the same objective and test input, then exposes individual outputs, repeated-trial variability, latency, token usage and explicit human winner selection.

## What works in this prototype
- Responsive Experiment Studio with editable prompt candidates.
- Live adapters for OpenAI Chat Completions, Anthropic Messages and Gemini generateContent.
- Cross-provider comparisons with 1–5 repeated trials.
- Bounded concurrency, request timeouts, input validation and local per-IP rate limiting.
- Aggregate ranking with mean score, sample count, score standard deviation and mean latency.
- Per-trial outputs, provider request IDs where available, token usage and errors.
- Transparent heuristic scoring provenance and optional reference-term overlap proxy.
- JSON and CSV export.
- Browser-local Prompt Library.
- Server-persisted local Run History using an atomic JSON snapshot file.
- PostgreSQL relational schema for the next persistence layer.

## Requirements and local setup
Node.js 20 or newer. No runtime npm dependencies.

~~~bash
cd apps/prompt-arena
cp .env.example .env
# Add one or more provider API keys to .env
npm start
~~~

Open http://127.0.0.1:4173.

### Provider credentials
Set one or more server-side environment variables: OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY. Optional model defaults and the OpenAI-compatible base URL are documented in .env.example. Keys are not entered in the browser and must never be committed to Git.

## Tests
~~~bash
npm test
~~~

## API
- GET /api/health — provider configured flags, model defaults and local storage mode; never returns credentials.
- POST /api/compare — execute prompt × provider × repetition trials.
- GET /api/experiments — list recent local experiment snapshots.
- POST /api/experiments — persist a completed snapshot.
- GET /api/experiments/:id — retrieve one saved snapshot.

## Evaluation integrity
Current scores are heuristic proxies, not factual correctness scores and not an LLM-as-a-judge result. Without a reference, the prototype uses observable output structure. With a reference answer, it measures expected-term overlap only; semantic equivalence and correctness are not established. Validate on a labelled benchmark and use independent human review before selecting a production prompt. The architecture document describes a separately versioned evaluator pipeline for future development.

Provider token usage is reported when the API returns it. Cost is not estimated because model pricing and billing terms change; a future cost feature should use a versioned provider pricing table.

## Data and security boundaries
- Local run history is stored in apps/prompt-arena/data/experiments.json; the directory is git-ignored.
- Prompt library entries are stored in browser local storage.
- API keys remain in the server process environment.
- The server binds to 127.0.0.1 by default.
- This prototype has no authentication, workspace isolation, PostgreSQL integration, durable queue or public deployment hardening. Do not expose it directly to the public internet.
- Avoid sending passwords, personal data, confidential source code or regulated data to model providers.
- In-memory rate limiting is process-local and resets when the server restarts.

See architecture.md for product architecture, execution invariants, data model, security requirements and roadmap. schema.sql is the PostgreSQL target schema.
