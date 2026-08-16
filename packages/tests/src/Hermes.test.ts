import { afterAll, beforeAll, describe, test } from "vitest";
import { cleanupTmpDir, createTestContext, resetTmpDir } from "./context.js";
import { hermesScenarios } from "./harnesses/hermes.js";
import type { TestContext } from "./types.js";

describe("Hermes Agent live headless gauntlet", () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await createTestContext();
    await resetTmpDir(context);
  });

  afterAll(async () => {
    await cleanupTmpDir(context);
  });

  for (const scenario of hermesScenarios()) {
    test(scenario.name, async () => {
      await scenario.run(context);
    });
  }
});
