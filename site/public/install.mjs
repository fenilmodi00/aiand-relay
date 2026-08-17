#!/usr/bin/env node
/**
 * Cross-platform installer (Windows / macOS / Linux).
 * Prefer this over install.sh when bash is unavailable:
 *   node scripts/install.mjs
 *   # or:  irm https://…/install.mjs | node   (if published)
 */
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const ORIGIN = process.env.AIANDRELAY_ORIGIN ?? "https://aiand-relay-6eb9031f.onbld.com";
const INSTALL_DIR = process.env.AIANDRELAY_HOME ?? join(homedir(), ".aiandrelay");
const BIN_DIR = join(INSTALL_DIR, "bin");
const isWin = process.platform === "win32";

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}
function info(msg) {
  console.log(`  ${msg}`);
}
function fail(msg) {
  console.error(`  ✗ ${msg}`);
  process.exit(1);
}

console.log("Installing aiandrelay…");

function ensureBun() {
  const probe = spawnSync(isWin ? "where" : "which", ["bun"], { encoding: "utf8" });
  if (probe.status === 0) {
    const ver = spawnSync("bun", ["--version"], { encoding: "utf8" });
    ok(`Bun found: ${(ver.stdout || "").trim()}`);
    return;
  }
  info("Bun not found — installing via https://bun.sh/install …");
  if (isWin) {
    const ps = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "irm https://bun.sh/install.ps1 | iex",
      ],
      { stdio: "inherit", shell: false },
    );
    if (ps.status !== 0) fail("Bun install failed. Install Bun manually: https://bun.sh");
  } else {
    const sh = spawnSync("bash", ["-lc", "curl -fsSL https://bun.sh/install | bash"], {
      stdio: "inherit",
    });
    if (sh.status !== 0) fail("Bun install failed. Install Bun manually: https://bun.sh");
  }
  const again = spawnSync(isWin ? "where" : "which", ["bun"], { encoding: "utf8" });
  if (again.status !== 0) {
    fail("Bun installed but not on PATH. Open a new shell and re-run.");
  }
  ok("Bun installed");
}

ensureBun();
mkdirSync(BIN_DIR, { recursive: true });
info(`Downloading aiandrelay from ${ORIGIN} …`);

const bundleUrl = `${ORIGIN}/aiandrelay.js`;
const bundlePath = join(BIN_DIR, "aiandrelay.js");
const res = await fetch(bundleUrl);
if (!res.ok) fail(`Failed to download ${bundleUrl} (${res.status})`);
writeFileSync(bundlePath, Buffer.from(await res.arrayBuffer()));
ok(`Bundle saved → ${bundlePath}`);

function writeUnixWrapper(name, harnessArgs) {
  const path = join(BIN_DIR, name);
  const extra = harnessArgs.length ? ` ${harnessArgs.join(" ")}` : "";
  writeFileSync(
    path,
    `#!/usr/bin/env sh\nexec bun "${bundlePath.replaceAll('"', '\\"')}"${extra} "$@"\n`,
    "utf8",
  );
  try {
    chmodSync(path, 0o755);
  } catch {
    // Windows may ignore mode bits.
  }
}

function writeWinWrapper(name, harnessArgs) {
  const cmdPath = join(BIN_DIR, `${name}.cmd`);
  const extra = harnessArgs.length ? ` ${harnessArgs.join(" ")}` : "";
  writeFileSync(cmdPath, `@ECHO off\r\nbun "${bundlePath}"${extra} %*\r\n`, "utf8");
}

const wrappers = [
  ["aiandrelay", []],
  ["aclaude", ["claude"]],
  ["aopencode", ["opencode"]],
  ["acodex", ["codex"]],
  ["api", ["pi"]],
  ["aprime", ["prime"]],
  ["ahermes", ["hermes"]],
  ["aomp", ["omp"]],
];

for (const [name, args] of wrappers) {
  if (isWin) writeWinWrapper(name, args);
  else writeUnixWrapper(name, args);
}
ok(`Wrappers installed → ${BIN_DIR}`);

// Renamed alias: apiagent → api
const legacyPiAlias = join(BIN_DIR, isWin ? "apiagent.cmd" : "apiagent");
if (existsSync(legacyPiAlias)) {
  unlinkSync(legacyPiAlias);
  ok("Removed old alias: apiagent (now api)");
}

const pathSep = isWin ? ";" : ":";
const onPath = (process.env.PATH ?? "").split(pathSep).some((p) => p === BIN_DIR);
if (!onPath) {
  if (isWin) {
    info(`Add to PATH for this session:  $env:Path = "${BIN_DIR};" + $env:Path`);
    info("Or permanently: System Properties → Environment Variables → Path → New");
  } else {
    const rc = process.env.SHELL?.includes("zsh")
      ? join(homedir(), ".zshrc")
      : process.env.SHELL?.includes("bash")
        ? join(homedir(), ".bashrc")
        : join(homedir(), ".profile");
    const line = `export PATH="${BIN_DIR}:$PATH"`;
    mkdirSync(dirname(rc), { recursive: true });
    const existing = existsSync(rc) ? readFileSync(rc, "utf8") : "";
    if (!existing.includes(line)) {
      writeFileSync(
        rc,
        `${existing}${existing.endsWith("\n") || !existing ? "" : "\n"}\n# aiandrelay\n${line}\n`,
      );
      ok(`Added aiandrelay to PATH in ${rc}`);
    }
    info(`Restart your shell, or run: export PATH="${BIN_DIR}:$PATH"`);
  }
} else {
  ok("Already on PATH");
}

const verify = spawnSync("bun", [bundlePath, "--version"], { encoding: "utf8" });
if (verify.status === 0) {
  ok(`Verified: ${(verify.stdout || "").trim()}`);
} else {
  info("Install finished; run with: bun ~/.aiandrelay/bin/aiandrelay.js --version");
}

console.log("Done. Run `aiandrelay help` to get started.");
info(
  "On first run (ahermes, aclaude, … or aiandrelay), you’ll be prompted for an ai& API key — or open https://docs.aiand.com/ from the prompt.",
);
