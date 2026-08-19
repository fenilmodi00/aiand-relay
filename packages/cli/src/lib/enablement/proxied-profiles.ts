import { HARNESS } from "../harness.js";
import { claudeSettingsPath } from "../claude/user-config.js";
import { enableClaudeNative, claudeNativeStatus } from "../claude/persist.js";
import { enableCodexNative, codexNativeStatus } from "../codex/persist.js";
import { codexConfigPath } from "../codex/user-config.js";
import type { EnablementProfile } from "./types.js";

export function proxiedProfiles(): EnablementProfile[] {
  return [
    {
      id: HARNESS.CLAUDE,
      label: "Claude Code",
      family: "proxied",
      paths: (ctx) => [claudeSettingsPath(ctx.home)],
      async enable(ctx, apiKey) {
        const result = await enableClaudeNative({
          home: ctx.home,
          apiKey,
          ...(ctx.main !== undefined ? { modelId: ctx.main } : {}),
        });
        if (result.endpoint.includes("api.aiand.com")) {
          throw new Error("Claude on must point at the local daemon, not api.aiand.com.");
        }
        return {
          label: "Claude Code",
          model: result.model,
          wrote: [result.settingsPath],
          auth: "stored key in ~/.aiandrelay (daemon session token in settings.json)",
          endpoint: `${result.endpoint}  (daemon; required for Claude)`,
          restartHint: "Claude Code",
        };
      },
      status: (ctx) => claudeNativeStatus(ctx.home),
    },
    {
      id: HARNESS.CODEX,
      label: "Codex",
      family: "proxied",
      paths: (ctx) => [codexConfigPath(ctx.home)],
      async enable(ctx, apiKey) {
        const result = await enableCodexNative({
          home: ctx.home,
          apiKey,
          ...(ctx.main !== undefined ? { modelId: ctx.main } : {}),
        });
        if (result.endpoint.includes("api.aiand.com")) {
          throw new Error("Codex on must point at the local daemon, not api.aiand.com.");
        }
        return {
          label: "Codex",
          model: result.model,
          wrote: [result.configPath],
          auth: "daemon session token in config.toml",
          endpoint: `${result.endpoint}/v1  (daemon; required for Codex)`,
          restartHint: "Codex",
        };
      },
      status: (ctx) => codexNativeStatus(ctx.home),
    },
  ];
}
