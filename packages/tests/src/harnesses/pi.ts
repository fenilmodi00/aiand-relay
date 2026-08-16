import { assert, assertCommandExists, outputIncludesPath } from "../assert.js";
import { runCommand } from "../command.js";
import { asRecord, jsonLines } from "../json-lines.js";
import type { Scenario } from "../types.js";

export function piScenarios(): Scenario[] {
  return [
    {
      name: "pi: basic streaming json response with cost",
      run: async (context) => {
        assertCommandExists("pi");
        const result = await runCommand(context, "pi-basic-json", process.execPath, [
          context.cliBin,
          "pi",
          "--",
          "--mode",
          "json",
          "--no-tools",
          "--no-session",
          "-p",
          "Reply with exactly: hi",
        ]);
        assert(result.status === 0, `exit ${result.status}`);
        const events = piEvents(result.stdout);
        assert(
          events.some((event) => event.type === "session"),
          "missing session event",
        );
        assert(
          events.some(
            (event) =>
              event.type === "message_update" &&
              asRecord(event.assistantMessageEvent).type === "text_delta",
          ),
          "missing streamed text delta",
        );
        assert(
          piAssistantText(events).some((text) => /\bhi\b/i.test(text)),
          "missing expected text",
        );
        const usage = finalAssistantUsage(events);
        assert(asNumber(usage.totalTokens) > 0, "missing token usage");
        assert(asNumber(asRecord(usage.cost).total) > 0, "missing cost total");
        assert(
          events.some((event) => asRecord(event.message).provider === "aiand"),
          "missing aiand provider marker",
        );
      },
    },
    {
      name: "pi: bash tool call with cost",
      run: async (context) => {
        const result = await runCommand(
          context,
          "pi-tool-pwd",
          process.execPath,
          [
            context.cliBin,
            "pi",
            "--",
            "--mode",
            "json",
            "--no-session",
            "-p",
            'Print the current working directory using a shell command (pwd, cd, or node -e "process.stdout.write(process.cwd())"), then answer with that path only.',
          ],
          { timeoutMs: 180_000 },
        );
        assert(result.status === 0, `exit ${result.status}`);
        const events = piEvents(result.stdout);
        assert(
          events.some(
            (event) => event.type === "tool_execution_start" && event.toolName === "bash",
          ),
          "missing bash tool execution start",
        );
        assert(
          events.some(
            (event) =>
              event.type === "tool_execution_end" &&
              event.toolName === "bash" &&
              event.isError === false,
          ),
          "missing successful bash tool execution end",
        );
        assert(
          outputIncludesPath(result.stdout, context.repoRoot),
          "expected pwd result in output",
        );
        const usage = finalAssistantUsage(events);
        assert(asNumber(usage.totalTokens) > 0, "missing token usage after tool call");
        assert(asNumber(asRecord(usage.cost).total) > 0, "missing cost total after tool call");
      },
    },
    {
      name: "pi: aiand model list includes multiple models and vision metadata",
      run: async (context) => {
        const glmResult = await runCommand(context, "pi-model-list-glm-default", process.execPath, [
          context.cliBin,
          "pi",
          "--",
          "--list-models",
          "GLM-5.2",
        ]);
        assert(glmResult.status === 0, `exit ${glmResult.status}`);
        assert(glmResult.stdout.includes("zai-org/glm-5.2"), "missing registered default model");
        assert(
          !glmResult.stderr.includes("Using custom model id"),
          "default should be registered in Pi",
        );

        const result = await runCommand(context, "pi-model-list", process.execPath, [
          context.cliBin,
          "pi",
          "--",
          "--list-models",
          "kimi",
        ]);
        assert(result.status === 0, `exit ${result.status}`);
        const lines = result.stdout.split(/\r?\n/).filter((line) => /\baiand\b/.test(line));
        assert(lines.length >= 1, "expected ai& models in list output");
        assert(
          lines.some((line) => /moonshotai\/kimi-k2\.7-code/.test(line) && /\byes\b/.test(line)),
          "missing vision-capable kimi-k2.7-code row",
        );
      },
    },
  ];
}

function piEvents(stdout: string): Array<Record<string, unknown>> {
  return jsonLines(stdout).map(asRecord);
}

function piAssistantText(events: Array<Record<string, unknown>>): string[] {
  return events
    .map((event) => asRecord(event.message))
    .filter((message) => message.role === "assistant")
    .flatMap((message) => (Array.isArray(message.content) ? message.content.map(asRecord) : []))
    .filter((part) => part.type === "text")
    .map((part) => String(part.text ?? ""));
}

function finalAssistantUsage(events: Array<Record<string, unknown>>): Record<string, unknown> {
  const assistantMessages = events
    .map((event) => asRecord(event.message))
    .filter((message) => message.role === "assistant" && message.usage);
  const message = assistantMessages.at(-1);
  assert(message, "missing assistant usage");
  return asRecord(message.usage);
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
