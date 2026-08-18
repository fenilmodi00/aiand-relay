import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { AIAND_BASE_URL } from "@aiandrelay/models";
import { opencodeAuthJsonPath, upsertOpencodeAiandAuth } from "../../../cli/src/lib/opencode/auth.js";
import {
  OPENCODE_DEFAULT_MODEL,
  OPENCODE_PROVIDER_ID,
  opencodeModelEntries,
} from "../../../cli/src/lib/opencode/defaults.js";
import {
  buildUserOpencodeProvider,
  injectOpencodeUserConfig,
  isOpencodePresent,
  locateOpencodeGlobalConfigFile,
  mergeUserOpencodeProvider,
  opencodeGlobalConfigDir,
} from "../../../cli/src/lib/opencode/user-config.js";

const LOCKDOWN_KEYS = ["enabled_providers", "disabled_providers", "model", "agent", "whitelist"] as const;

describe("buildUserOpencodeProvider", () => {
  test("matches aopencode npm/name/baseURL and curated models without secrets or lockdown", () => {
    const provider = buildUserOpencodeProvider();
    const curated = opencodeModelEntries();

    expect(OPENCODE_PROVIDER_ID).toBe("aiand");
    expect(provider.npm).toBe("@ai-sdk/openai-compatible");
    expect(provider.name).toBe("ai&");
    expect(provider.options).toEqual({ baseURL: AIAND_BASE_URL });
    expect(provider.options).not.toHaveProperty("apiKey");
    expect(provider).not.toHaveProperty("env");
    expect(Object.keys(provider.models).sort()).toEqual(Object.keys(curated).sort());
    expect(provider.models[OPENCODE_DEFAULT_MODEL]).toEqual(curated[OPENCODE_DEFAULT_MODEL]);

    for (const key of LOCKDOWN_KEYS) {
      expect(provider).not.toHaveProperty(key);
    }
    const serialized = JSON.stringify(provider);
    expect(serialized).not.toContain("apiKey");
    expect(serialized).not.toContain("{env:AIAND_API_KEY}");
  });
});

describe("mergeUserOpencodeProvider", () => {
  test("refreshes curated fields, keeps extras, strips apiKey, leaves user env and whitelist", () => {
    const curated = opencodeModelEntries();
    const merged = mergeUserOpencodeProvider({
      npm: "old-package",
      name: "old-name",
      query: { foo: "bar" },
      env: ["AIAND_API_KEY"],
      whitelist: ["custom/foo"],
      options: {
        apiKey: "{env:AIAND_API_KEY}",
        baseURL: "https://example.invalid/v1",
        headers: { "X-User": "1" },
      },
      models: {
        "custom/foo": { name: "User extra" },
        [OPENCODE_DEFAULT_MODEL]: { name: "stale curated name" },
      },
    });

    expect(merged.npm).toBe("@ai-sdk/openai-compatible");
    expect(merged.name).toBe("ai&");
    expect(merged.query).toEqual({ foo: "bar" });
    expect(merged.env).toEqual(["AIAND_API_KEY"]);
    expect(merged.whitelist).toEqual(["custom/foo"]);

    const options = merged.options as Record<string, unknown>;
    expect(options.baseURL).toBe(AIAND_BASE_URL);
    expect(options.headers).toEqual({ "X-User": "1" });
    expect(options).not.toHaveProperty("apiKey");

    const models = merged.models as Record<string, unknown>;
    expect(models["custom/foo"]).toEqual({ name: "User extra" });
    expect(models[OPENCODE_DEFAULT_MODEL]).toEqual(curated[OPENCODE_DEFAULT_MODEL]);
    for (const id of Object.keys(curated)) {
      expect(models[id]).toEqual(curated[id]);
    }

    expect(JSON.stringify(merged)).not.toContain("enabled_providers");
    expect(JSON.stringify(merged)).not.toContain("disabled_providers");
  });

  test("does not add env or whitelist when the user omitted them", () => {
    const merged = mergeUserOpencodeProvider({
      options: { timeout: 30 },
      models: {},
    });
    expect(merged).not.toHaveProperty("env");
    expect(merged).not.toHaveProperty("whitelist");
    const options = merged.options as Record<string, unknown>;
    expect(options.timeout).toBe(30);
    expect(options.baseURL).toBe(AIAND_BASE_URL);
  });

  test("rebuilds options and models when existing values are not objects", () => {
    const merged = mergeUserOpencodeProvider({
      options: "nope",
      models: ["nope"],
    });
    expect(merged.options).toEqual({ baseURL: AIAND_BASE_URL });
    expect(Object.keys(merged.models as object).sort()).toEqual(
      Object.keys(opencodeModelEntries()).sort(),
    );
  });
});

describe("OpenCode XDG paths", () => {
  test("default config dir is home/.config/opencode, not AppData", () => {
    const home = "C:\\Users\\x";
    const dir = opencodeGlobalConfigDir({ home, env: {} });
    expect(dir).toBe(path.join(home, ".config", "opencode"));
    expect(dir.toLowerCase()).not.toContain("appdata");
    expect(dir.toLowerCase()).not.toContain("localappdata");
  });

  test("XDG_CONFIG_HOME is the config home without nesting .config", () => {
    const home = "C:\\Users\\x";
    const dir = opencodeGlobalConfigDir({
      home,
      env: { XDG_CONFIG_HOME: "/custom-xdg" },
    });
    expect(dir).toBe(path.join("/custom-xdg", "opencode"));
    expect(dir).not.toBe(path.join("/custom-xdg", ".config", "opencode"));
  });

  test("default auth path is home/.local/share/opencode/auth.json, not AppData", () => {
    const home = "C:\\Users\\x";
    const filePath = opencodeAuthJsonPath({ home, env: {} });
    expect(filePath).toBe(path.join(home, ".local", "share", "opencode", "auth.json"));
    expect(filePath.toLowerCase()).not.toContain("appdata");
    expect(filePath.toLowerCase()).not.toContain("localappdata");
  });

  test("XDG_DATA_HOME is the data home without nesting .local/share", () => {
    const filePath = opencodeAuthJsonPath({
      home: "C:\\Users\\x",
      env: { XDG_DATA_HOME: "/custom-data" },
    });
    expect(filePath).toBe(path.join("/custom-data", "opencode", "auth.json"));
    expect(filePath).not.toContain(
      path.join("/custom-data", ".local", "share", "opencode", "auth.json"),
    );
  });
});

describe("isOpencodePresent / locateOpencodeGlobalConfigFile", () => {
  let home: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    home = await mkdtemp(path.join(os.tmpdir(), "aiandrelay-opencode-paths-"));
    env = {
      XDG_CONFIG_HOME: path.join(home, "xdg-config"),
      XDG_DATA_HOME: path.join(home, "xdg-data"),
    };
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  test("PATH hit is present even when the config dir is missing", () => {
    expect(isOpencodePresent({ home, env, binaryPresent: true })).toBe(true);
  });

  test("config dir hit is present even when PATH missed", async () => {
    await mkdir(opencodeGlobalConfigDir({ home, env }), { recursive: true });
    expect(isOpencodePresent({ home, env, binaryPresent: false })).toBe(true);
  });

  test("neither PATH nor config dir is not present", () => {
    expect(isOpencodePresent({ home, env, binaryPresent: false })).toBe(false);
  });

  test("a file at the config path is not a dir hit", async () => {
    const dir = opencodeGlobalConfigDir({ home, env });
    await mkdir(path.dirname(dir), { recursive: true });
    await writeFile(dir, "not-a-directory", "utf8");
    expect(isOpencodePresent({ home, env, binaryPresent: false })).toBe(false);
  });

  test("jsonc wins when jsonc, json, and config.json all exist", async () => {
    const dir = opencodeGlobalConfigDir({ home, env });
    await mkdir(dir, { recursive: true });
    const jsonc = path.join(dir, "opencode.jsonc");
    const json = path.join(dir, "opencode.json");
    const config = path.join(dir, "config.json");
    await writeFile(jsonc, "{}\n", "utf8");
    await writeFile(json, "{}\n", "utf8");
    await writeFile(config, "{}\n", "utf8");
    expect(locateOpencodeGlobalConfigFile({ home, env })).toEqual({
      dir,
      filePath: jsonc,
      existed: true,
    });
  });

  test("falls through to opencode.json then config.json", async () => {
    const dir = opencodeGlobalConfigDir({ home, env });
    await mkdir(dir, { recursive: true });
    const json = path.join(dir, "opencode.json");
    await writeFile(json, "{}\n", "utf8");
    expect(locateOpencodeGlobalConfigFile({ home, env }).filePath).toBe(json);

    await rm(json);
    const config = path.join(dir, "config.json");
    await writeFile(config, "{}\n", "utf8");
    expect(locateOpencodeGlobalConfigFile({ home, env }).filePath).toBe(config);
  });

  test("missing files locate create-target opencode.json", async () => {
    const dir = opencodeGlobalConfigDir({ home, env });
    await mkdir(dir, { recursive: true });
    expect(locateOpencodeGlobalConfigFile({ home, env })).toEqual({
      dir,
      filePath: path.join(dir, "opencode.json"),
      existed: false,
    });
  });
});

describe("upsertOpencodeAiandAuth", () => {
  let home: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    home = await mkdtemp(path.join(os.tmpdir(), "aiandrelay-opencode-auth-"));
    env = {
      XDG_CONFIG_HOME: path.join(home, "xdg-config"),
      XDG_DATA_HOME: path.join(home, "xdg-data"),
    };
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  test("creates auth.json with aiand api credential and 0o600 on unix", async () => {
    const result = await upsertOpencodeAiandAuth({
      home,
      env,
      apiKey: "sk-aiand-new",
    });
    const filePath = opencodeAuthJsonPath({ home, env });
    expect(result).toEqual({ status: "created", path: filePath });
    const raw = await readFile(filePath, "utf8");
    expect(JSON.parse(raw)).toEqual({
      [OPENCODE_PROVIDER_ID]: { type: "api", key: "sk-aiand-new" },
    });
    expect(raw.endsWith("\n")).toBe(true);
    if (process.platform !== "win32") {
      const info = await stat(filePath);
      expect(info.mode & 0o777).toBe(0o600);
    }
  });

  test("keeps sibling credentials and adds aiand", async () => {
    const filePath = opencodeAuthJsonPath({ home, env });
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      `${JSON.stringify({ anthropic: { type: "api", key: "sk-ant" } }, null, 2)}\n`,
      "utf8",
    );

    const result = await upsertOpencodeAiandAuth({
      home,
      env,
      apiKey: "sk-aiand-new",
    });
    expect(result.status).toBe("updated");
    expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual({
      anthropic: { type: "api", key: "sk-ant" },
      [OPENCODE_PROVIDER_ID]: { type: "api", key: "sk-aiand-new" },
    });
  });

  test("reconfigure updates the aiand key and leaves anthropic", async () => {
    const filePath = opencodeAuthJsonPath({ home, env });
    await upsertOpencodeAiandAuth({ home, env, apiKey: "sk-aiand-old" });
    await mkdir(path.dirname(filePath), { recursive: true });
    const first = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
    first.anthropic = { type: "api", key: "sk-ant" };
    await writeFile(filePath, `${JSON.stringify(first, null, 2)}\n`, "utf8");

    const result = await upsertOpencodeAiandAuth({
      home,
      env,
      apiKey: "sk-aiand-rotated",
    });
    expect(result.status).toBe("updated");
    expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual({
      anthropic: { type: "api", key: "sk-ant" },
      [OPENCODE_PROVIDER_ID]: { type: "api", key: "sk-aiand-rotated" },
    });
  });

  test("invalid JSON aborts and leaves bytes unchanged", async () => {
    const filePath = opencodeAuthJsonPath({ home, env });
    await mkdir(path.dirname(filePath), { recursive: true });
    const original = "NOT JSON";
    await writeFile(filePath, original, "utf8");

    const result = await upsertOpencodeAiandAuth({
      home,
      env,
      apiKey: "sk-aiand-new",
    });
    expect(result).toEqual({ status: "aborted", path: filePath, reason: "invalid-json" });
    await expect(readFile(filePath, "utf8")).resolves.toBe(original);
  });

  test("non-object JSON aborts without wiping", async () => {
    const filePath = opencodeAuthJsonPath({ home, env });
    await mkdir(path.dirname(filePath), { recursive: true });
    const original = "[1, 2]\n";
    await writeFile(filePath, original, "utf8");

    const result = await upsertOpencodeAiandAuth({
      home,
      env,
      apiKey: "sk-aiand-new",
    });
    expect(result).toEqual({ status: "aborted", path: filePath, reason: "not-object" });
    await expect(readFile(filePath, "utf8")).resolves.toBe(original);
  });
});

describe("injectOpencodeUserConfig", () => {
  let home: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    home = await mkdtemp(path.join(os.tmpdir(), "aiandrelay-opencode-inject-"));
    env = {
      XDG_CONFIG_HOME: path.join(home, "xdg-config"),
      XDG_DATA_HOME: path.join(home, "xdg-data"),
    };
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  test("creates opencode.json with schema and only provider.aiand", async () => {
    const result = await injectOpencodeUserConfig({ home, env });
    const filePath = path.join(opencodeGlobalConfigDir({ home, env }), "opencode.json");
    expect(result).toEqual({ status: "created", path: filePath });

    const parsed = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
    expect(parsed.$schema).toBe("https://opencode.ai/config.json");
    expect(Object.keys(parsed).sort()).toEqual(["$schema", "provider"]);
    const provider = parsed.provider as Record<string, unknown>;
    expect(Object.keys(provider)).toEqual(["aiand"]);
    const aiand = provider.aiand as Record<string, unknown>;
    expect(aiand).toEqual(buildUserOpencodeProvider());
    expect(JSON.stringify(parsed)).not.toContain("enabled_providers");
    expect(JSON.stringify(parsed)).not.toContain("disabled_providers");
    expect(JSON.stringify(parsed)).not.toContain("whitelist");
    expect(JSON.stringify(aiand)).not.toContain("apiKey");
    expect(aiand).not.toHaveProperty("env");
    expect(parsed).not.toHaveProperty("model");
    expect(parsed).not.toHaveProperty("agent");
  });

  test("inserts aiand beside anthropic without lockdown or schema insert", async () => {
    const dir = opencodeGlobalConfigDir({ home, env });
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, "opencode.json");
    const original = {
      provider: {
        anthropic: { npm: "@ai-sdk/anthropic", name: "Anthropic" },
      },
      mcp: { demo: { type: "local", command: ["echo"] } },
    };
    await writeFile(filePath, `${JSON.stringify(original, null, 2)}\n`, "utf8");

    const result = await injectOpencodeUserConfig({ home, env });
    expect(result).toEqual({ status: "created", path: filePath });
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
    expect(parsed.$schema).toBeUndefined();
    expect(parsed.mcp).toEqual(original.mcp);
    const provider = parsed.provider as Record<string, unknown>;
    expect(provider.anthropic).toEqual(original.provider.anthropic);
    expect(provider.aiand).toEqual(buildUserOpencodeProvider());
    expect(parsed).not.toHaveProperty("enabled_providers");
    expect(parsed).not.toHaveProperty("disabled_providers");
    expect(parsed).not.toHaveProperty("model");
    expect(parsed).not.toHaveProperty("agent");
  });

  test("preserves JSONC comments and anthropic when patching jsonc", async () => {
    const dir = opencodeGlobalConfigDir({ home, env });
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, "opencode.jsonc");
    const original = `{
  // keep this comment above provider
  "provider": {
    "anthropic": { "npm": "@ai-sdk/anthropic" }
  }
}
`;
    await writeFile(filePath, original, "utf8");

    const result = await injectOpencodeUserConfig({ home, env });
    expect(result.status).toBe("created");
    expect(result.path).toBe(filePath);
    const text = await readFile(filePath, "utf8");
    expect(text).toContain("keep this comment above provider");
    expect(text).toContain('"anthropic"');
    expect(text).toContain('"aiand"');
  });

  test("merges extras, refreshes curated models, and strips options.apiKey", async () => {
    const dir = opencodeGlobalConfigDir({ home, env });
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, "opencode.json");
    await writeFile(
      filePath,
      `${JSON.stringify(
        {
          provider: {
            aiand: {
              npm: "stale",
              name: "stale",
              options: {
                apiKey: "{env:AIAND_API_KEY}",
                baseURL: "https://example.invalid/v1",
              },
              models: {
                "custom/foo": { name: "User extra" },
                [OPENCODE_DEFAULT_MODEL]: { name: "stale curated name" },
              },
            },
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const result = await injectOpencodeUserConfig({ home, env });
    expect(result).toEqual({ status: "merged", path: filePath });
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
    const aiand = (parsed.provider as Record<string, unknown>).aiand as Record<string, unknown>;
    expect(aiand.npm).toBe("@ai-sdk/openai-compatible");
    expect(aiand.name).toBe("ai&");
    const options = aiand.options as Record<string, unknown>;
    expect(options.baseURL).toBe(AIAND_BASE_URL);
    expect(options).not.toHaveProperty("apiKey");
    const models = aiand.models as Record<string, unknown>;
    expect(models["custom/foo"]).toEqual({ name: "User extra" });
    expect(models[OPENCODE_DEFAULT_MODEL]).toEqual(opencodeModelEntries()[OPENCODE_DEFAULT_MODEL]);
    expect(aiand).not.toHaveProperty("whitelist");
    expect(aiand).not.toHaveProperty("env");
  });

  test("invalid JSON leaves the winning file unchanged", async () => {
    const dir = opencodeGlobalConfigDir({ home, env });
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, "opencode.json");
    const original = "{";
    await writeFile(filePath, original, "utf8");

    const result = await injectOpencodeUserConfig({ home, env });
    expect(result).toEqual({
      status: "aborted",
      path: filePath,
      reason: "invalid-json",
    });
    await expect(readFile(filePath, "utf8")).resolves.toBe(original);
  });

  test("v2 providers without provider aborts without write", async () => {
    const dir = opencodeGlobalConfigDir({ home, env });
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, "opencode.json");
    const original = `${JSON.stringify({ providers: { aiand: { package: "x" } } }, null, 2)}\n`;
    await writeFile(filePath, original, "utf8");

    const result = await injectOpencodeUserConfig({ home, env });
    expect(result).toEqual({ status: "aborted", path: filePath, reason: "v2-schema" });
    await expect(readFile(filePath, "utf8")).resolves.toBe(original);
  });

  test("both provider and providers is treated as v1 and patched", async () => {
    const dir = opencodeGlobalConfigDir({ home, env });
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, "opencode.json");
    await writeFile(
      filePath,
      `${JSON.stringify(
        {
          provider: { anthropic: { npm: "@ai-sdk/anthropic" } },
          providers: { leftover: true },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const result = await injectOpencodeUserConfig({ home, env });
    expect(result.status).toBe("created");
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
    expect(parsed.providers).toEqual({ leftover: true });
    const provider = parsed.provider as Record<string, unknown>;
    expect(provider.anthropic).toEqual({ npm: "@ai-sdk/anthropic" });
    expect(provider.aiand).toEqual(buildUserOpencodeProvider());
  });

  test("provider.aiand that is not an object aborts", async () => {
    const dir = opencodeGlobalConfigDir({ home, env });
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, "opencode.json");
    const original = `${JSON.stringify({ provider: { aiand: "nope" } }, null, 2)}\n`;
    await writeFile(filePath, original, "utf8");

    const result = await injectOpencodeUserConfig({ home, env });
    expect(result).toEqual({
      status: "aborted",
      path: filePath,
      reason: "aiand-not-object",
    });
    await expect(readFile(filePath, "utf8")).resolves.toBe(original);
  });

  test("when both json and jsonc exist, only jsonc is patched", async () => {
    const dir = opencodeGlobalConfigDir({ home, env });
    await mkdir(dir, { recursive: true });
    const jsonc = path.join(dir, "opencode.jsonc");
    const json = path.join(dir, "opencode.json");
    const jsonOriginal = '{"keep":true}\n';
    await writeFile(json, jsonOriginal, "utf8");
    await writeFile(jsonc, `{\n  // comment\n  "provider": {}\n}\n`, "utf8");

    const result = await injectOpencodeUserConfig({ home, env });
    expect(result.path).toBe(jsonc);
    await expect(readFile(json, "utf8")).resolves.toBe(jsonOriginal);
    const jsoncText = await readFile(jsonc, "utf8");
    expect(jsoncText).toContain("// comment");
    expect(jsoncText).toContain('"aiand"');
  });

  test("empty winning jsonc is rewritten in that filename with $schema", async () => {
    const dir = opencodeGlobalConfigDir({ home, env });
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, "opencode.jsonc");
    await writeFile(filePath, "  \n", "utf8");

    const result = await injectOpencodeUserConfig({ home, env });
    expect(result).toEqual({ status: "created", path: filePath });
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
    expect(parsed.$schema).toBe("https://opencode.ai/config.json");
    expect((parsed.provider as Record<string, unknown>).aiand).toEqual(buildUserOpencodeProvider());
  });
});
