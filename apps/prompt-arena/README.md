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
- PATCH /api/experiments/:id — persist a human-selected winner.

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


## AI prompt optimization pipeline
The live optimization workflow is available from the existing studio via **AI Prompt Optimizer** or directly at `/arena`.
- `POST /api/arena/run` generates 2–8 diverse prompt candidates, executes each against the same task/provider/model/settings, blindly judges successful outputs, calculates a weighted score and selects a winner.
- The default rubric is correctness 35%, relevance 20%, completeness 20%, clarity 10%, and constraint adherence 15%. Each dimension is scored 1–5 and normalized to 0–100.
- Generator, executor and judge provider/model are configurable. For less correlated evaluation, choose a different judge provider/model from the execution model.
- The winning prompt, output, leaderboard and trial details are persisted to the existing local experiment history.
- `GET /api/benchmark/100` returns the versioned benchmark suite.

The LLM judge is an estimate, not ground truth. Use reference answers, independent tests and human review for release decisions. The API does not claim a prompt is objectively best.

## 100-task benchmark
The initial benchmark is `benchmark/benchmark-100.jsonl`: 100 tasks across ten categories, with reference answers and evaluation notes. See `benchmark/README.md` for protocol and caveats.

Run a cost-conscious five-case smoke benchmark:
```bash
npm run benchmark
```

Run a larger sample or all 100 tasks:
```bash
npm run benchmark -- --limit 20
npm run benchmark -- --all
```

Set `PROMPT_ARENA_PROVIDER`, `PROMPT_ARENA_MODEL`, and optionally `PROMPT_ARENA_CANDIDATES` to configure the run. The runner includes a fixed baseline prompt in each task's competition and writes a local JSON report under `benchmark/results/`. Live runs require provider credentials and incur provider charges. No live benchmark score is claimed until the runner has actually been executed.
