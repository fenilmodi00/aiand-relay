import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  deepseekSettingsPath,
  injectDeepseekUserConfig,
  isDeepseekPresent,
} from "../../../cli/src/lib/deepseek/user-config.js";

const temporaryHomes: string[] = [];

async function tempHome(): Promise<string> {
  const home = await mkdtemp(path.join(os.tmpdir(), "aiandrelay-deepseek-config-"));
  temporaryHomes.push(home);
  return home;
}

afterEach(async () => {
  await Promise.all(
    temporaryHomes.splice(0).map((home) => rm(home, { recursive: true, force: true })),
  );
});

describe("DeepSeek native user config", () => {
  test("presence falls back to the config dir", async () => {
    const home = await tempHome();
    const env = { DSH_HOME: path.join(home, ".dsh") };

    expect(isDeepseekPresent({ home, env, binaryPresent: false })).toBe(false);
    await mkdir(env.DSH_HOME, { recursive: true });
    expect(isDeepseekPresent({ home, env, binaryPresent: false })).toBe(true);
  });

  test("creates settings.yaml with llm-pi-ai.providers.aiand and no inline secret", async () => {
    const home = await tempHome();
    const env = { DSH_HOME: path.join(home, ".dsh") };

    const result = await injectDeepseekUserConfig({ home, env });
    const filePath = deepseekSettingsPath({ home, env });
    const text = await readFile(filePath, "utf8");

    expect(result).toEqual({ status: "created", path: filePath });
    expect(text).toContain("llm-pi-ai:");
    expect(text).toContain("providers:");
    expect(text).toContain("aiand:");
    expect(text).toContain("apiKeyEnv: AIAND_API_KEY");
    expect(text).toContain("api: openai-completions");
    expect(text).toContain("baseURL: https://api.aiand.com/v1");
    expect(text).not.toContain("sk-");
    expect(text).not.toContain("apiKey:");
  });

  test("merges into llm-pi-ai.providers.aiand without deleting sibling providers or aiand extras", async () => {
    const home = await tempHome();
    const env = { DSH_HOME: path.join(home, ".dsh") };
    const filePath = deepseekSettingsPath({ home, env });
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      [
        "theme: dark",
        "llm-pi-ai:",
        "  pluginFlag: keep-me",
        "  providers:",
        "    anthropic:",
        "      api: anthropic-messages",
        "    aiand:",
        "      customFlag: keep-me-too",
        "      compat:",
        "        customCompat: true",
        "      models:",
        "        - id: custom/model",
        "          name: Keep custom model",
        "          input:",
        "            - text",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await injectDeepseekUserConfig({ home, env });
    const text = await readFile(filePath, "utf8");

    expect(result).toEqual({ status: "merged", path: filePath });
    expect(text).toContain("theme: dark");
    expect(text).toContain("pluginFlag: keep-me");
    expect(text).toContain("anthropic:");
    expect(text).toContain("api: anthropic-messages");
    expect(text).toContain("customFlag: keep-me-too");
    expect(text).toContain("customCompat: true");
    expect(text).toContain("id: custom/model");
    expect(text).toContain("apiKeyEnv: AIAND_API_KEY");
    expect(text).toContain("baseURL: https://api.aiand.com/v1");
  });

  test("preserves existing YAML comments during an in-place merge", async () => {
    const home = await tempHome();
    const env = { DSH_HOME: path.join(home, ".dsh") };
    const filePath = deepseekSettingsPath({ home, env });
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      [
        "# keep root comment",
        "llm-pi-ai:",
        "  # keep plugin comment",
        "  providers:",
        "    # keep providers comment",
        "    aiand:",
        "      # keep aiand comment",
        "      customFlag: keep-me",
        "      models:",
        "        # keep model comment",
        "        - id: custom/model",
        "          name: Keep custom model",
        "          input:",
        "            - text",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await injectDeepseekUserConfig({ home, env });
    const text = await readFile(filePath, "utf8");

    expect(result).toEqual({ status: "merged", path: filePath });
    expect(text).toContain("# keep root comment");
    expect(text).toContain("# keep plugin comment");
    expect(text).toContain("# keep providers comment");
    expect(text).toContain("# keep aiand comment");
    expect(text).toContain("# keep model comment");
    expect(text).toContain("customFlag: keep-me");
  });

  test("aborts on invalid yaml and preserves original bytes", async () => {
    const home = await tempHome();
    const env = { DSH_HOME: path.join(home, ".dsh") };
    const filePath = deepseekSettingsPath({ home, env });
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, "{bad", "utf8");

    await expect(injectDeepseekUserConfig({ home, env })).resolves.toEqual({
      status: "aborted",
      path: filePath,
      reason: "invalid-yaml",
    });
    await expect(readFile(filePath, "utf8")).resolves.toBe("{bad");
  });

  test.each([
    {
      name: "llm-pi-ai is not an object",
      original: "llm-pi-ai: nope\n",
      reason: "plugin-not-object",
    },
    {
      name: "llm-pi-ai.providers is not an object",
      original: "llm-pi-ai:\n  providers: nope\n",
      reason: "providers-not-object",
    },
    {
      name: "llm-pi-ai.providers.aiand is not an object",
      original: "llm-pi-ai:\n  providers:\n    aiand: nope\n",
      reason: "aiand-not-object",
    },
  ])("aborts when preview schema drift means $name", async ({ original, reason }) => {
    const home = await tempHome();
    const env = { DSH_HOME: path.join(home, ".dsh") };
    const filePath = deepseekSettingsPath({ home, env });
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, original, "utf8");

    await expect(injectDeepseekUserConfig({ home, env })).resolves.toEqual({
      status: "aborted",
      path: filePath,
      reason,
    });
    await expect(readFile(filePath, "utf8")).resolves.toBe(original);
  });

  test.each([
    {
      name: "compat is not an object",
      original: ["llm-pi-ai:", "  providers:", "    aiand:", "      compat: nope", ""].join("\n"),
      reason: "aiand-compat-not-object",
    },
    {
      name: "models is not a sequence",
      original: ["llm-pi-ai:", "  providers:", "    aiand:", "      models: nope", ""].join("\n"),
      reason: "aiand-models-not-array",
    },
  ])(
    "aborts when nested managed aiand content is malformed: $name",
    async ({ original, reason }) => {
      const home = await tempHome();
      const env = { DSH_HOME: path.join(home, ".dsh") };
      const filePath = deepseekSettingsPath({ home, env });
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, original, "utf8");

      await expect(injectDeepseekUserConfig({ home, env })).resolves.toEqual({
        status: "aborted",
        path: filePath,
        reason,
      });
      await expect(readFile(filePath, "utf8")).resolves.toBe(original);
    },
  );
});
