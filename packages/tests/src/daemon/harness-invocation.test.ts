import { describe, expect, test } from "vitest";
import { resolveHarnessInvocation } from "../../../cli/src/lib/commands/harness-invocation.js";
import { parseArgs } from "../../../cli/src/lib/parse-args.js";

describe("harness invocation parsing", () => {
  test("bare harness name means on", () => {
    const parsed = parseArgs(["claude"]);
    const invocation = resolveHarnessInvocation(
      parsed.positional,
      parsed.flags,
      parsed.harnessVerb,
    );

    expect(invocation.command).toBe("claude");
    expect(invocation.verb).toBe("on");
    expect(invocation.flags.passthrough).toBeUndefined();
  });

  test("explicit on does not pass on to the agent", () => {
    const parsed = parseArgs(["claude", "on"]);
    const invocation = resolveHarnessInvocation(
      parsed.positional,
      parsed.flags,
      parsed.harnessVerb,
    );

    expect(invocation.verb).toBe("on");
    expect(invocation.flags.passthrough).toBeUndefined();
  });

  test("off and status are harness verbs", () => {
    expect(parseArgs(["claude", "off"]).harnessVerb).toBe("off");
    expect(parseArgs(["opencode", "status"]).harnessVerb).toBe("status");
    expect(parseArgs(["pi", "help"]).harnessVerb).toBe("help");
  });

  test("run takes remaining tokens as passthrough", () => {
    const parsed = parseArgs(["claude", "run", "--resume", "8616d14d-f3a7-4ee3-bfc3-34bce6602b8d"]);
    const invocation = resolveHarnessInvocation(
      parsed.positional,
      parsed.flags,
      parsed.harnessVerb,
    );

    expect(invocation.verb).toBe("run");
    expect(invocation.flags.passthrough).toEqual([
      "--resume",
      "8616d14d-f3a7-4ee3-bfc3-34bce6602b8d",
    ]);
  });

  test("unknown flags after a harness imply run", () => {
    const parsed = parseArgs(["claude", "--resume", "8616d14d-f3a7-4ee3-bfc3-34bce6602b8d"]);
    const invocation = resolveHarnessInvocation(
      parsed.positional,
      parsed.flags,
      parsed.harnessVerb,
    );

    expect(invocation.verb).toBe("run");
    expect(invocation.flags.passthrough).toEqual([
      "--resume",
      "8616d14d-f3a7-4ee3-bfc3-34bce6602b8d",
    ]);
  });

  test("strips the passthrough separator and implies run", () => {
    const parsed = parseArgs(["claude", "--", "--print", "Reply with exactly: hi"]);
    const invocation = resolveHarnessInvocation(
      parsed.positional,
      parsed.flags,
      parsed.harnessVerb,
    );

    expect(invocation.verb).toBe("run");
    expect(invocation.flags.passthrough).toEqual(["--print", "Reply with exactly: hi"]);
    expect(invocation.flags.passthroughSeparator).toBe(true);
  });

  test("passes native status through when the separator is present", () => {
    const parsed = parseArgs(["claude", "--", "status"]);
    const invocation = resolveHarnessInvocation(
      parsed.positional,
      parsed.flags,
      parsed.harnessVerb,
    );

    expect(invocation.verb).toBe("run");
    expect(invocation.flags.passthrough).toEqual(["status"]);
  });

  test("claude status is the harness status verb", () => {
    const parsed = parseArgs(["claude", "status"]);
    const invocation = resolveHarnessInvocation(
      parsed.positional,
      parsed.flags,
      parsed.harnessVerb,
    );

    expect(invocation.verb).toBe("status");
    expect(invocation.flags.passthrough).toBeUndefined();
  });

  test("keeps aiandrelay flags before the harness", () => {
    const parsed = parseArgs(["--main", "aiand-kimi-k2-7-code", "claude"]);
    const invocation = resolveHarnessInvocation(
      parsed.positional,
      parsed.flags,
      parsed.harnessVerb,
    );

    expect(invocation.command).toBe("claude");
    expect(invocation.verb).toBe("on");
    expect(invocation.flags.main).toBe("aiand-kimi-k2-7-code");
  });

  test("on --model sets the relay model flag", () => {
    const parsed = parseArgs(["claude", "on", "--model", "aiand-kimi-k2-7-code"]);
    expect(parsed.harnessVerb).toBe("on");
    expect(parsed.flags.main).toBe("aiand-kimi-k2-7-code");
  });

  test("bare harness --model is on, not passthrough", () => {
    const parsed = parseArgs(["claude", "--model", "glm-5.2"]);
    expect(parsed.harnessVerb).toBe("on");
    expect(parsed.flags.main).toBe("glm-5.2");
  });

  test("parses codex-app model and restore flags before dispatch", () => {
    const parsed = parseArgs(["codex-app", "--model", "moonshotai/kimi-k2.7-code", "--restore"]);

    expect(parsed.positional).toEqual(["codex-app"]);
    expect(parsed.flags.main).toBe("moonshotai/kimi-k2.7-code");
    expect(parsed.flags.restore).toBe(true);
  });
});
