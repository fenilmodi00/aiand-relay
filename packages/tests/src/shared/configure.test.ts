import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import * as clack from "@clack/prompts";
import { runConfigure } from "../../../cli/src/lib/commands/global.js";
import { readGlobalConfig, resolveStoredApiKey } from "../../../cli/src/lib/global-config.js";
import { claudeSettingsPath } from "../../../cli/src/lib/claude/user-config.js";
import { deepseekSettingsPath } from "../../../cli/src/lib/deepseek/user-config.js";
import { hermesConfigPath, hermesEnvPath } from "../../../cli/src/lib/hermes/user-config.js";
import { grokConfigPath } from "../../../cli/src/lib/grok/user-config.js";
import { opencodeAuthJsonPath } from "../../../cli/src/lib/opencode/auth.js";
import { opencodeGlobalConfigDir } from "../../../cli/src/lib/opencode/user-config.js";
import { OPENCODE_PROVIDER_ID } from "../../../cli/src/lib/opencode/defaults.js";
import { locateOmpModelsFile } from "../../../cli/src/lib/omp/user-config.js";
import { piAuthJsonPath } from "../../../cli/src/lib/pi/user-config.js";
import { primeAuthJsonPath } from "../../../cli/src/lib/prime/user-config.js";

const temporaryHomes: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await Promise.all(
    temporaryHomes.splice(0).map((home) => rm(home, { recursive: true, force: true })),
  );
});

async function tempHome(): Promise<string> {
  const home = await mkdtemp(path.join(os.tmpdir(), "aiandrelay-configure-"));
  temporaryHomes.push(home);
  vi.stubEnv("XDG_CONFIG_HOME", path.join(home, "xdg-config"));
  vi.stubEnv("XDG_DATA_HOME", path.join(home, "xdg-data"));
  return home;
}

function isolatedEnv(home: string): NodeJS.ProcessEnv {
  return {
    XDG_CONFIG_HOME: path.join(home, "xdg-config"),
    XDG_DATA_HOME: path.join(home, "xdg-data"),
    HERMES_HOME: path.join(home, ".hermes"),
    GROK_HOME: path.join(home, ".grok"),
    DSH_HOME: path.join(home, ".dsh"),
  };
}

describe("aiandrelay configure", () => {
  test("uses options.env AIAND_API_KEY without depending on process.env", async () => {
    const home = await tempHome();
    vi.stubEnv("AIAND_API_KEY", "");
    const env = {
      ...isolatedEnv(home),
      AIAND_API_KEY: "aiand-env-only-key",
    };

    const ok = await runConfigure(home, {
      env,
      opencodeBinaryPresent: false,
      binaryPresence: {
        pi: false,
        omp: false,
        prime: false,
        hermes: false,
        grok: false,
        deepseek: false,
        claude: false,
      },
    });

    expect(ok).toBe(true);
    vi.stubEnv("AIAND_API_KEY", "");
    const stored = (await readGlobalConfig(home)).apiKey;
    expect(resolveStoredApiKey(stored)).toBe("aiand-env-only-key");
  });

  test("persists AIAND_API_KEY from the environment into ~/.aiandrelay", async () => {
    const home = await tempHome();
    vi.stubEnv("AIAND_API_KEY", "aiand-test-key");

    await runConfigure(home, { env: isolatedEnv(home), opencodeBinaryPresent: false });

    vi.stubEnv("AIAND_API_KEY", "");
    const stored = (await readGlobalConfig(home)).apiKey;

    expect(stored).toBe("aiand-test-key");
    expect(resolveStoredApiKey(stored)).toBe("aiand-test-key");
    expect(existsSync(opencodeGlobalConfigDir({ home, env: isolatedEnv(home) }))).toBe(false);
    expect(existsSync(opencodeAuthJsonPath({ home, env: isolatedEnv(home) }))).toBe(false);
  });

  test("skips OpenCode inject when not present and prints the skip path", async () => {
    const home = await tempHome();
    vi.stubEnv("AIAND_API_KEY", "aiand-test-key");
    const info = vi.spyOn(clack.log, "info");
    const env = isolatedEnv(home);
    const configDir = opencodeGlobalConfigDir({ home, env });

    const ok = await runConfigure(home, { env, opencodeBinaryPresent: false });

    expect(ok).toBe(true);
    expect(existsSync(configDir)).toBe(false);
    expect(existsSync(opencodeAuthJsonPath({ home, env }))).toBe(false);
    expect(info.mock.calls.map((call) => String(call[0])).join("\n")).toContain(
      `OpenCode was not found (no opencode on PATH and no ${configDir}). Skipping OpenCode provider inject. Re-run aiandrelay configure after installing OpenCode.`,
    );
  });

  test("PATH hit with no config dir creates auth.json then opencode.json", async () => {
    const home = await tempHome();
    vi.stubEnv("AIAND_API_KEY", "sk-aiand-secret");
    const env = isolatedEnv(home);
    const success = vi.spyOn(clack.log, "success");
    const info = vi.spyOn(clack.log, "info");

    const ok = await runConfigure(home, { env, opencodeBinaryPresent: true });

    expect(ok).toBe(true);
    const authPath = opencodeAuthJsonPath({ home, env });
    const configPath = path.join(opencodeGlobalConfigDir({ home, env }), "opencode.json");
    expect(JSON.parse(await readFile(authPath, "utf8"))).toEqual({
      [OPENCODE_PROVIDER_ID]: { type: "api", key: "sk-aiand-secret" },
    });
    const config = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>;
    expect(config.$schema).toBe("https://opencode.ai/config.json");
    const aiand = (config.provider as Record<string, unknown>).aiand as Record<string, unknown>;
    expect(aiand).not.toHaveProperty("env");
    expect(JSON.stringify(aiand)).not.toContain("apiKey");
    expect(JSON.stringify(config)).not.toContain("enabled_providers");

    const lines = [...success.mock.calls, ...info.mock.calls].map((call) => String(call[0]));
    expect(lines.join("\n")).toContain(`OpenCode: saved ai& credentials to ${authPath}`);
    expect(lines.join("\n")).toContain(`OpenCode: added provider.aiand to ${configPath}`);
    expect(lines.join("\n")).toContain(
      "Plain opencode can use ai& models. aopencode is unchanged (session lockdown; writes nothing on launch).",
    );
    expect(lines.join("\n")).not.toContain("sk-aiand-secret");
    expect(lines.join("\n")).not.toContain("nothing is written to disk");
  });

  test("config dir with PATH miss still injects", async () => {
    const home = await tempHome();
    vi.stubEnv("AIAND_API_KEY", "sk-aiand-secret");
    const env = isolatedEnv(home);
    await mkdir(opencodeGlobalConfigDir({ home, env }), { recursive: true });

    const ok = await runConfigure(home, { env, opencodeBinaryPresent: false });

    expect(ok).toBe(true);
    expect(existsSync(opencodeAuthJsonPath({ home, env }))).toBe(true);
    expect(existsSync(path.join(opencodeGlobalConfigDir({ home, env }), "opencode.json"))).toBe(
      true,
    );
  });

  test("auth abort skips config inject and still saves the relay key", async () => {
    const home = await tempHome();
    vi.stubEnv("AIAND_API_KEY", "sk-aiand-secret");
    const env = isolatedEnv(home);
    const authPath = opencodeAuthJsonPath({ home, env });
    await mkdir(path.dirname(authPath), { recursive: true });
    await writeFile(authPath, "NOT JSON", "utf8");
    const error = vi.spyOn(clack.log, "error");
    const info = vi.spyOn(clack.log, "info");

    const ok = await runConfigure(home, { env, opencodeBinaryPresent: true });

    expect(ok).toBe(true);
    expect((await readGlobalConfig(home)).apiKey).toBe("sk-aiand-secret");
    await expect(readFile(authPath, "utf8")).resolves.toBe("NOT JSON");
    expect(existsSync(path.join(opencodeGlobalConfigDir({ home, env }), "opencode.json"))).toBe(
      false,
    );
    expect(error.mock.calls.map((call) => String(call[0])).join("\n")).toContain(
      `OpenCode: left ${authPath} unchanged (auth.json is not valid JSON). Fix or move the file and re-run aiandrelay configure.`,
    );
    expect(info.mock.calls.map((call) => String(call[0])).join("\n")).toContain(
      "OpenCode: skipped provider inject because credentials were not written.",
    );
  });

  test("invalid config JSON leaves the file, keeps auth, returns true", async () => {
    const home = await tempHome();
    vi.stubEnv("AIAND_API_KEY", "sk-aiand-secret");
    const env = isolatedEnv(home);
    const configPath = path.join(opencodeGlobalConfigDir({ home, env }), "opencode.json");
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, "{", "utf8");
    const error = vi.spyOn(clack.log, "error");
    const success = vi.spyOn(clack.log, "success");

    const ok = await runConfigure(home, { env, opencodeBinaryPresent: true });

    expect(ok).toBe(true);
    await expect(readFile(configPath, "utf8")).resolves.toBe("{");
    const auth = JSON.parse(await readFile(opencodeAuthJsonPath({ home, env }), "utf8"));
    expect(auth[OPENCODE_PROVIDER_ID].key).toBe("sk-aiand-secret");
    expect(success.mock.calls.map((call) => String(call[0])).join("\n")).toContain(
      `OpenCode: saved ai& credentials to ${opencodeAuthJsonPath({ home, env })}`,
    );
    expect(error.mock.calls.map((call) => String(call[0])).join("\n")).toContain(
      `OpenCode: left ${configPath} unchanged (invalid JSON). Fix the file and re-run aiandrelay configure.`,
    );
  });

  test("v2 schema aborts config with the v2 message after auth write", async () => {
    const home = await tempHome();
    vi.stubEnv("AIAND_API_KEY", "sk-aiand-secret");
    const env = isolatedEnv(home);
    const configPath = path.join(opencodeGlobalConfigDir({ home, env }), "opencode.json");
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, `${JSON.stringify({ providers: { x: {} } }, null, 2)}\n`, "utf8");
    const error = vi.spyOn(clack.log, "error");
    const authPath = opencodeAuthJsonPath({ home, env });

    const ok = await runConfigure(home, { env, opencodeBinaryPresent: true });

    expect(ok).toBe(true);
    expect(JSON.parse(await readFile(configPath, "utf8"))).toEqual({ providers: { x: {} } });
    expect(error.mock.calls.map((call) => String(call[0])).join("\n")).toContain(
      `OpenCode: left ${configPath} unchanged (OpenCode v2 providers schema). This release only writes v1 provider.aiand. Add ai& in that file manually; credentials were saved to ${authPath}.`,
    );
  });

  test("merged provider prints the refresh message and does not mention nothing written to disk", async () => {
    const home = await tempHome();
    vi.stubEnv("AIAND_API_KEY", "sk-aiand-secret");
    const env = isolatedEnv(home);
    const configPath = path.join(opencodeGlobalConfigDir({ home, env }), "opencode.json");
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(
      configPath,
      `${JSON.stringify({ provider: { aiand: { models: { "custom/foo": { name: "x" } } } } }, null, 2)}\n`,
      "utf8",
    );
    const success = vi.spyOn(clack.log, "success");
    const info = vi.spyOn(clack.log, "info");

    await runConfigure(home, { env, opencodeBinaryPresent: true });

    const text = [...success.mock.calls, ...info.mock.calls]
      .map((call) => String(call[0]))
      .join("\n");
    expect(text).toContain(
      `OpenCode: updated provider.aiand in ${configPath} (curated models refreshed; extra models kept)`,
    );
    expect(text).not.toContain("nothing is written to disk");
  });

  test("provider-not-object prints the not-an-object message", async () => {
    const home = await tempHome();
    vi.stubEnv("AIAND_API_KEY", "sk-aiand-secret");
    const env = isolatedEnv(home);
    const configPath = path.join(opencodeGlobalConfigDir({ home, env }), "opencode.json");
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, `${JSON.stringify({ provider: "x" })}\n`, "utf8");
    const error = vi.spyOn(clack.log, "error");

    const ok = await runConfigure(home, { env, opencodeBinaryPresent: true });
    expect(ok).toBe(true);
    expect(error.mock.calls.map((call) => String(call[0])).join("\n")).toContain(
      `OpenCode: left ${configPath} unchanged (top-level provider is not an object).`,
    );
  });

  test("aiand-not-object prints the not-an-object message", async () => {
    const home = await tempHome();
    vi.stubEnv("AIAND_API_KEY", "sk-aiand-secret");
    const env = isolatedEnv(home);
    const configPath = path.join(opencodeGlobalConfigDir({ home, env }), "opencode.json");
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, `${JSON.stringify({ provider: { aiand: "nope" } })}\n`, "utf8");
    const error = vi.spyOn(clack.log, "error");

    const ok = await runConfigure(home, { env, opencodeBinaryPresent: true });
    expect(ok).toBe(true);
    expect(error.mock.calls.map((call) => String(call[0])).join("\n")).toContain(
      `OpenCode: left ${configPath} unchanged (provider.aiand exists but is not an object).`,
    );
  });

  test("I/O error prints path and message without the API key", async () => {
    if (process.platform === "win32") {
      return;
    }
    const home = await tempHome();
    vi.stubEnv("AIAND_API_KEY", "sk-aiand-secret");
    const env = isolatedEnv(home);
    const authPath = opencodeAuthJsonPath({ home, env });
    const dataDir = path.dirname(authPath);
    await mkdir(dataDir, { recursive: true });
    await chmod(dataDir, 0o500);
    const error = vi.spyOn(clack.log, "error");
    try {
      const ok = await runConfigure(home, { env, opencodeBinaryPresent: true });
      expect(ok).toBe(true);
      const messages = error.mock.calls.map((call) => String(call[0])).join("\n");
      expect(messages).toContain(`OpenCode: could not write ${authPath}:`);
      expect(messages).not.toContain("sk-aiand-secret");
    } finally {
      await chmod(dataDir, 0o700);
    }
  });

  test("Pi, omp, and Prime path hits create native config artifacts", async () => {
    const home = await tempHome();
    vi.stubEnv("AIAND_API_KEY", "sk-aiand-secret");
    const env = isolatedEnv(home);

    const ok = await runConfigure(home, {
      env,
      opencodeBinaryPresent: false,
      binaryPresence: {
        pi: true,
        omp: true,
        prime: true,
      },
    });

    expect(ok).toBe(true);
    expect(JSON.parse(await readFile(piAuthJsonPath(home), "utf8")).aiand.key).toBe(
      "sk-aiand-secret",
    );
    expect(await readFile(path.join(home, ".pi", "agent", "models.json"), "utf8")).toContain(
      '"aiand"',
    );
    await expect(readFile(locateOmpModelsFile(home), "utf8")).resolves.toContain(
      "apiKey: AIAND_API_KEY",
    );
    expect(JSON.parse(await readFile(primeAuthJsonPath(home), "utf8")).aiand.key).toBe(
      "sk-aiand-secret",
    );
    await expect(
      readFile(path.join(home, ".prime", "agent", "models.json"), "utf8"),
    ).resolves.toContain('"aiand"');
  });

  test("Pi auth not-object abort is explicit and skips config inject", async () => {
    const home = await tempHome();
    vi.stubEnv("AIAND_API_KEY", "sk-aiand-secret");
    const env = isolatedEnv(home);
    const error = vi.spyOn(clack.log, "error");
    const info = vi.spyOn(clack.log, "info");
    const authPath = piAuthJsonPath(home);
    await mkdir(path.dirname(authPath), { recursive: true });
    await writeFile(authPath, "[]\n", "utf8");

    const ok = await runConfigure(home, {
      env,
      opencodeBinaryPresent: false,
      binaryPresence: {
        pi: true,
        omp: false,
        prime: false,
        hermes: false,
        grok: false,
        deepseek: false,
        claude: false,
      },
    });

    expect(ok).toBe(true);
    expect(error.mock.calls.map((call) => String(call[0])).join("\n")).toContain(
      `Pi Code: left ${authPath} unchanged (auth.json is not an object).`,
    );
    expect(info.mock.calls.map((call) => String(call[0])).join("\n")).toContain(
      "Pi Code: skipped provider inject because credentials were not written.",
    );
    expect(existsSync(path.join(home, ".pi", "agent", "models.json"))).toBe(false);
  });

  test("Pi config write failure reports models.json instead of auth.json", async () => {
    const home = await tempHome();
    vi.stubEnv("AIAND_API_KEY", "sk-aiand-secret");
    const env = isolatedEnv(home);
    const error = vi.spyOn(clack.log, "error");
    const failingPath = path.join(home, ".pi", "agent", "models.json");
    await mkdir(failingPath, { recursive: true });

    const ok = await runConfigure(home, {
      env,
      opencodeBinaryPresent: false,
      binaryPresence: {
        pi: true,
        omp: false,
        prime: false,
        hermes: false,
        grok: false,
        deepseek: false,
        claude: false,
      },
    });

    expect(ok).toBe(true);
    const messages = error.mock.calls.map((call) => String(call[0])).join("\n");
    expect(messages).toContain(`Pi Code: could not write ${failingPath}:`);
    expect(messages).not.toContain(`Pi Code: could not write ${piAuthJsonPath(home)}:`);
  });

  test("Prime config write failure reports models.json instead of auth.json", async () => {
    const home = await tempHome();
    vi.stubEnv("AIAND_API_KEY", "sk-aiand-secret");
    const env = isolatedEnv(home);
    const error = vi.spyOn(clack.log, "error");
    const failingPath = path.join(home, ".prime", "agent", "models.json");
    await mkdir(failingPath, { recursive: true });

    const ok = await runConfigure(home, {
      env,
      opencodeBinaryPresent: false,
      binaryPresence: {
        pi: false,
        omp: false,
        prime: true,
        hermes: false,
        grok: false,
        deepseek: false,
        claude: false,
      },
    });

    expect(ok).toBe(true);
    const messages = error.mock.calls.map((call) => String(call[0])).join("\n");
    expect(messages).toContain(`Prime Agent: could not write ${failingPath}:`);
    expect(messages).not.toContain(`Prime Agent: could not write ${primeAuthJsonPath(home)}:`);
  });

  test("Hermes, Grok, and DeepSeek path hits create native config artifacts", async () => {
    const home = await tempHome();
    vi.stubEnv("AIAND_API_KEY", "sk-aiand-secret");
    const env = isolatedEnv(home);

    const ok = await runConfigure(home, {
      env,
      opencodeBinaryPresent: false,
      binaryPresence: {
        hermes: true,
        grok: true,
        deepseek: true,
      },
    });

    expect(ok).toBe(true);
    await expect(readFile(hermesConfigPath({ home, env }), "utf8")).resolves.toContain("aiand:");
    await expect(readFile(hermesEnvPath({ home, env }), "utf8")).resolves.toContain(
      "AIAND_API_KEY=sk-aiand-secret",
    );
    await expect(readFile(grokConfigPath({ home, env }), "utf8")).resolves.toContain(
      "[model.aiand]",
    );
    await expect(readFile(deepseekSettingsPath({ home, env }), "utf8")).resolves.toContain(
      "llm-pi-ai:",
    );
  });

  test("Hermes and DeepSeek abort messages describe the unsupported shape", async () => {
    const home = await tempHome();
    vi.stubEnv("AIAND_API_KEY", "sk-aiand-secret");
    const env = isolatedEnv(home);
    const error = vi.spyOn(clack.log, "error");

    await mkdir(path.dirname(hermesConfigPath({ home, env })), { recursive: true });
    await writeFile(hermesConfigPath({ home, env }), "providers: nope\n", "utf8");
    await mkdir(path.dirname(deepseekSettingsPath({ home, env })), { recursive: true });
    await writeFile(deepseekSettingsPath({ home, env }), "llm-pi-ai: nope\n", "utf8");

    const ok = await runConfigure(home, {
      env,
      opencodeBinaryPresent: false,
      binaryPresence: {
        pi: false,
        omp: false,
        prime: false,
        hermes: true,
        grok: false,
        deepseek: true,
        claude: false,
      },
    });

    expect(ok).toBe(true);
    const messages = error.mock.calls.map((call) => String(call[0])).join("\n");
    expect(messages).toContain(
      `Hermes Agent: left ${hermesConfigPath({ home, env })} unchanged (providers is not an object).`,
    );
    expect(messages).toContain(
      `DeepSeek Harness: left ${deepseekSettingsPath({ home, env })} unchanged (llm-pi-ai is not an object).`,
    );
  });

  test("Hermes env write failure reports .env instead of config.yaml", async () => {
    const home = await tempHome();
    vi.stubEnv("AIAND_API_KEY", "sk-aiand-secret");
    const env = isolatedEnv(home);
    const error = vi.spyOn(clack.log, "error");
    const failingPath = hermesEnvPath({ home, env });
    await mkdir(failingPath, { recursive: true });

    const ok = await runConfigure(home, {
      env,
      opencodeBinaryPresent: false,
      binaryPresence: {
        pi: false,
        omp: false,
        prime: false,
        hermes: true,
        grok: false,
        deepseek: false,
        claude: false,
      },
    });

    expect(ok).toBe(true);
    const messages = error.mock.calls.map((call) => String(call[0])).join("\n");
    expect(messages).toContain(`Hermes Agent: could not write ${failingPath}:`);
    expect(messages).not.toContain(
      `Hermes Agent: could not write ${hermesConfigPath({ home, env })}:`,
    );
  });

  test("directory fallback detects multiple harnesses and injects native config without PATH hits", async () => {
    const home = await tempHome();
    vi.stubEnv("AIAND_API_KEY", "sk-aiand-secret");
    const env = isolatedEnv(home);
    const info = vi.spyOn(clack.log, "info");

    await Promise.all([
      mkdir(opencodeGlobalConfigDir({ home, env }), { recursive: true }),
      mkdir(path.join(home, ".pi", "agent"), { recursive: true }),
      mkdir(path.join(home, ".omp", "agent"), { recursive: true }),
      mkdir(path.join(home, ".prime", "agent"), { recursive: true }),
      mkdir(path.join(home, ".claude"), { recursive: true }),
      mkdir(env.HERMES_HOME!, { recursive: true }),
      mkdir(env.GROK_HOME!, { recursive: true }),
      mkdir(env.DSH_HOME!, { recursive: true }),
    ]);

    const ok = await runConfigure(home, {
      env,
      opencodeBinaryPresent: false,
      binaryPresence: {
        codex: false,
        pi: false,
        omp: false,
        prime: false,
        hermes: false,
        grok: false,
        deepseek: false,
        claude: false,
      },
    });

    expect(ok).toBe(true);
    expect(existsSync(opencodeAuthJsonPath({ home, env }))).toBe(true);
    expect(existsSync(path.join(opencodeGlobalConfigDir({ home, env }), "opencode.json"))).toBe(
      true,
    );
    expect(existsSync(piAuthJsonPath(home))).toBe(true);
    expect(existsSync(path.join(home, ".pi", "agent", "models.json"))).toBe(true);
    expect(existsSync(locateOmpModelsFile(home))).toBe(true);
    expect(existsSync(primeAuthJsonPath(home))).toBe(true);
    expect(existsSync(path.join(home, ".prime", "agent", "models.json"))).toBe(true);
    expect(existsSync(hermesConfigPath({ home, env }))).toBe(true);
    expect(existsSync(hermesEnvPath({ home, env }))).toBe(true);
    expect(existsSync(grokConfigPath({ home, env }))).toBe(true);
    expect(existsSync(deepseekSettingsPath({ home, env }))).toBe(true);
    expect(existsSync(claudeSettingsPath(home))).toBe(false);

    const text = info.mock.calls.map((call) => String(call[0])).join("\n");
    expect(text).toContain(
      "Codex: not found (run aiandrelay codex on for native daemon routing)",
    );
    expect(text).toContain("OpenCode: not found (configure turns this on; add-only inject)");
    expect(text).toContain("Pi Code: not found (configure turns this on; add-only inject)");
    expect(text).toContain("omp: not found (configure turns this on; add-only inject)");
    expect(text).toContain("Prime Agent: not found (configure turns this on; add-only inject)");
    expect(text).toContain("Hermes Agent: not found (configure turns this on; add-only inject)");
    expect(text).toContain("Grok Build: not found (configure turns this on; add-only inject)");
    expect(text).toContain(
      "DeepSeek Harness (alpha): not found (configure turns this on; add-only inject)",
    );
    expect(text).toContain(
      "Plain opencode can use ai& models. aopencode is unchanged (session lockdown; writes nothing on launch).",
    );
    expect(text).toContain("omp: provider credentials resolve through");
    expect(text).toContain(
      "Grok Build: ai& entries reference AIAND_API_KEY via env_key. Existing user defaults were left unchanged.",
    );
    expect(text).toContain(
      `Claude Code: left ${claudeSettingsPath(home)} unchanged (native custom providers are not supported safely). Run \`aiandrelay claude on\` to point stock claude at the local daemon.`,
    );
  });

  test("Claude path hit logs explicit defer and leaves settings untouched", async () => {
    const home = await tempHome();
    vi.stubEnv("AIAND_API_KEY", "sk-aiand-secret");
    const env = isolatedEnv(home);
    const info = vi.spyOn(clack.log, "info");

    const ok = await runConfigure(home, {
      env,
      opencodeBinaryPresent: false,
      binaryPresence: {
        claude: true,
      },
    });

    expect(ok).toBe(true);
    expect(existsSync(claudeSettingsPath(home))).toBe(false);
    expect(info.mock.calls.map((call) => String(call[0])).join("\n")).toContain(
      `Claude Code: left ${claudeSettingsPath(home)} unchanged (native custom providers are not supported safely). Run \`aiandrelay claude on\` to point stock claude at the local daemon.`,
    );
  });
});
