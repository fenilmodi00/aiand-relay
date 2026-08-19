import { randomBytes } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { writeJsonAtomic, resolveAiandBaseUrl } from "../aiand-core.js";
import { resolveClaudeModel } from "./defaults.js";
import { claudeSettingsPath } from "./user-config.js";
import { buildClaudeEnv } from "./core.js";
import { ensureDaemon, registerDaemonSession } from "../daemon/launch.js";
import { daemonUrl, resolveDaemonPort } from "../daemon/server.js";
import { installAutoStart } from "../daemon/auto-start.js";
import { writePersistentRegistration } from "../enablement/persistent-session.js";
import { relayHomeFor } from "../enablement/relay-home.js";
import type { RegisterSessionRequest } from "../daemon/state.js";
import { isPlainObject } from "../shared/native-user-config.js";

export async function enableClaudeNative(opts: {
  home: string;
  apiKey: string;
  modelId?: string;
}): Promise<{ model: string; settingsPath: string; endpoint: string }> {
  const { url } = await ensureDaemon();
  await installAutoStart().catch(() => undefined);
  const selected = resolveClaudeModel(opts.modelId);
  const token = `aiandrelay-claude-${randomBytes(24).toString("base64url")}`;
  const registration: RegisterSessionRequest = {
    token,
    authToken: token,
    agent: "claude",
    apiKey: opts.apiKey,
    baseUrl: resolveAiandBaseUrl(),
    modelLabel: selected.definition.name,
    modelId: selected.alias,
    targetModelId: selected.definition.id,
    modelDefinition: selected.definition,
  };
  await registerDaemonSession(url, registration);
  await writePersistentRegistration("claude", registration, relayHomeFor(opts.home));

  const settingsPath = claudeSettingsPath(opts.home);
  const env = buildClaudeEnv({
    apiKey: opts.apiKey,
    baseUrl: resolveAiandBaseUrl(),
    modelId: selected.alias,
    modelName: selected.definition.name,
    proxyUrl: url,
    authToken: token,
  });
  const nextEnv: Record<string, string> = {
    ANTHROPIC_BASE_URL: String(env.ANTHROPIC_BASE_URL ?? url),
    ANTHROPIC_AUTH_TOKEN: token,
  };
  for (const key of Object.keys(env)) {
    if (key.startsWith("ANTHROPIC_") || key.startsWith("CLAUDE_")) {
      const value = env[key];
      if (typeof value === "string") {
        nextEnv[key] = value;
      }
    }
  }

  let existing: Record<string, unknown> = {};
  try {
    const raw = await readFile(settingsPath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (isPlainObject(parsed)) {
      existing = parsed;
    }
  } catch {
    existing = {};
  }
  const prevEnv = isPlainObject(existing.env) ? existing.env : {};
  existing.env = { ...prevEnv, ...nextEnv };
  await mkdir(path.dirname(settingsPath), { recursive: true });
  await writeJsonAtomic(settingsPath, existing);
  return { model: selected.alias, settingsPath, endpoint: url };
}

export async function claudeNativeStatus(home: string): Promise<{
  connection: "on" | "off";
  provider?: string;
  auth?: string;
  model?: string;
  detail?: string;
}> {
  const settingsPath = claudeSettingsPath(home);
  try {
    const parsed: unknown = JSON.parse(await readFile(settingsPath, "utf8"));
    if (!isPlainObject(parsed) || !isPlainObject(parsed.env)) {
      return { connection: "off" };
    }
    const base = String(parsed.env.ANTHROPIC_BASE_URL ?? "");
    if (!base.includes("127.0.0.1") && !base.includes("localhost")) {
      return { connection: "off" };
    }
    const model =
      typeof parsed.env.ANTHROPIC_MODEL === "string" ? parsed.env.ANTHROPIC_MODEL : undefined;
    return {
      connection: "on",
      provider: "ai& (local daemon)",
      auth: "ANTHROPIC_AUTH_TOKEN in settings.json",
      ...(model !== undefined ? { model } : {}),
      detail: `Endpoint: ${base}`,
    };
  } catch {
    return { connection: "off" };
  }
}

export function claudeLoopbackUrl(): string {
  return daemonUrl(resolveDaemonPort());
}
