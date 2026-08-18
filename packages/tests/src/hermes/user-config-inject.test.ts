import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  hermesConfigPath,
  hermesEnvPath,
  injectHermesUserConfig,
  isHermesPresent,
  upsertHermesEnvKey,
} from "../../../cli/src/lib/hermes/user-config.js";

const temporaryHomes: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryHomes.splice(0).map((home) => rm(home, { recursive: true, force: true })),
  );
});

async function tempHome(): Promise<string> {
  const home = await mkdtemp(path.join(os.tmpdir(), "aiandrelay-hermes-inject-"));
  temporaryHomes.push(home);
  return home;
}

function hermesEnv(home: string): NodeJS.ProcessEnv {
  return {
    HERMES_HOME: path.join(home, ".hermes"),
  };
}

describe("Hermes native user config", () => {
  test("presence falls back to the config dir", async () => {
    const home = await tempHome();
    const env = hermesEnv(home);
    expect(isHermesPresent({ home, env, binaryPresent: false })).toBe(false);
    await mkdir(path.dirname(hermesConfigPath({ home, env })), { recursive: true });
    expect(isHermesPresent({ home, env, binaryPresent: false })).toBe(true);
  });

  test("creates providers.aiand without adding a top-level model block", async () => {
    const home = await tempHome();
    const env = hermesEnv(home);

    const result = await injectHermesUserConfig({ home, env });
    const filePath = hermesConfigPath({ home, env });

    expect(result).toEqual({ status: "created", path: filePath });
    const text = await readFile(filePath, "utf8");
    expect(text).toContain("providers:");
    expect(text).toContain("aiand:");
    expect(text).not.toContain("\nmodel:");
    expect(text).not.toContain("api_key:");
  });

  test("preserves string model shape and comments while adding providers.aiand", async () => {
    const home = await tempHome();
    const env = hermesEnv(home);
    const filePath = hermesConfigPath({ home, env });
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      [
        "# keep root comment",
        'model: "zai-org/glm-5.2"',
        "providers:",
        "  anthropic:",
        "    api_key: ${ANTHROPIC_API_KEY}",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await injectHermesUserConfig({ home, env });

    expect(result).toEqual({ status: "created", path: filePath });
    const text = await readFile(filePath, "utf8");
    expect(text).toContain("# keep root comment");
    expect(text).toContain('model: "zai-org/glm-5.2"');
    expect(text).toContain("anthropic:");
    expect(text).toContain("aiand:");
  });

  test("preserves object model shape and user extras when refreshing aiand", async () => {
    const home = await tempHome();
    const env = hermesEnv(home);
    const filePath = hermesConfigPath({ home, env });
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      [
        "model:",
        "  provider: anthropic",
        '  default: "claude-sonnet"',
        "providers:",
        "  aiand:",
        "    discover_models: true",
        "    extra_headers:",
        "      X-User: keep-me",
        "    models:",
        "      - id: custom/foo",
        '        name: "Keep custom model"',
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await injectHermesUserConfig({ home, env });

    expect(result).toEqual({ status: "merged", path: filePath });
    const text = await readFile(filePath, "utf8");
    expect(text).toContain("provider: anthropic");
    expect(text).toContain('default: "claude-sonnet"');
    expect(text).toContain("X-User: keep-me");
    expect(text).toContain("id: custom/foo");
    expect(text).toContain('name: "Keep custom model"');
    expect(text).toContain("discover_models: false");
  });

  test("non-sequence providers.aiand.models aborts and preserves original bytes", async () => {
    const home = await tempHome();
    const env = hermesEnv(home);
    const filePath = hermesConfigPath({ home, env });
    const original = [
      "providers:",
      "  aiand:",
      "    base_url: https://example.invalid/v1",
      "    models:",
      "      custom: nope",
      "",
    ].join("\n");
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, original, "utf8");

    await expect(injectHermesUserConfig({ home, env })).resolves.toEqual({
      status: "aborted",
      path: filePath,
      reason: "models-not-sequence",
    });
    await expect(readFile(filePath, "utf8")).resolves.toBe(original);
  });

  test("invalid yaml aborts and preserves original bytes", async () => {
    const home = await tempHome();
    const env = hermesEnv(home);
    const filePath = hermesConfigPath({ home, env });
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, "providers: [\n", "utf8");

    await expect(injectHermesUserConfig({ home, env })).resolves.toEqual({
      status: "aborted",
      path: filePath,
      reason: "invalid-yaml",
    });
    await expect(readFile(filePath, "utf8")).resolves.toBe("providers: [\n");
  });

  test("top-level yaml scalar aborts without write", async () => {
    const home = await tempHome();
    const env = hermesEnv(home);
    const filePath = hermesConfigPath({ home, env });
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, "just-a-string\n", "utf8");

    await expect(injectHermesUserConfig({ home, env })).resolves.toEqual({
      status: "aborted",
      path: filePath,
      reason: "not-object",
    });
    await expect(readFile(filePath, "utf8")).resolves.toBe("just-a-string\n");
  });
});

describe("Hermes .env auth", () => {
  test("creates .env with AIAND_API_KEY when missing", async () => {
    const home = await tempHome();
    const env = hermesEnv(home);

    const result = await upsertHermesEnvKey({ home, env, apiKey: "sk-aiand-new" });
    const filePath = hermesEnvPath({ home, env });

    expect(result).toEqual({ status: "created", path: filePath });
    await expect(readFile(filePath, "utf8")).resolves.toBe("AIAND_API_KEY=sk-aiand-new\n");
  });

  test("updates AIAND_API_KEY and preserves sibling dotenv entries", async () => {
    const home = await tempHome();
    const env = hermesEnv(home);
    const filePath = hermesEnvPath({ home, env });
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      ["OPENAI_API_KEY=keep-me", "AIAND_API_KEY=sk-aiand-old", "HERMES_LOG=debug", ""].join("\n"),
      "utf8",
    );

    const result = await upsertHermesEnvKey({ home, env, apiKey: "sk-aiand-new" });

    expect(result).toEqual({ status: "updated", path: filePath });
    await expect(readFile(filePath, "utf8")).resolves.toBe(
      ["OPENAI_API_KEY=keep-me", "AIAND_API_KEY=sk-aiand-new", "HERMES_LOG=debug", ""].join("\n"),
    );
  });

  test("appends AIAND_API_KEY when .env exists without it", async () => {
    const home = await tempHome();
    const env = hermesEnv(home);
    const filePath = hermesEnvPath({ home, env });
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, "OPENAI_API_KEY=keep-me\n", "utf8");

    const result = await upsertHermesEnvKey({ home, env, apiKey: "sk-aiand-new" });

    expect(result).toEqual({ status: "updated", path: filePath });
    await expect(readFile(filePath, "utf8")).resolves.toBe(
      "OPENAI_API_KEY=keep-me\nAIAND_API_KEY=sk-aiand-new\n",
    );
  });
});
