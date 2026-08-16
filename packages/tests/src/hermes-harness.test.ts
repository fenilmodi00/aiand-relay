import { describe, expect, test } from "vitest";
import {
  hermesArgsWithoutAiandrelayOverrides,
  hermesConfigYaml,
} from "../../cli/src/lib/harnesses/hermes.js";

describe("hermesConfigYaml", () => {
  test("writes custom provider config with interpolated api key", () => {
    const yaml = hermesConfigYaml({
      defaultModel: "zai-org/glm-5.2",
      baseUrl: "https://api.aiand.com/v1",
    });

    expect(yaml).toBe(
      [
        "model:",
        '  default: "zai-org/glm-5.2"',
        "  provider: custom",
        '  base_url: "https://api.aiand.com/v1"',
        "  api_key: ${AIAND_API_KEY}",
        "",
      ].join("\n"),
    );
  });
});

describe("hermesArgsWithoutAiandrelayOverrides", () => {
  test("strips provider and model flags including short -m and equals forms", () => {
    expect(
      hermesArgsWithoutAiandrelayOverrides([
        "chat",
        "-q",
        "hi",
        "--provider",
        "openai",
        "--model",
        "gpt-4",
        "-m",
        "other",
        "--yolo",
        "--provider=anthropic",
        "--model=claude",
        "-m=skip",
      ]),
    ).toEqual(["chat", "-q", "hi", "--yolo"]);
  });

  test("keeps Hermes headless and tool flags intact", () => {
    expect(
      hermesArgsWithoutAiandrelayOverrides(["chat", "-Q", "--quiet", "--yolo", "-q", "Reply hi"]),
    ).toEqual(["chat", "-Q", "--quiet", "--yolo", "-q", "Reply hi"]);
  });
});
