import "../lib/load-env.mjs";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPromptArena } from "../lib/prompt-arena-pipeline.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const suitePath = path.join(root, "..", "benchmark", "benchmark-100.jsonl");
const all = (await readFile(suitePath, "utf8")).trim().split(/\r?\n/).map(line => JSON.parse(line));
const args = process.argv.slice(2);
const allRequested = args.includes("--all");
if (allRequested && !args.includes("--confirm-cost")) throw new Error("The full 100-case run makes hundreds of provider calls. Re-run with --all --confirm-cost after reviewing provider costs.");
const limitIndex = args.indexOf("--limit");
const limit = allRequested ? 100 : (limitIndex >= 0 ? Number(args[limitIndex + 1]) : 5);
if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("--limit must be between 1 and 100.");
const provider = process.env.PROMPT_ARENA_PROVIDER || "openai";
const model = process.env.PROMPT_ARENA_MODEL || process.env.OPENAI_DEFAULT_MODEL || "gpt-4o-mini";
const candidateCount = Number(process.env.PROMPT_ARENA_CANDIDATES || 3);
const selected = all.slice(0, limit);
const baselinePrompt = "Answer the user's task directly and accurately. Follow every explicit output constraint. Do not invent facts; state when information is unavailable.";
const results = [];
for (const item of selected) {
  process.stdout.write(`[${results.length + 1}/${selected.length}] ${item.id} ${item.category} ... `);
  try {
    const result = await runPromptArena({
      task: item.task, referenceAnswer: item.reference_answer,
      candidateCount, provider, model, judgeProvider: provider, judgeModel: model,
      baselinePrompt
    });
    const baseline = result.leaderboard.find(x => x.id === "ORIGINAL_BASELINE");
    const bestGenerated = result.leaderboard.find(x => x.id !== "BASELINE");
    results.push({
      id: item.id, category: item.category, status: "succeeded",
      winner_id: result.winner.id, winner_score: result.winner.score,
      baseline_score: baseline?.score ?? null,
      best_generated_score: bestGenerated?.score ?? null,
      generated_delta: baseline && bestGenerated ? Number((bestGenerated.score - baseline.score).toFixed(2)) : null,
      duration_ms: result.summary.duration_ms,
      leaderboard: result.leaderboard
    });
    process.stdout.write(`winner=${result.winner.id} score=${result.winner.score}\n`);
  } catch (error) {
    results.push({ id: item.id, category: item.category, status: "failed", error: String(error.message || error).slice(0,500) });
    process.stdout.write("FAILED: " + String(error.message || error) + "\n");
  }
}
const successful = results.filter(x => x.status === "succeeded");
const deltas = successful.map(x => x.generated_delta).filter(Number.isFinite);
const report = {
  suite: "Prompt Arena 100-task benchmark", suite_version: "1.0.0",
  run_at: new Date().toISOString(), provider, model, candidate_count: candidateCount,
  requested_cases: limit, completed_cases: successful.length, failed_cases: results.length-successful.length,
  mean_generated_minus_baseline_score: deltas.length ? Number((deltas.reduce((a,b)=>a+b,0)/deltas.length).toFixed(2)) : null,
  generated_wins: successful.filter(x => x.generated_delta > 0).length,
  baseline_wins: successful.filter(x => x.generated_delta < 0).length,
  ties: successful.filter(x => x.generated_delta === 0).length,
  results
};
const outputDir = path.join(root, "..", "benchmark", "results");
await mkdir(outputDir, { recursive: true });
const outputPath = path.join(outputDir, `benchmark-${limit}-${Date.now()}.json`);
await writeFile(outputPath, JSON.stringify(report, null, 2), { mode: 0o600 });
process.stdout.write(`\nReport: ${outputPath}\nCompleted: ${report.completed_cases}/${limit}; failures: ${report.failed_cases}\nMean generated-vs-baseline score delta: ${report.mean_generated_minus_baseline_score ?? "n/a"}\n`);
if (report.failed_cases) process.exitCode = 1;
