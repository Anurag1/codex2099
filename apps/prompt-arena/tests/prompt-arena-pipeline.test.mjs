import test from "node:test";
import assert from "node:assert/strict";
import { scoreJudgment, rankTrials, RUBRIC } from "../lib/prompt-arena-pipeline.mjs";

test("rubric weights sum to one", () => {
  assert.equal(Object.values(RUBRIC).reduce((a,b)=>a+b,0), 1);
});

test("perfect judge scores normalize to 100", () => {
  assert.equal(scoreJudgment({
    correctness:5,relevance:5,completeness:5,clarity:5,constraint_adherence:5
  }),100);
});

test("ranking uses weighted quality and returns stable rank labels", () => {
  const trials = [
    {id:"P1",name:"Verbose",latency_ms:80},
    {id:"P2",name:"Correct",latency_ms:120}
  ];
  const judgments = [
    {id:"P1",correctness:2,relevance:5,completeness:5,clarity:5,constraint_adherence:5},
    {id:"P2",correctness:5,relevance:5,completeness:5,clarity:5,constraint_adherence:5}
  ];
  const ranked = rankTrials(trials,judgments);
  assert.equal(ranked[0].id,"P2");
  assert.equal(ranked[0].rank,1);
  assert.equal(ranked[1].rank,2);
});

import { runPromptArena } from "../lib/prompt-arena-pipeline.mjs";

test("runs generation, candidate execution, blind judging and selection end-to-end with a mocked provider", async () => {
  const old = {
    key: process.env.OPENAI_API_KEY,
    base: process.env.OPENAI_BASE_URL,
    concurrency: process.env.MAX_CONCURRENCY,
    fetch: globalThis.fetch
  };
  process.env.OPENAI_API_KEY = "pipeline-test-key";
  process.env.OPENAI_BASE_URL = "https://mock-provider.invalid/v1";
  process.env.MAX_CONCURRENCY = "1";
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    const system = request.messages[0].content;
    let output;
    if (system.includes("candidate-generation")) {
      output = JSON.stringify({ candidates: [
        { id: "P1", strategy: "verification-first", prompt: "Verify every claim." },
        { id: "P2", strategy: "direct", prompt: "Answer directly." }
      ]});
    } else if (system.includes("blind output evaluator")) {
      output = JSON.stringify({ evaluations: [
        { id: "P1", correctness: 5, relevance: 5, completeness: 5, clarity: 4, constraint_adherence: 5, reasoning: "Supported by the reference." },
        { id: "P2", correctness: 3, relevance: 4, completeness: 3, clarity: 5, constraint_adherence: 3, reasoning: "Misses a required detail." }
      ]});
    } else {
      output = system === "Verify every claim." ? "Verified answer: 42." : "The answer is 42.";
    }
    return new Response(JSON.stringify({
      id: "mock-request",
      choices: [{ message: { content: output } }],
      usage: { prompt_tokens: 10, completion_tokens: 12 }
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await runPromptArena({
      task: "Return the answer and verify it.",
      candidateCount: 2,
      provider: "openai",
      model: "mock-model",
      referenceAnswer: "42"
    });
    assert.equal(result.trials.length, 2);
    assert.equal(result.winner.id, "P1");
    assert.equal(result.winner.score, 98);
    assert.equal(result.leaderboard[0].rank, 1);
    assert.equal(result.summary.score_provenance, "llm_judge_estimate");
  } finally {
    globalThis.fetch = old.fetch;
    if (old.key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = old.key;
    if (old.base === undefined) delete process.env.OPENAI_BASE_URL; else process.env.OPENAI_BASE_URL = old.base;
    if (old.concurrency === undefined) delete process.env.MAX_CONCURRENCY; else process.env.MAX_CONCURRENCY = old.concurrency;
  }
});
