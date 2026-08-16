#!/usr/bin/env node
/**
 * List the live ai& model catalog with modality and pricing.
 *
 * aiandrelay builds its model catalog dynamically from this same endpoint
 * (`GET /v1/models`), which returns id, name, context_window, capabilities[],
 * per-1M pricing, and reasoning_efforts. This script prints it so you can see
 * exactly what the tool will pick up.
 *
 * Usage:
 *   AIAND_API_KEY=... node scripts/list-aiand-models.mjs
 */

const BASE_URL = process.env.AIAND_BASE_URL ?? "https://api.aiand.com/v1";
const apiKey = process.env.AIAND_API_KEY;

if (!apiKey) {
  console.error("AIAND_API_KEY is not set. Export it and re-run.");
  process.exit(1);
}

const res = await fetch(`${BASE_URL}/models`, {
  headers: { Authorization: `Bearer ${apiKey}` },
});

if (!res.ok) {
  console.error(`GET /models failed: ${res.status} ${res.statusText}`);
  console.error(await res.text());
  process.exit(1);
}

const body = await res.json();
const models = Array.isArray(body?.data) ? body.data : [];
models.sort((a, b) => String(a.id).localeCompare(String(b.id)));

console.log(`${models.length} models on ${BASE_URL}:\n`);
console.log(`  ${"id".padEnd(42)} ${"caps".padEnd(28)} ${"ctx".padStart(8)}  $in/$out per Mtok`);
for (const model of models) {
  const caps = Array.isArray(model.capabilities) ? model.capabilities.join(",") : "?";
  const ctx = String(model.context_window ?? model.context_length ?? "?").padStart(8);
  const price = `${model.input_per_1m ?? "?"}/${model.output_per_1m ?? "?"}`;
  console.log(
    `  ${String(model.id).padEnd(42)} ${String(caps).slice(0, 28).padEnd(28)} ${ctx}  ${price}`,
  );
}
