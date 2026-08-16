#!/usr/bin/env node
/**
 * Regenerate packages/models/src/catalog-snapshot.ts from live GET /v1/models.
 *
 *   AIAND_API_KEY=... pnpm --filter @aiandrelay/models regen-catalog
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE_URL = (process.env.AIAND_BASE_URL ?? "https://api.aiand.com/v1").replace(/\/$/, "");
const apiKey = process.env.AIAND_API_KEY;
if (!apiKey) {
  console.error("AIAND_API_KEY is not set.");
  process.exit(1);
}

const res = await fetch(`${BASE_URL}/models`, {
  headers: { Authorization: `Bearer ${apiKey}` },
});
if (!res.ok) {
  console.error(`GET /models failed: ${res.status}`);
  console.error(await res.text());
  process.exit(1);
}

const body = await res.json();
const models = Array.isArray(body?.data) ? body.data : [];
if (models.length === 0) {
  console.error("GET /models returned no models");
  process.exit(1);
}

const slim = models.map((m) => ({
  id: m.id,
  name: m.name ?? m.id,
  owned_by: m.owned_by ?? null,
  provider: m.provider ?? null,
  context_window: m.context_window ?? null,
  capabilities: m.capabilities ?? [],
  reasoning_efforts: m.reasoning_efforts ?? [],
  reasoning_effort_default: m.reasoning_effort_default ?? null,
  description: m.description ?? null,
  currency: m.currency ?? null,
  input_per_1m: m.input_per_1m ?? null,
  output_per_1m: m.output_per_1m ?? null,
  cached_input_per_1m: m.cached_input_per_1m ?? null,
}));

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, "..", "src", "catalog-snapshot.ts");
const header = `/**
 * Offline snapshot of the ai& OpenAI model catalog (\`GET /v1/models\`),
 * regenerated ${new Date().toISOString().slice(0, 10)}.
 *
 * Regenerate with: pnpm --filter @aiandrelay/models regen-catalog
 */
import type { AiandApiModel } from "./index.js";

export const CATALOG_SNAPSHOT: readonly AiandApiModel[] = `;

writeFileSync(outPath, `${header}${JSON.stringify(slim, null, 2)};\n`);
console.log(`Wrote ${slim.length} models to ${outPath}`);
