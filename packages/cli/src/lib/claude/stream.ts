import { randomUUID } from "node:crypto";
import { type ServerResponse } from "node:http";
import { type ModelDefinition, findModelById } from "@aiandrelay/models";
import { writeProxyDebugLog } from "../proxy-debug.js";
import { type ProxyPerfTracer } from "../proxy-perf.js";
import { writeSse } from "../sse.js";
import { postChatCompletionStream, AiandResponseHeaderTimeoutError } from "../aiand-client.js";
import {
  readAiandSseWithRetry,
  AiandSseIdleTimeoutError,
  AiandSsePrematureCloseError,
  AiandSseRetryResponseError,
} from "../aiand-stream.js";
import { CostTracker } from "../cost.js";
import {
  APPROX_CHARS_PER_TOKEN,
  applyEstimatedContextBudget,
  clampClaudeClientMaxTokens,
} from "./context-budget.js";
import { mapStopReason } from "./content-format.js";
import {
  toOpenAIMessages,
  toOpenAIToolChoice,
  toOpenAITools,
  aiandReasoningEffort,
} from "./translate-request.js";
import { resolveTargetModel, thinkingSignature } from "./translate-response.js";
import { mapAiandError, writeAnthropicError } from "./aiand-call.js";
import type { AnthropicMessagesRequest, StreamProxyResult } from "./wire-types.js";

type ClaudeStreamOptions = {
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

const CLAUDE_CODE_DEFAULT_MAX_OUTPUT_TOKENS = 32_000;
const CLAUDE_RESPONSE_OUTPUT_HEADROOM_TOKENS = 2_048;
const CLAUDE_THINKING_OUTPUT_MAX_TOKENS = 8_000;

export async function streamAnthropicFromAiand(
  res: ServerResponse,
  body: AnthropicMessagesRequest,
  options: ClaudeStreamOptions,
  signal?: AbortSignal,
  perf?: ProxyPerfTracer,
): Promise<StreamProxyResult> {
  // Translate the Anthropic request into the ai&/OpenAI chat payload once.
  // The body is extracted into a single local so the translate step is written
  // once and run through the perf tracer when present, or directly otherwise -
  // rather than duplicating the whole translation body across the spanSync and
  // fallback branches. Behavior is unchanged.
  const run = () => {
    const targetModel = resolveTargetModel(body.model, options);
    const messages = toOpenAIMessages(body, targetModel.definition);
    const tools = toOpenAITools(body.tools, options);
    const reasoningEffort = options.isCompactionRequest
      ? undefined
      : aiandReasoningEffort(body, targetModel.definition);
    const maxTokens = clampClaudeClientMaxTokens(body.max_tokens, targetModel.definition, options);
    return {
      targetModel,
      messages,
      tools,
      reasoningEffort,
      maxTokens,
    };
  };
  const translated = perf ? perf.spanSync("translate_request", run) : run();
  const { targetModel, messages, tools, reasoningEffort, maxTokens } = translated;

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
    stream: true,
    // Guarantee ai& sends a usage chunk at the end so cost tracking has
    // real token counts (without this, some streamed responses omit usage).
    stream_options: { include_usage: true },
  };
  // Estimate input tokens from the inbound raw byte length via the session's
  // calibrated estimator (or the rawBytes/4 fallback when there is no
  // costTracker), instead of re-serializing the translated payload. This makes
  // the budget check O(1) on the ~95% of turns far from the window.
  const estimatedInputTokens = estimateInputTokensFromRawBytes(options);
  applyEstimatedContextBudget(
    payload,
    targetModel.definition,
    options,
    "stream",
    estimatedInputTokens,
  );

  debugLog(options, "aiand stream request", {
    model: payload.model,
    messageCount: payload.messages.length,
    toolCount: payload.tools?.length ?? 0,
    maxTokens: payload.max_tokens,
    reasoningEffort,
  });

  // The ai& client owns both transient (429/503) and reactive context-fit
  // retries now, so this path just posts once and maps whatever comes back. A
  // context-length rejection is self-healed inside the client (max_tokens →
  // strip old images → trim text → drop oldest turns) before it ever surfaces.
  let response: Response;
  try {
    response = await postAiandStream(payload, options, signal, perf);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const timedOut = err instanceof AiandResponseHeaderTimeoutError;
    writeAnthropicError(
      res,
      timedOut ? 504 : 503,
      timedOut ? "timeout_error" : "overloaded_error",
      message,
    );
    return { ok: false, status: timedOut ? 504 : 503, error: message };
  }

  if (!response.ok) {
    const error = await mapAiandError(response);
    debugLog(options, "aiand stream error", {
      status: error.status,
      anthropicType: error.anthropicType,
      code: error.code,
      body: error.message.slice(0, 1000),
    });
    writeAnthropicError(res, error.anthropicStatus, error.anthropicType, error.message);
    return { ok: false, status: error.anthropicStatus, error: error.message };
  }
  if (!response.body) {
    const message = "ai& returned no stream body.";
    writeAnthropicError(res, 500, "api_error", message);
    return { ok: false, status: 500, error: message };
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders?.();
  res.socket?.setNoDelay(true);

  const messageId = `msg_${randomUUID().replaceAll("-", "")}`;
  const model = body.model ?? options.modelId;
  // Start the stream with an empty message; content blocks are added as the
  // upstream emits them. usage is filled in from the final usage chunk (or
  // stays 0 if ai& omits it despite include_usage).
  writeSse(res, "message_start", {
    type: "message_start",
    message: {
      id: messageId,
      type: "message",
      role: "assistant",
      model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    },
  });

  const blockManager = new StreamBlockManager(res, new StreamOutputBudget(options));
  let stopReason = "end_turn";
  let upstreamFinishReason: string | null = null;
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedTokens = 0;
  let streamAttempt = 0;

  try {
    for await (const eventData of readAiandSseWithRetry(
      response,
      () => postAiandStream(payload, options, signal, perf, "upstream_fetch_retry"),
      {
        isOutputStarted: () => blockManager.hasOutput(),
        onRetry: ({ attempt, maxRetries, timeoutMs }) =>
          debugLog(options, "retrying aiand stream after idle timeout", {
            attempt,
            maxRetries,
            model: payload.model,
            timeoutMs,
          }),
      },
    )) {
      if (eventData.attempt !== streamAttempt) {
        streamAttempt = eventData.attempt;
        upstreamFinishReason = null;
        inputTokens = 0;
        outputTokens = 0;
        cachedTokens = 0;
      }
      const event = parseStreamData(eventData.data);
      if (!event) {
        continue;
      }
      const delta = event.delta;
      if (delta) {
        const reasoning = delta.reasoning ?? delta.reasoning_content;
        if (typeof reasoning === "string" && reasoning.length > 0) {
          if (options.isCompactionRequest) {
            // Some ai& reasoning models still place summarization output
            // in reasoning_content when reasoning is explicitly disabled.
            // Claude Code's compactor only accepts assistant text, so expose
            // that provider-specific channel as text for this request type.
            perf?.markOnce("first_delta", { kind: "text" });
            blockManager.emitText(reasoning);
          } else {
            perf?.markOnce("first_delta", { kind: "thinking" });
            blockManager.emitThinking(reasoning);
          }
        }
        if (typeof delta.content === "string" && delta.content.length > 0) {
          perf?.markOnce("first_delta", { kind: "text" });
          blockManager.emitText(delta.content);
        }
        if (Array.isArray(delta.tool_calls)) {
          for (const toolCall of delta.tool_calls) {
            perf?.markOnce("first_delta", { kind: "tool_call" });
            blockManager.emitToolCall(toolCall);
          }
        }
      }
      if (event.usage) {
        inputTokens = event.usage.prompt_tokens ?? inputTokens;
        outputTokens = event.usage.completion_tokens ?? outputTokens;
        cachedTokens =
          event.usage.prompt_tokens_details?.cached_tokens ??
          event.usage.cached_tokens ??
          cachedTokens;
      }
      if (event.finish_reason) {
        upstreamFinishReason = event.finish_reason;
      }
    }
  } catch (err) {
    debugLog(options, "aiand stream read error", {
      error: err instanceof Error ? err.message : String(err),
    });
    if (err instanceof AiandSsePrematureCloseError) {
      return failAnthropicStream(res, 502, "api_error", err.message);
    }
    if (err instanceof AiandSseIdleTimeoutError) {
      return failAnthropicStream(res, 504, "timeout_error", err.message);
    }
    if (err instanceof AiandSseRetryResponseError) {
      const mapped = await mapAiandError(err.response);
      return failAnthropicStream(res, mapped.anthropicStatus, mapped.anthropicType, mapped.message);
    }
    // Mid-stream failure: best-effort close whatever block is open, then end.
    // The client already has partial output; we can't retroactively emit an
    // error event in a way Anthropic SSE expects after content has started.
  }

  stopReason = mapStopReason(upstreamFinishReason, {
    outputTokens,
    requestedMaxTokens: payload.max_tokens as number | undefined,
  });
  // Claude Code automatically continues a response reported as max_tokens.
  // That behavior is useful for normal turns but fatal for compaction: several
  // bounded summary chunks accumulate until Claude Code's own output guard
  // aborts the operation. A compact response is a single bounded handoff, so
  // never invite continuation after ai& reaches its summary budget.
  if (options.isCompactionRequest && upstreamFinishReason === "length") {
    stopReason = "end_turn";
  }
  if (upstreamFinishReason === "length" && stopReason !== "max_tokens") {
    debugLog(options, "downgraded short ai& length stop", {
      outputTokens,
      requestedMaxTokens: payload.max_tokens,
    });
  }
  blockManager.close();
  if (inputTokens > 0 || outputTokens > 0) {
    options.costTracker?.addUsage(inputTokens, cachedTokens, outputTokens, targetModel.definition);
  }
  debugLog(options, "aiand stream done", {
    stopReason,
    usage: { inputTokens, outputTokens, cachedTokens },
    blocks: blockManager.summary(),
    outputBudget: blockManager.outputSummary(),
  });

  writeSse(res, "message_delta", {
    type: "message_delta",
    delta: { stop_reason: stopReason, stop_sequence: null },
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  });
  writeSse(res, "message_stop", { type: "message_stop" });
  res.end();
  return { ok: true, status: res.statusCode };
}

async function postAiandStream(
  payload: Record<string, unknown>,
  options: ClaudeStreamOptions,
  signal?: AbortSignal,
  perf?: ProxyPerfTracer,
  spanName = "upstream_fetch",
  spanFields?: Record<string, unknown>,
): Promise<Response> {
  // Wire policy + context-fit must use the *request* model (e.g. Haiku tier),
  // not the session default — otherwise effort defaults leak across tiers.
  const requestModelId = typeof payload.model === "string" ? payload.model : undefined;
  const modelDefinition =
    (requestModelId ? findModelById(requestModelId) : undefined) ?? options.modelDefinition;
  const request = () =>
    postChatCompletionStream(payload, options, signal, undefined, {
      modelDefinition,
      debug: options.debug,
    });
  return await (perf?.span(spanName, request, spanFields) ?? request());
}

/**
 * Parses one SSE `data:` JSON payload into a normalized stream event. Returns
 * null for non-JSON lines (ai& occasionally sends `[DONE]` or comments).
 * Tolerates both `usage` on a final choices-bearing chunk and on a dedicated
 * empty-choices usage chunk (the `stream_options.include_usage` shape).
 */
function parseStreamData(data: string): {
  delta?: {
    reasoning?: string | null;
    reasoning_content?: string | null;
    content?: string | null;
    tool_calls?: Array<{
      index?: number;
      id?: string;
      type?: string;
      function?: { name?: string; arguments?: string };
    }>;
  } | null;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cached_tokens?: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
    };
  } | null;
  finish_reason?: string | null;
} | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const obj = parsed as Record<string, unknown>;
  const choices = obj.choices;
  const choice =
    Array.isArray(choices) && choices.length > 0 ? (choices[0] as Record<string, unknown>) : null;
  return {
    delta: (choice?.delta as Record<string, unknown> | undefined) ?? null,
    usage: (obj.usage as Record<string, unknown> | undefined) ?? null,
    finish_reason:
      typeof choice?.finish_reason === "string" ? (choice.finish_reason as string) : null,
  };
}

/**
 * Manages the content_block lifecycle on the Anthropic SSE stream. Tracks which
 * block type is currently open so we emit content_block_start exactly once per
 * block and content_block_stop before the next opens. Indices are contiguous
 * starting at 0, in arrival order: thinking → text → tool_use(…).
 */
class StreamBlockManager {
  private nextIndex = 0;
  private openBlock:
    | { type: "thinking"; index: number; reasoning: string }
    | { type: "text"; index: number }
    | { type: "tool_use"; index: number; id: string; name: string; arguments: string }
    | null = null;
  private blockCount = 0;

  constructor(
    private readonly res: ServerResponse,
    private readonly outputBudget: StreamOutputBudget,
  ) {}

  emitThinking(reasoning: string): void {
    const emittedReasoning = this.outputBudget.takeThinking(reasoning);
    if (!emittedReasoning) {
      return;
    }
    if (!this.openBlock || this.openBlock.type !== "thinking") {
      this.closeOpenBlock();
      this.openBlock = { type: "thinking", index: this.nextIndex, reasoning: "" };
      writeSse(this.res, "content_block_start", {
        type: "content_block_start",
        index: this.openBlock.index,
        content_block: { type: "thinking", thinking: "", signature: "" },
      });
      this.blockCount += 1;
    }
    this.openBlock.reasoning += emittedReasoning;
    writeSse(this.res, "content_block_delta", {
      type: "content_block_delta",
      index: this.openBlock.index,
      delta: { type: "thinking_delta", thinking: emittedReasoning },
    });
  }

  emitText(text: string): void {
    const emittedText = this.outputBudget.takeText(text);
    if (!emittedText) {
      return;
    }
    if (!this.openBlock || this.openBlock.type !== "text") {
      this.closeOpenBlock();
      this.openBlock = { type: "text", index: this.nextIndex };
      writeSse(this.res, "content_block_start", {
        type: "content_block_start",
        index: this.openBlock.index,
        content_block: { type: "text", text: "" },
      });
      this.blockCount += 1;
    }
    writeSse(this.res, "content_block_delta", {
      type: "content_block_delta",
      index: this.openBlock.index,
      delta: { type: "text_delta", text: emittedText },
    });
  }

  emitToolCall(toolCall: {
    index?: number;
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
  }): void {
    // Tool calls arrive across multiple chunks: the first carries id + name,
    // later chunks carry arguments JSON fragments (possibly split mid-string).
    // We accumulate into one block keyed by ai&'s tool-call `index`; if
    // the index doesn't match the open tool_use block, start a new one.
    const tcIndex = typeof toolCall.index === "number" ? toolCall.index : 0;
    const name = toolCall.function?.name;
    const argsFragment = this.outputBudget.takeToolJson(toolCall.function?.arguments ?? "");
    // A tool_use block is open and matches this delta when the open block is a
    // tool_use AND its upstream tool-call index equals this delta's index. A new
    // index means a new tool call → start a fresh block. Check the open block's
    // type directly (not via optional chaining) so TS narrows it to the
    // tool_use variant for reuse.
    const open = this.openBlock;
    if (open && open.type === "tool_use" && this.currentToolCallIndex === tcIndex) {
      if (argsFragment) {
        open.arguments += argsFragment;
        writeSse(this.res, "content_block_delta", {
          type: "content_block_delta",
          index: open.index,
          delta: { type: "input_json_delta", partial_json: argsFragment },
        });
      }
      return;
    }

    this.closeOpenBlock();
    const id = toolCall.id ?? `toolu_${randomUUID().replaceAll("-", "")}`;
    const toolName = name ?? "tool";
    const block: { type: "tool_use"; index: number; id: string; name: string; arguments: string } =
      {
        type: "tool_use",
        index: this.nextIndex,
        id,
        name: toolName,
        arguments: "",
      };
    this.openBlock = block;
    this.currentToolCallIndex = tcIndex;
    writeSse(this.res, "content_block_start", {
      type: "content_block_start",
      index: block.index,
      // Anthropic streams tool_use with input: {} on the start event; the
      // real input arrives as input_json_delta fragments that the client
      // accumulates into the final input object.
      content_block: { type: "tool_use", id, name: toolName, input: {} },
    });
    this.blockCount += 1;
    if (argsFragment) {
      block.arguments += argsFragment;
      writeSse(this.res, "content_block_delta", {
        type: "content_block_delta",
        index: block.index,
        delta: { type: "input_json_delta", partial_json: argsFragment },
      });
    }
  }

  private currentToolCallIndex = -1;

  closeOpenBlock(): void {
    if (!this.openBlock) {
      return;
    }
    // For a thinking block, emit a compact stable signature before closing.
    // Do not base64 the full reasoning text here: Claude Code counts the
    // signature in its output budget, so duplicating long reasoning can make an
    // otherwise valid response exceed its 32k output-token guard.
    if (this.openBlock.type === "thinking") {
      writeSse(this.res, "content_block_delta", {
        type: "content_block_delta",
        index: this.openBlock.index,
        delta: { type: "signature_delta", signature: thinkingSignature(this.openBlock.reasoning) },
      });
    }
    writeSse(this.res, "content_block_stop", {
      type: "content_block_stop",
      index: this.openBlock.index,
    });
    this.nextIndex += 1;
    this.openBlock = null;
  }

  close(): void {
    this.closeOpenBlock();
  }

  hasOutput(): boolean {
    return this.blockCount > 0;
  }

  summary(): string {
    return `${this.blockCount} block(s)`;
  }

  outputSummary(): Record<string, unknown> {
    return this.outputBudget.summary();
  }
}

function failAnthropicStream(
  res: ServerResponse,
  status: number,
  type: string,
  message: string,
): StreamProxyResult {
  writeSse(res, "error", { type: "error", error: { type, message } });
  res.end();
  return { ok: false, status, error: message };
}

class StreamOutputBudget {
  private readonly maxContentChars: number;
  private readonly maxThinkingChars: number;
  private contentChars = 0;
  private thinkingChars = 0;
  private droppedThinkingChars = 0;
  private droppedContentChars = 0;

  constructor(options: ClaudeStreamOptions) {
    const claudeMaxTokens =
      finitePositiveInteger(options.claudeCodeMaxOutputTokens) ??
      CLAUDE_CODE_DEFAULT_MAX_OUTPUT_TOKENS;
    const safeContentTokens = Math.max(1, claudeMaxTokens - CLAUDE_RESPONSE_OUTPUT_HEADROOM_TOKENS);
    this.maxContentChars = safeContentTokens * APPROX_CHARS_PER_TOKEN;
    this.maxThinkingChars =
      Math.min(safeContentTokens, CLAUDE_THINKING_OUTPUT_MAX_TOKENS) * APPROX_CHARS_PER_TOKEN;
  }

  takeThinking(value: string): string {
    return this.take(value, true);
  }

  takeText(value: string): string {
    return this.take(value, false);
  }

  takeToolJson(value: string): string {
    return this.take(value, false);
  }

  summary(): Record<string, unknown> {
    return {
      contentChars: this.contentChars,
      thinkingChars: this.thinkingChars,
      droppedContentChars: this.droppedContentChars,
      droppedThinkingChars: this.droppedThinkingChars,
      maxContentChars: this.maxContentChars,
      maxThinkingChars: this.maxThinkingChars,
    };
  }

  private take(value: string, thinking: boolean): string {
    if (!value) {
      return "";
    }
    const remainingContentChars = this.maxContentChars - this.contentChars;
    const remainingThinkingChars = thinking ? this.maxThinkingChars - this.thinkingChars : Infinity;
    const remaining = Math.max(0, Math.min(remainingContentChars, remainingThinkingChars));
    if (remaining <= 0) {
      this.drop(value.length, thinking);
      return "";
    }
    if (value.length <= remaining) {
      this.contentChars += value.length;
      if (thinking) {
        this.thinkingChars += value.length;
      }
      return value;
    }
    const emitted = value.slice(0, remaining);
    this.contentChars += emitted.length;
    if (thinking) {
      this.thinkingChars += emitted.length;
    }
    this.drop(value.length - emitted.length, thinking);
    return emitted;
  }

  private drop(chars: number, thinking: boolean): void {
    if (thinking) {
      this.droppedThinkingChars += chars;
    } else {
      this.droppedContentChars += chars;
    }
  }
}

function finitePositiveInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(1, Math.floor(value));
}

function debugLog(
  options: ClaudeStreamOptions,
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
function estimateInputTokensFromRawBytes(options: ClaudeStreamOptions): number {
  const rawBytes = options.rawBytes;
  if (typeof rawBytes !== "number" || rawBytes <= 0) {
    return 1;
  }
  if (options.costTracker) {
    return options.costTracker.tokenEstimator.estimate(rawBytes);
  }
  return Math.max(1, Math.ceil(rawBytes / APPROX_CHARS_PER_TOKEN));
}
