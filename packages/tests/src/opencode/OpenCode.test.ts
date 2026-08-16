import { afterAll, beforeAll, describe, test } from "vitest";
import { cleanupTmpDir, createTestContext, resetTmpDir } from "../shared/context.js";
import { opencodeScenarios } from "./scenarios.js";
import type { TestContext } from "../shared/types.js";

describe("OpenCode live headless gauntlet", () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await createTestContext();
    await resetTmpDir(context);
  });

  afterAll(async () => {
    await cleanupTmpDir(context);
  });

  for (const scenario of opencodeScenarios()) {
    test(scenario.name, async () => {
      await scenario.run(context);
    });
  }
});
