#!/usr/bin/env node
/**
 * Build CLI then run vitest. Supports `--set KEY=VAL` so live scripts work
 * on Windows without Unix `KEY=VAL cmd` prefixes.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const testsRoot = join(here, "..");
const repoRoot = join(testsRoot, "..", "..");
const require = createRequire(import.meta.url);

const rawArgs = process.argv.slice(2);
const envSets = [];
const forwarded = [];
for (let i = 0; i < rawArgs.length; i += 1) {
  if (rawArgs[i] === "--set" && rawArgs[i + 1]) {
    envSets.push(rawArgs[i + 1]);
    i += 1;
    continue;
  }
  if (rawArgs[i] === "--") continue;
  forwarded.push(rawArgs[i]);
}

for (const entry of envSets) {
  const eq = entry.indexOf("=");
  if (eq < 1) continue;
  process.env[entry.slice(0, eq)] = entry.slice(eq + 1);
}

function runNode(scriptPath, args, cwd) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd,
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

// Build CLI via its package script target (tsc), without pnpm.cmd spawn.
runNode(
  join(repoRoot, "node_modules", "typescript", "bin", "tsc"),
  ["-p", join(repoRoot, "packages", "cli", "tsconfig.json")],
  repoRoot,
);

const vitestPkg = require.resolve("vitest/package.json", { paths: [testsRoot] });
const vitestBin = join(dirname(vitestPkg), "vitest.mjs");
runNode(vitestBin, ["run", "--config", "vitest.config.ts", ...forwarded], testsRoot);
