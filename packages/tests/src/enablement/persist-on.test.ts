import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { engineOff, engineOn } from "../../../cli/src/lib/enablement/engine.js";
import { applyNativeCodexBlock } from "../../../cli/src/lib/codex/persist.js";
import { locateOpencodeGlobalConfigFile } from "../../../cli/src/lib/opencode/user-config.js";

const homes: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

describe("persist enablement", () => {
  test("opencode on writes config and off restores comments", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "aiandrelay-on-"));
    homes.push(home);
    vi.stubEnv("XDG_CONFIG_HOME", path.join(home, "xdg-config"));
    vi.stubEnv("XDG_DATA_HOME", path.join(home, "xdg-data"));
    const configDir = path.join(home, "xdg-config", "opencode");
    await mkdir(configDir, { recursive: true });
    const configPath = path.join(configDir, "opencode.json");
    const original = "{\n  // keep\n  \"$schema\": \"https://opencode.ai/config.json\"\n}\n";
    await import("node:fs/promises").then((fs) => fs.writeFile(configPath, original, "utf8"));

    await engineOn("opencode", { home, apiKey: "sk-test" });
    const located = locateOpencodeGlobalConfigFile({ home, env: process.env });
    const afterOn = await readFile(located.filePath, "utf8");
    expect(afterOn).toContain("aiand");
    expect(afterOn).toContain("provider");

    await engineOff("opencode", { home });
    expect(await readFile(configPath, "utf8")).toBe(original);
  });
});

describe("codex native block", () => {
  test("loopback block never points at api.aiand.com", () => {
    const next = applyNativeCodexBlock("", {
      modelId: "deepseek-ai/deepseek-v4-flash",
      baseUrl: "http://127.0.0.1:7878/v1",
      apiKey: "tok",
      catalogPath: "/tmp/catalog.json",
    });
    expect(next).toContain("127.0.0.1");
    expect(next).not.toContain("api.aiand.com");
  });
});
