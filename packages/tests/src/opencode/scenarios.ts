import {
  assert,
  assertCommandExists,
  looksLikeContextError,
  outputIncludesPath,
} from "../shared/assert.js";
import { runCommand } from "../shared/command.js";
import { asRecord, jsonLines } from "../shared/json-lines.js";
import { makeLongRecords } from "../shared/long-context.js";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { Scenario } from "../shared/types.js";

export function opencodeScenarios(): Scenario[] {
  return [
    {
      name: "opencode: basic streaming headless response",
      run: async (context) => {
        assertCommandExists("opencode");
        const result = await runCommand(context, "opencode-basic", process.execPath, [
          context.cliBin,
          "opencode",
          "--",
          "run",
          "--format",
          "json",
          "--dangerously-skip-permissions",
          "Reply with exactly: hi",
        ]);
        assert(result.status === 0, `exit ${result.status}`);
        const events = openCodeEvents(result.stdout);
        assert(
          events.some((event) => event.type === "step_start"),
          "missing step_start event",
        );
        assert(
          events.some((event) => event.type === "text"),
          "missing streamed text event",
        );
        assert(
          events.some((event) => event.type === "step_finish"),
          "missing step_finish event",
        );
        assert(
          openCodeText(events).some((text) => /\bhi\b/i.test(text)),
          "missing expected text",
        );
      },
    },
    {
      name: "opencode: bash tool call",
      run: async (context) => {
        const result = await runCommand(
          context,
          "opencode-tool-pwd",
          process.execPath,
          [
            context.cliBin,
            "opencode",
            "--",
            "run",
            "--format",
            "json",
            "--dangerously-skip-permissions",
            'Print the current working directory using a shell command (pwd, cd, or node -e "process.stdout.write(process.cwd())"), then answer with that path only.',
          ],
          { timeoutMs: 180_000 },
        );
        assert(result.status === 0, `exit ${result.status}`);
        const events = openCodeEvents(result.stdout);
        assert(
          events.some((event) => event.type === "tool_use" && asRecord(event.part).tool === "bash"),
          "missing bash tool_use event",
        );
        assert(
          outputIncludesPath(result.stdout, context.repoRoot),
          "expected pwd result in output",
        );
      },
    },
    {
      name: "opencode: long-context pressure",
      run: async (context) => {
        const prompt = [
          "You are testing long-context handling. Read the repeated records below and answer with only the checksum token from the final record.",
          makeLongRecords(250, "OPENCODE_FINAL_CHECKSUM_4185"),
        ].join("\n\n");
        // Windows CreateProcess command-line limit (~32KB) is exceeded when a
        // large prompt is passed as an argv token; feed the body via a file and
        // ask the model to read it instead.
        const promptPath = path.join(context.tmpDir, "opencode-long-context.txt");
        await writeFile(promptPath, prompt, "utf8");
        const result = await runCommand(
          context,
          "opencode-long-context",
          process.execPath,
          [
            context.cliBin,
            "opencode",
            "--",
            "run",
            "--format",
            "json",
            "--dangerously-skip-permissions",
            `Read the file at ${promptPath} and answer with only the checksum token from the final record in that file.`,
          ],
          { timeoutMs: 180_000 },
        );
        assert(result.status === 0, `exit ${result.status}`);
        assert(result.stdout.includes("OPENCODE_FINAL_CHECKSUM_4185"), "missing final checksum");
        assert(
          !looksLikeContextError(result.stderr + result.stdout),
          "context-length error surfaced",
        );
      },
    },
  ];
}

function openCodeEvents(stdout: string): Array<Record<string, unknown>> {
  return jsonLines(stdout).map(asRecord);
}

function openCodeText(events: Array<Record<string, unknown>>): string[] {
  return events
    .filter((event) => event.type === "text")
    .map((event) => String(asRecord(event.part).text ?? ""));
}
