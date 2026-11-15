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
