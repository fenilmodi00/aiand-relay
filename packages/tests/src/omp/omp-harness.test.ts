import { describe, expect, test } from "vitest";
import { AIAND_BASE_URL } from "@aiandrelay/models";
import {
  HARNESS,
  HARNESS_BIN,
  HARNESS_INSTALL,
  HARNESS_LABEL,
} from "../../../cli/src/lib/harness.js";
import { isHarnessImplemented } from "../../../cli/src/lib/harness-registry.js";
import { missingHarnessMessage } from "../../../cli/src/lib/detect.js";
import { resolveHarnessInvocation } from "../../../cli/src/lib/commands/harness-invocation.js";
import { parseArgs } from "../../../cli/src/lib/parse-args.js";
import {
  ompArgsWithoutAiandrelayOverrides,
  ompModelsYml,
} from "../../../cli/src/lib/harnesses/omp.js";

describe("ompModelsYml", () => {
  test("writes aiand openai-completions provider with expected baseUrl and compat", () => {
    const yaml = ompModelsYml("test-api-key");

    expect(yaml).toContain("providers:");
    expect(yaml).toContain("aiand:");
    expect(yaml).toContain(`baseUrl: "${AIAND_BASE_URL}"`);
    expect(yaml).toContain("api: openai-completions");
    expect(yaml).toContain('apiKey: "test-api-key"');
    expect(yaml).toContain("supportsDeveloperRole: false");
    expect(yaml).toContain("supportsReasoningEffort: true");
  });

  test("filters modalities to text/image and maps thinking levels for reasoning models", () => {
    const yaml = ompModelsYml("test-api-key");

    expect(yaml).not.toMatch(/\bpdf\b/);
    expect(yaml).not.toMatch(/\bvideo\b/);
    expect(yaml).toMatch(/input:\s*\[(?:text|image)(?:,\s*(?:text|image))?\]/);
    expect(yaml).toContain("thinkingLevelMap:");
    expect(yaml).toContain("off: none");
    expect(yaml).toContain("medium: high");
    expect(yaml).toContain("max: max");
  });
});

describe("ompArgsWithoutAiandrelayOverrides", () => {
  test("strips provider, model, models, and api-key including equals forms", () => {
    expect(
      ompArgsWithoutAiandrelayOverrides([
        "--resume",
        "sess",
        "--provider",
        "openai",
        "--model",
        "gpt-4",
        "--models",
        "a,b",
        "--api-key",
        "sk-x",
        "--print",
        "--mode",
        "json",
        "--provider=anthropic",
        "--model=claude",
        "--models=x",
        "--api-key=sk-y",
        "Reply hi",
      ]),
    ).toEqual(["--resume", "sess", "--print", "--mode", "json", "Reply hi"]);
  });

  test("keeps omp headless and tool flags intact", () => {
    expect(
      ompArgsWithoutAiandrelayOverrides([
        "--mode",
        "json",
        "--print",
        "--no-session",
        "--yolo",
        "Reply hi",
      ]),
    ).toEqual(["--mode", "json", "--print", "--no-session", "--yolo", "Reply hi"]);
  });
});

describe("omp harness identity", () => {
  test("omp is a known implemented harness with omp binary and install hints", () => {
    expect(HARNESS.OMP).toBe("omp");
    expect(HARNESS_LABEL[HARNESS.OMP]).toBe("omp");
    expect(HARNESS_BIN[HARNESS.OMP]).toBe("omp");
    expect(isHarnessImplemented(HARNESS.OMP)).toBe(true);
    expect(HARNESS_INSTALL[HARNESS.OMP].command).toContain("@oh-my-pi/pi-coding-agent");
    expect(HARNESS_INSTALL[HARNESS.OMP].url).toBe("https://omp.sh/");
    const missing = missingHarnessMessage(HARNESS.OMP);
    expect(missing).toContain("omp");
    expect(missing).toContain("@oh-my-pi/pi-coding-agent");
    expect(missing).not.toContain("@earendil-works/pi-coding-agent");
  });
});

describe("omp harness invocation", () => {
  test("forwards omp passthrough after -- separator", () => {
    const parsed = parseArgs(["omp", "--", "--mode", "json", "--print", "Reply hi"]);
    const invocation = resolveHarnessInvocation(
      parsed.positional,
      parsed.flags,
      parsed.harnessVerb,
    );

    expect(invocation.command).toBe("omp");
    expect(invocation.flags.passthrough).toEqual(["--mode", "json", "--print", "Reply hi"]);
    expect(invocation.flags.passthroughSeparator).toBe(true);
  });
});
