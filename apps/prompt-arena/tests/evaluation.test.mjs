import test from "node:test";
import assert from "node:assert/strict";
import { validateCompareRequest, evaluateOutput, rankOutputs } from "../lib/evaluation.mjs";

const valid = { objective: "Extract data", input: "Sample input", variants: [{ prompt: "Prompt A" }, { prompt: "Prompt B" }], providers: [{ provider: "openai", model: "gpt-4o-mini" }] };

test("accepts a valid controlled comparison", () => {
  assert.equal(validateCompareRequest(valid).repetitions, 1);
});
test("rejects fewer than two variants", () => {
  assert.throws(() => validateCompareRequest({ ...valid, variants: [{ prompt: "Only one" }] }), /between 2 and 10/);
});
test("rejects unsupported providers", () => {
  assert.throws(() => validateCompareRequest({ ...valid, providers: [{ provider: "unknown", model: "x" }] }), /Unsupported provider/);
});
test("bounds repeated trials", () => {
  assert.throws(() => validateCompareRequest({ ...valid, repetitions: 6 }), /repetitions/);
});
test("scores are bounded and carry heuristic provenance", () => {
  const result = evaluateOutput('{"answer":"42","missing":"null"}');
  assert.ok(result.score >= 0 && result.score <= 100);
  assert.match(result.provenance, /^heuristic/);
});
test("expected term overlap is disclosed", () => {
  const result = evaluateOutput("Acme invoice AR-1 total 500", "Acme invoice total 500");
  assert.equal(result.provenance, "heuristic_expected-term-overlap");
  assert.match(result.rationale, /overlap/);
});
test("ranking sorts highest score first", () => {
  const result = rankOutputs([{ score: 50, latency_ms: 10 }, { score: 90, latency_ms: 100 }]);
  assert.equal(result[0].score, 90);
});
