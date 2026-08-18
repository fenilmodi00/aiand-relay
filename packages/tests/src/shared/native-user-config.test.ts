import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { getSelectableModels } from "@aiandrelay/models";
import {
  AIAND_API_KEY_ENV_NAME,
  AIAND_API_KEY_ENV_REF,
  AIAND_BASE_URL,
} from "../../../cli/src/lib/aiand-core.js";
import {
  createdOrMergedStatus,
  directoryExists,
  getNativeUserConfigModels,
  isPlainObject,
  isPresentByBinaryOrDirectory,
  type NativeAuthInjector,
  type NativeInjectContext,
  type NativePresenceContext,
  type NativeUserConfigInjector,
  readTextIfExists,
  updatedOrCreatedStatus,
  upsertDotenvVar,
} from "../../../cli/src/lib/shared/native-user-config.js";
import {
  buildPiFamilyProviderConfig,
  injectPiFamilyConfig,
  locatePiFamilyConfigFile,
  piFamilyAuthJsonPath,
  piFamilyConfigDir,
  upsertPiFamilyAuth,
} from "../../../cli/src/lib/shared/pi-family-user-config.js";

const temporaryDirs: string[] = [];

async function tempHome(): Promise<string> {
  const home = await mkdtemp(path.join(os.tmpdir(), "aiandrelay-native-config-"));
  temporaryDirs.push(home);
  return home;
}

afterEach(async () => {
  await Promise.all(temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("shared native-user-config helpers", () => {
  test("shared injector contracts cover presence, config inject, and optional auth writes", async () => {
    const injectContext: NativeInjectContext = { home: "C:\\Users\\demo", env: {} };
    const presenceContext: NativePresenceContext = { ...injectContext, binaryPresent: false };
    const authInjector: NativeAuthInjector<"invalid-json"> = {
      persistAuth: async ({ apiKey, home }) => ({
        status: apiKey === "bad" ? "aborted" : "created",
        path: path.join(home, "auth.json"),
        ...(apiKey === "bad" ? { reason: "invalid-json" as const } : {}),
      }),
    };
    const injector: NativeUserConfigInjector<"invalid-json", "not-object"> = {
      harness: "demo",
      isPresent: ({ home, binaryPresent }) => binaryPresent || home.length > 0,
      injectUserConfig: async ({ home }) => ({ status: "created", path: path.join(home, "config.json") }),
      ...authInjector,
    };

    expect(injector.harness).toBe("demo");
    expect(injector.isPresent(presenceContext)).toBe(true);
    await expect(injector.injectUserConfig(injectContext)).resolves.toEqual({
      status: "created",
      path: path.join(injectContext.home, "config.json"),
    });
    await expect(injector.persistAuth?.({ ...injectContext, apiKey: "bad" })).resolves.toEqual({
      status: "aborted",
      path: path.join(injectContext.home, "auth.json"),
      reason: "invalid-json",
    });
  });

  test("isPlainObject accepts records and rejects arrays/null", () => {
    expect(isPlainObject({ ok: true })).toBe(true);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject(["x"])).toBe(false);
  });

  test("directoryExists and isPresentByBinaryOrDirectory use directory fallback", async () => {
    const home = await tempHome();
    const dir = path.join(home, ".pi", "agent");
    expect(directoryExists(dir)).toBe(false);
    expect(isPresentByBinaryOrDirectory(false, dir)).toBe(false);
    await mkdir(dir, { recursive: true });
    expect(directoryExists(dir)).toBe(true);
    expect(isPresentByBinaryOrDirectory(false, dir)).toBe(true);
    expect(isPresentByBinaryOrDirectory(true, path.join(home, "missing"))).toBe(true);
  });

  test("readTextIfExists returns undefined for missing files", async () => {
    const home = await tempHome();
    expect(await readTextIfExists(path.join(home, "missing.txt"))).toBeUndefined();
  });

  test("shared status helpers enforce created-vs-merged and created-vs-updated conventions", () => {
    expect(createdOrMergedStatus(false)).toBe("created");
    expect(createdOrMergedStatus(true)).toBe("merged");
    expect(updatedOrCreatedStatus(false)).toBe("created");
    expect(updatedOrCreatedStatus(true)).toBe("updated");
  });

  test("shared ai& config constants keep env and base-url conventions centralized", () => {
    expect(AIAND_API_KEY_ENV_NAME).toBe("AIAND_API_KEY");
    expect(AIAND_API_KEY_ENV_REF).toBe("{env:AIAND_API_KEY}");
    expect(AIAND_BASE_URL).toBe("https://api.aiand.com/v1");
  });

  test("shared native model payload mirrors the selectable catalog", () => {
    const nativeModels = getNativeUserConfigModels();
    const selectable = getSelectableModels();
    expect(nativeModels.map((definition) => definition.id)).toEqual(
      selectable.map((definition) => definition.id),
    );
  });

  test("upsertDotenvVar creates and updates while preserving other lines", async () => {
    const home = await tempHome();
    const filePath = path.join(home, ".hermes", ".env");

    const created = await upsertDotenvVar(filePath, "AIAND_API_KEY", "first");
    expect(created.status).toBe("created");
    await expect(readFile(filePath, "utf8")).resolves.toBe("AIAND_API_KEY=first\n");

    await writeFile(filePath, "EXISTING=1\nAIAND_API_KEY=old\n", "utf8");
    const updated = await upsertDotenvVar(filePath, "AIAND_API_KEY", "second");
    expect(updated.status).toBe("updated");
    await expect(readFile(filePath, "utf8")).resolves.toBe("EXISTING=1\nAIAND_API_KEY=second\n");
  });
});

describe("Pi-family shared helpers", () => {
  test("shared pi-family payload builder uses the shared native model helper", async () => {
    const sourcePath = path.join(
      process.cwd(),
      "..",
      "cli",
      "src",
      "lib",
      "shared",
      "pi-family-user-config.ts",
    );
    const source = await readFile(sourcePath, "utf8");

    expect(source).toContain('getNativeUserConfigModels');
    expect(source).not.toContain('getCodexSupportedModels');
  });

  test("pi/omp/prime config dirs and omp precedence are stable", async () => {
    const home = await tempHome();
    expect(piFamilyConfigDir("pi", home)).toBe(path.join(home, ".pi", "agent"));
    expect(piFamilyConfigDir("omp", home)).toBe(path.join(home, ".omp", "agent"));
    expect(piFamilyConfigDir("prime", home)).toBe(path.join(home, ".prime", "agent"));

    const ompDir = piFamilyConfigDir("omp", home);
    await mkdir(ompDir, { recursive: true });
    await writeFile(path.join(ompDir, "models.yaml"), "providers: {}\n", "utf8");
    expect(locatePiFamilyConfigFile("omp", home).filePath).toBe(path.join(ompDir, "models.yaml"));
    await writeFile(path.join(ompDir, "models.yml"), "providers: {}\n", "utf8");
    expect(locatePiFamilyConfigFile("omp", home).filePath).toBe(path.join(ompDir, "models.yml"));
  });

  test("provider payload uses placeholder auth for pi/prime and env name for omp", () => {
    const pi = buildPiFamilyProviderConfig("pi");
    const omp = buildPiFamilyProviderConfig("omp");
    const prime = buildPiFamilyProviderConfig("prime");

    expect(pi.api).toBe("openai-completions");
    expect(pi.authHeader).toBe(true);
    expect(pi.apiKey).toBe("configured-via-auth-json");
    expect(omp.apiKey).toBe("AIAND_API_KEY");
    expect(prime.apiKey).toBe("configured-via-auth-json");
    expect(pi.models.length).toBeGreaterThan(0);
  });

  test("upsertPiFamilyAuth creates and updates auth.json while preserving siblings", async () => {
    const home = await tempHome();
    const created = await upsertPiFamilyAuth("pi", home, "sk-one");
    expect(created.status).toBe("created");
    expect(JSON.parse(await readFile(piFamilyAuthJsonPath("pi", home), "utf8"))).toEqual({
      aiand: { type: "api_key", key: "sk-one" },
    });

    await writeFile(
      piFamilyAuthJsonPath("pi", home),
      `${JSON.stringify({ other: { type: "api_key", key: "keep" } }, null, 2)}\n`,
      "utf8",
    );
    const updated = await upsertPiFamilyAuth("pi", home, "sk-two");
    expect(updated.status).toBe("updated");
    expect(JSON.parse(await readFile(piFamilyAuthJsonPath("pi", home), "utf8"))).toEqual({
      other: { type: "api_key", key: "keep" },
      aiand: { type: "api_key", key: "sk-two" },
    });
  });

  test("upsertPiFamilyAuth aborts on invalid json", async () => {
    const home = await tempHome();
    const authPath = piFamilyAuthJsonPath("prime", home);
    await mkdir(path.dirname(authPath), { recursive: true });
    await writeFile(authPath, "not json", "utf8");
    await expect(upsertPiFamilyAuth("prime", home, "sk")).resolves.toEqual({
      status: "aborted",
      path: authPath,
      reason: "invalid-json",
    });
  });

  test("injectPiFamilyConfig creates and merges json config", async () => {
    const home = await tempHome();
    const created = await injectPiFamilyConfig("pi", home);
    expect(created.status).toBe("created");
    const configPath = path.join(piFamilyConfigDir("pi", home), "models.json");
    const parsed = JSON.parse(await readFile(configPath, "utf8")) as {
      providers: Record<string, { api: string }>;
    };
    expect(parsed.providers.aiand.api).toBe("openai-completions");

    await writeFile(
      configPath,
      `${JSON.stringify({ providers: { other: { api: "x" } } }, null, 2)}\n`,
      "utf8",
    );
    const createdBesideOther = await injectPiFamilyConfig("pi", home);
    expect(createdBesideOther.status).toBe("created");
    const createdParsed = JSON.parse(await readFile(configPath, "utf8")) as {
      providers: Record<string, { api: string }>;
    };
    expect(createdParsed.providers.other.api).toBe("x");
    expect(createdParsed.providers.aiand.api).toBe("openai-completions");

    const merged = await injectPiFamilyConfig("pi", home);
    expect(merged.status).toBe("merged");
  });

  test("injectPiFamilyConfig creates yaml config for omp", async () => {
    const home = await tempHome();
    const created = await injectPiFamilyConfig("omp", home);
    expect(created.status).toBe("created");
    const configPath = path.join(piFamilyConfigDir("omp", home), "models.yml");
    const raw = await readFile(configPath, "utf8");
    expect(raw).toContain("providers:");
    expect(raw).toContain("aiand:");
    expect(raw).toContain("apiKey: AIAND_API_KEY");
  });

  test("injectPiFamilyConfig aborts when providers is present but not an object", async () => {
    const home = await tempHome();

    const ompPath = path.join(piFamilyConfigDir("omp", home), "models.yml");
    await mkdir(path.dirname(ompPath), { recursive: true });
    const originalYaml = "# keep me\nproviders: nope\n";
    await writeFile(ompPath, originalYaml, "utf8");
    await expect(injectPiFamilyConfig("omp", home)).resolves.toEqual({
      status: "aborted",
      path: ompPath,
      reason: "providers-not-object",
    });
    await expect(readFile(ompPath, "utf8")).resolves.toBe(originalYaml);

    const piPath = path.join(piFamilyConfigDir("pi", home), "models.json");
    await mkdir(path.dirname(piPath), { recursive: true });
    const originalJson = '{\n  "providers": "nope"\n}\n';
    await writeFile(piPath, originalJson, "utf8");
    await expect(injectPiFamilyConfig("pi", home)).resolves.toEqual({
      status: "aborted",
      path: piPath,
      reason: "providers-not-object",
    });
    await expect(readFile(piPath, "utf8")).resolves.toBe(originalJson);
  });

  test("injectPiFamilyConfig aborts when providers.aiand is present but not an object", async () => {
    const home = await tempHome();

    const ompPath = path.join(piFamilyConfigDir("omp", home), "models.yml");
    await mkdir(path.dirname(ompPath), { recursive: true });
    const originalYaml = "providers:\n  aiand: nope\n";
    await writeFile(ompPath, originalYaml, "utf8");
    await expect(injectPiFamilyConfig("omp", home)).resolves.toEqual({
      status: "aborted",
      path: ompPath,
      reason: "aiand-not-object",
    });
    await expect(readFile(ompPath, "utf8")).resolves.toBe(originalYaml);

    const primePath = path.join(piFamilyConfigDir("prime", home), "models.json");
    await mkdir(path.dirname(primePath), { recursive: true });
    const originalJson = '{\n  "providers": {\n    "aiand": "nope"\n  }\n}\n';
    await writeFile(primePath, originalJson, "utf8");
    await expect(injectPiFamilyConfig("prime", home)).resolves.toEqual({
      status: "aborted",
      path: primePath,
      reason: "aiand-not-object",
    });
    await expect(readFile(primePath, "utf8")).resolves.toBe(originalJson);
  });

  test("injectPiFamilyConfig preserves yaml comments when merging aiand beside other providers", async () => {
    const home = await tempHome();
    const ompPath = path.join(piFamilyConfigDir("omp", home), "models.yml");
    await mkdir(path.dirname(ompPath), { recursive: true });
    await writeFile(
      ompPath,
      [
        "# keep top comment",
        "providers:",
        "  # keep sibling comment",
        "  other:",
        "    api: existing",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await injectPiFamilyConfig("omp", home);
    expect(result).toEqual({ status: "created", path: ompPath });

    const raw = await readFile(ompPath, "utf8");
    expect(raw).toContain("# keep top comment");
    expect(raw).toContain("# keep sibling comment");
    expect(raw).toContain("other:");
    expect(raw).toContain("api: existing");
    expect(raw).toContain("aiand:");
  });

  test("injectPiFamilyConfig aborts on invalid yaml/json", async () => {
    const home = await tempHome();
    const ompPath = path.join(piFamilyConfigDir("omp", home), "models.yml");
    await mkdir(path.dirname(ompPath), { recursive: true });
    await writeFile(ompPath, "{bad", "utf8");
    await expect(injectPiFamilyConfig("omp", home)).resolves.toEqual({
      status: "aborted",
      path: ompPath,
      reason: "invalid-yaml",
    });

    const piPath = path.join(piFamilyConfigDir("pi", home), "models.json");
    await mkdir(path.dirname(piPath), { recursive: true });
    await writeFile(piPath, "{bad", "utf8");
    await expect(injectPiFamilyConfig("pi", home)).resolves.toEqual({
      status: "aborted",
      path: piPath,
      reason: "invalid-json",
    });
  });
});
