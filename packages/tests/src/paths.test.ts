import path from "node:path";
import { describe, expect, test } from "vitest";
import { aiandrelayHome, isProcessAlive } from "@aiandrelay/cli/dist/lib/paths.js";

describe("paths.ts - single source of truth for home + liveness (#7)", () => {
  test("aiandrelayHome honors AIANDRELAY_HOME env", () => {
    const original = process.env.AIANDRELAY_HOME;
    process.env.AIANDRELAY_HOME = "/tmp/aiandrelay-test-home-xyz";
    try {
      expect(aiandrelayHome()).toBe("/tmp/aiandrelay-test-home-xyz");
    } finally {
      if (original === undefined) delete process.env.AIANDRELAY_HOME;
      else process.env.AIANDRELAY_HOME = original;
    }
  });

  test("aiandrelayHome falls back to ~/.aiandrelay when env unset", () => {
    const original = process.env.AIANDRELAY_HOME;
    delete process.env.AIANDRELAY_HOME;
    try {
      const home = aiandrelayHome();
      expect(home.endsWith(`${path.sep}.aiandrelay`)).toBe(true);
    } finally {
      if (original !== undefined) process.env.AIANDRELAY_HOME = original;
    }
  });

  test("isProcessAlive returns false for a dead pid (ESRCH)", () => {
    // pid 0 is never a valid kill target on unix; use a very large unused pid.
    expect(isProcessAlive(999_999_999)).toBe(false);
  });

  test("isProcessAlive returns true for the current process", () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });
});
