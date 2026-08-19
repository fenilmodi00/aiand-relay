#!/usr/bin/env node
import os from "node:os";
import { loadEnvFile } from "../lib/load-env.js";
import { parseArgs } from "../lib/parse-args.js";
import { printHelp, runConfigure } from "../lib/commands/global.js";
import { dispatchHarnessCommand } from "../lib/commands/harness.js";
import { detectInstalledHarness } from "../lib/detect.js";
import type { HarnessId } from "../lib/harness.js";
import { isHarnessCommand, resolveHarnessInvocation } from "../lib/commands/harness-invocation.js";
import { ensureApiKeyInteractive } from "../lib/ensure-api-key.js";
import { readGlobalConfig, resolveStoredApiKey } from "../lib/global-config.js";
import { maybeSelfUpdate } from "../lib/autoupdate.js";
import { getInstallId, sendTelemetryEvent } from "../lib/telemetry.js";
import { VERSION } from "../lib/version.js";

async function daemonStop(): Promise<void> {
  const { resolveDaemonPort, daemonUrl, daemonPidPath } = await import("../lib/daemon/server.js");
  const { readFile, unlink } = await import("node:fs/promises");
  const pidPath = daemonPidPath();
  const port = resolveDaemonPort();
  let pid: number | undefined;
  try {
    const raw = (await readFile(pidPath, "utf8")).trim();
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    pid = Number.isFinite(parsed) ? parsed : undefined;
  } catch {
    pid = undefined;
  }
  if (pid === undefined) {
    console.log(`aiandrelay daemon: not running (no pid file at ${pidPath}).`);
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ESRCH") {
      try {
        await unlink(pidPath);
      } catch {
        // ignore
      }
      console.log(`aiandrelay daemon: not running (stale pid file removed).`);
      return;
    }
    throw err;
  }
  // Best-effort: the daemon removes its own pid file on SIGTERM. Give it a
  // moment, then clear a leftover if the signal was lost.
  await new Promise((resolve) => setTimeout(resolve, 300));
  try {
    await unlink(pidPath);
  } catch {
    // already cleaned by the daemon
  }
  console.log(`aiandrelay daemon: stopped (pid ${pid}) on ${daemonUrl(port)}.`);
}

async function loadStoredSecrets(): Promise<void> {
  // Native web search / Tavily removed. API keys come from AIAND_API_KEY,
  // project .env allowlist, or resolveAiandApiKey(home).
  if (process.env.AIAND_API_KEY?.trim()) {
    return;
  }
  try {
    const home = process.env.HOME;
    if (!home) {
      return;
    }
    const resolved = resolveStoredApiKey((await readGlobalConfig(home)).apiKey);
    if (resolved) {
      process.env.AIAND_API_KEY = resolved;
    }
  } catch {
    // No config yet (e.g. before first `configure`) — nothing to do.
  }
}

async function ensureConfiguredForInteractiveLaunch(apiKey?: string): Promise<boolean> {
  return ensureApiKeyInteractive({
    home: os.homedir(),
    ...(apiKey !== undefined ? { apiKey } : {}),
  });
}

async function runInteractiveLauncher(): Promise<void> {
  if (!isInteractive()) {
    printHelp();
    return;
  }

  if (!(await ensureConfiguredForInteractiveLaunch())) {
    return;
  }

  const clack = await import("@clack/prompts");
  const choice = await clack.select({
    message: "What do you want to run?",
    options: launcherOptions(),
  });
  if (clack.isCancel(choice)) {
    clack.cancel("Cancelled.");
    return;
  }
  if (choice === "configure") {
    await runConfigure();
    return;
  }
  if (choice === "chatgpt") {
    // ChatGPT Desktop (the former Codex desktop app, merged in 2026). Routes
    // to the same codex-app flow as `aiandrelay chatgpt` / `codex-app`.
    const { runCodexAppCommand } = await import("../lib/codex-app.js");
    const result = await runCodexAppCommand({ home: os.homedir() });
    if (result.message) {
      console.log(result.message);
    }
    if (result.payload) {
      console.log(JSON.stringify(result.payload, null, 2));
    }
    return;
  }

  await dispatchHarnessCommand(choice, "run", {});
}

/**
 * Launcher entries, with tools you actually have installed listed first - an
 * install-ordered menu beats a fixed one when only some harnesses are present.
 */
function launcherOptions(): Array<{ value: string; label: string; hint: string }> {
  const harnesses = [
    { value: "codex", label: "Codex", hint: "acodex" },
    { value: "claude", label: "Claude Code", hint: "aclaude" },
    { value: "pi", label: "Pi Code", hint: "api" },
    { value: "opencode", label: "OpenCode", hint: "aopencode" },
    { value: "prime", label: "Prime Agent", hint: "aprime" },
    { value: "hermes", label: "Hermes Agent", hint: "ahermes" },
    { value: "deepseek", label: "DeepSeek Harness", hint: "adeepseek (alpha)" },
    { value: "grok", label: "Grok Build", hint: "agrok" },
    { value: "omp", label: "omp", hint: "aomp" },
  ];
  const installed: typeof harnesses = [];
  const missing: typeof harnesses = [];
  for (const entry of harnesses) {
    const detected = detectInstalledHarness(entry.value as HarnessId).installed;
    (detected ? installed : missing).push(
      detected ? entry : { ...entry, hint: `${entry.hint} (not installed)` },
    );
  }
  return [
    ...installed,
    ...missing,
    { value: "chatgpt", label: "ChatGPT Desktop", hint: "chatgpt" },
    { value: "configure", label: "Configure", hint: "API keys and detected tools" },
  ];
}

function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

async function initCatalogIfPossible(): Promise<void> {
  try {
    const { initModelCatalog } = await import("../lib/model-catalog-init.js");
    await initModelCatalog({ home: os.homedir() });
  } catch {
    // Bundled snapshot is enough for `model list`.
  }
}

async function main() {
  // Self-update first (throttled, bounded, never throws). Placed before arg
  // parsing so even `aiandrelay help` keeps an install current, but it's a
  // no-op unless this is the installed bundle and the throttle window passed.
  // Keep this before loading project .env files so a repo cannot redirect the
  // updater with AIANDRELAY_MANIFEST_URL / AIANDRELAY_HOME.
  await maybeSelfUpdate();

  // Load a .env (cwd → repo root) after self-update, and only for approved
  // credential keys, so local project env files cannot control the CLI runtime.
  loadEnvFile();

  // If AIAND_API_KEY still isn't set (not in the env or .env), fall back to the
  // key stored by `aiandrelay configure` so harnesses and `{env:AIAND_API_KEY}`
  // refs work without re-sourcing .env every session.
  await loadStoredSecrets();

  const parsed = parseArgs(process.argv.slice(2));
  const [rawCommand, rawVerb] = parsed.positional;
  // `chatgpt` is the canonical command now that the Codex desktop app merged
  // into the ChatGPT desktop app; `codex-app` (and `chatgpt-app`) stay as
  // backward-compatible aliases. The internal command id / config markers /
  // backup dir keep the stable "codex-app" string so restore still finds old
  // config blocks written by previous versions.
  const command =
    rawCommand === "picode"
      ? "pi"
      : rawCommand === "chatgpt" || rawCommand === "chatgpt-app"
        ? "codex-app"
        : rawCommand;

  if (!command) {
    await runInteractiveLauncher();
    return;
  }

  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "--version" || command === "-v" || command === "version") {
    process.stdout.write(`aiandrelay v${VERSION}\n`);
    return;
  }

  if (command === "update") {
    const { runUpdateCommand } = await import("../lib/autoupdate.js");
    process.stdout.write(`${await runUpdateCommand()}\n`);
    return;
  }

  if (command === "whoami") {
    process.stdout.write(`${await getInstallId()}\n`);
    return;
  }

  // Local spend report. Reads only the session store this machine already
  // writes; nothing is uploaded.
  if (command === "usage") {
    const { buildUsageReport, formatUsageReport, parseUsageWindowMs } =
      await import("../lib/usage-report.js");
    const requested = parsed.flags.last;
    const windowMs = parseUsageWindowMs(requested ?? "7d");
    if (windowMs === undefined) {
      throw new Error(
        `Invalid --last value "${requested}". Use a window like 30m, 24h, 7d, or 4w.`,
      );
    }
    const summary = await buildUsageReport(windowMs);
    process.stdout.write(`${formatUsageReport(summary, requested ?? "7d")}\n`);
    return;
  }

  if (command === "status") {
    const { printGlobalStatus } = await import("../lib/enablement/engine.js");
    await printGlobalStatus({ home: os.homedir(), ...parsed.flags });
    return;
  }

  if (command === "model") {
    const sub = rawVerb ?? parsed.positional[1];
    if (sub !== "list") {
      throw new Error('Unknown "model" command. Expected: list.');
    }
    const { getSelectableModels } = await import("@aiandrelay/models");
    await initCatalogIfPossible();
    const search = parsed.flags.search?.trim().toLowerCase();
    const models = getSelectableModels().filter((model) => {
      if (!search) {
        return true;
      }
      return `${model.id} ${model.name}`.toLowerCase().includes(search);
    });
    for (const model of models) {
      console.log(`${model.id}\t${model.name}`);
    }
    return;
  }

  if (command === "configure") {
    await runConfigure();
    return;
  }

  if (command === "uninstall") {
    const { runUninstall } = await import("../lib/enablement/uninstall.js");
    const result = await runUninstall({ home: os.homedir() });
    if (result.offErrors.length > 0 || result.removalFailures.length > 0) {
      process.exitCode = 1;
    }
    return;
  }

  // Hidden: install.sh finish screen (`aiandrelay banner install`).
  if (command === "banner") {
    const { printBanner } = await import("../lib/cli/banner.js");
    const context = rawVerb === "install" ? "install" : undefined;
    printBanner({ version: VERSION, ...(context ? { context } : {}) });
    return;
  }

  // Internal entry point run by install.sh right after a successful install
  // verification. Not user-facing; emits the one-time install event.
  if (command === "__telemetry-install-completed") {
    await sendTelemetryEvent({ event: "install_completed" });
    return;
  }

  // Internal entry point: the daemon self-spawns with `--daemon` via
  // ensureDaemon() (launch.ts). Runs the shared proxy server forever; never
  // returns. Keep this before any command that needs a key - the daemon needs
  // no daemon-wide credentials (each session registers its own).
  if (command === "--daemon") {
    const { runDaemon } = await import("../lib/daemon/server.js");
    await runDaemon();
    return;
  }

  // User-facing daemon control. Not a harness, so handle it before the harness
  // dispatch (which would reject "daemon" as an unknown harness). Inlined from
  // the former daemon/cli.ts (a shallow pass-through with exactly one caller):
  // `serve` is already covered by the `--daemon` branch above, so only `stop`
  // reaches here.
  if (command === "daemon") {
    const verb = rawVerb;
    const expected = "stop, install, uninstall, status";
    if (verb === undefined) {
      throw new Error(`Unknown "daemon" command. Expected: ${expected}.`);
    }
    if (verb === "stop") {
      await daemonStop();
      return;
    }
    if (verb === "serve") {
      const { runDaemon } = await import("../lib/daemon/server.js");
      await runDaemon();
      return;
    }
    // Auto-start at login (launchd on macOS, systemd --user on Linux). Keeps a
    // current daemon always available instead of one left over from an older
    // release, and removes the cold start on the first turn of the day.
    if (verb === "install" || verb === "uninstall" || verb === "status") {
      const { installAutoStart, uninstallAutoStart, autoStartStatus } =
        await import("../lib/daemon/auto-start.js");
      if (verb === "install") {
        process.stdout.write(`${await installAutoStart()}\n`);
        return;
      }
      if (verb === "uninstall") {
        process.stdout.write(`${await uninstallAutoStart()}\n`);
        return;
      }
      const status = await autoStartStatus();
      process.stdout.write(`${status.detail}\n`);
      if (status.servicePath) {
        process.stdout.write(`  Service: ${status.servicePath}\n`);
      }
      return;
    }
    throw new Error(`Unknown "daemon ${verb}" command. Expected: ${expected}.`);
  }

  if (command === "codex-app") {
    if (
      !parsed.flags.restore &&
      !(await ensureConfiguredForInteractiveLaunch(parsed.flags.apiKey))
    ) {
      throw new Error("No ai& API key found. Run `aiandrelay configure` or set AIAND_API_KEY.");
    }
    const { runCodexAppCommand } = await import("../lib/codex-app.js");
    const result = await runCodexAppCommand({ home: os.homedir(), ...parsed.flags });
    if (result.message) {
      console.log(result.message);
    }
    if (result.payload) {
      console.log(JSON.stringify(result.payload, null, 2));
    }
    return;
  }

  const invocation = resolveHarnessInvocation(
    parsed.positional,
    parsed.flags,
    parsed.harnessVerb,
  );

  if (isHarnessCommand(invocation.command)) {
    const needsKey = invocation.verb === "on" || invocation.verb === "run";
    if (needsKey && !(await ensureConfiguredForInteractiveLaunch(parsed.flags.apiKey))) {
      throw new Error("No ai& API key found. Run `aiandrelay configure` or set AIAND_API_KEY.");
    }
    void sendTelemetryEvent({ event: "cli_started", agent: invocation.command });
  }

  await dispatchHarnessCommand(invocation.command, invocation.verb, invocation.flags);
}

main().catch((err: unknown) => {
  if (!(err instanceof Error)) {
    console.error(`Error: ${String(err)}`);
    process.exitCode = 1;
    return;
  }
  console.error(`Error: ${err.message}`);
  process.exitCode = 1;
});
