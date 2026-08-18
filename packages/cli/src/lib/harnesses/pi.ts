import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { AIAND_BASE_URL } from "@aiandrelay/models";
import { getCodexSupportedModels, resolveCodexModel } from "../codex/defaults.js";
import { HARNESS } from "../harness.js";
import { defineHarness, type HarnessContext, type HarnessResult } from "../harness-types.js";
import { resolveAiandApiKey } from "../aiand-core.js";
import { meteredEndpoint } from "../metered-spawn.js";
import { spawnBinary } from "../spawn-bin.js";

const PI_PROVIDER_ID = "aiand";
function piSupportedModels(): string {
  return getCodexSupportedModels()
    .map((model) => model.id)
    .join(",");
}

const VALUE_FLAGS = new Set(["--api-key", "--provider", "--model", "--models"]);

function piArgsWithoutAiandrelayOverrides(args: string[]): string[] {
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

function writePiModelsJson(agentDir: string, apiKey: string, baseUrl: string): void {
  const models = getCodexSupportedModels().map(({ definition }) => ({
    id: definition.id,
    name: definition.name,
    reasoning: definition.reasoning,
    // Pi rejects unknown modality tokens (pdf/video) and drops the whole provider.
    input: definition.modalities.input.filter((m) => m === "text" || m === "image"),
    contextWindow: definition.limit.context,
    maxTokens: definition.limit.output,
    // Map Pi's thinking UI levels onto ai&'s allowlist (none|high|max).
    ...(definition.reasoning
      ? {
          thinkingLevelMap: {
            off: "none",
            minimal: "none",
            low: "none",
            medium: "high",
            high: "high",
            xhigh: "max",
            max: "max",
          },
        }
      : {}),
    cost: {
      input: definition.cost.input,
      output: definition.cost.output,
      cacheRead: definition.cost.cache_read ?? 0,
      cacheWrite: 0,
    },
  }));

  writeFileSync(
    join(agentDir, "models.json"),
    `${JSON.stringify(
      {
        providers: {
          [PI_PROVIDER_ID]: {
            // ai& is not a Pi built-in provider, so declare it as a custom
            // OpenAI-compatible provider: baseUrl + api="openai-completions"
            // route Pi's requests through the ai& endpoint.
            baseUrl,
            api: "openai-completions",
            apiKey,
            // ai& runs on vLLM, which does not understand the OpenAI
            // "developer" role; send the system prompt as a system message.
            // supportsReasoningEffort: emit reasoning_effort for GLM-class models.
            compat: { supportsDeveloperRole: false, supportsReasoningEffort: true },
            models,
          },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

function piArgsWithDefaultThinking(args: string[]): string[] {
  for (const arg of args) {
    if (arg === "--thinking" || arg.startsWith("--thinking=")) {
      return args;
    }
  }
  // Product default: wire none (Pi's UI default is medium, which ai& rejects).
  return ["--thinking", "off", ...args];
}

export default defineHarness({
  id: HARNESS.PI,
  label: "Pi Code",

  async run(ctx: HarnessContext): Promise<HarnessResult> {
    const apiKey = await resolveAiandApiKey({
      apiKey: ctx.apiKey,
      home: ctx.home,
    });
    if (!apiKey) {
      throw new Error("No ai& API key found. Pass --api-key or set AIAND_API_KEY.");
    }

    const agentDir = mkdtempSync(join(tmpdir(), "aiandrelay-pi-"));
    const sessionDir =
      process.env.PI_CODING_AGENT_SESSION_DIR ??
      join(ctx.home || homedir(), ".pi", "agent", "sessions");
    const selectedModel = resolveCodexModel(ctx.main);
    const endpoint = await meteredEndpoint({
      agent: HARNESS.PI,
      apiKey,
      baseUrl: AIAND_BASE_URL,
      model: selectedModel.definition,
    });
    writePiModelsJson(agentDir, endpoint.apiKey, endpoint.baseUrl);
    const supportedModels = piSupportedModels();
    const args = [
      "--provider",
      PI_PROVIDER_ID,
      "--model",
      selectedModel.id,
      "--models",
      supportedModels,
      "--api-key",
      endpoint.apiKey,
      "--no-approve",
      "--no-extensions",
      "--no-skills",
      "--no-prompt-templates",
      "--no-themes",
      ...piArgsWithDefaultThinking(piArgsWithoutAiandrelayOverrides(ctx.passthrough ?? [])),
    ];

    if (process.env.AIANDRELAY_DEBUG === "1") {
      process.stderr.write(`[aiandrelay pi] provider: ${PI_PROVIDER_ID}\n`);
      process.stderr.write(`[aiandrelay pi] model: ${selectedModel.id}\n`);
      process.stderr.write(`[aiandrelay pi] models: ${supportedModels}\n`);
      process.stderr.write(`[aiandrelay pi] temp config dir: ${agentDir}\n`);
      process.stderr.write(`[aiandrelay pi] session dir: ${sessionDir}\n`);
    }

    process.stderr.write(`ai& Relay ▸ Launching Pi Code with ai&.\n`);
    const child = spawnBinary("pi", args, {
      env: {
        ...process.env,
        PI_CODING_AGENT_DIR: agentDir,
        PI_CODING_AGENT_SESSION_DIR: sessionDir,
        AIAND_API_KEY: endpoint.apiKey,
      },
      stdio: "inherit",
    });

    const result = await new Promise<{ status: number | null; signal: NodeJS.Signals | null }>(
      (resolve) => {
        child.on("error", (err) => {
          process.stderr.write(`ai& Relay ▸ Failed to launch pi: ${err.message}.\n`);
          resolve({ status: 1, signal: null });
        });
        child.on("exit", (status, signal) => resolve({ status, signal }));
      },
    );

    await endpoint.finish();
    try {
      rmSync(agentDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }

    if (typeof result.status === "number") {
      process.exitCode = result.status;
    }
    return {};
  },
});
