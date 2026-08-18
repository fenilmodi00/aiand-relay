import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { AIAND_BASE_URL } from "../../../cli/src/lib/aiand-core.js";
import {
  injectPrimeUserConfig,
  isPrimePresent,
  primeAuthJsonPath,
  primeConfigDir,
  upsertPrimeAuth,
} from "../../../cli/src/lib/prime/user-config.js";

const temporaryDirs: string[] = [];

async function tempHome(): Promise<string> {
  const home = await mkdtemp(path.join(os.tmpdir(), "aiandrelay-prime-user-config-"));
  temporaryDirs.push(home);
  return home;
}

afterEach(async () => {
  await Promise.all(temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("Prime native injection adapter", () => {
  test("resolves presence and native file paths from home", async () => {
    const home = await tempHome();
    expect(primeConfigDir(home)).toBe(path.join(home, ".prime", "agent"));
    expect(primeAuthJsonPath(home)).toBe(path.join(home, ".prime", "agent", "auth.json"));

    expect(isPrimePresent(home, false)).toBe(false);
    await mkdir(primeConfigDir(home), { recursive: true });
    expect(isPrimePresent(home, false)).toBe(true);
    expect(isPrimePresent(home, true)).toBe(true);
  });

  test("creates models.json with aiand provider config", async () => {
    const home = await tempHome();

    const result = await injectPrimeUserConfig(home);
    const filePath = path.join(primeConfigDir(home), "models.json");

    expect(result).toEqual({ status: "created", path: filePath });
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as {
      providers: Record<string, Record<string, unknown>>;
    };
    expect(Object.keys(parsed.providers)).toEqual(["aiand"]);
    expect(parsed.providers.aiand.baseUrl).toBe(AIAND_BASE_URL);
    expect(parsed.providers.aiand.api).toBe("openai-completions");
    expect(parsed.providers.aiand.apiKey).toBe("configured-via-auth-json");
  });

  test("merges aiand beside sibling providers and stays idempotent on rerun", async () => {
    const home = await tempHome();
    const filePath = path.join(primeConfigDir(home), "models.json");
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      `${JSON.stringify({ providers: { other: { api: "existing", keep: true } } }, null, 2)}\n`,
      "utf8",
    );

    const created = await injectPrimeUserConfig(home);
    expect(created).toEqual({ status: "created", path: filePath });

    const afterFirst = await readFile(filePath, "utf8");
    const firstParsed = JSON.parse(afterFirst) as {
      providers: Record<string, Record<string, unknown>>;
    };
    expect(firstParsed.providers.other).toEqual({ api: "existing", keep: true });
    expect(firstParsed.providers.aiand.baseUrl).toBe(AIAND_BASE_URL);

    const merged = await injectPrimeUserConfig(home);
    expect(merged).toEqual({ status: "merged", path: filePath });
    await expect(readFile(filePath, "utf8")).resolves.toBe(afterFirst);
  });

  test("aborts on invalid models.json without changing bytes", async () => {
    const home = await tempHome();
    const filePath = path.join(primeConfigDir(home), "models.json");
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, "{bad", "utf8");

    await expect(injectPrimeUserConfig(home)).resolves.toEqual({
      status: "aborted",
      path: filePath,
      reason: "invalid-json",
    });
    await expect(readFile(filePath, "utf8")).resolves.toBe("{bad");
  });

  test("creates and updates auth.json while preserving sibling credentials", async () => {
    const home = await tempHome();
    const authPath = primeAuthJsonPath(home);

    await expect(upsertPrimeAuth(home, "sk-prime-one")).resolves.toEqual({
      status: "created",
      path: authPath,
    });
    expect(JSON.parse(await readFile(authPath, "utf8"))).toEqual({
      aiand: { type: "api_key", key: "sk-prime-one" },
    });

    await writeFile(
      authPath,
      `${JSON.stringify({ other: { type: "api_key", key: "keep" } }, null, 2)}\n`,
      "utf8",
    );
    await expect(upsertPrimeAuth(home, "sk-prime-two")).resolves.toEqual({
      status: "updated",
      path: authPath,
    });
    expect(JSON.parse(await readFile(authPath, "utf8"))).toEqual({
      other: { type: "api_key", key: "keep" },
      aiand: { type: "api_key", key: "sk-prime-two" },
    });
  });
});
