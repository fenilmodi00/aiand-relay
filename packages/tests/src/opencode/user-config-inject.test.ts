import { describe, expect, test } from "vitest";
import { AIAND_BASE_URL } from "@aiandrelay/models";
import {
  OPENCODE_DEFAULT_MODEL,
  OPENCODE_PROVIDER_ID,
  opencodeModelEntries,
} from "../../../cli/src/lib/opencode/defaults.js";
import {
  buildUserOpencodeProvider,
  mergeUserOpencodeProvider,
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
