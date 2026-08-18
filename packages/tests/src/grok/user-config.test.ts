import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { getDefaultModel } from "@aiandrelay/models";
import { AIAND_API_KEY_ENV_NAME, AIAND_BASE_URL } from "../../../cli/src/lib/aiand-core.js";
import {
  grokConfigDir,
  grokConfigPath,
  injectGrokUserConfig,
  isGrokPresent,
} from "../../../cli/src/lib/grok/user-config.js";

const temporaryDirs: string[] = [];

async function tempHome(): Promise<string> {
  const home = await mkdtemp(path.join(os.tmpdir(), "aiandrelay-grok-user-config-"));
  temporaryDirs.push(home);
  return home;
}

afterEach(async () => {
  await Promise.all(temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("Grok native user config", () => {
  test("detects Grok from PATH or the native config dir", async () => {
    const home = await tempHome();
    const env = { GROK_HOME: path.join(home, ".grok-custom") };

    expect(isGrokPresent({ home, env, binaryPresent: false })).toBe(false);
    await mkdir(grokConfigDir({ home, env }), { recursive: true });
    expect(isGrokPresent({ home, env, binaryPresent: false })).toBe(true);
    expect(isGrokPresent({ home, env, binaryPresent: true })).toBe(true);
  });

  test("appends a single add-only aiand section without touching model defaults", async () => {
    const home = await tempHome();
    const env = { GROK_HOME: path.join(home, ".grok-custom") };
    const filePath = grokConfigPath({ home, env });
    const defaultModel = getDefaultModel();
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      [
        "# keep this comment",
        "[models]",
        'default = "grok-4"',
        "",
        "[model.grok-4]",
        'model = "grok-4"',
        "",
      ].join("\n"),
      "utf8",
    );

    await expect(injectGrokUserConfig({ home, env })).resolves.toEqual({
      status: "created",
      path: filePath,
    });

    const next = await readFile(filePath, "utf8");
    expect(next).toContain("# keep this comment");
    expect(next).toContain('[models]\ndefault = "grok-4"');
    expect(next).toContain('[model.grok-4]\nmodel = "grok-4"');
    expect(next).toContain("[model.aiand]");
    expect(next).toContain(`model = "${defaultModel.id}"`);
    expect(next).toContain(`base_url = "${AIAND_BASE_URL}"`);
    expect(next).toContain(`env_key = "${AIAND_API_KEY_ENV_NAME}"`);
    expect(next.match(/\[model\.aiand\]/g)).toHaveLength(1);
  });

  test("updates the aiand section in place and stays idempotent on rerun", async () => {
    const home = await tempHome();
    const env = { GROK_HOME: path.join(home, ".grok-custom") };
    const filePath = grokConfigPath({ home, env });
    const defaultModel = getDefaultModel();
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      [
        "[models]",
        'default = "keep-user-default"',
        "",
        "[model.aiand]",
        'model = "old/model"',
        'base_url = "https://example.invalid/v1"',
        'name = "Old Name"',
        'env_key = "WRONG_ENV"',
        "",
      ].join("\n"),
      "utf8",
    );

    await expect(injectGrokUserConfig({ home, env })).resolves.toEqual({
      status: "updated",
      path: filePath,
    });
    const firstPass = await readFile(filePath, "utf8");

    await expect(injectGrokUserConfig({ home, env })).resolves.toEqual({
      status: "updated",
      path: filePath,
    });
    await expect(readFile(filePath, "utf8")).resolves.toBe(firstPass);

    expect(firstPass).toContain('[models]\ndefault = "keep-user-default"');
    expect(firstPass).toContain(`model = "${defaultModel.id}"`);
    expect(firstPass).toContain(`base_url = "${AIAND_BASE_URL}"`);
    expect(firstPass).toContain('name = "ai& Default"');
    expect(firstPass).toContain(`env_key = "${AIAND_API_KEY_ENV_NAME}"`);
    expect(firstPass).not.toContain("old/model");
    expect(firstPass).not.toContain("WRONG_ENV");
    expect(firstPass.match(/\[model\.aiand\]/g)).toHaveLength(1);
  });

  test("preserves user-owned keys and comments inside model.aiand on update", async () => {
    const home = await tempHome();
    const env = { GROK_HOME: path.join(home, ".grok-custom") };
    const filePath = grokConfigPath({ home, env });
    const defaultModel = getDefaultModel();
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      [
        "[model.aiand]",
        "# keep this section comment",
        'custom_label = "keep-me"',
        "custom_toggle = true",
        'model = "old/model" # keep inline comment',
        'base_url = "https://example.invalid/v1"',
        'name = "Old Name"',
        'env_key = "WRONG_ENV"',
        "",
      ].join("\n"),
      "utf8",
    );

    await expect(injectGrokUserConfig({ home, env })).resolves.toEqual({
      status: "updated",
      path: filePath,
    });

    const next = await readFile(filePath, "utf8");
    expect(next).toContain("# keep this section comment");
    expect(next).toContain('custom_label = "keep-me"');
    expect(next).toContain("custom_toggle = true");
    expect(next).toContain(`model = "${defaultModel.id}" # keep inline comment`);
    expect(next).toContain(`base_url = "${AIAND_BASE_URL}"`);
    expect(next).toContain('name = "ai& Default"');
    expect(next).toContain(`env_key = "${AIAND_API_KEY_ENV_NAME}"`);
    expect(next).not.toContain("old/model");
    expect(next).not.toContain("WRONG_ENV");
  });

  test("aborts on invalid TOML and preserves original bytes", async () => {
    const home = await tempHome();
    const env = { GROK_HOME: path.join(home, ".grok-custom") };
    const filePath = grokConfigPath({ home, env });
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, "[model.aiand\nbroken = true\n", "utf8");

    await expect(injectGrokUserConfig({ home, env })).resolves.toEqual({
      status: "aborted",
      path: filePath,
      reason: "invalid-toml",
    });
    await expect(readFile(filePath, "utf8")).resolves.toBe("[model.aiand\nbroken = true\n");
  });
});
