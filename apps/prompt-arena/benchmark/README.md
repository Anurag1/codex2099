# Prompt Arena 100-task benchmark

Version: 1.0.0  
Cases: 100  
Categories: 10 (10 cases each)  
Format: JSONL, one immutable case per line.

## Purpose
A small, inspectable development benchmark for validating the prompt-generation → execution → blind-judging → selection pipeline. It covers extraction, formatting, arithmetic, logic, summarization, classification, instruction following, code/debugging, general knowledge and planning/decision tasks.

## Files
- `benchmark-100.jsonl`: 100 tasks with reference answers and evaluation notes.
- `run-benchmark.mjs`: executes a selected number of cases against the live Prompt Arena pipeline and writes a JSON report.

## Run
From `apps/prompt-arena`:

```bash
# First 5 cases (default; cost-conscious smoke benchmark)
npm run benchmark

# First 20 cases
npm run benchmark -- --limit 20

# All 100 cases (live provider calls; review provider costs first)
npm run benchmark -- --all --confirm-cost

# Select provider/model
PROMPT_ARENA_PROVIDER=openai PROMPT_ARENA_MODEL=gpt-4o-mini npm run benchmark -- --limit 5
```

Each case invokes prompt generation, candidate execution and judging. The benchmark runner also includes a fixed baseline prompt as a candidate. Results are written under `benchmark/results/` (git-ignored by default only if explicitly added; do not commit raw prompts containing private data).

## Interpretation
- This is a starter benchmark, not a validated scientific benchmark or a leaderboard claim.
- Reference answers are concise anchors; semantically equivalent answers should receive credit.
- LLM judge scores are estimates. The judge must receive the reference answer, remain blind to prompt identity and be calibrated against human labels before making release decisions.
- Use a fixed model/version, temperature, rubric version and prompt-arena commit for comparable runs.
- Run the complete suite more than once when measuring stochastic variance.
- Keep a held-out set for final evaluation; do not tune prompts against all 100 cases and then report those same cases as independent validation.
