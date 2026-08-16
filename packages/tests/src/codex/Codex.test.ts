import { afterAll, beforeAll, describe, test } from "vitest";
import { cleanupTmpDir, createTestContext, resetTmpDir } from "../shared/context.js";
import { codexScenarios } from "./scenarios.js";
import type { TestContext } from "../shared/types.js";

describe("Codex live headless gauntlet", () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await createTestContext();
    await resetTmpDir(context);
  });

  afterAll(async () => {
    await cleanupTmpDir(context);
  });

  for (const scenario of codexScenarios()) {
    test(scenario.name, async () => {
      await scenario.run(context);
    });
  }
});
