import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("local experiment store saves, lists and retrieves a snapshot", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "prompt-arena-store-"));
  const previous = process.env.PROMPT_ARENA_DATA_DIR;
  process.env.PROMPT_ARENA_DATA_DIR = directory;
  try {
    const store = await import("../lib/store.mjs?isolated-test");
    const saved = await store.saveExperiment({
      name: "Storage smoke test",
      objective: "Verify persistence",
      mode: "live",
      variants: [{ name: "A", prompt: "test" }],
      results: [{ status: "succeeded", score: 80 }],
      ranking: [],
      summary: { total: 1, succeeded: 1 }
    });
    assert.ok(saved.id);
    assert.equal((await store.getExperiment(saved.id)).name, "Storage smoke test");
    const listed = await store.listExperiments();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].id, saved.id);
    assert.equal("results" in listed[0], false);
    const updated = await store.updateExperimentWinner(saved.id, "openai|gpt-4o-mini|A");
    assert.equal(updated.winner, "openai|gpt-4o-mini|A");
    assert.equal((await store.getExperiment(saved.id)).winner, "openai|gpt-4o-mini|A");
  } finally {
    if (previous === undefined) delete process.env.PROMPT_ARENA_DATA_DIR;
    else process.env.PROMPT_ARENA_DATA_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
