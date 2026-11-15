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
