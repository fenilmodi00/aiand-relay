import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveCodexModel } from "../codex/defaults.js";
import {
  buildGrokIdentityRule,
  buildGrokLaunchEnvironment,
  grokArgsWithAiandIdentity,
  startGrokModelCatalogServer,
} from "../grok/core.js";
import { HARNESS } from "../harness.js";
import { defineHarness, type HarnessContext, type HarnessResult } from "../harness-types.js";
import { resolveAiandApiKey, resolveAiandBaseUrl } from "../aiand-core.js";
import { meteredEndpoint } from "../metered-spawn.js";
import { spawnBinary } from "../spawn-bin.js";

export default defineHarness({
  id: HARNESS.GROK,
  label: "Grok Build",

  async run(ctx: HarnessContext): Promise<HarnessResult> {
    const apiKey = await resolveAiandApiKey({ apiKey: ctx.apiKey, home: ctx.home });
    if (!apiKey) {
      throw new Error("No ai& API key found. Pass --api-key or set AIAND_API_KEY.");
    }

    const selectedModel = resolveCodexModel(ctx.main);
    const endpoint = await meteredEndpoint({
      agent: HARNESS.GROK,
      apiKey,
      baseUrl: resolveAiandBaseUrl(),
      model: selectedModel.definition,
    });
    const baseUrl = endpoint.baseUrl;
    // Isolated, empty auth file: Grok must use the ai& key we supply rather
    // than the user's own xAI login, and their real auth file stays untouched.
    const temporaryAuthDirectory = mkdtempSync(join(tmpdir(), "aiandrelay-grok-auth-"));
    const authPath = join(temporaryAuthDirectory, "no-auth.json");
    let catalogServer: Awaited<ReturnType<typeof startGrokModelCatalogServer>> | undefined;
    try {
      catalogServer = await startGrokModelCatalogServer(baseUrl);
      const args = [
        "--model",
        selectedModel.id,
        ...grokArgsWithAiandIdentity(
          ctx.passthrough ?? [],
          buildGrokIdentityRule(selectedModel.definition),
        ),
      ];
      const env = buildGrokLaunchEnvironment({
        inheritedEnv: process.env,
        apiKey: endpoint.apiKey,
        authPath,
        baseUrl,
        modelsListUrl: catalogServer.modelsListUrl,
        selectedModel: selectedModel.definition,
      });

      if (process.env.AIANDRELAY_DEBUG === "1") {
        process.stderr.write(`[aiandrelay grok] model: ${selectedModel.id}\n`);
        process.stderr.write(`[aiandrelay grok] inference: ${baseUrl}\n`);
        process.stderr.write(`[aiandrelay grok] model catalog: ${catalogServer.modelsListUrl}\n`);
        process.stderr.write(`[aiandrelay grok] auth isolation: ${authPath}\n`);
      }

      process.stderr.write(
        `ai& Relay ▸ Launching Grok Build with ai& (${selectedModel.definition.name}). Not xAI.\n`,
      );
      const child = spawnBinary("grok", args, { env, stdio: "inherit" });
      const result = await new Promise<{ status: number | null; signal: NodeJS.Signals | null }>(
        (resolve) => {
          child.on("error", (err) => {
            process.stderr.write(`ai& Relay ▸ Failed to launch grok: ${err.message}.\n`);
            resolve({ status: 1, signal: null });
          });
          child.on("exit", (status, signal) => resolve({ status, signal }));
        },
      );
      process.exitCode = typeof result.status === "number" ? result.status : result.signal ? 1 : 0;
    } finally {
      try {
        await endpoint.finish();
        await catalogServer?.close();
      } finally {
        rmSync(temporaryAuthDirectory, { recursive: true, force: true });
      }
    }
    return {};
  },
});
