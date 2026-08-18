import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  injectPiUserConfig,
  isPiPresent,
  piAuthJsonPath,
  piConfigDir,
  piNativeUserConfig,
  upsertPiAuth,
} from "../../../cli/src/lib/pi/user-config.js";

const temporaryDirs: string[] = [];

async function tempHome(): Promise<string> {
  const home = await mkdtemp(path.join(os.tmpdir(), "aiandrelay-pi-user-config-"));
  temporaryDirs.push(home);
  return home;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("Pi native injection adapter", () => {
  test("exposes the Pi adapter contract and stable paths", async () => {
    const home = await tempHome();

    expect(piNativeUserConfig.harness).toBe("pi");
    expect(piConfigDir(home)).toBe(path.join(home, ".pi", "agent"));
    expect(piAuthJsonPath(home)).toBe(path.join(home, ".pi", "agent", "auth.json"));
    expect(piNativeUserConfig.isPresent({ home, env: {}, binaryPresent: true })).toBe(true);
  });

  test("detects Pi from PATH or the native config dir", async () => {
    const home = await tempHome();

    expect(isPiPresent(home, false)).toBe(false);
    await mkdir(piConfigDir(home), { recursive: true });
    expect(isPiPresent(home, false)).toBe(true);
    expect(piNativeUserConfig.isPresent({ home, env: {}, binaryPresent: true })).toBe(true);
  });

  test("merges models.json additively and stays idempotent on rerun", async () => {
    const home = await tempHome();
    const configPath = path.join(piConfigDir(home), "models.json");
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(
      configPath,
      `${JSON.stringify({ providers: { other: { api: "keep-me" } } }, null, 2)}\n`,
      "utf8",
    );

    await expect(piNativeUserConfig.injectUserConfig({ home, env: {} })).resolves.toEqual({
      status: "created",
      path: configPath,
    });

    const firstPass = JSON.parse(await readFile(configPath, "utf8")) as {
      providers: Record<string, { api?: string; baseUrl?: string; models?: unknown[] }>;
    };
    expect(firstPass.providers.other.api).toBe("keep-me");
    expect(firstPass.providers.aiand.api).toBe("openai-completions");
    expect(firstPass.providers.aiand.baseUrl).toContain("aiand");

    const afterFirstPass = await readFile(configPath, "utf8");
    await expect(injectPiUserConfig(home)).resolves.toEqual({
      status: "merged",
      path: configPath,
    });
    await expect(readFile(configPath, "utf8")).resolves.toBe(afterFirstPass);
  });

  test("upserts auth.json additively and stays idempotent on rerun", async () => {
    const home = await tempHome();
    const authPath = piAuthJsonPath(home);
    await mkdir(path.dirname(authPath), { recursive: true });
    await writeFile(
      authPath,
      `${JSON.stringify({ other: { type: "api_key", key: "keep" } }, null, 2)}\n`,
      "utf8",
    );

    await expect(
      piNativeUserConfig.persistAuth({ home, env: {}, apiKey: "sk-pi-one" }),
    ).resolves.toEqual({
      status: "updated",
      path: authPath,
    });
    expect(JSON.parse(await readFile(authPath, "utf8"))).toEqual({
      other: { type: "api_key", key: "keep" },
      aiand: { type: "api_key", key: "sk-pi-one" },
    });

    const afterFirstPass = await readFile(authPath, "utf8");
    await expect(upsertPiAuth(home, "sk-pi-one")).resolves.toEqual({
      status: "updated",
      path: authPath,
    });
    await expect(readFile(authPath, "utf8")).resolves.toBe(afterFirstPass);
  });

  test("aborts invalid models.json and auth.json without clobbering either file", async () => {
    const home = await tempHome();
    const configPath = path.join(piConfigDir(home), "models.json");
    const authPath = piAuthJsonPath(home);
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, "{bad", "utf8");
    await writeFile(authPath, "not json", "utf8");

    await expect(injectPiUserConfig(home)).resolves.toEqual({
      status: "aborted",
      path: configPath,
      reason: "invalid-json",
    });
    await expect(upsertPiAuth(home, "sk-pi")).resolves.toEqual({
      status: "aborted",
      path: authPath,
      reason: "invalid-json",
    });
    await expect(readFile(configPath, "utf8")).resolves.toBe("{bad");
    await expect(readFile(authPath, "utf8")).resolves.toBe("not json");
  });
});
