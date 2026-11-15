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

import { aggregateResults } from "../lib/evaluation.mjs";
test("aggregates repeated trials with mean and standard deviation", () => {
  const grouped = aggregateResults([
    { provider: "openai", model: "m", variant_index: 0, variant_name: "A", score: 80, latency_ms: 100 },
    { provider: "openai", model: "m", variant_index: 0, variant_name: "A", score: 100, latency_ms: 200 }
  ]);
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].sample_count, 2);
  assert.equal(grouped[0].mean_score, 90);
  assert.equal(grouped[0].score_stddev, 10);
  assert.equal(grouped[0].mean_latency_ms, 150);
});

import { createServer } from "node:http";
import { callProvider } from "../lib/providers.mjs";

test("OpenAI-compatible adapter sends the candidate prompt and parses usage", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalBase = process.env.OPENAI_BASE_URL;
  let received = null;
  const mock = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    received = { url: req.url, auth: req.headers.authorization, body: JSON.parse(raw) };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ id: "mock-request-1", choices: [{ message: { content: "mock model output" } }], usage: { prompt_tokens: 11, completion_tokens: 7 } }));
  });
  await new Promise(resolve => mock.listen(0, "127.0.0.1", resolve));
  const address = mock.address();
  process.env.OPENAI_API_KEY = "unit-test-secret";
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${address.port}/v1`;
  try {
    const result = await callProvider({ provider: "openai", model: "test-model", prompt: "Candidate instruction", input: "Shared input" });
    assert.equal(result.output, "mock model output");
    assert.equal(result.usage.input_tokens, 11);
    assert.equal(result.usage.output_tokens, 7);
    assert.equal(received.url, "/v1/chat/completions");
    assert.equal(received.auth, "Bearer unit-test-secret");
    assert.equal(received.body.messages[0].content, "Candidate instruction");
    assert.equal(received.body.messages[1].content, "Shared input");
  } finally {
    await new Promise(resolve => mock.close(resolve));
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey;
    if (originalBase === undefined) delete process.env.OPENAI_BASE_URL; else process.env.OPENAI_BASE_URL = originalBase;
  }
});
