import { describe, expect, test } from "vitest";
import { buildCatalog, type AiandApiModel } from "../../../models/src/index.js";

function row(id: string, caps: string[]): AiandApiModel {
  return {
    id,
    name: id,
    capabilities: caps,
    context_window: 128000,
    input_per_1m: 1,
    output_per_1m: 1,
  };
}

describe("vision failover order", () => {
  test("uses only SPEC ordered ids and skips missing", () => {
    const catalog = buildCatalog([
      row("zai-org/glm-5.2", ["chat", "reasoning", "tool_calling"]),
      row("moonshotai/kimi-k2.7-code", ["chat", "vision", "tool_calling"]),
      row("google/gemma-4-31b-it", ["chat", "vision"]),
      row("qwen/qwen3.6-27b", ["chat", "vision"]), // must NOT append
    ]);
    expect(catalog.vision.map((m) => m.id)).toEqual([
      "moonshotai/kimi-k2.7-code",
      "google/gemma-4-31b-it",
    ]);
  });

  test("inserts kimi-k2.6 when present", () => {
    const catalog = buildCatalog([
      row("moonshotai/kimi-k2.7-code", ["vision", "chat"]),
      row("moonshotai/kimi-k2.6", ["vision", "chat"]),
      row("google/gemma-4-31b-it", ["vision", "chat"]),
    ]);
    expect(catalog.vision.map((m) => m.id)).toEqual([
      "moonshotai/kimi-k2.7-code",
      "moonshotai/kimi-k2.6",
      "google/gemma-4-31b-it",
    ]);
  });
});
