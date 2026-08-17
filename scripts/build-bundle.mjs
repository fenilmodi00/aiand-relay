#!/usr/bin/env node
/**
 * Build the single cross-platform Bun-target JS bundle for distribution.
 * Cross-platform replacement for build-bundle.sh (works without bash).
 *
 * Output: site/public/aiandrelay.js (+ mirrored site/aiandrelay.js),
 * installer copies, and latest.json manifest.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
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

console.log(`Building aiandrelay v${VERSION} bundle…`);

// Direct tsc — avoids Windows spawnSync("pnpm.cmd") EINVAL without shell:true.
run(process.execPath, [
  join(ROOT, "node_modules", "typescript", "bin", "tsc"),
  "-p",
  join(ROOT, "packages", "models", "tsconfig.json"),
]);

const publicDir = join(ROOT, "site", "public");
const trackedDir = join(ROOT, "site");
mkdirSync(publicDir, { recursive: true });

const installSrc = join(ROOT, "scripts", "install.sh");
copyFileSync(installSrc, join(publicDir, "install.sh"));
copyFileSync(installSrc, join(trackedDir, "install.sh"));
const installMjs = join(ROOT, "scripts", "install.mjs");
copyFileSync(installMjs, join(publicDir, "install.mjs"));
copyFileSync(installMjs, join(trackedDir, "install.mjs"));
console.log("✓ installer → site/public/install.{sh,mjs} and site/install.{sh,mjs}");

run("bun", [
  "build",
  join(ROOT, "packages", "cli", "src", "bin", "aiandrelay.ts"),
  "--target=bun",
  "--production",
  "--define",
  `process.env.AIANDRELAY_VERSION="${VERSION}"`,
  "--outfile",
  join(publicDir, "aiandrelay.js"),
]);

const publicBundle = join(publicDir, "aiandrelay.js");
copyFileSync(publicBundle, join(trackedDir, "aiandrelay.js"));
const bytes = statSync(publicBundle).size;
console.log(`✓ bundle → site/public/aiandrelay.js and site/aiandrelay.js (${bytes} bytes)`);

const manifest = {
  version: VERSION,
  url: "https://aiand-relay-6eb9031f.onbld.com/aiandrelay.js",
  publishedAt: new Date().toISOString(),
};
const json = `${JSON.stringify(manifest, null, 2)}\n`;
writeFileSync(join(publicDir, "latest.json"), json);
writeFileSync(join(trackedDir, "latest.json"), json);
console.log(`✓ manifest → site/public/latest.json and site/latest.json (v${VERSION})`);
