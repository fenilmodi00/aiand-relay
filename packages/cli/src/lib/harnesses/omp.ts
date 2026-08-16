import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AIAND_BASE_URL } from "@aiandrelay/models";
import { getCodexSupportedModels, resolveCodexModel } from "../codex/defaults.js";
import { HARNESS } from "../harness.js";
import { defineHarness, type HarnessContext, type HarnessResult } from "../harness-types.js";
import { resolveAiandApiKey } from "../aiand-core.js";
import { aiandrelayHome } from "../paths.js";
import { spawnBinary } from "../spawn-bin.js";

/**
 * omp (Oh My Pi) - a spawned harness, like Hermes / Prime.
 *
 * omp speaks OpenAI chat-completions, so we write a relay-owned `models.yml`
 * declaring custom provider `aiand` and spawn `omp` with that agent dir via
 * `PI_CODING_AGENT_DIR`. The user's real `~/.omp` stays untouched.
 *
 * Agent dir: persistent `~/.aiandrelay/omp` (Prime-style). omp stores agent.db /
 * model cache under the agent dir — ephemeral temps would re-bootstrap every
 * launch. Named profiles ignore `PI_CODING_AGENT_DIR`; relay launches assume
 * default-profile semantics.
 */

const OMP_PROVIDER_ID = "aiand";
const OMP_BIN = "omp";

/** Relay-owned omp agent dir (never the user's ~/.omp). */
function ompAgentDir(): string {
  return join(aiandrelayHome(), "omp");
}

const VALUE_FLAGS = new Set(["--api-key", "--provider", "--model", "--models"]);

/** Strip provider/model/api-key/models overrides so passthrough cannot leave ai&. */
export function ompArgsWithoutAiandrelayOverrides(args: string[]): string[] {
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
    if (
      arg.startsWith("--api-key=") ||
      arg.startsWith("--provider=") ||
      arg.startsWith("--model=") ||
      arg.startsWith("--models=")
    ) {
      continue;
    }
    sanitized.push(arg);
  }
  return sanitized;
}

function yamlQuote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function ompSupportedModels(): string {
  return getCodexSupportedModels()
    .map((model) => model.id)
    .join(",");
}

function ompArgsWithDefaultThinking(args: string[]): string[] {
  for (const arg of args) {
    if (arg === "--thinking" || arg.startsWith("--thinking=")) {
      return args;
    }
  }
  return ["--thinking", "off", ...args];
}

/** omp-native `models.yml` declaring ai& as a custom openai-completions provider. */
export function ompModelsYml(apiKey: string): string {
  const lines: string[] = [
    "providers:",
    `  ${OMP_PROVIDER_ID}:`,
    `    baseUrl: ${yamlQuote(AIAND_BASE_URL)}`,
    "    api: openai-completions",
    `    apiKey: ${yamlQuote(apiKey)}`,
    "    compat:",
    "      supportsDeveloperRole: false",
    "      supportsReasoningEffort: true",
    "    models:",
  ];

  for (const { definition } of getCodexSupportedModels()) {
    const input = definition.modalities.input.filter((m) => m === "text" || m === "image");
    lines.push(`      - id: ${yamlQuote(definition.id)}`);
    lines.push(`        name: ${yamlQuote(definition.name)}`);
    lines.push(`        reasoning: ${definition.reasoning ? "true" : "false"}`);
    lines.push(`        input: [${input.join(", ")}]`);
    lines.push(`        contextWindow: ${definition.limit.context}`);
    lines.push(`        maxTokens: ${definition.limit.output}`);
    if (definition.reasoning) {
      lines.push("        thinkingLevelMap:");
      lines.push("          off: none");
      lines.push("          minimal: none");
      lines.push("          low: none");
      lines.push("          medium: high");
      lines.push("          high: high");
      lines.push("          xhigh: max");
      lines.push("          max: max");
    }
    lines.push("        cost:");
    lines.push(`          input: ${definition.cost.input}`);
    lines.push(`          output: ${definition.cost.output}`);
    lines.push(`          cacheRead: ${definition.cost.cache_read ?? 0}`);
    lines.push("          cacheWrite: 0");
  }

  lines.push("");
  return lines.join("\n");
}

export default defineHarness({
  id: HARNESS.OMP,
  label: "omp",

  async run(ctx: HarnessContext): Promise<HarnessResult> {
    const apiKey = await resolveAiandApiKey({
      apiKey: ctx.apiKey,
      home: ctx.home,
    });
    if (!apiKey) {
      throw new Error("No ai& API key found. Pass --api-key or set AIAND_API_KEY.");
    }

    const agentDir = ompAgentDir();
    mkdirSync(agentDir, { recursive: true, mode: 0o700 });
    writeFileSync(join(agentDir, "models.yml"), ompModelsYml(apiKey), {
      encoding: "utf8",
      mode: 0o600,
    });

    const selectedModel = resolveCodexModel(ctx.main);
    const supportedModels = ompSupportedModels();
    const args = [
      "--provider",
      OMP_PROVIDER_ID,
      "--model",
      selectedModel.id,
      "--models",
      supportedModels,
      "--api-key",
      apiKey,
      "--yolo",
      "--no-extensions",
      "--no-skills",
      ...ompArgsWithDefaultThinking(ompArgsWithoutAiandrelayOverrides(ctx.passthrough ?? [])),
    ];

    if (process.env.AIANDRELAY_DEBUG === "1") {
      process.stderr.write(`[aiandrelay omp] provider: ${OMP_PROVIDER_ID}\n`);
      process.stderr.write(`[aiandrelay omp] model: ${selectedModel.id}\n`);
      process.stderr.write(`[aiandrelay omp] agent dir: ${agentDir}\n`);
    }

    process.stderr.write(
      `ai& Relay ▸ Launching omp with ai& (${selectedModel.definition.name}).\n`,
    );
    const child = spawnBinary(OMP_BIN, args, {
      env: {
        ...process.env,
        PI_CODING_AGENT_DIR: agentDir,
        AIAND_API_KEY: apiKey,
        OMP_SKIP_SETUP: "1",
      },
      stdio: "inherit",
    });

    const result = await new Promise<{ status: number | null; signal: NodeJS.Signals | null }>(
      (resolve) => {
        child.on("error", (err) => {
          process.stderr.write(`ai& Relay ▸ Failed to launch ${OMP_BIN}: ${err.message}.\n`);
          resolve({ status: 1, signal: null });
        });
        child.on("exit", (status, signal) => resolve({ status, signal }));
      },
    );

    if (typeof result.status === "number") {
      process.exitCode = result.status;
    } else if (result.signal) {
      process.exitCode = 1;
    }
    return {};
  },
});
