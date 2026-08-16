#!/usr/bin/env node
// Reports remaining legacy-brand references in committed source (the "Nebius TF
// Relay" / "Nebius Token Factory" / nebiusrelay cleanup). Excludes gitignored
// scratch, build output, lockfiles, and the generated site bundle so the check
// reflects only real product code.
//
// Usage: node scripts/find-deprecated.mjs          # print list
//        node scripts/find-deprecated.mjs --json  # json output
//        node scripts/find-deprecated.mjs --check  # exit 1 if any found

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

// directories to skip entirely (gitignored or build output)
const DIRECTORY_ONLY = new Set([
  ".git", "node_modules", ".turbo", ".cache", ".vercel", ".next", "dist", "build",
  ".scratch", ".omo", ".opencode", ".cursor", ".claude", ".codex", ".gstack",
  "docs", "artifacts", "tmp",
]);

// specific files to skip (generated, lockfiles, or the tool itself)
const SKIP_FILENAMES = new Set([
  "bun.lock", "aiandrelay.js", "latest.json", "install.sh", "install.mjs",
  "find-deprecated.mjs", "replace-legacy.mjs",
  "claude-headless-coding-session.messages.json",
  "codex-headless-coding-session.responses.json",
]);

// terms to look for (case-insensitive)
const PATTERNS = [
  /\bnebius\b/i,             // Nebius
  /nebiusrelay/i,            // ~/.nebiusrelay
  /nebus/i,                  // typo of Nebius
  /token\s*factory/i,        // Token Factory / tokenfactory
];

function walk(dir, into) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (DIRECTORY_ONLY.has(e.name)) continue;
      const full = path.join(dir, e.name);
      walk(full, into);
    } else {
      if (SKIP_FILENAMES.has(e.name)) continue;
      if (/\.(png|jpe?g|gif|webp|avif|ico|pdf|zip|tar|gz|exe|ttf|woff2?|wasm|map|jsonl)$/.test(e.name)) continue;
      const full = path.join(dir, e.name);
      if (fs.statSync(full).size > 2 * 1024 * 1024) continue;
      into.push(full);
    }
  }
}

function readMatches(file) {
  let content;
  try {
    content = fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
  const lines = content.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    for (const p of PATTERNS) {
      if (p.test(lines[i])) {
        out.push({ line: i + 1, text: lines[i], pattern: p.source });
        break;
      }
    }
  }
  return out;
}

const files = [];
walk(ROOT, files);

const results = [];
for (const f of files) {
  const rel = path.relative(ROOT, f).split(path.sep).join("/");
  const m = readMatches(f);
  if (m && m.length) results.push({ file: rel, matches: m });
}

// self-reference: this file contains the literal search terms in its own patterns.
const filtered = results.filter((r) => !r.file.startsWith("scripts/"));

const isJson = process.argv.includes("--json");
const isCheck = process.argv.includes("--check");

if (isJson) {
  console.log(JSON.stringify(filtered, null, 2));
} else {
  console.log(`Found ${filtered.length} files with legacy terms:\n`);
  for (const r of filtered) {
    console.log(r.file);
    for (const m of r.matches) {
      console.log(`  :${m.line}  ${m.text.trim().slice(0, 160)}`);
    }
    console.log();
  }
  if (isCheck) process.exit(filtered.length ? 1 : 0);
}
