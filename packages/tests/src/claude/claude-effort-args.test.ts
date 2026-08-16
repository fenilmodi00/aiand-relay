import { afterEach, describe, expect, test, vi } from "vitest";
import { buildClaudeLaunchArgs } from "../../../cli/src/lib/claude/core.js";

describe("claudeEffortArgs via buildClaudeLaunchArgs", () => {
  afterEach(() => vi.unstubAllEnvs());

  test("does not inject --effort when AIANDRELAY_REASONING_EFFORT unset", () => {
    vi.stubEnv("AIANDRELAY_REASONING_EFFORT", "");
    const args = buildClaudeLaunchArgs([], "token");
    expect(args.includes("--effort")).toBe(false);
  });

  test("does not inject --effort when env is none", () => {
    vi.stubEnv("AIANDRELAY_REASONING_EFFORT", "none");
    const args = buildClaudeLaunchArgs([], "token");
    expect(args.includes("--effort")).toBe(false);
  });

  test("injects explicit high", () => {
    vi.stubEnv("AIANDRELAY_REASONING_EFFORT", "high");
    const args = buildClaudeLaunchArgs([], "token");
    const effortIndex = args.indexOf("--effort");
    expect(effortIndex).toBeGreaterThanOrEqual(0);
    expect(args[effortIndex + 1]).toBe("high");
  });

  test("respects user --effort", () => {
    vi.stubEnv("AIANDRELAY_REASONING_EFFORT", "high");
    const args = buildClaudeLaunchArgs(["--effort", "max"], "token");
    expect(args.filter((a) => a === "--effort" || a === "high")).not.toContain("high");
  });
});
