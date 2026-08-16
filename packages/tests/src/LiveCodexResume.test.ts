import { copyFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { assertCommandExists } from "./assert.js";
import { runCommand } from "./command.js";
import { cleanupTmpDir, createTestContext, resetTmpDir } from "./context.js";
import { asRecord, jsonLines } from "./json-lines.js";
import type { CommandResult, TestContext } from "./types.js";

const maybeDescribe = process.env.AIANDRELAY_LIVE_CODEX_RESUME === "1" ? describe : describe.skip;

maybeDescribe("live Codex cross-provider resume", () => {
  let context: TestContext;
  let codexHome: string;

  beforeAll(async () => {
    assertCommandExists("codex");
    context = await createTestContext();
    await resetTmpDir(context);
    codexHome = path.join(context.tmpDir, "codex-home");
    await mkdir(codexHome, { recursive: true });
    await copyFile(
      path.join(os.homedir(), ".codex", "auth.json"),
      path.join(codexHome, "auth.json"),
    );
  });

  afterAll(async () => {
    if (context) {
      await cleanupTmpDir(context);
    }
  });

  test("normal Codex → acodex → normal Codex preserves reasoning and local actions", async () => {
    const cwd = path.join(context.tmpDir, "normal-aiand-normal");
    await mkdir(cwd, { recursive: true });
    const normalMarker = "NORMAL_ACTION_5261";
    const aiandMarker = "AIAND_ACTION_9047";

    const normalStart = await runNormalCodex(
      context,
      codexHome,
      cwd,
      "resume-normal-start",
      persistentExecArgs(
        `Use apply_patch to create normal-action.txt containing exactly ${normalMarker} followed by a newline. Then reply exactly: NORMAL_CODEX_CREATED`,
      ),
    );
    expect(normalStart.status).toBe(0);
    expect(itemTypes(normalStart)).toContain("file_change");
    const threadId = startedThreadId(normalStart);

    const aiandResume = await runAiandCodex(
      context,
      codexHome,
      cwd,
      "resume-aiand-middle",
      persistentResumeArgs(
        threadId,
        `Use a shell command to read normal-action.txt. Then use apply_patch to create aiand-action.txt containing exactly ${aiandMarker} followed by a newline. Reply exactly: ${normalMarker} ${aiandMarker}`,
      ),
    );
    expect(aiandResume.status).toBe(0);
    expect(startedThreadId(aiandResume)).toBe(threadId);
    expect(itemTypes(aiandResume)).toEqual(
      expect.arrayContaining(["command_execution", "file_change"]),
    );
    expect(aiandResume.stdout).toContain(`${normalMarker} ${aiandMarker}`);

    const normalResume = await runNormalCodex(
      context,
      codexHome,
      cwd,
      "resume-normal-finish",
      persistentResumeArgs(
        threadId,
        "Use a shell command to read normal-action.txt and aiand-action.txt. Reply exactly with their two marker lines separated by one space.",
      ),
    );
    expect(normalResume.status).toBe(0);
    expect(startedThreadId(normalResume)).toBe(threadId);
    expect(itemTypes(normalResume)).toContain("command_execution");
    expect(normalResume.stdout).toContain(`${normalMarker} ${aiandMarker}`);
    expect(normalResume.stdout + normalResume.stderr).not.toContain("array_above_max_length");
  });

  test("acodex → normal Codex → acodex preserves shell and patch history", async () => {
    const cwd = path.join(context.tmpDir, "aiand-normal-aiand");
    await mkdir(cwd, { recursive: true });
    const aiandMarker = "AIAND_ORIGIN_3185";
    const normalMarker = "NORMAL_RESUMED_7724";

    const aiandStart = await runAiandCodex(
      context,
      codexHome,
      cwd,
      "reverse-aiand-start",
      persistentExecArgs(
        `Use a shell command with printf to create shared-action.txt containing exactly ${aiandMarker} followed by a newline. Then reply exactly: AIAND_CODEX_CREATED`,
      ),
    );
    expect(aiandStart.status).toBe(0);
    expect(itemTypes(aiandStart)).toContain("command_execution");
    const threadId = startedThreadId(aiandStart);

    const normalResume = await runNormalCodex(
      context,
      codexHome,
      cwd,
      "reverse-normal-middle",
      persistentResumeArgs(
        threadId,
        `Use a shell command to read shared-action.txt. Then use apply_patch to append ${normalMarker} on its own line. Reply exactly: ${aiandMarker} ${normalMarker}`,
      ),
    );
    expect(normalResume.status).toBe(0);
    expect(startedThreadId(normalResume)).toBe(threadId);
    expect(itemTypes(normalResume)).toEqual(
      expect.arrayContaining(["command_execution", "file_change"]),
    );
    expect(normalResume.stdout).toContain(`${aiandMarker} ${normalMarker}`);
    expect(normalResume.stdout + normalResume.stderr).not.toContain("array_above_max_length");

    const aiandResume = await runAiandCodex(
      context,
      codexHome,
      cwd,
      "reverse-aiand-finish",
      persistentResumeArgs(
        threadId,
        "Use a shell command to read shared-action.txt. Reply exactly with its two marker lines separated by one space.",
      ),
    );
    expect(aiandResume.status).toBe(0);
    expect(startedThreadId(aiandResume)).toBe(threadId);
    expect(itemTypes(aiandResume)).toContain("command_execution");
    expect(aiandResume.stdout).toContain(`${aiandMarker} ${normalMarker}`);
  });

  test.todo(
    "normal Codex resume picker lists ai& Relay provider sessions (blocked by openai/codex#19318)",
  );
});

function persistentExecArgs(prompt: string): string[] {
  return [
    "exec",
    "--json",
    "--skip-git-repo-check",
    "--ignore-user-config",
    "--ignore-rules",
    "--dangerously-bypass-approvals-and-sandbox",
    prompt,
  ];
}

function persistentResumeArgs(threadId: string, prompt: string): string[] {
  return [
    "exec",
    "resume",
    threadId,
    "--json",
    "--skip-git-repo-check",
    "--ignore-user-config",
    "--ignore-rules",
    "--dangerously-bypass-approvals-and-sandbox",
    prompt,
  ];
}

async function runNormalCodex(
  context: TestContext,
  codexHome: string,
  cwd: string,
  name: string,
  args: string[],
): Promise<CommandResult> {
  return runCommand(context, name, "codex", args, {
    cwd,
    timeoutMs: 240_000,
    env: { CODEX_HOME: codexHome },
  });
}

async function runAiandCodex(
  context: TestContext,
  codexHome: string,
  cwd: string,
  name: string,
  args: string[],
): Promise<CommandResult> {
  return runCommand(context, name, process.execPath, [context.cliBin, "codex", "--", ...args], {
    cwd,
    timeoutMs: 240_000,
    env: { CODEX_HOME: codexHome },
  });
}

function events(result: CommandResult): Array<Record<string, unknown>> {
  return jsonLines(result.stdout).map(asRecord);
}

function startedThreadId(result: CommandResult): string {
  const id = events(result).find((event) => event.type === "thread.started")?.thread_id;
  expect(typeof id).toBe("string");
  return String(id);
}

function itemTypes(result: CommandResult): string[] {
  return events(result)
    .filter((event) => event.type === "item.completed")
    .map((event) => String(asRecord(event.item).type ?? ""));
}
