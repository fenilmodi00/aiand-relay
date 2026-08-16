import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import { AIAND_DOCS_URL, ensureApiKeyInteractive } from "../../cli/src/lib/ensure-api-key.js";
import { readGlobalConfig, resolveStoredApiKey } from "../../cli/src/lib/global-config.js";

const temporaryHomes: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    temporaryHomes.splice(0).map((home) => rm(home, { recursive: true, force: true })),
  );
});

async function tempHome(): Promise<string> {
  const home = await mkdtemp(path.join(os.tmpdir(), "aiandrelay-ensure-key-"));
  temporaryHomes.push(home);
  return home;
}

function mockPrompts(overrides: {
  selectValues?: Array<"enter" | "docs" | symbol>;
  passwordValue?: string | symbol;
}) {
  const selectValues = [...(overrides.selectValues ?? ["enter"])];
  return {
    select: vi.fn(async () => selectValues.shift() ?? "enter"),
    password: vi.fn(async () => overrides.passwordValue ?? "aiand-test-key"),
    isCancel: (v: unknown) => typeof v === "symbol",
    cancel: vi.fn(),
    log: { info: vi.fn(), success: vi.fn(), warn: vi.fn() },
  };
}

describe("ensureApiKeyInteractive", () => {
  test("returns true without prompting when AIAND_API_KEY is set", async () => {
    const home = await tempHome();
    vi.stubEnv("AIAND_API_KEY", "from-env");
    const prompts = mockPrompts({});
    const ok = await ensureApiKeyInteractive({
      home,
      interactive: true,
      prompts,
    });
    expect(ok).toBe(true);
    expect(prompts.select).not.toHaveBeenCalled();
  });

  test("returns false without prompting when non-interactive and key missing", async () => {
    const home = await tempHome();
    vi.stubEnv("AIAND_API_KEY", "");
    const prompts = mockPrompts({});
    const ok = await ensureApiKeyInteractive({
      home,
      interactive: false,
      prompts,
    });
    expect(ok).toBe(false);
    expect(prompts.select).not.toHaveBeenCalled();
  });

  test("saves entered key and sets env when interactive", async () => {
    const home = await tempHome();
    vi.stubEnv("AIAND_API_KEY", "");
    const prompts = mockPrompts({
      selectValues: ["enter"],
      passwordValue: "  aiand-saved-key  ",
    });
    const ok = await ensureApiKeyInteractive({ home, interactive: true, prompts });
    expect(ok).toBe(true);
    expect(process.env.AIAND_API_KEY).toBe("aiand-saved-key");
    const stored = (await readGlobalConfig(home)).apiKey;
    expect(resolveStoredApiKey(stored)).toBe("aiand-saved-key");
  });

  test("opens docs then accepts key on next select", async () => {
    const home = await tempHome();
    vi.stubEnv("AIAND_API_KEY", "");
    const openDocs = vi.fn(async () => true);
    const prompts = mockPrompts({
      selectValues: ["docs", "enter"],
      passwordValue: "after-docs-key",
    });
    const ok = await ensureApiKeyInteractive({
      home,
      interactive: true,
      prompts,
      openDocs,
    });
    expect(ok).toBe(true);
    expect(openDocs).toHaveBeenCalledWith(AIAND_DOCS_URL);
    expect(process.env.AIAND_API_KEY).toBe("after-docs-key");
  });

  test("returns false when user cancels select", async () => {
    const home = await tempHome();
    vi.stubEnv("AIAND_API_KEY", "");
    const cancelSymbol = Symbol("cancel");
    const prompts = mockPrompts({ selectValues: [cancelSymbol] });
    const ok = await ensureApiKeyInteractive({ home, interactive: true, prompts });
    expect(ok).toBe(false);
    expect(prompts.cancel).toHaveBeenCalled();
  });
});
