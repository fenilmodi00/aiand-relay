import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  claudeSettingsPath,
  decideClaudeNativeConfig,
  isClaudePresent,
} from "../../../cli/src/lib/claude/user-config.js";
import {
  deepseekSettingsPath,
  injectDeepseekUserConfig,
  isDeepseekPresent,
} from "../../../cli/src/lib/deepseek/user-config.js";
import {
  hermesConfigPath,
  injectHermesUserConfig,
  isHermesPresent,
  upsertHermesEnvKey,
} from "../../../cli/src/lib/hermes/user-config.js";
import {
  injectOmpUserConfig,
  isOmpPresent,
  locateOmpModelsFile,
  ompNativeUserConfig,
} from "../../../cli/src/lib/omp/user-config.js";
import { injectPiUserConfig, isPiPresent, piAuthJsonPath, upsertPiAuth } from "../../../cli/src/lib/pi/user-config.js";
import {
  grokConfigPath,
  injectGrokUserConfig,
  isGrokPresent,
} from "../../../cli/src/lib/grok/user-config.js";
import {
  injectPrimeUserConfig,
  isPrimePresent,
  primeAuthJsonPath,
  upsertPrimeAuth,
} from "../../../cli/src/lib/prime/user-config.js";

const temporaryDirs: string[] = [];

function isolatedEnv(home: string): NodeJS.ProcessEnv {
  return {
    HERMES_HOME: path.join(home, ".hermes"),
    GROK_HOME: path.join(home, ".grok"),
    DSH_HOME: path.join(home, ".dsh"),
  };
}

async function tempHome(): Promise<string> {
  const home = await mkdtemp(path.join(os.tmpdir(), "aiandrelay-harness-user-config-"));
  temporaryDirs.push(home);
  return home;
}

afterEach(async () => {
  await Promise.all(temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("Pi/OMP/Prime adapter entrypoints", () => {
  test("presence falls back to config dirs", async () => {
    const home = await tempHome();
    expect(isPiPresent(home, false)).toBe(false);
    await mkdir(path.join(home, ".pi", "agent"), { recursive: true });
    expect(isPiPresent(home, false)).toBe(true);

    expect(isOmpPresent(home, false)).toBe(false);
    await mkdir(path.join(home, ".omp", "agent"), { recursive: true });
    expect(isOmpPresent(home, false)).toBe(true);

    expect(isPrimePresent(home, false)).toBe(false);
    await mkdir(path.join(home, ".prime", "agent"), { recursive: true });
    expect(isPrimePresent(home, false)).toBe(true);
  });

  test("Pi auth/config adapters write expected files", async () => {
    const home = await tempHome();
    await expect(upsertPiAuth(home, "sk-pi")).resolves.toMatchObject({ status: "created" });
    await expect(injectPiUserConfig(home)).resolves.toMatchObject({ status: "created" });
    expect(JSON.parse(await readFile(piAuthJsonPath(home), "utf8")).aiand.key).toBe("sk-pi");
  });

  test("OMP adapter writes models.yml by default", async () => {
    const home = await tempHome();
    await expect(injectOmpUserConfig(home)).resolves.toMatchObject({ status: "created" });
    const filePath = locateOmpModelsFile(home);
    expect(path.basename(filePath)).toBe("models.yml");
    await expect(readFile(filePath, "utf8")).resolves.toContain("apiKey: AIAND_API_KEY");
  });

  test("OMP adapter exposes the shared injector contract without auth writes", async () => {
    const home = await tempHome();

    expect(ompNativeUserConfig.harness).toBe("omp");
    expect(ompNativeUserConfig.persistAuth).toBeUndefined();
    expect(ompNativeUserConfig.isPresent({ home, env: {}, binaryPresent: false })).toBe(false);

    await mkdir(path.join(home, ".omp", "agent"), { recursive: true });
    expect(ompNativeUserConfig.isPresent({ home, env: {}, binaryPresent: false })).toBe(true);
    await expect(ompNativeUserConfig.injectUserConfig({ home, env: {} })).resolves.toMatchObject({
      status: "created",
    });
  });

  test("OMP adapter prefers models.yml over models.yaml and legacy models.json", async () => {
    const home = await tempHome();
    const ompDir = path.join(home, ".omp", "agent");
    await mkdir(ompDir, { recursive: true });
    await writeFile(path.join(ompDir, "models.json"), '{\n  "providers": {}\n}\n', "utf8");
    expect(locateOmpModelsFile(home)).toBe(path.join(ompDir, "models.json"));

    await writeFile(path.join(ompDir, "models.yaml"), "providers: {}\n", "utf8");
    expect(locateOmpModelsFile(home)).toBe(path.join(ompDir, "models.yaml"));

    await writeFile(path.join(ompDir, "models.yml"), "providers: {}\n", "utf8");
    expect(locateOmpModelsFile(home)).toBe(path.join(ompDir, "models.yml"));
  });

  test("OMP adapter aborts on invalid yaml and preserves the original bytes", async () => {
    const home = await tempHome();
    const filePath = path.join(home, ".omp", "agent", "models.yml");
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, "{bad", "utf8");

    await expect(injectOmpUserConfig(home)).resolves.toEqual({
      status: "aborted",
      path: filePath,
      reason: "invalid-yaml",
    });
    await expect(readFile(filePath, "utf8")).resolves.toBe("{bad");
  });

  test("OMP adapter re-runs idempotently against an existing managed yaml file", async () => {
    const home = await tempHome();
    const first = await injectOmpUserConfig(home);
    const filePath = locateOmpModelsFile(home);
    const firstText = await readFile(filePath, "utf8");

    const second = await injectOmpUserConfig(home);
    const secondText = await readFile(filePath, "utf8");

    expect(first).toEqual({ status: "created", path: filePath });
    expect(second).toEqual({ status: "merged", path: filePath });
    expect(secondText).toBe(firstText);
  });

  test("Prime auth/config adapters write expected files", async () => {
    const home = await tempHome();
    await expect(upsertPrimeAuth(home, "sk-prime")).resolves.toMatchObject({ status: "created" });
    await expect(injectPrimeUserConfig(home)).resolves.toMatchObject({ status: "created" });
    expect(JSON.parse(await readFile(primeAuthJsonPath(home), "utf8")).aiand.key).toBe("sk-prime");
  });
});

describe("Hermes native user config", () => {
  test("merges provider config without clobbering model and writes .env", async () => {
    const home = await tempHome();
    const env = isolatedEnv(home);
    const configPath = hermesConfigPath({ home, env });
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, 'model: "keep-me"\nproviders:\n  other:\n    base_url: https://x\n', "utf8");

    await expect(injectHermesUserConfig({ home, env })).resolves.toMatchObject({ status: "created" });
    const next = await readFile(configPath, "utf8");
    expect(next).toContain("model: keep-me");
    expect(next).toContain("aiand:");
    await expect(upsertHermesEnvKey({ home, env, apiKey: "sk-hermes" })).resolves.toMatchObject({
      status: "created",
    });
  });

  test("presence uses binary or configured home", async () => {
    const home = await tempHome();
    const env = isolatedEnv(home);
    expect(isHermesPresent({ home, env, binaryPresent: false })).toBe(false);
    await mkdir(path.join(home, ".hermes"), { recursive: true });
    expect(isHermesPresent({ home, env, binaryPresent: false })).toBe(true);
  });
});

describe("Grok native user config", () => {
  test("injects a managed TOML block and preserves existing content", async () => {
    const home = await tempHome();
    const env = isolatedEnv(home);
    const configPath = grokConfigPath({ home, env });
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, 'keep = "x"\n', "utf8");

    await expect(injectGrokUserConfig({ home, env })).resolves.toMatchObject({ status: "merged" });
    const next = await readFile(configPath, "utf8");
    expect(next).toContain('keep = "x"');
    expect(next).toContain("[model.aiand_");
    expect(next).toContain('env_key = "AIAND_API_KEY"');
  });

  test("aborts on invalid TOML and presence uses GROK_HOME", async () => {
    const home = await tempHome();
    const env = isolatedEnv(home);
    const configPath = grokConfigPath({ home, env });
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, "bad = [\n", "utf8");
    await expect(injectGrokUserConfig({ home, env })).resolves.toEqual({
      status: "aborted",
      path: configPath,
      reason: "invalid-toml",
    });
    expect(isGrokPresent({ home, env, binaryPresent: false })).toBe(true);
  });
});

describe("DeepSeek native user config", () => {
  test("writes nested llm-pi-ai provider settings", async () => {
    const home = await tempHome();
    const env = isolatedEnv(home);
    await expect(injectDeepseekUserConfig({ home, env })).resolves.toMatchObject({ status: "created" });
    const next = await readFile(deepseekSettingsPath({ home, env }), "utf8");
    expect(next).toContain("llm-pi-ai:");
    expect(next).toContain("apiKeyEnv: AIAND_API_KEY");
  });

  test("presence uses DSH_HOME and invalid YAML aborts", async () => {
    const home = await tempHome();
    const env = isolatedEnv(home);
    const settingsPath = deepseekSettingsPath({ home, env });
    await mkdir(path.dirname(settingsPath), { recursive: true });
    await writeFile(settingsPath, "{bad", "utf8");
    expect(isDeepseekPresent({ home, env, binaryPresent: false })).toBe(true);
    await expect(injectDeepseekUserConfig({ home, env })).resolves.toEqual({
      status: "aborted",
      path: settingsPath,
      reason: "invalid-yaml",
    });
  });
});

describe("Claude native config decision", () => {
  test("returns an explicit deferred decision and uses config-dir detection", async () => {
    const home = await tempHome();
    expect(isClaudePresent(home, false)).toBe(false);
    await mkdir(path.dirname(claudeSettingsPath(home)), { recursive: true });
    expect(isClaudePresent(home, false)).toBe(true);
    expect(decideClaudeNativeConfig(home)).toEqual({
      status: "deferred",
      path: claudeSettingsPath(home),
      reason: "unsupported-custom-provider",
    });
  });
});
