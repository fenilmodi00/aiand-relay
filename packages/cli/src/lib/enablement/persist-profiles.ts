import path from "node:path";
import { readFile } from "node:fs/promises";
import { HARNESS, type HarnessId } from "../harness.js";
import { upsertOpencodeAiandAuth, opencodeAuthJsonPath } from "../opencode/auth.js";
import {
  injectOpencodeUserConfig,
  locateOpencodeGlobalConfigFile,
} from "../opencode/user-config.js";
import { injectPiUserConfig, piAuthJsonPath, upsertPiAuth } from "../pi/user-config.js";
import { injectPrimeUserConfig, primeAuthJsonPath, upsertPrimeAuth } from "../prime/user-config.js";
import { injectOmpUserConfig, locateOmpModelsFile } from "../omp/user-config.js";
import {
  hermesConfigPath,
  hermesEnvPath,
  injectHermesUserConfig,
  upsertHermesEnvKey,
} from "../hermes/user-config.js";
import { injectDeepseekUserConfig, deepseekSettingsPath } from "../deepseek/user-config.js";
import { grokConfigPath, injectGrokUserConfig } from "../grok/user-config.js";
import { getDefaultModel } from "@aiandrelay/models";
import type { EnablementProfile } from "./types.js";
import type { HarnessContext } from "../harness-types.js";

function envFrom(ctx: HarnessContext): NodeJS.ProcessEnv {
  return ctx.env ?? process.env;
}

async function fileContains(absPath: string, needle: string): Promise<boolean> {
  try {
    const text = await readFile(absPath, "utf8");
    return text.includes(needle);
  } catch {
    return false;
  }
}

function injectError(label: string, path: string, reason: string): Error {
  return new Error(`${label}: left ${path} unchanged (${reason}).`);
}

export function persistProfiles(): EnablementProfile[] {
  const model = () => getDefaultModel().id;
  return [
    {
      id: HARNESS.OPENCODE,
      label: "OpenCode",
      family: "persist",
      paths: (ctx) => [
        locateOpencodeGlobalConfigFile({ home: ctx.home, env: envFrom(ctx) }).filePath,
        opencodeAuthJsonPath({ home: ctx.home, env: envFrom(ctx) }),
      ],
      async enable(ctx, apiKey) {
        const env = envFrom(ctx);
        const auth = await upsertOpencodeAiandAuth({ home: ctx.home, env, apiKey });
        if (auth.status === "aborted") {
          throw injectError("OpenCode", auth.path, "auth.json is not valid JSON");
        }
        const config = await injectOpencodeUserConfig({ home: ctx.home, env });
        if (config.status === "aborted") {
          throw injectError("OpenCode", config.path, config.reason);
        }
        return {
          label: "OpenCode",
          model: ctx.main ?? model(),
          wrote: [config.path],
          auth: auth.path,
          restartHint: "OpenCode",
        };
      },
      async status(ctx) {
        const configPath = locateOpencodeGlobalConfigFile({
          home: ctx.home,
          env: envFrom(ctx),
        }).filePath;
        const on = await fileContains(configPath, "aiand");
        return on
          ? {
              connection: "on",
              provider: "ai&",
              auth: opencodeAuthJsonPath({ home: ctx.home, env: envFrom(ctx) }),
            }
          : { connection: "off" };
      },
    },
    {
      id: HARNESS.PI,
      label: "Pi Code",
      family: "persist",
      paths: (ctx) => [
        path.join(ctx.home, ".pi", "agent", "models.json"),
        piAuthJsonPath(ctx.home),
      ],
      async enable(ctx, apiKey) {
        const auth = await upsertPiAuth(ctx.home, apiKey);
        if (auth.status === "aborted") {
          throw injectError("Pi Code", auth.path, String(auth.reason));
        }
        const config = await injectPiUserConfig(ctx.home);
        if (config.status === "aborted") {
          throw injectError("Pi Code", config.path, String(config.reason));
        }
        return {
          label: "Pi Code",
          model: ctx.main ?? model(),
          wrote: [config.path],
          auth: auth.path,
          restartHint: "Pi Code",
        };
      },
      async status(ctx) {
        const on = await fileContains(path.join(ctx.home, ".pi", "agent", "models.json"), "aiand");
        return on
          ? { connection: "on", provider: "ai&", auth: piAuthJsonPath(ctx.home) }
          : { connection: "off" };
      },
    },
    {
      id: HARNESS.PRIME,
      label: "Prime Agent",
      family: "persist",
      paths: (ctx) => [
        path.join(ctx.home, ".prime", "agent", "models.json"),
        primeAuthJsonPath(ctx.home),
      ],
      async enable(ctx, apiKey) {
        const auth = await upsertPrimeAuth(ctx.home, apiKey);
        if (auth.status === "aborted") {
          throw injectError("Prime Agent", auth.path, String(auth.reason));
        }
        const config = await injectPrimeUserConfig(ctx.home);
        if (config.status === "aborted") {
          throw injectError("Prime Agent", config.path, String(config.reason));
        }
        return {
          label: "Prime Agent",
          model: ctx.main ?? model(),
          wrote: [config.path],
          auth: auth.path,
          restartHint: "Prime Agent",
        };
      },
      async status(ctx) {
        const on = await fileContains(
          path.join(ctx.home, ".prime", "agent", "models.json"),
          "aiand",
        );
        return on
          ? { connection: "on", provider: "ai&", auth: primeAuthJsonPath(ctx.home) }
          : { connection: "off" };
      },
    },
    {
      id: HARNESS.OMP,
      label: "omp",
      family: "persist",
      paths: (ctx) => [locateOmpModelsFile(ctx.home)],
      async enable(ctx) {
        const config = await injectOmpUserConfig(ctx.home);
        if (config.status === "aborted") {
          throw injectError("omp", config.path, String(config.reason));
        }
        return {
          label: "omp",
          model: ctx.main ?? model(),
          wrote: [config.path],
          restartHint: "omp",
        };
      },
      async status(ctx) {
        const on = await fileContains(locateOmpModelsFile(ctx.home), "aiand");
        return on ? { connection: "on", provider: "ai&" } : { connection: "off" };
      },
    },
    {
      id: HARNESS.HERMES,
      label: "Hermes Agent",
      family: "persist",
      paths: (ctx) => [
        hermesConfigPath({ home: ctx.home, env: envFrom(ctx) }),
        hermesEnvPath({ home: ctx.home, env: envFrom(ctx) }),
      ],
      async enable(ctx, apiKey) {
        const env = envFrom(ctx);
        await upsertHermesEnvKey({ home: ctx.home, env, apiKey });
        const config = await injectHermesUserConfig({ home: ctx.home, env });
        if (config.status === "aborted") {
          throw injectError("Hermes Agent", config.path, String(config.reason));
        }
        return {
          label: "Hermes Agent",
          model: ctx.main ?? model(),
          wrote: [config.path],
          auth: hermesEnvPath({ home: ctx.home, env }),
          restartHint: "Hermes Agent",
        };
      },
      async status(ctx) {
        const on = await fileContains(
          hermesConfigPath({ home: ctx.home, env: envFrom(ctx) }),
          "aiand",
        );
        return on ? { connection: "on", provider: "ai&" } : { connection: "off" };
      },
    },
    {
      id: HARNESS.DEEPSEEK,
      label: "DeepSeek Harness",
      family: "persist",
      paths: (ctx) => [deepseekSettingsPath({ home: ctx.home, env: envFrom(ctx) })],
      async enable(ctx) {
        const config = await injectDeepseekUserConfig({ home: ctx.home, env: envFrom(ctx) });
        if (config.status === "aborted") {
          throw injectError("DeepSeek Harness", config.path, String(config.reason));
        }
        return {
          label: "DeepSeek Harness",
          model: ctx.main ?? model(),
          wrote: [config.path],
          restartHint: "DeepSeek Harness",
        };
      },
      async status(ctx) {
        const on = await fileContains(
          deepseekSettingsPath({ home: ctx.home, env: envFrom(ctx) }),
          "aiand",
        );
        return on ? { connection: "on", provider: "ai&" } : { connection: "off" };
      },
    },
    {
      id: HARNESS.GROK,
      label: "Grok Build",
      family: "persist",
      paths: (ctx) => [grokConfigPath({ home: ctx.home, env: envFrom(ctx) })],
      async enable(ctx) {
        const config = await injectGrokUserConfig({ home: ctx.home, env: envFrom(ctx) });
        if (config.status === "aborted") {
          throw injectError("Grok Build", config.path, String(config.reason));
        }
        return {
          label: "Grok Build",
          model: ctx.main ?? model(),
          wrote: [config.path],
          restartHint: "Grok Build",
        };
      },
      async status(ctx) {
        const on = await fileContains(
          grokConfigPath({ home: ctx.home, env: envFrom(ctx) }),
          "aiand",
        );
        return on ? { connection: "on", provider: "ai&" } : { connection: "off" };
      },
    },
  ];
}

export function persistProfileIds(): HarnessId[] {
  return persistProfiles().map((profile) => profile.id);
}
