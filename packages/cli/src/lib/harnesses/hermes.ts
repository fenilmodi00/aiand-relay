import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AIAND_BASE_URL } from "@aiandrelay/models";
import { resolveCodexModel } from "../codex/defaults.js";
import { HARNESS } from "../harness.js";
import { defineHarness, type HarnessContext, type HarnessResult } from "../harness-types.js";
import { resolveAiandApiKey } from "../aiand-core.js";
import { meteredEndpoint } from "../metered-spawn.js";
import { aiandrelayHome } from "../paths.js";
import { spawnBinary } from "../spawn-bin.js";

/**
 * Hermes Agent (Nous Research) - a spawned harness, like OpenCode / Pi / Prime.
 *
 * Hermes already speaks OpenAI chat-completions, so it needs no translation
 * proxy: we write a minimal custom-provider `config.yaml` under a relay-owned
 * `HERMES_HOME` and point it at ai&. The user's real `~/.hermes` stays
 * completely untouched.
 *
 * Home: persistent `~/.aiandrelay/hermes` (Prime-style). Hermes keeps config,
 * memories, skills, and sessions under HERMES_HOME - a throwaway temp home
 * would wipe that state every launch.
 */

const HERMES_BIN = "hermes";

/** Relay-owned Hermes home (never the user's ~/.hermes). */
function hermesHome(): string {
  return join(aiandrelayHome(), "hermes");
}

const VALUE_FLAGS = new Set(["--provider", "--model", "-m"]);

/** Strip provider/model overrides so passthrough cannot leave ai&. */
export function hermesArgsWithoutAiandrelayOverrides(args: string[]): string[] {
  const sanitized: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === undefined) {
      continue;
    }
    if (VALUE_FLAGS.has(arg)) {
      i += 1;
      continue;
    }
    if (arg.startsWith("--provider=") || arg.startsWith("--model=") || arg.startsWith("-m=")) {
      continue;
    }
    sanitized.push(arg);
  }
  return sanitized;
}

function yamlQuote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Minimal Hermes `config.yaml` for ai& as a custom OpenAI-compatible endpoint. */
export function hermesConfigYaml(options: { defaultModel: string; baseUrl: string }): string {
  return [
    "model:",
    `  default: ${yamlQuote(options.defaultModel)}`,
    "  provider: custom",
    `  base_url: ${yamlQuote(options.baseUrl)}`,
    "  api_key: ${AIAND_API_KEY}",
    "",
  ].join("\n");
}

export default defineHarness({
  id: HARNESS.HERMES,
  label: "Hermes Agent",

  async run(ctx: HarnessContext): Promise<HarnessResult> {
    const apiKey = await resolveAiandApiKey({
      apiKey: ctx.apiKey,
      home: ctx.home,
    });
    if (!apiKey) {
      throw new Error("No ai& API key found. Pass --api-key or set AIAND_API_KEY.");
    }

    const home = hermesHome();
    mkdirSync(home, { recursive: true, mode: 0o700 });

    const selectedModel = resolveCodexModel(ctx.main);
    // Route through the daemon when metering is on, so this session's spend is
    // tracked and it gets model fallback + retries like the proxied harnesses.
    const endpoint = await meteredEndpoint({
      agent: HARNESS.HERMES,
      apiKey,
      baseUrl: AIAND_BASE_URL,
      model: selectedModel.definition,
    });
    writeFileSync(
      join(home, "config.yaml"),
      hermesConfigYaml({ defaultModel: selectedModel.id, baseUrl: endpoint.baseUrl }),
      { encoding: "utf8", mode: 0o600 },
    );

    const args = hermesArgsWithoutAiandrelayOverrides(ctx.passthrough ?? []);

    if (process.env.AIANDRELAY_DEBUG === "1") {
      process.stderr.write(`[aiandrelay hermes] provider: custom\n`);
      process.stderr.write(`[aiandrelay hermes] model: ${selectedModel.id}\n`);
      process.stderr.write(`[aiandrelay hermes] HERMES_HOME: ${home}\n`);
    }

    process.stderr.write(
      `ai& Relay ▸ Launching Hermes Agent with ai& (${selectedModel.definition.name}).\n`,
    );
    const child = spawnBinary(HERMES_BIN, args, {
      env: {
        ...process.env,
        HERMES_HOME: home,
        AIAND_API_KEY: endpoint.apiKey,
      },
      stdio: "inherit",
    });

    const result = await new Promise<{ status: number | null; signal: NodeJS.Signals | null }>(
      (resolve) => {
        child.on("error", (err) => {
          process.stderr.write(`ai& Relay ▸ Failed to launch ${HERMES_BIN}: ${err.message}.\n`);
          resolve({ status: 1, signal: null });
        });
        child.on("exit", (status, signal) => resolve({ status, signal }));
      },
    );

    await endpoint.finish();
    if (typeof result.status === "number") {
      process.exitCode = result.status;
    } else if (result.signal) {
      process.exitCode = 1;
    }
    return {};
  },
});
