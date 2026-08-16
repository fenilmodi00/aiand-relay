/**
 * Offline catalog snapshot + catalog adapter seams (SPEC §4 / §5 / §6).
 */
import { describe, expect, it } from "vitest";
import {
  AIAND_BASE_URL,
  DEEPSEEK_V4_FLASH,
  GLM_5_2,
  KIMI_K2_7_CODE,
  MOTIF_3,
  SELECTABLE_MODELS,
  VISION_MODELS,
  buildCatalog,
  mapReasoningEffortForModel,
  type AiandApiModel,
} from "@aiandrelay/models";
import { applyAiandChatWire, defaultWireReasoningEffort } from "../../../cli/src/lib/chat-wire.js";
import { loadEnvFile } from "../../../cli/src/lib/load-env.js";
import { resolveAiandBaseUrl } from "../../../cli/src/lib/aiand-core.js";
import { remapClaudeStockTier, resolveClaudeModel } from "../../../cli/src/lib/claude/defaults.js";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("ai& catalog adapter", () => {
  it("defaults base URL to api.aiand.com/v1", () => {
    expect(AIAND_BASE_URL).toBe("https://api.aiand.com/v1");
    expect(resolveAiandBaseUrl({})).toBe(AIAND_BASE_URL);
  });

  it("builds models from capabilities / context_window / per-1M prices", () => {
    const rows: AiandApiModel[] = [
      {
        id: "zai-org/glm-5.2",
        context_window: 1_048_576,
        capabilities: ["reasoning", "tool_calling"],
        reasoning_efforts: ["none", "high", "max"],
        input_per_1m: "160",
        output_per_1m: "650",
        cached_input_per_1m: "40",
      },
      {
        id: "google/gemma-4-31b-it",
        context_window: 262_144,
        capabilities: ["vision", "tool_calling"],
        reasoning_efforts: ["none", "high"],
        input_per_1m: "30",
        output_per_1m: "80",
      },
    ];
    const catalog = buildCatalog(rows);
    expect(catalog.defaultModel.id).toBe("zai-org/glm-5.2");
    expect(catalog.byId.get("zai-org/glm-5.2")?.cost.input).toBe(160);
    expect(catalog.byId.get("zai-org/glm-5.2")?.anthropicAlias).toBe("aiand-glm-5-2");
    expect(catalog.vision[0]?.id).toBe("google/gemma-4-31b-it");
  });

  it("ships snapshot with glm-5.2 default and curated vision order", () => {
    expect(GLM_5_2.id).toBe("zai-org/glm-5.2");
    expect(SELECTABLE_MODELS[0]?.id).toBe("zai-org/glm-5.2");
    expect(VISION_MODELS[0]?.id).toBe("moonshotai/kimi-k2.7-code");
    expect(MOTIF_3.id).toBe("motif-technologies/motif-3");
    expect(DEEPSEEK_V4_FLASH.anthropicAlias).toBe("aiand-deepseek-v4-flash");
    expect(KIMI_K2_7_CODE.attachment).toBe(true);
  });
});

describe("chat wire policy", () => {
  it("strips chat_template_kwargs and rewrites max_tokens", () => {
    const wired = applyAiandChatWire(
      {
        model: GLM_5_2.id,
        max_tokens: 100,
        chat_template_kwargs: { clear_thinking: true },
        reasoning_effort: "low",
      },
      { modelDefinition: GLM_5_2 },
    );
    expect(wired.chat_template_kwargs).toBeUndefined();
    expect(wired.max_tokens).toBeUndefined();
    expect(wired.max_completion_tokens).toBe(100);
    expect(wired.reasoning_effort).toBe("none");
  });

  it("maps effort enums and catalog-gates", () => {
    expect(mapReasoningEffortForModel(GLM_5_2, "medium")).toBe("high");
    expect(mapReasoningEffortForModel(GLM_5_2, "xhigh")).toBe("max");
    // kimi-k2.7-code only allows high
    expect(mapReasoningEffortForModel(KIMI_K2_7_CODE, "none")).toBeUndefined();
    expect(mapReasoningEffortForModel(KIMI_K2_7_CODE, "high")).toBe("high");
    expect(defaultWireReasoningEffort(GLM_5_2, undefined)).toBe("none");
  });

  it("prefers existing max_completion_tokens when both present", () => {
    const wired = applyAiandChatWire({
      max_tokens: 10,
      max_completion_tokens: 99,
    });
    expect(wired.max_completion_tokens).toBe(99);
    expect(wired.max_tokens).toBeUndefined();
  });

  it("wires default reasoning_effort none when unset and model accepts it", () => {
    const wired = applyAiandChatWire(
      { model: GLM_5_2.id, max_completion_tokens: 50 },
      { modelDefinition: GLM_5_2 },
    );
    expect(wired.reasoning_effort).toBe("none");
  });
});

describe("env loader", () => {
  it("loads AIAND_API_KEY only and never NEBIUS_*", () => {
    const dir = mkdtempSync(join(tmpdir(), "aiandrelay-env-"));
    writeFileSync(
      join(dir, ".env"),
      "AIAND_API_KEY=aiand-secret\nNEBIUS_API_KEY=nebius-secret\nTAVILY_API_KEY=tvly\n",
    );
    delete process.env.AIAND_API_KEY;
    delete process.env.NEBIUS_API_KEY;
    delete process.env.TAVILY_API_KEY;
    loadEnvFile(dir);
    expect(process.env.AIAND_API_KEY).toBe("aiand-secret");
    expect(process.env.NEBIUS_API_KEY).toBeUndefined();
    expect(process.env.TAVILY_API_KEY).toBeUndefined();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("Claude stock tier remap", () => {
  it("maps haiku/sonnet/opus onto curated slots", () => {
    expect(remapClaudeStockTier("claude-haiku-4-5")?.definition.id).toBe(KIMI_K2_7_CODE.id);
    expect(remapClaudeStockTier("claude-opus-4")?.definition.id).toBe(GLM_5_2.id);
    expect(remapClaudeStockTier("claude-sonnet-4")?.definition.id).toBe(MOTIF_3.id);
    expect(resolveClaudeModel("aiand-glm-5-2").definition.id).toBe(GLM_5_2.id);
  });

  it("hard-errors unknown non-stock models", () => {
    expect(() => resolveClaudeModel("claude-mystery-9000")).toThrow(/Unsupported Claude model/);
    expect(() => resolveClaudeModel("totally-unknown-model")).toThrow(/Unsupported Claude model/);
  });
});
