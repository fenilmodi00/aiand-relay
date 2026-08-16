import { type ModelDefinition } from "@aiandrelay/models";
import { writeProxyDebugLog } from "../proxy-debug.js";
import { type ProxyPerfTracer } from "../proxy-perf.js";
import { CostTracker } from "../cost.js";
import {
  APPROX_CHARS_PER_TOKEN,
  applyEstimatedContextBudget,
  clampClaudeClientMaxTokens,
} from "./context-budget.js";
import {
  toOpenAIMessages,
  toOpenAIToolChoice,
  toOpenAITools,
  aiandReasoningEffort,
} from "./translate-request.js";
import { resolveTargetModel } from "./translate-response.js";
import { fetchAiand } from "./aiand-call.js";
import type { AnthropicMessagesRequest, OpenAIChatResponse } from "./wire-types.js";

type ClaudeChatOptions = {
  apiKey: string;
  baseUrl: string;
  modelId: string;
  targetModelId: string;
  modelDefinition: ModelDefinition;
  debug?: boolean | undefined;
  claudeCodeMaxOutputTokens?: number | undefined;
  claudeCodeMaxOutputTokensUserSet?: boolean | undefined;
  isCompactionRequest?: boolean | undefined;
  costTracker?: CostTracker | undefined;
  /** Raw byte length of the inbound Anthropic-JSON request body, from readJsonBodyWithSize. */
  rawBytes?: number | undefined;
};

export async function callAiandChatCompletions(
  body: AnthropicMessagesRequest,
  options: ClaudeChatOptions,
  signal?: AbortSignal,
  perf?: ProxyPerfTracer,
): Promise<OpenAIChatResponse> {
  const translated =
    perf?.spanSync("translate_request", () => {
      const targetModel = resolveTargetModel(body.model, options);
      const messages = toOpenAIMessages(body, targetModel.definition);
      const tools = toOpenAITools(body.tools, options);
      return { targetModel, messages, tools };
    }) ??
    (() => {
      const targetModel = resolveTargetModel(body.model, options);
      const messages = toOpenAIMessages(body, targetModel.definition);
      const tools = toOpenAITools(body.tools, options);
      return { targetModel, messages, tools };
    })();
  const { targetModel, messages, tools } = translated;

  const reasoningEffort = options.isCompactionRequest
    ? undefined
    : aiandReasoningEffort(body, targetModel.definition);
  const maxTokens = clampClaudeClientMaxTokens(body.max_tokens, targetModel.definition, options);
  const payload = {
    model: targetModel.definition.id,
    messages,
    max_tokens: maxTokens,
    stop: body.stop_sequences,
    temperature: body.temperature,
    tools,
    tool_choice: toOpenAIToolChoice(body.tool_choice),
    ...(options.isCompactionRequest
      ? { reasoning: { enabled: false } }
      : reasoningEffort
        ? { reasoning_effort: reasoningEffort }
        : {}),
    stream: false,
  };
  const estimatedInputTokens = estimateInputTokensFromRawBytes(options);
  applyEstimatedContextBudget(
    payload,
    targetModel.definition,
    options,
    "request",
    estimatedInputTokens,
  );
  debugLog(options, "aiand request", {
    model: payload.model,
    messageCount: payload.messages.length,
    toolCount: payload.tools?.length ?? 0,
    maxTokens: payload.max_tokens,
    reasoningEffort,
  });
  const response = await (perf?.span("upstream_fetch", () =>
    fetchAiand(payload, options, targetModel.definition, signal),
  ) ?? fetchAiand(payload, options, targetModel.definition, signal));

  if (!response.ok) {
    throw response.error;
  }
  const json = response.json;
  if (typeof payload.max_tokens === "number") {
    (
      json as OpenAIChatResponse & { _aiandrelayRequestedMaxTokens?: number }
    )._aiandrelayRequestedMaxTokens = payload.max_tokens;
  }
  const usage = json.usage;
  const promptTokens = usage?.prompt_tokens ?? 0;
  const completionTokens = usage?.completion_tokens ?? 0;
  const cachedTokens = usage?.prompt_tokens_details?.cached_tokens ?? usage?.cached_tokens ?? 0;
  const incrementalCost =
    options.costTracker?.addUsage(
      promptTokens,
      cachedTokens,
      completionTokens,
      targetModel.definition,
    ) ?? 0;
  debugLog(options, "aiand response", {
    id: json.id,
    choices: json.choices?.length ?? 0,
    finishReason: json.choices?.[0]?.finish_reason,
    usage: { promptTokens, completionTokens, cachedTokens },
    incrementalCostUsd: Number(incrementalCost.toFixed(6)),
    toolCalls: json.choices?.[0]?.message?.tool_calls?.map((toolCall) => ({
      name: toolCall.function?.name,
      argumentsPreview: toolCall.function?.arguments?.slice(0, 300),
    })),
  });
  return json;
}

function debugLog(
  options: ClaudeChatOptions,
  label: string,
  value: unknown | (() => unknown),
): void {
  writeProxyDebugLog("aiandrelay proxy", options, label, value);
}

/**
 * Estimate input tokens from the inbound request's raw byte length. Uses the
 * session costTracker's calibrated estimator when present; otherwise falls
 * back to rawBytes / APPROX_CHARS_PER_TOKEN (4). Returns a positive integer.
 * O(1) - no payload serialization.
 */
function estimateInputTokensFromRawBytes(options: ClaudeChatOptions): number {
  const rawBytes = options.rawBytes;
  if (typeof rawBytes !== "number" || rawBytes <= 0) {
    return 1;
  }
  if (options.costTracker) {
    return options.costTracker.tokenEstimator.estimate(rawBytes);
  }
  return Math.max(1, Math.ceil(rawBytes / APPROX_CHARS_PER_TOKEN));
}
