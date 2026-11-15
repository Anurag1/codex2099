import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(root, "data");
const dataFile = path.join(dataDir, "experiments.json");
let writeQueue = Promise.resolve();

async function readAll() {
  try {
    const parsed = JSON.parse(await readFile(dataFile, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw new Error("Experiment storage could not be read.");
  }
}

export async function listExperiments(limit = 50) {
  const rows = await readAll();
  return rows.slice(0, Math.max(1, Math.min(100, limit))).map(({ id, name, objective, mode, created_at, summary, winner }) => ({
    id, name, objective, mode, created_at, summary, winner
  }));
}

export async function getExperiment(id) {
  return (await readAll()).find(item => item.id === id) || null;
}

export async function saveExperiment(input) {
  const task = async () => {
    const rows = await readAll();
    const record = {
      id: randomUUID(),
      name: String(input.name || "Untitled experiment").slice(0, 160),
      objective: String(input.objective || "").slice(0, 4000),
      mode: input.mode === "live" ? "live" : "demo",
      variants: Array.isArray(input.variants) ? input.variants.slice(0, 10) : [],
      results: Array.isArray(input.results) ? input.results.slice(0, 500) : [],
      ranking: Array.isArray(input.ranking) ? input.ranking.slice(0, 100) : [],
      summary: input.summary && typeof input.summary === "object" ? input.summary : {},
      winner: input.winner ? String(input.winner).slice(0, 200) : null,
      created_at: new Date().toISOString()
    };
    rows.unshift(record);
    const next = rows.slice(0, 100);
    await mkdir(dataDir, { recursive: true });
    const temporary = dataFile + ".tmp";
    await writeFile(temporary, JSON.stringify(next), { mode: 0o600 });
    await rename(temporary, dataFile);
    return record;
  };
  const pending = writeQueue.then(task, task);
  writeQueue = pending.then(() => undefined, () => undefined);
  return pending;
}
