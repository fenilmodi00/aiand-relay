import { backupPaths } from "../enablement/snapshot.js";
import { getEnablementProfile } from "../enablement/engine.js";
import { relayHomeFor } from "../enablement/relay-home.js";
import { printBanner } from "../cli/banner.js";
import os from "node:os";
import path from "node:path";
import * as clack from "@clack/prompts";
import { ALL_HARNESSES, HARNESS, HARNESS_LABEL, type HarnessId } from "../harness.js";
import { isHarnessImplemented } from "../harness-registry.js";
import { detectInstalledHarnesses } from "../detect.js";
import { readGlobalConfig, setGlobalApiKey, resolveStoredApiKey } from "../global-config.js";
import { VERSION } from "../version.js";
import { resolveBinPath } from "../spawn-bin.js";
import {
  claudeSettingsPath,
  decideClaudeNativeConfig,
  isClaudePresent,
} from "../claude/user-config.js";
import {
  deepseekSettingsPath,
  injectDeepseekUserConfig,
  isDeepseekPresent,
} from "../deepseek/user-config.js";
import {
  hermesConfigPath,
  hermesEnvPath,
  injectHermesUserConfig,
  isHermesPresent,
  upsertHermesEnvKey,
} from "../hermes/user-config.js";
import { upsertOpencodeAiandAuth, opencodeAuthJsonPath } from "../opencode/auth.js";
import {
  injectOpencodeUserConfig,
  isOpencodePresent,
  locateOpencodeGlobalConfigFile,
  opencodeGlobalConfigDir,
} from "../opencode/user-config.js";
import { grokConfigPath, injectGrokUserConfig, isGrokPresent } from "../grok/user-config.js";
import { injectOmpUserConfig, isOmpPresent, locateOmpModelsFile } from "../omp/user-config.js";
import {
  injectPiUserConfig,
  isPiPresent,
  piAuthJsonPath,
  upsertPiAuth,
} from "../pi/user-config.js";
import {
  injectPrimeUserConfig,
  isPrimePresent,
  primeAuthJsonPath,
  upsertPrimeAuth,
} from "../prime/user-config.js";

export function printHelp() {
  printBanner({ version: VERSION });
  console.log(`
Usage:
  aiandrelay configure         save key; turn on detected OpenAI-compatible tools
  aiandrelay uninstall         off every harness, then remove the CLI
  aiandrelay status            key + per-harness routing
  aiandrelay model list        browse ai& coding models
  aiandrelay update            update to the latest release
  aiandrelay whoami
  aiandrelay usage [--last 7d] tracked local spend by model and tool
  aiandrelay daemon install    start the daemon at login (macOS/Linux)
  aiandrelay daemon uninstall  stop starting the daemon at login
  aiandrelay daemon status     show auto-start service status
  aiandrelay daemon stop       stop the running daemon
  aiandrelay chatgpt [--model <model>] [--restore]  (alpha)
  aiandrelay <harness> [on|off|status|help|run ...]

Harnesses: claude, codex, opencode, pi, prime, hermes, deepseek, grok, omp
Bare \`aiandrelay claude\` writes native config (on). Use \`run\` to launch the wrapper.
Claude/Codex: \`on\` points at the local daemon. Other tools: \`on\` writes an ai& provider into that tool's own files.
Keys stay in ~/.aiandrelay/config.json and each tool's files (not the OS keychain — harnesses need a baked key).

Docs: https://aiand-relay-6eb9031f.onbld.com/llms.txt
`);
}

export type RunConfigureOptions = {
  env?: NodeJS.ProcessEnv;
  opencodeBinaryPresent?: boolean;
  binaryPresence?: Partial<Record<HarnessId, boolean>>;
};

export async function runConfigure(
  home = os.homedir(),
  options: RunConfigureOptions = {},
): Promise<boolean> {
  clack.intro("aiandrelay configure");

  const detected = detectInstalledHarnesses();
  const notImplemented = ALL_HARNESSES.filter((h) => !isHarnessImplemented(h));
  const env = options.env ?? process.env;
  const binaryPresentFor = (harness: HarnessId): boolean => {
    if (harness === HARNESS.OPENCODE && options.opencodeBinaryPresent !== undefined) {
      return options.opencodeBinaryPresent;
    }
    return options.binaryPresence?.[harness] ?? detected[harness].installed;
  };

  const lines = ALL_HARNESSES.map((h) => {
    const found = binaryPresentFor(h) ? "found" : "not found";
    const support = configureSupportLabel(h);
    return `  ${HARNESS_LABEL[h]}: ${found}${support}`;
  });
  clack.log.info(`Detected tools:\n${lines.join("\n")}`);
  clack.log.info("Fresh configure only — no legacy key/home migration.");

  const existing = resolveStoredApiKey((await readGlobalConfig(home)).apiKey);
  let apiKey = existing || env.AIAND_API_KEY || process.env.AIAND_API_KEY || "";
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

  const opencodeConfigDir = opencodeGlobalConfigDir({ home, env });
  if (!isOpencodePresent({ home, env, binaryPresent: binaryPresentFor(HARNESS.OPENCODE) })) {
    clack.log.info(
      `OpenCode was not found (no opencode on PATH and no ${opencodeConfigDir}). Skipping OpenCode provider inject. Re-run aiandrelay configure after installing OpenCode.`,
    );
  } else {
    try {
      await snapshotPersistHarness(HARNESS.OPENCODE, home, env);
      const authResult = await upsertOpencodeAiandAuth({ home, env, apiKey });
      if (authResult.status === "aborted") {
        clack.log.error(
          `OpenCode: left ${authResult.path} unchanged (auth.json is not valid JSON). Fix or move the file and re-run aiandrelay configure.`,
        );
        clack.log.info("OpenCode: skipped provider inject because credentials were not written.");
      } else {
        if (authResult.status === "created") {
          clack.log.success(`OpenCode: saved ai& credentials to ${authResult.path}`);
        } else {
          clack.log.success(`OpenCode: updated ai& credentials in ${authResult.path}`);
        }
        try {
          const configResult = await injectOpencodeUserConfig({ home, env });
          if (configResult.status === "created") {
            clack.log.success(`OpenCode: added provider.aiand to ${configResult.path}`);
            clack.log.info(
              "Plain opencode can use ai& models. aopencode is unchanged (session lockdown; writes nothing on launch).",
            );
          } else if (configResult.status === "merged") {
            clack.log.success(
              `OpenCode: updated provider.aiand in ${configResult.path} (curated models refreshed; extra models kept)`,
            );
          } else if (configResult.status === "aborted") {
            if (configResult.reason === "invalid-json") {
              clack.log.error(
                `OpenCode: left ${configResult.path} unchanged (invalid JSON). Fix the file and re-run aiandrelay configure.`,
              );
            } else if (configResult.reason === "v2-schema") {
              clack.log.error(
                `OpenCode: left ${configResult.path} unchanged (OpenCode v2 providers schema). This release only writes v1 provider.aiand. Add ai& in that file manually; credentials were saved to ${authResult.path}.`,
              );
            } else if (configResult.reason === "provider-not-object") {
              clack.log.error(
                `OpenCode: left ${configResult.path} unchanged (top-level provider is not an object).`,
              );
            } else {
              clack.log.error(
                `OpenCode: left ${configResult.path} unchanged (provider.aiand exists but is not an object).`,
              );
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const located = locateOpencodeGlobalConfigFile({ home, env });
          clack.log.error(`OpenCode: could not write ${located.filePath}: ${message}`);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      clack.log.error(
        `OpenCode: could not write ${opencodeAuthJsonPath({ home, env })}: ${message}`,
      );
    }
  }

  if (!isPiPresent(home, binaryPresentFor(HARNESS.PI))) {
    clack.log.info(
      `Pi Code was not found (no pi on PATH and no ${path.join(home, ".pi", "agent")}). Skipping Pi native config inject.`,
    );
  } else {
    try {
      await snapshotPersistHarness(HARNESS.PI, home, env);
      const authResult = await upsertPiAuth(home, apiKey);
      if (authResult.status === "aborted") {
        clack.log.error(
          `Pi Code: left ${authResult.path} unchanged (${formatJsonAbortReason(authResult.reason)}).`,
        );
        clack.log.info("Pi Code: skipped provider inject because credentials were not written.");
      } else {
        clack.log.success(
          `Pi Code: ${authResult.status === "created" ? "saved" : "updated"} ai& credentials in ${authResult.path}`,
        );
        try {
          const configResult = await injectPiUserConfig(home);
          logPiFamilyConfigResult("Pi Code", configResult);
        } catch (err) {
          clack.log.error(
            `Pi Code: could not write ${path.join(home, ".pi", "agent", "models.json")}: ${formatError(err)}`,
          );
        }
      }
    } catch (err) {
      clack.log.error(`Pi Code: could not write ${piAuthJsonPath(home)}: ${formatError(err)}`);
    }
  }

  if (!isOmpPresent(home, binaryPresentFor(HARNESS.OMP))) {
    clack.log.info(
      `omp was not found (no omp on PATH and no ${path.join(home, ".omp", "agent")}). Skipping omp native config inject.`,
    );
  } else {
    try {
      await snapshotPersistHarness(HARNESS.OMP, home, env);
      const configResult = await injectOmpUserConfig(home);
      logPiFamilyConfigResult("omp", configResult);
      if (configResult.status !== "aborted") {
        clack.log.info(
          `omp: provider credentials resolve through ${locateOmpModelsFile(home)} using AIAND_API_KEY env-name semantics.`,
        );
      }
    } catch (err) {
      clack.log.error(`omp: could not write ${locateOmpModelsFile(home)}: ${formatError(err)}`);
    }
  }

  if (!isPrimePresent(home, binaryPresentFor(HARNESS.PRIME))) {
    clack.log.info(
      `Prime Agent was not found (no prime-agent on PATH and no ${path.join(home, ".prime", "agent")}). Skipping Prime native config inject.`,
    );
  } else {
    try {
      await snapshotPersistHarness(HARNESS.PRIME, home, env);
      const authResult = await upsertPrimeAuth(home, apiKey);
      if (authResult.status === "aborted") {
        clack.log.error(
          `Prime Agent: left ${authResult.path} unchanged (${formatJsonAbortReason(authResult.reason)}).`,
        );
        clack.log.info(
          "Prime Agent: skipped provider inject because credentials were not written.",
        );
      } else {
        clack.log.success(
          `Prime Agent: ${authResult.status === "created" ? "saved" : "updated"} ai& credentials in ${authResult.path}`,
        );
        try {
          const configResult = await injectPrimeUserConfig(home);
          logPiFamilyConfigResult("Prime Agent", configResult);
        } catch (err) {
          clack.log.error(
            `Prime Agent: could not write ${path.join(home, ".prime", "agent", "models.json")}: ${formatError(err)}`,
          );
        }
      }
    } catch (err) {
      clack.log.error(
        `Prime Agent: could not write ${primeAuthJsonPath(home)}: ${formatError(err)}`,
      );
    }
  }

  if (!isHermesPresent({ home, env, binaryPresent: binaryPresentFor(HARNESS.HERMES) })) {
    clack.log.info(
      `Hermes Agent was not found (no hermes on PATH and no ${path.join(home, ".hermes")}). Skipping Hermes native config inject.`,
    );
  } else {
    await snapshotPersistHarness(HARNESS.HERMES, home, env);
    let hermesEnvWritten = false;
    try {
      const envResult = await upsertHermesEnvKey({ home, env, apiKey });
      clack.log.success(
        `Hermes Agent: ${envResult.status === "created" ? "saved" : "updated"} AIAND_API_KEY in ${envResult.path}`,
      );
      hermesEnvWritten = true;
    } catch (err) {
      clack.log.error(
        `Hermes Agent: could not write ${hermesEnvPath({ home, env })}: ${formatError(err)}`,
      );
    }
    if (hermesEnvWritten) {
      try {
        const configResult = await injectHermesUserConfig({ home, env });
        logYamlConfigResult("Hermes Agent", configResult);
      } catch (err) {
        clack.log.error(
          `Hermes Agent: could not write ${hermesConfigPath({ home, env })}: ${formatError(err)}`,
        );
      }
    }
  }

  if (!isGrokPresent({ home, env, binaryPresent: binaryPresentFor(HARNESS.GROK) })) {
    clack.log.info(
      `Grok Build was not found (no grok on PATH and no ${path.join(home, ".grok")}). Skipping Grok native config inject.`,
    );
  } else {
    try {
      await snapshotPersistHarness(HARNESS.GROK, home, env);
      const configResult = await injectGrokUserConfig({ home, env });
      if (configResult.status === "aborted") {
        clack.log.error(`Grok Build: left ${configResult.path} unchanged (invalid TOML).`);
      } else {
        clack.log.success(
          `Grok Build: ${configResult.status === "created" ? "created" : "updated"} ai& model entries in ${configResult.path}`,
        );
        clack.log.info(
          "Grok Build: ai& entries reference AIAND_API_KEY via env_key. Existing user defaults were left unchanged.",
        );
      }
    } catch (err) {
      clack.log.error(
        `Grok Build: could not write ${grokConfigPath({ home, env })}: ${formatError(err)}`,
      );
    }
  }

  if (!isDeepseekPresent({ home, env, binaryPresent: binaryPresentFor(HARNESS.DEEPSEEK) })) {
    clack.log.info(
      `DeepSeek Harness (alpha) was not found (no dsh on PATH and no ${path.join(home, ".dsh")}). Skipping DeepSeek native config inject.`,
    );
  } else {
    try {
      await snapshotPersistHarness(HARNESS.DEEPSEEK, home, env);
      const configResult = await injectDeepseekUserConfig({ home, env });
      logDeepseekConfigResult("DeepSeek Harness", configResult);
    } catch (err) {
      clack.log.error(
        `DeepSeek Harness: could not write ${deepseekSettingsPath({ home, env })}: ${formatError(err)}`,
      );
    }
  }

  if (!isClaudePresent(home, binaryPresentFor(HARNESS.CLAUDE))) {
    clack.log.info(
      `Claude Code was not found (no claude on PATH and no ${path.join(home, ".claude")}). Skipping Claude native config decision.`,
    );
  } else {
    const decision = decideClaudeNativeConfig(home);
    clack.log.info(
      `Claude Code: left ${decision.path} unchanged (${formatClaudeDecision(decision.reason)}). Run \`aiandrelay claude on\` to point stock claude at the local daemon.`,
    );
  }

  const launchable = ALL_HARNESSES.filter(
    (h) => isHarnessImplemented(h) && binaryPresentFor(h as HarnessId),
  );
  if (launchable.length > 0) {
    clack.log.info(
      `Ready to launch: ${launchable
        .map((h) => HARNESS_LABEL[h])
        .join(
          ", ",
        )}. Run \`aiandrelay <harness> on\` to write native config, then use the stock binary. \`aiandrelay <harness> run\` still launches the wrapper.`,
    );
  }

  clack.log.info(
    "OpenAI-compatible tools that were found are on (add-only inject + snapshot). Claude Code and Codex: run `aiandrelay claude on` / `aiandrelay codex on`.",
  );

  if (notImplemented.length > 0) {
    clack.log.info(
      `${notImplemented.map((h) => HARNESS_LABEL[h]).join(" and ")} support is coming in a later phase (needs a local translation proxy).`,
    );
  }

  clack.outro("Done.");
  return true;
}

function configureSupportLabel(harness: HarnessId): string {
  if (!isHarnessImplemented(harness)) {
    return " (support coming later)";
  }
  switch (harness) {
    case HARNESS.CLAUDE:
      return " (run aiandrelay claude on for native daemon routing)";
    case HARNESS.CODEX:
      return " (run aiandrelay codex on for native daemon routing)";
    case HARNESS.OPENCODE:
    case HARNESS.PI:
    case HARNESS.PRIME:
    case HARNESS.HERMES:
    case HARNESS.DEEPSEEK:
    case HARNESS.GROK:
    case HARNESS.OMP:
      return " (configure turns this on; add-only inject)";
  }
}

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function formatJsonAbortReason(reason: "invalid-json" | "not-object"): string {
  return reason === "invalid-json" ? "auth.json is not valid JSON" : "auth.json is not an object";
}

function logPiFamilyConfigResult(
  label: string,
  result: {
    status: "created" | "merged" | "updated" | "aborted";
    path: string;
    reason?:
      | "invalid-json"
      | "invalid-yaml"
      | "not-object"
      | "providers-not-object"
      | "aiand-not-object"
      | "aiand-compat-not-object"
      | "aiand-models-not-array"
      | "aiand-model-cost-not-object"
      | "aiand-model-thinking-level-map-not-object";
  },
): void {
  if (result.status === "aborted") {
    clack.log.error(
      `${label}: left ${result.path} unchanged (${formatPiFamilyConfigAbortReason(result.reason)}).`,
    );
    return;
  }
  clack.log.success(
    `${label}: ${result.status === "created" ? "added" : "updated"} ai& provider config in ${result.path}`,
  );
}

function logYamlConfigResult(
  label: string,
  result: {
    status: "created" | "merged" | "updated" | "aborted";
    path: string;
    reason?:
      | "invalid-yaml"
      | "not-object"
      | "providers-not-object"
      | "aiand-not-object"
      | "models-not-sequence";
  },
): void {
  if (result.status === "aborted") {
    clack.log.error(
      `${label}: left ${result.path} unchanged (${formatYamlConfigAbortReason(result.reason)}).`,
    );
    return;
  }
  clack.log.success(
    `${label}: ${result.status === "created" ? "added" : "updated"} ai& provider config in ${result.path}`,
  );
}

function logDeepseekConfigResult(
  label: string,
  result: {
    status: "created" | "merged" | "updated" | "aborted";
    path: string;
    reason?:
      | "invalid-yaml"
      | "not-object"
      | "plugin-not-object"
      | "providers-not-object"
      | "aiand-not-object"
      | "aiand-compat-not-object"
      | "aiand-models-not-array";
  },
): void {
  if (result.status === "aborted") {
    clack.log.error(
      `${label}: left ${result.path} unchanged (${formatDeepseekAbortReason(result.reason)}).`,
    );
    return;
  }
  clack.log.success(
    `${label}: ${result.status === "created" ? "added" : "updated"} ai& provider config in ${result.path}`,
  );
}

function formatPiFamilyConfigAbortReason(
  reason:
    | "invalid-json"
    | "invalid-yaml"
    | "not-object"
    | "providers-not-object"
    | "aiand-not-object"
    | "aiand-compat-not-object"
    | "aiand-models-not-array"
    | "aiand-model-cost-not-object"
    | "aiand-model-thinking-level-map-not-object"
    | undefined,
): string {
  switch (reason) {
    case "invalid-json":
      return "invalid JSON";
    case "invalid-yaml":
      return "invalid YAML";
    case "providers-not-object":
      return "providers is not an object";
    case "aiand-not-object":
      return "providers.aiand is not an object";
    case "aiand-compat-not-object":
      return "providers.aiand.compat is not an object";
    case "aiand-models-not-array":
      return "providers.aiand.models is not an array/sequence";
    case "aiand-model-cost-not-object":
      return "providers.aiand.models[*].cost is not an object";
    case "aiand-model-thinking-level-map-not-object":
      return "providers.aiand.models[*].thinkingLevelMap is not an object";
    case "not-object":
    default:
      return "config root is not an object";
  }
}

function formatYamlConfigAbortReason(
  reason:
    | "invalid-yaml"
    | "not-object"
    | "providers-not-object"
    | "aiand-not-object"
    | "models-not-sequence"
    | undefined,
): string {
  switch (reason) {
    case "invalid-yaml":
      return "invalid YAML";
    case "providers-not-object":
      return "providers is not an object";
    case "aiand-not-object":
      return "providers.aiand is not an object";
    case "models-not-sequence":
      return "providers.aiand.models is not a sequence";
    case "not-object":
    default:
      return "config root is not an object";
  }
}

function formatDeepseekAbortReason(
  reason:
    | "invalid-yaml"
    | "not-object"
    | "plugin-not-object"
    | "providers-not-object"
    | "aiand-not-object"
    | "aiand-compat-not-object"
    | "aiand-models-not-array"
    | undefined,
): string {
  switch (reason) {
    case "invalid-yaml":
      return "invalid YAML";
    case "plugin-not-object":
      return "llm-pi-ai is not an object";
    case "providers-not-object":
      return "llm-pi-ai.providers is not an object";
    case "aiand-not-object":
      return "llm-pi-ai.providers.aiand is not an object";
    case "aiand-compat-not-object":
      return "llm-pi-ai.providers.aiand.compat is not an object";
    case "aiand-models-not-array":
      return "llm-pi-ai.providers.aiand.models is not an array/sequence";
    case "not-object":
    default:
      return "config root is not an object";
  }
}

function formatClaudeDecision(
  reason: "unsupported-custom-provider" | "destructive-proxy-redirection",
): string {
  if (reason === "destructive-proxy-redirection") {
    return "native settings would redirect all Claude traffic through a proxy";
  }
  return "native custom providers are not supported safely";
}

async function snapshotPersistHarness(
  id: HarnessId,
  home: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const profile = getEnablementProfile(id);
  await backupPaths(relayHomeFor(home), id, profile.paths({ home, env }));
}
