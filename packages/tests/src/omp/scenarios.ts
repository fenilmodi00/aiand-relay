import path from "node:path";
import { assert, assertCommandExists, outputIncludesPath } from "../shared/assert.js";
import { runCommand } from "../shared/command.js";
import { asRecord, jsonLines } from "../shared/json-lines.js";
import type { Scenario } from "../shared/types.js";

/**
 * Live omp (Oh My Pi) gauntlet. Requires AIAND_API_KEY (or configured relay key)
 * and `omp` on PATH. Headless: positional prompt + `--mode json --print --no-session`.
 * Named profiles ignore PI_CODING_AGENT_DIR — these scenarios assume default profile.
 */
export function ompScenarios(): Scenario[] {
  return [
    {
      name: "omp: basic streaming json response with cost",
      run: async (context) => {
        assertCommandExists("omp");
        const result = await runCommand(context, "omp-basic-json", process.execPath, [
          context.cliBin,
          "omp",
          "--",
          "--mode",
          "json",
          "--print",
          "--no-session",
          "--no-tools",
          "Reply with exactly: hi",
        ]);
        assert(result.status === 0, `exit ${result.status}`);
        const events = ompEvents(result.stdout);
        assert(
          events.some((event) => event.type === "session"),
          "missing session event",
        );
        assert(
          ompAssistantText(events).some((text) => /\bhi\b/i.test(text)),
          "missing expected text",
        );
        const usage = finalAssistantUsage(events);
        if (usage) {
          assert(asNumber(usage.totalTokens) > 0, "missing token usage");
          const cost = asRecord(usage.cost);
          if (Object.keys(cost).length > 0) {
            assert(asNumber(cost.total) > 0, "missing cost total");
          }
        }
        assert(
          events.some((event) => asRecord(event.message).provider === "aiand") ||
            /provider:\s*aiand/i.test(result.stderr),
          "missing aiand provider marker",
        );
        assert(context.aiandrelayHome, "test context missing aiandrelayHome");
        const agentDir = path.join(context.aiandrelayHome, "omp");
        assert(
          outputIncludesPath(result.stderr, agentDir),
          `expected agent dir ${agentDir} in debug stderr`,
        );
        assert(
          !/agent dir:\s*.*[\\/]\.omp(?:\s|$)/.test(result.stderr),
          "must not use the user's ~/.omp agent dir",
        );
      },
    },
    {
      name: "omp: shell tool call with cost",
      run: async (context) => {
        const result = await runCommand(
          context,
          "omp-tool-pwd",
          process.execPath,
          [
            context.cliBin,
            "omp",
            "--",
            "--mode",
            "json",
            "--print",
            "--no-session",
            'Print the current working directory using a shell command (pwd, cd, or node -e "process.stdout.write(process.cwd())"), then answer with that path only.',
          ],
          { timeoutMs: 180_000 },
        );
        assert(result.status === 0, `exit ${result.status}`);
        assert(
          outputIncludesPath(result.stdout, context.repoRoot) ||
            outputIncludesPath(result.stderr, context.repoRoot),
          "expected pwd result in output",
        );
        const events = ompEvents(result.stdout);
        const usage = finalAssistantUsage(events);
        if (usage) {
          assert(asNumber(usage.totalTokens) > 0, "missing token usage after tool call");
        }
      },
    },
    {
      name: "omp: model catalog lists ai& models / vision metadata",
      run: async (context) => {
        const result = await runCommand(context, "omp-models-find", process.execPath, [
          context.cliBin,
          "omp",
          "--",
          "models",
          "find",
          "kimi",
        ]);
        assert(result.status === 0, `exit ${result.status}`);
        const output = `${result.stdout}\n${result.stderr}`;
        assert(/moonshotai\/kimi-k2\.7-code/i.test(output), "missing kimi-k2.7-code in catalog");
        assert(/\baiand\b/i.test(output), "expected aiand provider in model listing");
        assert(
          /\bimage\b|\bvision\b|\byes\b/i.test(output),
          "expected vision/image capability marker for kimi",
        );
      },
    },
  ];
}

function ompEvents(stdout: string): Array<Record<string, unknown>> {
  return jsonLines(stdout).map(asRecord);
}

function ompAssistantText(events: Array<Record<string, unknown>>): string[] {
  return events
    .map((event) => asRecord(event.message))
    .filter((message) => message.role === "assistant")
    .flatMap((message) => (Array.isArray(message.content) ? message.content.map(asRecord) : []))
    .filter((part) => part.type === "text")
    .map((part) => String(part.text ?? ""));
}

function finalAssistantUsage(
  events: Array<Record<string, unknown>>,
): Record<string, unknown> | undefined {
  const assistantMessages = events
    .map((event) => asRecord(event.message))
    .filter((message) => message.role === "assistant" && message.usage);
  const message = assistantMessages.at(-1);
  return message ? asRecord(message.usage) : undefined;
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
