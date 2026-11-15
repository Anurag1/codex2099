# Prompt Arena

A lightweight prompt experimentation workbench prototype.

## Run
Open `index.html` in a modern browser. No dependencies or API keys required.

## Included
- Edit/add/remove competing prompt variants
- Shared test input for controlled comparisons
- Side-by-side demo outputs and heuristic rankings
- Blind review, human preference voting, explicit winner selection
- Prompt evolution into a new editable variant
- JSON/CSV export and browser-local save

## Important
This is a front-end prototype in **DEMO mode**. It does not call GPT, Claude, Gemini, or another model. Output examples, scores, and latency are illustrative, not model benchmark claims. A production version needs server-side provider adapters, secure secret storage, auth, run orchestration, persistent storage, cost limits, and real evaluator provenance.

See [architecture.md](architecture.md) and [schema.sql](schema.sql).
