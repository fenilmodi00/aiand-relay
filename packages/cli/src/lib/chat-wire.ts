import { mapReasoningEffortForModel, type ModelDefinition } from "@aiandrelay/models";

/**
 * Shared OpenAI chat-completions wire policy for ai& (SPEC §5):
 * - always strip `chat_template_kwargs`
 * - rewrite `max_tokens` → `max_completion_tokens` (prefer existing max_completion_tokens)
 * - map + catalog-gate `reasoning_effort`
 */

export type ChatWireOptions = {
  modelDefinition?: ModelDefinition | undefined;
};

/**
 * Mutate (or return a shallow copy of) a chat-completions payload for ai& wire.
 */
export function applyAiandChatWire(
  payload: Record<string, unknown>,
  options: ChatWireOptions = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...payload };
  delete out.chat_template_kwargs;

  if (out.max_tokens !== undefined) {
    if (out.max_completion_tokens === undefined) {
      out.max_completion_tokens = out.max_tokens;
    }
    delete out.max_tokens;
  }

  const model = options.modelDefinition;
  if (model) {
    const raw = typeof out.reasoning_effort === "string" ? out.reasoning_effort : "none";
    const mapped = mapReasoningEffortForModel(model, raw);
    if (mapped) {
      out.reasoning_effort = mapped;
    } else {
      delete out.reasoning_effort;
    }
  }

  return out;
}

/** Default product effort when unset/invalid: wire `"none"` (catalog-gated). */
export function defaultWireReasoningEffort(
  model: ModelDefinition,
  envValue = process.env.AIANDRELAY_REASONING_EFFORT,
): string | undefined {
  const trimmed = envValue?.trim();
  if (trimmed) {
    const mapped = mapReasoningEffortForModel(model, trimmed);
    if (mapped) return mapped;
  }
  return mapReasoningEffortForModel(model, "none");
}
