import { describe, expect, test } from "vitest";
import { resolveCodexModel } from "../../../cli/src/lib/codex/defaults.js";
import {
  buildDeepseekLaunchSpec,
  buildDeepseekPatch,
  DEEPSEEK_PROVIDER_ID,
} from "../../../cli/src/lib/deepseek/core.js";
import {
  buildGrokIdentityRule,
  buildGrokLaunchEnvironment,
  buildGrokModelCatalog,
  grokArgsWithAiandIdentity,
} from "../../../cli/src/lib/grok/core.js";

describe("deepseek cordis patch", () => {
  test("declares aiandrelay openai-completions provider and default model", () => {
    const selected = resolveCodexModel();
    const patch = buildDeepseekPatch(selected, "https://api.aiand.com/v1", undefined);
    const provider = patch.find((entry) => entry.id === "llm-pi-ai") as {
      config: { providers: Record<string, { api: string; baseURL: string }> };
    };
    expect(provider.config.providers[DEEPSEEK_PROVIDER_ID]?.api).toBe("openai-completions");
    expect(provider.config.providers[DEEPSEEK_PROVIDER_ID]?.baseURL).toBe(
      "https://api.aiand.com/v1",
    );
    const defaults = patch.find((entry) => entry.id === "agent-default-model") as {
      config: { provider: string; model: string };
    };
    expect(defaults.config.provider).toBe(DEEPSEEK_PROVIDER_ID);
    expect(defaults.config.model).toBe(selected.id);
    expect(patch.some((entry) => entry.id === "llm-deepseek" && entry.disabled === true)).toBe(
      true,
    );
  });

  test("launch spec strips user --patch and injects AIAND_API_KEY", () => {
    const launch = buildDeepseekLaunchSpec({
      apiKey: "test-key",
      baseUrl: "https://api.aiand.com/v1",
      patchPath: "/tmp/patch.yml",
      passthrough: ["--patch", "evil.yml", "--verbose"],
      env: {},
    });
    expect(launch.args).toEqual(["web", "--patch", "/tmp/patch.yml", "--verbose"]);
    expect(launch.env.AIAND_API_KEY).toBe("test-key");
  });
});

describe("grok catalog and credential safety", () => {
  test("catalog entries point inference at the supplied base URL", () => {
    const catalog = buildGrokModelCatalog("https://api.aiand.com/v1");
    expect(catalog.object).toBe("list");
    expect(catalog.data.length).toBeGreaterThan(0);
    expect(catalog.data.every((entry) => entry.base_url === "https://api.aiand.com/v1")).toBe(true);
    expect(catalog.data.every((entry) => entry.api_backend === "chat_completions")).toBe(true);
  });

  test("launch env disables xAI-native image/voice surfaces", () => {
    const selected = resolveCodexModel().definition;
    const env = buildGrokLaunchEnvironment({
      inheritedEnv: { GROK_AUTH: "user-login", GROK_HOME: "  " },
      apiKey: "aiand-key",
      authPath: "/tmp/no-auth.json",
      baseUrl: "https://api.aiand.com/v1",
      modelsListUrl: "http://127.0.0.1:9/v1/models",
      selectedModel: selected,
    });
    expect(env.XAI_API_KEY).toBe("aiand-key");
    expect(env.AIAND_API_KEY).toBe("aiand-key");
    expect(env.GROK_IMAGE_GEN).toBe("0");
    expect(env.GROK_IMAGE_EDIT).toBe("0");
    expect(env.GROK_VOICE_MODE).toBe("0");
    expect(env.GROK_AUTH).toBeUndefined();
    expect(env.GROK_HOME).toBeUndefined();
    expect(env.GROK_XAI_API_BASE_URL).toBe("http://127.0.0.1:9/v1");
  });

  test("identity rule is prepended and model overrides are stripped", () => {
    const selected = resolveCodexModel().definition;
    const identity = buildGrokIdentityRule(selected);
    const args = grokArgsWithAiandIdentity(
      ["--model", "xai/grok", "--rules", "user rule", "-q"],
      identity,
    );
    expect(args).not.toContain("xai/grok");
    expect(args).toContain("--rules");
    expect(args.at(-1)).toContain(identity);
    expect(args.at(-1)).toContain("user rule");
  });
});
