# Prompt Arena Architecture

## Logical system
Browser UI → Application API → experiment orchestration → ProviderAdapter → model provider. Evaluation is a separate service: heuristic evaluator, optional LLM judge, reference evaluator, and human preference capture. Persistence is PostgreSQL; secrets live in a server-side secret manager.

## Controlled experiment invariant
Each prompt candidate in a comparison must receive identical test input, model/provider configuration, system context, generation parameters, and evaluator rubric. Freeze a run manifest containing prompt version IDs, model/version, temperature, max tokens, seed where supported, input hash, rubric version and creation time.

## Run lifecycle
1. Validate objective, prompt candidates, test cases, model configuration and cost ceiling.
2. Freeze experiment manifest and immutable prompt versions.
3. Create one output task per prompt × model × test case × repetition.
4. Dispatch with bounded concurrency, timeout and bounded retry/backoff.
5. Persist output, provider request ID, latency, token usage and cost when available.
6. Evaluate separately and store evaluator type and score provenance.
7. Rank with visible weighted rubric. Keep human preference separate.
8. Explicitly choose winner; preserve its immutable version.
9. Evolve by creating a child prompt variant; never overwrite a parent.

## Evaluation
Default dimensions: task success 30%, correctness 30%, completeness 15%, instruction adherence 15%, clarity 10%. Scores should be normalized to 0–100; weighted score = sum(weight × normalized dimension score) / sum(weights). Human preference is reported independently, not silently merged into machine scores. Show evaluator type, rubric version, evidence/rationale and uncertainty.

Repeated stochastic trials should report sample count, mean, standard deviation and per-case breakdown. Never claim a statistical win based on a single sample.

## Suggested API
- POST /api/experiments
- GET /api/experiments/:id
- POST /api/experiments/:id/variants
- POST /api/experiments/:id/runs
- GET /api/runs/:id
- POST /api/outputs/:id/evaluations
- POST /api/outputs/:id/votes
- POST /api/experiments/:id/evolve
- GET /api/experiments/:id/export?format=json|csv

## Security / operations
Store only secret references in database; never expose API keys to browser code. Redact authorization headers and sensitive prompt content in logs. Apply auth/workspace isolation, rate limits, concurrency caps, provider timeouts, retries and per-run spend ceilings. Warn against submitting secrets or sensitive personal data.


## Implemented live-provider MVP
The current code implements a Node.js 20+ HTTP server with no runtime dependencies:
- `lib/providers.mjs`: OpenAI Chat Completions, Anthropic Messages and Gemini generateContent adapters.
- `server.mjs`: health endpoint, comparison endpoint, request validation, per-IP in-memory rate limiting, bounded concurrency and provider timeouts.
- `lib/evaluation.mjs`: input validation, heuristic rubric proxies and deterministic ranking.
- `tests/evaluation.test.mjs`: Node built-in test coverage.

### Implemented API
`GET /api/health` returns provider configured flags and default model names only.
`POST /api/compare` accepts objective, shared input, 2–10 variants, 1–3 providers and 1–5 repetitions. It executes the full Cartesian product of providers × variants × repetitions. Each request receives the same input and generation settings. Successful outputs include latency, token usage if exposed by provider, score, score provenance and rationale. Repeated trials are grouped by provider/model/variant and report mean score, score standard deviation, sample count and mean latency. Failed outputs contain provider/model/variant identifiers and a bounded error string; prompt text and input are not echoed in failure payloads.

### Evaluation caveat
The shipped evaluator is a heuristic proxy, not an LLM judge. Reference-answer mode checks expected-term overlap only. It cannot reliably determine factuality, semantic equivalence, or nuanced instruction-following. A future LLM judge must be separately labelled, run against a versioned rubric, and calibrated against human-labelled examples. Token prices are not hard-coded; actual cost estimation requires a versioned provider pricing table.

### Security boundary
The server binds to loopback by default and should remain local until authentication and durable quotas are implemented. API keys are environment-only. The in-memory limiter is not distributed protection. Use a secret manager and an authenticated reverse proxy before any shared deployment.
