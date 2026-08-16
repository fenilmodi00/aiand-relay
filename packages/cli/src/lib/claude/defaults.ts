import {
  GLM_5_2,
  GLM_5_2_ANTHROPIC_CAPABILITIES,
  KIMI_K2_7_CODE,
  MOTIF_3,
  getDefaultModel,
  getSelectableModels,
  resolveModelByKeys,
  type ModelDefinition,
} from "@aiandrelay/models";

export const CLAUDE_LOCAL_PROXY_HOST = "127.0.0.1";
export const CLAUDE_MODEL_CAPABILITIES = GLM_5_2_ANTHROPIC_CAPABILITIES;

export type ClaudeModelSelection = {
  alias: string;
  definition: ModelDefinition;
};

export const CLAUDE_HAIKU_MODEL = KIMI_K2_7_CODE;
export const CLAUDE_HAIKU_MODEL_SELECTION: ClaudeModelSelection = {
  alias: CLAUDE_HAIKU_MODEL.anthropicAlias ?? CLAUDE_HAIKU_MODEL.id,
  definition: CLAUDE_HAIKU_MODEL,
};

/** Sonnet stock tier → curated secondary (not primary, not haiku). */
export const CLAUDE_SECONDARY_MODEL = MOTIF_3;
export const CLAUDE_SECONDARY_MODEL_SELECTION: ClaudeModelSelection = {
  alias: CLAUDE_SECONDARY_MODEL.anthropicAlias ?? CLAUDE_SECONDARY_MODEL.id,
  definition: CLAUDE_SECONDARY_MODEL,
};

/**
 * Claude-routable models = every model in the live ai& catalog plus the
 * lightweight Haiku-tier backend Claude Code uses for built-in exploration
 * subagents. Read from the dynamic catalog so it tracks what ai& serves.
 * Models without a friendly Anthropic alias use their ai& id directly.
 */
export function getClaudeSupportedModels(): readonly ClaudeModelSelection[] {
  const selectable = getSelectableModels().map((definition) => ({
    alias: definition.anthropicAlias ?? definition.id,
    definition,
  }));
  const hasHaiku = selectable.some(
    (model) => model.definition.id === CLAUDE_HAIKU_MODEL_SELECTION.definition.id,
  );
  return hasHaiku ? selectable : [...selectable, CLAUDE_HAIKU_MODEL_SELECTION];
}

function primarySelection(): ClaudeModelSelection {
  const def = getDefaultModel();
  return { alias: def.anthropicAlias ?? def.id, definition: def };
}

/**
 * Remap Claude Code stock tier names (and dated variants) onto curated slots.
 * Unknown non-stock requests hard-error in resolveClaudeModel.
 */
export function remapClaudeStockTier(value: string): ClaudeModelSelection | undefined {
  const v = value.toLowerCase();
  const looksStock =
    v === "haiku" ||
    v === "sonnet" ||
    v === "opus" ||
    v.includes("haiku") ||
    v.includes("sonnet") ||
    v.includes("opus") ||
    /^claude[-_]/.test(v);
  if (!looksStock) {
    return undefined;
  }
  if (v.includes("haiku")) {
    return CLAUDE_HAIKU_MODEL_SELECTION;
  }
  if (v.includes("opus")) {
    return primarySelection();
  }
  if (v.includes("sonnet")) {
    return CLAUDE_SECONDARY_MODEL_SELECTION;
  }
  // Bare "claude-*" without a recognizable tier — hard-error upstream.
  return undefined;
}

export function resolveClaudeModel(value: string | undefined): ClaudeModelSelection {
  const supported = getClaudeSupportedModels();
  if (supported.length === 0) {
    throw new Error("No Claude models are configured.");
  }

  if (value) {
    const stock = remapClaudeStockTier(value);
    if (stock) {
      return stock;
    }
  }

  const found = resolveModelByKeys(
    supported.map((model) => model.definition),
    value,
    [(model) => model.anthropicAlias, (model) => model.id],
    getDefaultModel().id,
  );
  if (!found) {
    const expected = supported
      .map(
        (model) =>
          `${model.definition.anthropicAlias ?? model.definition.id} (${model.definition.id})`,
      )
      .join(", ");
    throw new Error(`Unsupported Claude model "${value}". Expected one of: ${expected}.`);
  }
  return { alias: found.anthropicAlias ?? found.id, definition: found };
}

/** Snapshot default used by some tests. */
export const CLAUDE_PRIMARY_MODEL = GLM_5_2;
