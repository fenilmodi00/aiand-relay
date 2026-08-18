import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { AIAND_BASE_URL } from "@aiandrelay/models";
import { opencodeAuthJsonPath } from "../../../cli/src/lib/opencode/auth.js";
import {
  OPENCODE_DEFAULT_MODEL,
  OPENCODE_PROVIDER_ID,
  opencodeModelEntries,
} from "../../../cli/src/lib/opencode/defaults.js";
import {
  buildUserOpencodeProvider,
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
