import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  emitContextTrimAlarm,
  parseAiandContextLengthInputTokens,
} from "../../cli/src/lib/context-fit.js";
import { getInstallId, sendTelemetryEvent } from "../../cli/src/lib/telemetry.js";

describe("telemetry", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "aiandrelay-telemetry-"));
    vi.stubEnv("AIANDRELAY_HOME", tmpDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("does not send analytics or create install state in GitHub Actions", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("GITHUB_ACTIONS", "true");

    await sendTelemetryEvent({ event: "cli_started", agent: "codex" });

    expect(fetchMock).not.toHaveBeenCalled();
    await expect(readFile(path.join(tmpDir, "install-id"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  test("returns one stable install id when first-use callers race", async () => {
    const ids = await Promise.all(Array.from({ length: 10 }, () => getInstallId()));

    expect(new Set(ids)).toHaveLength(1);
    const stored = JSON.parse(await readFile(path.join(tmpDir, "install-id"), "utf8"));
    expect(stored.id).toBe(ids[0]);
  });

  test("context_trim telemetry event is POSTed with the structured trim payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("GITHUB_ACTIONS", "false");
    vi.stubEnv("AIANDRELAY_TELEMETRY_URL", "https://telemetry.test/api/telemetry");

    await sendTelemetryEvent({
      event: "context_trim",
      contextTrim: {
        path: "preemptive",
        model: "zai-org/glm-5.2",
        trimmedChars: 4096,
        inputTokens: 200000,
        contextWindow: 262144,
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/telemetry$/);
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.event).toBe("context_trim");
    expect(body.product).toBe("aiandrelay");
    expect(body.contextTrim).toEqual({
      path: "preemptive",
      model: "zai-org/glm-5.2",
      trimmedChars: 4096,
      inputTokens: 200000,
      contextWindow: 262144,
    });
  });

  test("parseAiandContextLengthInputTokens extracts input token counts", () => {
    expect(
      parseAiandContextLengthInputTokens(
        "This model's maximum context length is 131072 tokens. However, you requested 270000 tokens (250000 in the messages, 20000 in the completion).",
      ),
    ).toBe(250000);
  });

  test("emitContextTrimAlarm writes stderr and fires telemetry when enabled", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("GITHUB_ACTIONS", "false");
    vi.stubEnv("AIANDRELAY_TELEMETRY_URL", "https://telemetry.test/api/telemetry");
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    emitContextTrimAlarm({
      path: "retry",
      model: "moonshotai/kimi-k2.7-code",
      trimmedChars: 100,
      inputTokens: 50_000,
      contextWindow: 262_144,
      action: "trim_text",
    });

    expect(write).toHaveBeenCalled();
    expect(String(write.mock.calls[0]?.[0])).toContain("moonshotai/kimi-k2.7-code");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });
});
