import { describe, expect, test } from "vitest";
import {
  formatUsageReport,
  parseUsageWindowMs,
  summarizeUsage,
  type UsageSummary,
} from "../../../cli/src/lib/usage-report.js";
import type { TrackedUsageSession } from "../../../cli/src/lib/daemon/storage.js";

describe("parseUsageWindowMs", () => {
  test("parses minute, hour, day, and week windows", () => {
    expect(parseUsageWindowMs("30m")).toBe(30 * 60_000);
    expect(parseUsageWindowMs("24h")).toBe(24 * 3_600_000);
    expect(parseUsageWindowMs("7d")).toBe(7 * 86_400_000);
    expect(parseUsageWindowMs("4w")).toBe(4 * 604_800_000);
  });

  test("rejects empty or unparseable values", () => {
    expect(parseUsageWindowMs(undefined)).toBeUndefined();
    expect(parseUsageWindowMs("")).toBeUndefined();
    expect(parseUsageWindowMs("7")).toBeUndefined();
    expect(parseUsageWindowMs("0d")).toBeUndefined();
    expect(parseUsageWindowMs("-1h")).toBeUndefined();
  });
});

describe("summarizeUsage", () => {
  test("aggregates totals and ranks by cost", () => {
    const sessions: TrackedUsageSession[] = [
      {
        agent: "codex",
        modelId: "a",
        modelName: "Model A",
        promptTokens: 100,
        cachedTokens: 10,
        completionTokens: 20,
        costUsd: 0.02,
        endedAt: 2,
      },
      {
        agent: "claude",
        modelId: "b",
        modelName: "Model B",
        promptTokens: 50,
        cachedTokens: 0,
        completionTokens: 5,
        costUsd: 0.05,
        endedAt: 1,
      },
      {
        agent: "codex",
        modelId: "a",
        modelName: "Model A",
        promptTokens: 25,
        cachedTokens: 5,
        completionTokens: 5,
        costUsd: 0.01,
        endedAt: 3,
      },
    ];

    const summary = summarizeUsage(sessions, 0);
    expect(summary.sessions).toBe(3);
    expect(summary.costUsd).toBeCloseTo(0.08);
    expect(summary.promptTokens).toBe(175);
    expect(summary.cachedTokens).toBe(15);
    expect(summary.completionTokens).toBe(30);
    expect(summary.byModel.map((row) => row.model)).toEqual(["Model B", "Model A"]);
    expect(summary.byHarness.map((row) => row.agent)).toEqual(["claude", "codex"]);
    expect(summary.byHarness[1]?.sessions).toBe(2);
  });
});

describe("formatUsageReport", () => {
  test("explains empty windows", () => {
    const empty: UsageSummary = {
      sessions: 0,
      promptTokens: 0,
      cachedTokens: 0,
      completionTokens: 0,
      costUsd: 0,
      since: 0,
      byModel: [],
      byHarness: [],
    };
    const text = formatUsageReport(empty, "7d");
    expect(text).toContain("No completed sessions in the last 7d");
    expect(text).toContain("Usage is recorded when a session exits");
  });

  test("renders totals with local-only footer", () => {
    const summary = summarizeUsage(
      [
        {
          agent: "codex",
          modelId: "m",
          modelName: "Motif 3",
          promptTokens: 1000,
          cachedTokens: 100,
          completionTokens: 50,
          costUsd: 0.1234,
          endedAt: 1,
        },
      ],
      0,
    );
    const text = formatUsageReport(summary, "24h");
    expect(text).toContain("ai& Relay usage - last 24h");
    expect(text).toContain("1 session(s)");
    expect(text).toContain("Motif 3");
    expect(text).toContain("codex");
    expect(text).toContain("Local only - read from ~/.aiandrelay, never uploaded.");
  });
});
