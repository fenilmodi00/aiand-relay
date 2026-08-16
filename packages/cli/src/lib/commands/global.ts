import os from "node:os";
import * as clack from "@clack/prompts";
import { ALL_HARNESSES, HARNESS_LABEL, type HarnessId } from "../harness.js";
import { isHarnessImplemented } from "../harness-registry.js";
import { detectInstalledHarnesses } from "../detect.js";
import { readGlobalConfig, setGlobalApiKey, resolveStoredApiKey } from "../global-config.js";
import { VERSION } from "../version.js";

export function printHelp() {
  console.log(`aiandrelay v${VERSION} - ai& for coding CLIs

Usage:
  aiandrelay configure
  aiandrelay update            update to the latest release
  aiandrelay whoami
  aiandrelay usage [--last 7d] tracked local spend by model and tool
  aiandrelay daemon install    start the daemon at login (macOS/Linux)
  aiandrelay daemon uninstall  stop starting the daemon at login
  aiandrelay daemon status     show auto-start service status
  aiandrelay daemon stop       stop the running daemon
  aiandrelay chatgpt [--model <model>] [--restore]  (alpha)
  aiandrelay codex [...]       (alias: acodex)
  aiandrelay claude [...]      (alias: aclaude)
  aiandrelay pi [...]          (alias: api)
  aiandrelay opencode [...]    (alias: aopencode)
  aiandrelay prime [...]       (alias: aprime)
  aiandrelay hermes [...]      (alias: ahermes)
  aiandrelay deepseek [...]    (alpha, alias: adeepseek)
  aiandrelay grok [...]        (alias: agrok; Grok's UI on ai& models)
  aiandrelay omp [...]         (alias: aomp)

Extra args after codex/claude/pi/opencode/prime/hermes/deepseek/grok/omp are passed through.
ChatGPT App support is alpha; run \`aiandrelay chatgpt --restore\` (alias: codex-app) to restore the previous desktop config.

Codex flags:
  --no-mcp   Skip your ~/.codex/config.toml MCP servers for a fast startup
             (maps to codex --ignore-user-config; also skips other codex config).

Your last-used model is remembered per tool: change it with /model (or --model
before the harness) and the next launch reuses it.

Docs: https://aiand-relay.vercel.app/llms.txt
  LLM-readable documentation - if you are an AI agent asked to install, configure,
  or use aiandrelay (including headless use), read that file first.
`);
}

export async function runConfigure(home = os.homedir()): Promise<boolean> {
  clack.intro("aiandrelay configure");

  const detected = detectInstalledHarnesses();
  const notImplemented = ALL_HARNESSES.filter((h) => !isHarnessImplemented(h));

  const lines = ALL_HARNESSES.map((h) => {
    const found = detected[h].installed ? "found" : "not found";
    const support = isHarnessImplemented(h) ? " (ephemeral settings)" : " (support coming later)";
    return `  ${HARNESS_LABEL[h]}: ${found}${support}`;
  });
  clack.log.info(`Detected tools:\n${lines.join("\n")}`);
  clack.log.info("Fresh configure only — no legacy key/home migration.");

  const existing = resolveStoredApiKey((await readGlobalConfig(home)).apiKey);
  let apiKey = existing || process.env.AIAND_API_KEY || "";
  if (!apiKey) {
    const entered = await clack.password({
      message: "ai& API key (from https://docs.aiand.com/):",
      validate: (value) => (value.trim() ? undefined : "An API key is required"),
    });
    if (clack.isCancel(entered)) {
      clack.cancel("Cancelled.");
      return false;
    }
    apiKey = entered.trim();
  }
  await setGlobalApiKey(home, apiKey);
  clack.log.success("ai& API key saved to ~/.aiandrelay/config.json");

  const launchable = ALL_HARNESSES.filter(
    (h) => isHarnessImplemented(h) && detected[h as HarnessId].installed,
  );
  if (launchable.length > 0) {
    clack.log.info(
      `Ready to launch: ${launchable
        .map((h) => HARNESS_LABEL[h])
        .join(", ")}. Run \`aiandrelay <harness>\` to start - nothing is written to disk.`,
    );
  }

  if (notImplemented.length > 0) {
    clack.log.info(
      `${notImplemented.map((h) => HARNESS_LABEL[h]).join(" and ")} support is coming in a later phase (needs a local translation proxy).`,
    );
  }

  clack.outro("Done.");
  return true;
}
