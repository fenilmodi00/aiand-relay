import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  injectOmpUserConfig,
  isOmpPresent,
  locateOmpModelsFile,
  ompNativeUserConfig,
} from "../../../cli/src/lib/omp/user-config.js";

const temporaryDirs: string[] = [];

async function tempHome(): Promise<string> {
  const home = await mkdtemp(path.join(os.tmpdir(), "aiandrelay-harness-user-config-"));
  temporaryDirs.push(home);
  return home;
}

afterEach(async () => {
  await Promise.all(temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("OMP native user config", () => {
  test("presence falls back to the config dir", async () => {
    const home = await tempHome();
    expect(isOmpPresent(home, false)).toBe(false);
    await mkdir(path.join(home, ".omp", "agent"), { recursive: true });
    expect(isOmpPresent(home, false)).toBe(true);
  });

  test("writes models.yml by default", async () => {
    const home = await tempHome();
    await expect(injectOmpUserConfig(home)).resolves.toMatchObject({ status: "created" });
    const filePath = locateOmpModelsFile(home);
    expect(path.basename(filePath)).toBe("models.yml");
    await expect(readFile(filePath, "utf8")).resolves.toContain("apiKey: AIAND_API_KEY");
  });

  test("exposes the shared injector contract without auth writes", async () => {
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

  test("prefers models.yml over models.yaml and legacy models.json", async () => {
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

  test("preserves nested aiand keys and comments when merging managed values", async () => {
    const home = await tempHome();
    const filePath = path.join(home, ".omp", "agent", "models.yml");
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      [
        "providers:",
        "  aiand:",
        "    # keep nested comment",
        "    customFlag: keep-me",
        "    compat:",
        "      customCompat: true",
        "    models:",
        "      # keep custom model comment",
        "      - id: custom/model",
        "        name: Keep custom model",
        "        reasoning: false",
        "        input:",
        "          - text",
        "        contextWindow: 1024",
        "        maxTokens: 256",
        "        cost:",
        "          input: 1",
        "          output: 2",
        "          cacheRead: 0",
        "          cacheWrite: 0",
        "",
      ].join("\n"),
      "utf8",
    );

    await expect(injectOmpUserConfig(home)).resolves.toEqual({ status: "merged", path: filePath });
    const next = await readFile(filePath, "utf8");
    expect(next).toContain("# keep nested comment");
    expect(next).toContain("customFlag: keep-me");
    expect(next).toContain("customCompat: true");
    expect(next).toContain("# keep custom model comment");
    expect(next).toContain("- id: custom/model");
    expect(next).toContain("Keep custom model");
    expect(next).toContain("baseUrl: https://api.aiand.com/v1");
    expect(next).toContain("apiKey: AIAND_API_KEY");
  });

  test("aborts on invalid yaml and preserves the original bytes", async () => {
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

  test("re-runs idempotently against an existing managed yaml file", async () => {
    const home = await tempHome();
    const first = await injectOmpUserConfig(home);
    const filePath = locateOmpModelsFile(home);
    const firstText = await readFile(filePath, "utf8");

    const second = await injectOmpUserConfig(home);
    const secondText = await readFile(filePath, "utf8");
    const firstModelIds = [...firstText.matchAll(/^\s*-\s+id:\s+(.+)$/gm)].map((match) => match[1]);
    const secondModelIds = [...secondText.matchAll(/^\s*-\s+id:\s+(.+)$/gm)].map((match) => match[1]);

    expect(first).toEqual({ status: "created", path: filePath });
    expect(second).toEqual({ status: "merged", path: filePath });
    expect(secondModelIds).toEqual(firstModelIds);
    expect(secondText).toContain("apiKey: AIAND_API_KEY");
  });
});
