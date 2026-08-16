import { type ModelDefinition } from "@aiandrelay/models";
import { writeProxyDebugLog } from "../proxy-debug.js";
import { postChatCompletion } from "../aiand-client.js";
import type { ChatMessage, ChatResponse, AiandChatResult } from "./wire-types.js";

type CodexAiandOptions = {
  apiKey: string;
  baseUrl: string;
  debug?: boolean | undefined;
};

export async function callAiandChat(
  payload: Record<string, unknown>,
  options: CodexAiandOptions,
  modelDefinition: ModelDefinition,
  signal?: AbortSignal,
): Promise<ChatResponse> {
  const result = await fetchAiandChat(payload, options, modelDefinition, signal);
  if (!result.ok) {
    throw new Error(`ai& API returned ${result.status}: ${result.text.slice(0, 1000)}`);
  }
  return (await result.response.json()) as ChatResponse;
}

// Python dict methods whose names could collide with a key in tool-call
// arguments when an ai& chat template calls `arguments.<method>()`.
// Only `items` has been confirmed to collide (GLM-5.2, MiniMax-M3), but the
// reactive retry sanitizes all of them so an unknown future collision
// self-heals without a code change.
const TEMPLATE_ERROR_DICT_METHODS = new Set([
  "items",
  "keys",
  "values",
  "get",
  "pop",
  "popitem",
  "setdefault",
  "update",
  "clear",
  "copy",
  "fromkeys",
]);

function isAiandTemplateError(text: string): boolean {
  return /process_messages_failed|not callable|apply chat template|invalid operation/i.test(text);
}

/** Deep-clone just enough of the payload to safely mutate tool-call arguments. */
function cloneMessagesForRetry(messages: unknown): ChatMessage[] {
  const arr = Array.isArray(messages) ? (messages as ChatMessage[]) : [];
  return arr.map((msg) => ({
    ...msg,
    ...(msg.tool_calls
      ? {
          tool_calls: msg.tool_calls.map((tc) => ({
            ...tc,
            function: { ...tc.function },
          })),
        }
      : {}),
  }));
}

/**
 * Rename every top-level dict-method-named key in every tool-call's arguments
 * to `_<name>`. Returns true if anything changed (i.e. a retry is warranted).
 * More aggressive than the proactive `items`-only rename because this only
 * runs after a real upstream failure, so there is no happy-path cost.
 */
function sanitizePayloadForTemplateRetry(payload: Record<string, unknown>): boolean {
  const messages = cloneMessagesForRetry(payload.messages);
  let changed = false;
  for (const message of messages) {
    if (!message.tool_calls) continue;
    for (const toolCall of message.tool_calls) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
        let modified = false;
        for (const key of Object.keys(parsed)) {
          if (TEMPLATE_ERROR_DICT_METHODS.has(key)) {
            parsed[`_${key}`] = parsed[key];
            delete parsed[key];
            modified = true;
          }
        }
        if (modified) {
          toolCall.function.arguments = JSON.stringify(parsed);
          changed = true;
        }
      } catch {
        // Not valid JSON -- skip this tool call.
      }
    }
  }
  if (changed) {
    payload.messages = messages;
  }
  return changed;
}

export async function fetchAiandChat(
  payload: Record<string, unknown>,
  options: CodexAiandOptions,
  modelDefinition: ModelDefinition,
  signal?: AbortSignal,
): Promise<AiandChatResult> {
  const first = await postAiandChat(payload, options, modelDefinition, signal);
  if (first.ok) {
    return { ok: true, response: first };
  }
  // The shared ai& client already self-healed any context-length overflow
  // (max_tokens → strip old images → trim text → drop oldest turns) before
  // returning, so anything non-OK here is either terminal or a template crash.
  const text = await first.text();

  // Template-error self-healing: if ai&'s chat template crashed on a
  // dict-method-named key in tool-call arguments (e.g. `items`), sanitize all
  // such keys and retry once. This is the reactive backstop behind the
  // proactive `items`-only rename in translate-request.ts -- it catches any
  // future unknown collision without a code change.
  if (isAiandTemplateError(text)) {
    const sanitized: Record<string, unknown> = { ...payload };
    if (sanitizePayloadForTemplateRetry(sanitized)) {
      debugLog(options, "retrying aiand request after template-error sanitization", {
        model: sanitized.model,
        originalError: text.slice(0, 1000),
      });
      const retry = await postAiandChat(sanitized, options, modelDefinition, signal);
      if (retry.ok) {
        return { ok: true, response: retry };
      }
      return { ok: false, status: retry.status, text: await retry.text() };
    }
  }

  return { ok: false, status: first.status, text };
}

async function postAiandChat(
  payload: Record<string, unknown>,
  options: CodexAiandOptions,
  modelDefinition: ModelDefinition,
  signal?: AbortSignal,
): Promise<Response> {
  // Delegate the fetch + 429/503 retry loop AND the reactive context-fit retry
  // to the shared ai& client (aiand-client.ts). Passing the model
  // definition enables the context-fit repair; this harness keeps only the
  // Codex-specific debug logging and template-error handling on top.
  return postChatCompletion(payload, options, signal, { modelDefinition, debug: options.debug });
}

function debugLog(
  options: CodexAiandOptions,
  label: string,
  payload: unknown | (() => unknown),
): void {
  writeProxyDebugLog("aiandrelay codex proxy", options, label, payload);
}
