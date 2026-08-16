import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import { runConfigure } from "../../cli/src/lib/commands/global.js";
import { readGlobalConfig, resolveStoredApiKey } from "../../cli/src/lib/global-config.js";

const temporaryHomes: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    temporaryHomes.splice(0).map((home) => rm(home, { recursive: true, force: true })),
  );
});

describe("aiandrelay configure", () => {
  test("persists AIAND_API_KEY from the environment into ~/.aiandrelay", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "aiandrelay-configure-"));
    temporaryHomes.push(home);
    vi.stubEnv("AIAND_API_KEY", "aiand-test-key");

    await runConfigure(home);

    vi.stubEnv("AIAND_API_KEY", "");
    const stored = (await readGlobalConfig(home)).apiKey;

    expect(stored).toBe("aiand-test-key");
    expect(resolveStoredApiKey(stored)).toBe("aiand-test-key");
  });
});
