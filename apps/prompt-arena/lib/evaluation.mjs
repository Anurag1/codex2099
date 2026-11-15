const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));

export function validateCompareRequest(body) {
  if (!body || typeof body !== "object") throw new Error("Request body must be a JSON object.");
  if (typeof body.objective !== "string" || !body.objective.trim()) throw new Error("objective is required.");
  if (typeof body.input !== "string" || !body.input.trim()) throw new Error("input is required.");
  if (body.input.length > 30000) throw new Error("input exceeds 30,000 characters.");
  if (!Array.isArray(body.variants) || body.variants.length < 2 || body.variants.length > 10) throw new Error("Provide between 2 and 10 prompt variants.");
  if (!Array.isArray(body.providers) || body.providers.length < 1 || body.providers.length > 3) throw new Error("Select between 1 and 3 providers.");
  for (const [i, v] of body.variants.entries()) {
    if (!v || typeof v.prompt !== "string" || !v.prompt.trim()) throw new Error(`Variant ${i + 1} needs prompt text.`);
    if (v.prompt.length > 12000) throw new Error(`Variant ${i + 1} exceeds 12,000 characters.`);
  }
  for (const p of body.providers) {
    if (!["openai", "anthropic", "gemini"].includes(p.provider)) throw new Error("Unsupported provider.");
    if (typeof p.model !== "string" || !/^[\w.:-]{1,100}$/.test(p.model)) throw new Error("Each provider needs a valid model identifier.");
  }
  const repetitions = Number(body.repetitions ?? 1);
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 5) throw new Error("repetitions must be an integer from 1 to 5.");
  return { ...body, repetitions };
}

export function evaluateOutput(output, expectedOutput = "") {
  const text = String(output ?? "").trim();
  if (!text) return { score: 0, dimensions: { task_success: 0, completeness: 0, instruction_adherence: 0, clarity: 0 }, provenance: "heuristic_proxy", rationale: "The provider returned an empty output. This is a structural heuristic, not a factual correctness judgement." };
  const hasExpected = typeof expectedOutput === "string" && expectedOutput.trim().length > 0;
  const expectedTerms = hasExpected ? expectedOutput.toLowerCase().split(/\W+/).filter(x => x.length > 2) : [];
  const matches = expectedTerms.filter(term => text.toLowerCase().includes(term)).length;
  const expectedCoverage = expectedTerms.length ? matches / expectedTerms.length : null;
  const hasStructure = /[{}\[\]]/.test(text) || /^\s*[-*\d]/m.test(text);
  const hasUncertainty = /\b(null|unknown|not provided|not specified|missing|uncertain)\b/i.test(text);
  const dimensions = {
    task_success: hasExpected ? Math.round(expectedCoverage * 5) : (text.length >= 30 ? 4 : 3),
    completeness: hasExpected ? Math.round(expectedCoverage * 5) : (text.length >= 80 ? 4 : 3),
    instruction_adherence: hasStructure ? 4 : 3,
    clarity: text.length > 12000 ? 3 : (text.split(/\s+/).length >= 8 ? 4 : 3)
  };
  if (hasUncertainty) dimensions.instruction_adherence = Math.min(5, dimensions.instruction_adherence + 1);
  const weights = { task_success: 0.35, completeness: 0.25, instruction_adherence: 0.25, clarity: 0.15 };
  const score = Math.round(Object.entries(dimensions).reduce((sum, [key, value]) => sum + value * 20 * weights[key], 0));
  return {
    score: clamp(score),
    dimensions,
    provenance: hasExpected ? "heuristic_expected-term-overlap" : "heuristic_structure-proxy",
    rationale: hasExpected
      ? `Heuristic expected-term overlap: ${matches}/${expectedTerms.length}. This does not establish semantic correctness.`
      : "No reference answer supplied. Scores use output structure and observable text features only; they are not an LLM judge or a correctness guarantee."
  };
}

export function rankOutputs(outputs) {
  return [...outputs].sort((a, b) => b.score - a.score || a.latency_ms - b.latency_ms);
}

export function aggregateResults(outputs) {
  const groups = new Map();
  for (const item of outputs) {
    const key = [item.provider, item.model, item.variant_index].join("::");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.values()].map(items => {
    const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    const scores = items.map(x => x.score).filter(Number.isFinite);
    const latencies = items.map(x => x.latency_ms).filter(Number.isFinite);
    const scoreMean = mean(scores);
    const variance = scores.length ? mean(scores.map(x => (x - scoreMean) ** 2)) : null;
    return {
      provider: items[0].provider, model: items[0].model, variant_name: items[0].variant_name,
      variant_index: items[0].variant_index, sample_count: items.length,
      mean_score: scoreMean === null ? null : Math.round(scoreMean * 100) / 100,
      score_stddev: variance === null ? null : Math.round(Math.sqrt(variance) * 100) / 100,
      mean_latency_ms: latencies.length ? Math.round(mean(latencies) * 100) / 100 : null
    };
  });
}
