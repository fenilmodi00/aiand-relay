import path from "node:path";
import { assert, assertCommandExists, outputIncludesPath } from "../shared/assert.js";
import { runCommand } from "../shared/command.js";
import type { Scenario } from "../shared/types.js";

/**
 * Live Hermes Agent gauntlet. Requires a real `AIAND_API_KEY` (or configured
 * relay key) and `hermes` on PATH — same gate as other live harness suites.
 * Headless entry is `hermes chat -q` (not `hermes run`).
 */
export function hermesScenarios(): Scenario[] {
  return [
    {
      name: "hermes: basic oneshot chat reply",
      run: async (context) => {
        assertCommandExists("hermes");
        const result = await runCommand(context, "hermes-basic-oneshot", process.execPath, [
          context.cliBin,
          "hermes",
          "--",
          "chat",
          "-Q",
          "-q",
          "Reply with exactly: hi",
        ]);
        assert(result.status === 0, `exit ${result.status}`);
        assert(/\bhi\b/i.test(result.stdout), "missing expected text");
        // AIANDRELAY_DEBUG=1 logs HERMES_HOME; prove relay-owned home, not ~/.hermes.
        assert(context.aiandrelayHome, "test context missing aiandrelayHome");
        const hermesHome = path.join(context.aiandrelayHome, "hermes");
        assert(
          outputIncludesPath(result.stderr, hermesHome),
          `expected HERMES_HOME ${hermesHome} in debug stderr`,
        );
        assert(
          !/HERMES_HOME:\s*.*[\\/]\.hermes(?:\s|$)/.test(result.stderr),
          "must not use the user's ~/.hermes",
        );
      },
    },
    {
      name: "hermes: shell tool call prints cwd",
      run: async (context) => {
        const result = await runCommand(
          context,
          "hermes-tool-pwd",
          process.execPath,
          [
            context.cliBin,
            "hermes",
            "--",
            "chat",
            "-Q",
            "--yolo",
            "-q",
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
      },
    },
  ];
}
