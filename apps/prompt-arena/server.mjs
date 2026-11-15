import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { validateCompareRequest, evaluateOutput, rankOutputs, aggregateResults } from "./lib/evaluation.mjs";
import { callProvider, providerStatus } from "./lib/providers.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const allowedOrigin = process.env.ALLOWED_ORIGIN || `http://127.0.0.1:${port}`;
const maxBody = 100_000;
const rateLimit = Number(process.env.RATE_LIMIT_PER_MINUTE || 20);
const requests = new Map();

function send(res, status, data, headers = {}) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers });
  res.end(JSON.stringify(data));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "", size = 0;
    req.on("data", chunk => { size += chunk.length; if (size > maxBody) { reject(new Error("Request body too large.")); req.destroy(); return; } raw += chunk; });
    req.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch { reject(new Error("Invalid JSON body.")); } });
    req.on("error", reject);
  });
}
function limited(req) {
  const key = req.socket.remoteAddress || "unknown";
  const now = Date.now(), recent = (requests.get(key) || []).filter(t => now - t < 60_000);
  if (recent.length >= rateLimit) return false;
  recent.push(now); requests.set(key, recent); return true;
}
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length); let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) { const i = cursor++; try { results[i] = await fn(items[i], i); } catch (e) { const item = items[i]; results[i] = { provider: item.provider, model: item.model, variant_name: item.variant_name, variant_index: item.variant_index, repetition: item.repetition, status: "failed", error: String(e.message || e).slice(0, 500) }; } }
  }));
  return results;
}
const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && origin !== allowedOrigin) return send(res, 403, { error: "Origin not allowed." });
  if (origin) res.setHeader("access-control-allow-origin", allowedOrigin);
  res.setHeader("vary", "Origin");
  if (req.method === "OPTIONS") { res.writeHead(204, { "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type" }); return res.end(); }
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (req.method === "GET" && url.pathname === "/api/health") return send(res, 200, { ok: true, mode: "live-provider-backend", providers: providerStatus() });
  if (req.method === "GET" && url.pathname === "/") {
    try { const html = await readFile(path.join(root, "index.html")); res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(html); }
    catch { return send(res, 404, { error: "index.html not found." }); }
  }
  if (req.method === "POST" && url.pathname === "/api/compare") {
    if (!limited(req)) return send(res, 429, { error: "Rate limit reached. Wait one minute before retrying." });
    try {
      const body = validateCompareRequest(await readBody(req));
      const tasks = body.providers.flatMap(p => body.variants.flatMap((v, variant_index) => Array.from({ length: body.repetitions }, (_, repetition) => ({
        provider: p.provider, model: p.model, variant_name: v.name || `Variant ${variant_index + 1}`, variant_index, repetition: repetition + 1,
        prompt: v.prompt, input: body.input, expected_output: body.expected_output || ""
      }))));
      const results = await mapLimit(tasks, Math.max(1, Math.min(8, Number(process.env.MAX_CONCURRENCY || 4))), async task => {
        const result = await callProvider({ ...task, temperature: body.temperature ?? 0.2, maxTokens: body.max_tokens ?? 1200 });
        const evaluation = evaluateOutput(result.output, task.expected_output);
        return { provider: task.provider, model: task.model, variant_name: task.variant_name, variant_index: task.variant_index, repetition: task.repetition, status: "succeeded", output: result.output, latency_ms: result.latency_ms, usage: result.usage, provider_request_id: result.provider_request_id, score: evaluation.score, dimensions: evaluation.dimensions, score_provenance: evaluation.provenance, rationale: evaluation.rationale };
      });
      const succeeded = results.filter(x => x.status === "succeeded");
      const aggregates = aggregateResults(succeeded);\n      const ranked = rankOutputs(aggregates.map(x => ({ ...x, score: x.mean_score, latency_ms: x.mean_latency_ms })));
      return send(res, 200, { mode: "live", objective: body.objective, input_sha256: await cryptoHash(body.input), repetitions: body.repetitions, results, ranking: ranked.map((x, i) => ({ rank: i + 1, provider: x.provider, model: x.model, variant_name: x.variant_name, sample_count: x.sample_count, mean_score: x.mean_score, score_stddev: x.score_stddev, mean_latency_ms: x.mean_latency_ms })), summary: { total: results.length, succeeded: succeeded.length, failed: results.length - succeeded.length, groups: aggregates.length } });
    } catch (error) { return send(res, 400, { error: String(error.message || error).slice(0, 500) }); }
  }
  return send(res, 404, { error: "Not found." });
});
async function cryptoHash(value) {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(value).digest("hex");
}
server.listen(port, host, () => process.stdout.write(`Prompt Arena API listening at http://${host}:${port}\n`));
