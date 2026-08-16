import { describe, expect, it } from "vitest";
import {
  DEEPSEEK_V4_FLASH,
  DEEPSEEK_V4_PRO,
  GLM_5_2,
  KIMI_K2_7_CODE,
  SELECTABLE_MODELS,
  buildCatalog,
  resolveModelByKeys,
  type ModelDefinition,
} from "@aiandrelay/models";

// Unit tests for the shared model-selection mechanism. The per-harness
// wrappers (resolveClaudeModel / resolveCodexModel) are thin policy over this
// pure helper, and the live gauntlet never exercises `--main`, so this is the
// only place the resolution algorithm is asserted today.

describe("resolveModelByKeys", () => {
  // Claude matches by alias OR id; mirrors the key set in resolveClaudeModel.
  const aliasAndId: ReadonlyArray<(model: ModelDefinition) => string | null | undefined> = [
    (model) => model.anthropicAlias,
    (model) => model.id,
  ];
  const byId: ReadonlyArray<(model: ModelDefinition) => string | null | undefined> = [
    (model) => model.id,
  ];

  it("returns the default model when no value is given", () => {
    expect(resolveModelByKeys(SELECTABLE_MODELS, undefined, aliasAndId, GLM_5_2.id)?.id).toBe(
      GLM_5_2.id,
    );
  });

  it("returns the default model when the value is empty", () => {
    expect(resolveModelByKeys(SELECTABLE_MODELS, "", aliasAndId, GLM_5_2.id)?.id).toBe(GLM_5_2.id);
  });

  it("matches by id", () => {
    expect(
      resolveModelByKeys(SELECTABLE_MODELS, KIMI_K2_7_CODE.id, aliasAndId, GLM_5_2.id)?.id,
    ).toBe(KIMI_K2_7_CODE.id);
  });

  it("matches by alias", () => {
    expect(
      resolveModelByKeys(
        SELECTABLE_MODELS,
        GLM_5_2.anthropicAlias ?? undefined,
        aliasAndId,
        GLM_5_2.id,
      )?.id,
    ).toBe(GLM_5_2.id);
  });

  it("includes DeepSeek V4 Flash and Pro aliases with long-context limits", () => {
    expect(DEEPSEEK_V4_FLASH.anthropicAlias).toBe("aiand-deepseek-v4-flash");
    expect(DEEPSEEK_V4_FLASH.limit.context).toBe(1_048_576);
    expect(DEEPSEEK_V4_FLASH.limit.output).toBe(384_000);
    expect(DEEPSEEK_V4_PRO.anthropicAlias).toBe("aiand-deepseek-v4-pro");
    expect(DEEPSEEK_V4_PRO.limit.context).toBe(1_048_576);
    expect(DEEPSEEK_V4_PRO.limit.output).toBe(384_000);
  });

  it("builds catalog rows from ai& field names", () => {
    const catalog = buildCatalog([
      {
        id: "example/only-live-model",
        name: "Only Live Model",
        context_window: 8000,
        capabilities: ["chat", "tool_calling"],
        input_per_1m: "0.1",
        output_per_1m: "0.2",
      },
      {
        id: DEEPSEEK_V4_FLASH.id,
        context_window: 1_048_576,
        capabilities: ["reasoning", "tool_calling"],
        input_per_1m: "25",
        output_per_1m: "40",
      },
    ]);

    expect(catalog.byId.has("example/only-live-model")).toBe(true);
    expect(catalog.byId.get(DEEPSEEK_V4_FLASH.id)?.limit.context).toBe(1_048_576);
    expect(catalog.byId.get(DEEPSEEK_V4_FLASH.id)?.anthropicAlias).toBe("aiand-deepseek-v4-flash");
  });

  it("returns undefined when the value matches no model", () => {
    expect(
      resolveModelByKeys(SELECTABLE_MODELS, "no/such-model", aliasAndId, GLM_5_2.id),
    ).toBeUndefined();
  });

  it("falls back to the first list entry when defaultId is not in the list", () => {
    expect(resolveModelByKeys(SELECTABLE_MODELS, undefined, byId, "no/such-id")?.id).toBe(
      SELECTABLE_MODELS[0]?.id,
    );
  });

  it("returns undefined for an empty list", () => {
    expect(resolveModelByKeys([], undefined, byId, GLM_5_2.id)).toBeUndefined();
  });
});
