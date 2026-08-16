import {
  acceptsReasoningEffort,
  mapReasoningEffortForModel,
  type ModelDefinition,
} from "@aiandrelay/models";
import { defaultWireReasoningEffort } from "../chat-wire.js";
import { isNativeWebSearchToolType } from "../native-search-refuse.js";
import { writeProxyDebugLog } from "../proxy-debug.js";
import {
  formatToolResultContent,
  formatWebSearchToolResult,
  stringifyAnthropicContent,
} from "./content-format.js";
import type {
  AnthropicMessagesRequest,
  AnthropicTool,
  OpenAIMessage,
  OpenAITool,
} from "./wire-types.js";

type DebugOptions = {
  debug?: boolean | undefined;
};

type AiandReasoningEffort = "none" | "low" | "medium" | "high" | "max";

const AIANDRELAY_IDENTITY_PROMPT =
  "You are an ai& model routed through aiandrelay, not Anthropic Claude.";

/**
 * Reasoning effort for the chat wire. Default product effort is `"none"`;
 * map harness enums → ai& `none|high|max` and catalog-gate (SPEC §5/§8).
 */
export function aiandReasoningEffort(
  body: AnthropicMessagesRequest,
  targetModel: ModelDefinition,
): AiandReasoningEffort | undefined {
  if (!acceptsReasoningEffort(targetModel.id)) {
    return undefined;
  }

  const explicit =
    typeof body.reasoning_effort === "string"
      ? body.reasoning_effort
      : typeof body.effort === "string"
        ? body.effort
        : typeof body.thinking?.effort === "string"
          ? body.thinking.effort
          : undefined;

  if (explicit) {
    return mapReasoningEffortForModel(targetModel, explicit);
  }

  return defaultWireReasoningEffort(targetModel) as AiandReasoningEffort | undefined;
}

export function toOpenAITools(
  tools: AnthropicTool[] | undefined,
  options?: DebugOptions,
): OpenAITool[] | undefined {
  if (!tools || tools.length === 0) {
    return undefined;
  }
  const translated = tools.flatMap((tool) => {
    // SPEC §9: strip native web_search_* server tools from the upstream chat
    // tools list; custom function tools named `web_search` still passthrough.
    if (isNativeWebSearchTool(tool)) {
      debugLog(options, "stripped native web_search tool from upstream", {
        name: tool.name,
        type: tool.type,
      });
      return [];
    }
    return [
      {
        type: "function" as const,
        function: {
          name: openAIToolName(tool),
          description: tool.description ?? "",
          parameters: toOpenAIToolParameters(tool),
        },
      },
    ];
  });
  return translated.length > 0 ? translated : undefined;
}

function openAIToolName(tool: AnthropicTool): string {
  return tool.name ?? "tool";
}

function toOpenAIToolParameters(tool: AnthropicTool): unknown {
  if (tool.input_schema) {
    return tool.input_schema;
  }
  return { type: "object", properties: {} };
}

export function toOpenAIToolChoice(toolChoice: unknown): unknown {
  if (!toolChoice || typeof toolChoice !== "object") {
    return undefined;
  }
  const choice = toolChoice as { type?: unknown; name?: unknown };
  if (choice.type === "auto") {
    return "auto";
  }
  if (choice.type === "any") {
    return "required";
  }
  if (choice.type === "tool" && typeof choice.name === "string" && choice.name) {
    return { type: "function", function: { name: choice.name } };
  }
  return undefined;
}

function isNativeWebSearchTool(tool: AnthropicTool): boolean {
  return isNativeWebSearchToolType(tool.type);
}

export function toOpenAIMessages(
  body: AnthropicMessagesRequest,
  targetModel?: ModelDefinition,
): OpenAIMessage[] {
  const systemParts = [
    targetModel
      ? `${AIANDRELAY_IDENTITY_PROMPT} Backend: ${targetModel.name} (${targetModel.id}).`
      : AIANDRELAY_IDENTITY_PROMPT,
  ];
  const system = stringifyAnthropicContent(body.system);
  if (system) {
    systemParts.push(system);
  }
  const messages: OpenAIMessage[] = [{ role: "system", content: systemParts.join("\n\n") }];

  for (const message of body.messages ?? []) {
    if (typeof message.content === "string") {
      messages.push({ role: message.role, content: message.content });
      continue;
    }

    const textParts: string[] = [];
    const reasoningParts: string[] = [];
    const toolCalls: OpenAIMessage["tool_calls"] = [];
    for (const block of message.content) {
      if (block.type === "text") {
        textParts.push(block.text);
      } else if (block.type === "thinking") {
        reasoningParts.push(block.thinking);
      } else if (block.type === "redacted_thinking") {
        reasoningParts.push(block.data);
      } else if (block.type === "tool_result") {
        messages.push({
          role: "tool",
          tool_call_id: block.tool_use_id,
          content: formatToolResultContent(block.content, block.is_error),
        });
      } else if (
        block.type === "web_search_tool_result" ||
        block.type === "web_search_tool_result_error"
      ) {
        messages.push({
          role: "tool",
          tool_call_id: block.tool_use_id ?? "web_search",
          content: formatWebSearchToolResult(block),
        });
      } else if (block.type === "tool_use" || block.type === "server_tool_use") {
        toolCalls.push({
          id: block.id,
          type: "function",
          function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
        });
      }
    }

    const content = textParts.join("\n");
    if (content || reasoningParts.length > 0 || toolCalls.length > 0) {
      messages.push({
        role: message.role,
        content: content || null,
        ...(reasoningParts.length > 0 ? { reasoning_content: reasoningParts.join("\n") } : {}),
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      });
    }
  }

  return messages;
}

function debugLog(
  options: DebugOptions | undefined,
  label: string,
  value: unknown | (() => unknown),
): void {
  writeProxyDebugLog("aiandrelay proxy", options, label, value);
}
