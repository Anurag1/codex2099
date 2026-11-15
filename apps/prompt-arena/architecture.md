# Prompt Arena — Product and System Architecture

## Product definition
Prompt Arena is a controlled experimentation workspace for comparing prompt variants across language models. It answers: under the same task conditions, which prompt/model configuration performs better on a defined benchmark, and how consistent is that result? It is not a generic chat interface; the core object is a reproducible experiment.

## Product modules
1. Experiment Studio — objective, shared test input, prompt candidates, provider/model selection, generation parameters and repetition count.
2. Execution Orchestrator — creates the prompt × model × test-case × repetition matrix, applies bounded concurrency and timeouts, and records partial failures.
3. Provider Adapters — normalized request/response interfaces for OpenAI, Anthropic and Gemini. Credentials stay server-side.
4. Evaluation Engine — separately versioned heuristic, reference-based, LLM-judge and human evaluators. The prototype implements transparent structural/term-overlap heuristics only.
5. Results Arena — aggregate ranking, per-trial outputs, latency, token counts, variability and error inspection.
6. Prompt Library — reusable prompt snippets stored in browser-local storage in this prototype.
7. Run History — backend-persisted local experiment snapshots; PostgreSQL is the production persistence target.
8. Decision Record — explicit human winner selection, separate from machine scores.
9. Workspace & Governance — multi-user access, quotas, audit events and secret references are production design requirements, not yet implemented.

## Logical architecture
Browser SPA (HTML/CSS/JS) → Local HTTP API (Node.js 20+, built-in HTTP) → validation and rate limiting → experiment orchestrator (bounded worker pool) → provider adapters → OpenAI / Anthropic / Gemini APIs.
Side paths: local JSON snapshot store (working prototype), PostgreSQL (target durable store), secret manager (target; prototype reads environment variables), evaluation engine (heuristic now; calibrated evaluators later).

## Controlled experiment invariant
Every candidate in one comparison receives the same test case, selected model configuration, system context, generation parameters and evaluator version. Freeze a run manifest containing immutable prompt text/version and SHA-256, exact provider/model, test-case input hash, temperature, output-token limit, supported seed, evaluator/rubric version, repetition number and timestamps. Do not change input or generation settings between candidates and attribute the difference to prompt quality.

## Execution lifecycle
1. Validate objective, prompt candidates, test cases, providers, model IDs and resource limits.
2. Freeze run manifest and create the trial matrix.
3. Dispatch trials through a bounded worker pool.
4. Enforce timeouts and provider-specific error handling.
5. Store outputs, latency, request IDs and token usage when supplied.
6. Evaluate independently from generation.
7. Aggregate sample count, mean, standard deviation and latency by prompt/model/test case.
8. Display failed trials and partial completion rather than silently dropping them.
9. Let a human select a winner; preserve the selected version and rationale.
10. Evolve by creating a child prompt version, never overwriting an earlier candidate.

## Evaluation model
Target rubric dimensions: task success 30%, correctness against reference 30%, completeness 15%, instruction adherence 15%, clarity 10%. The current prototype does not implement this full rubric. It implements a small structural heuristic and optional expected-term overlap proxy. Those scores can mislead and are visibly labelled as heuristics. A future LLM judge must use a versioned rubric, blinded candidate labels, pairwise calibration against human annotations, judge-consistency checks and a held-out validation set. Human preference remains a separate signal.

## Data model
See schema.sql. Core entities: workspaces and members; experiments and immutable prompt variants; benchmark suites and test cases; provider connections (secret references only); experiment runs and individual trials; raw outputs and evaluations; human votes and audit events. The current prototype persists a bounded list of experiment snapshots to data/experiments.json. It does not yet use PostgreSQL, accounts, team workspaces, durable queues or a secret manager.

## Implemented API
- GET /api/health — provider configured flags, default model names and storage mode; never returns secrets.
- POST /api/compare — validates and executes a comparison; returns individual trials, aggregate ranking and summary.
- GET /api/experiments — lists recent saved snapshots.
- POST /api/experiments — persists a completed snapshot in local JSON storage.
- GET /api/experiments/:id — returns one saved snapshot.

Target production API (not yet implemented): experiment CRUD; prompt variant versioning; asynchronous run creation/status/cancellation; output evaluation and human voting; prompt evolution; JSON/CSV export.

## UI information architecture
- Experiment Studio: experiment definition and prompt variants on the left; results, ranking and decision on the right.
- Prompt Library: reusable snippets saved locally.
- Run History: persisted experiments with detail replay.
- Providers & Settings: connection health and setup guidance.

Responsive layout collapses to one column on smaller screens. UI uses semantic controls, labels, loading/error states and explicit score provenance.

## Security and reliability
Prototype boundary: server binds to 127.0.0.1 by default; API keys are environment-only; local JSON store is for one development instance; process-local rate limiter is not distributed protection; no authentication, workspace isolation, database encryption, job queue or public deployment hardening.
Before public deployment: add authentication and authorization on every workspace resource; enable PostgreSQL row-level security and audit logging; use a managed secret vault and key rotation; deploy behind HTTPS and an authenticated reverse proxy; add durable queue workers, idempotency, retries and cancellation; add spend limits, quotas and concurrency controls; implement retention/deletion and sensitive-data redaction; add monitoring, tracing, alerting and backup/restore tests.

## Roadmap
P0 — local MVP (implemented): responsive studio, three provider adapters, bounded live comparisons, heuristic scoring, JSON/CSV export, local prompt library and local run history.
P1 — evaluation validity: labelled benchmark import, exact-match/structured validators, task-specific metrics, blinded pairwise human review and evaluator calibration.
P2 — durable collaboration: PostgreSQL repository layer, authentication, workspace permissions, prompt versioning, audit log and background queue.
P3 — decision-grade intelligence: calibrated LLM judge, bootstrap confidence intervals, paired statistical tests, cost estimation from versioned price tables and prompt mutation with regression gates.
P4 — hosted product: managed deployment, quotas/billing, team sharing, privacy controls, observability and operations.
