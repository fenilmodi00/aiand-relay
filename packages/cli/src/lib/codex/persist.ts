import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolveAiandBaseUrl, writeTextAtomic } from "../aiand-core.js";
import { codexModelCatalogJson } from "./catalog.js";
import { CODEX_PROVIDER_ID, resolveCodexModel } from "./defaults.js";
import { codexConfigPath } from "./user-config.js";
import { ensureDaemon, registerDaemonSession } from "../daemon/launch.js";
import { daemonUrl, resolveDaemonPort } from "../daemon/server.js";
import { installAutoStart } from "../daemon/auto-start.js";
import { writePersistentRegistration } from "../enablement/persistent-session.js";
import { relayHomeFor } from "../enablement/relay-home.js";
import type { RegisterSessionRequest } from "../daemon/state.js";

const BEGIN = "# --- aiandrelay native ---";
const END = "# --- end aiandrelay native ---";

export function nativeCodexCatalogPath(home: string): string {
  return path.join(relayHomeFor(home), "codex-native-catalog.json");
}

export async function enableCodexNative(opts: {
  home: string;
  apiKey: string;
  modelId?: string;
}): Promise<{ model: string; configPath: string; endpoint: string }> {
  const { url } = await ensureDaemon();
  await installAutoStart().catch(() => undefined);
  const selected = resolveCodexModel(opts.modelId);
  const token = `aiandrelay-codex-${randomBytes(24).toString("base64url")}`;
  const registration: RegisterSessionRequest = {
    token,
    authToken: token,
    agent: "codex",
    apiKey: opts.apiKey,
    baseUrl: resolveAiandBaseUrl(),
    modelLabel: selected.definition.name,
    modelId: selected.id,
    targetModelId: selected.definition.id,
    modelDefinition: selected.definition,
  };
  await registerDaemonSession(url, registration);
  await writePersistentRegistration("codex", registration, relayHomeFor(opts.home));

  const catalogPath = nativeCodexCatalogPath(opts.home);
  await writeTextAtomic(catalogPath, `${codexModelCatalogJson()}\n`);

  const configPath = codexConfigPath(opts.home);
  const existing = await readTextIfExists(configPath);
  const next = applyNativeCodexBlock(existing ?? "", {
    modelId: selected.id,
    baseUrl: `${url}/v1`,
    apiKey: token,
    catalogPath,
  });
  await writeTextAtomic(configPath, next);
  return { model: selected.id, configPath, endpoint: url };
}

export function applyNativeCodexBlock(
  raw: string,
  opts: { modelId: string; baseUrl: string; apiKey: string; catalogPath: string },
): string {
  const stripped = stripNativeCodexBlock(raw).trimEnd();
  const block = [
    BEGIN,
    `model = ${tomlString(opts.modelId)}`,
    `model_provider = ${tomlString(CODEX_PROVIDER_ID)}`,
    `model_catalog_json = ${tomlString(opts.catalogPath)}`,
    "",
    `[model_providers.${CODEX_PROVIDER_ID}]`,
    `name = ${tomlString("ai& Relay")}`,
    `base_url = ${tomlString(opts.baseUrl)}`,
    `wire_api = ${tomlString("responses")}`,
    `api_key = ${tomlString(opts.apiKey)}`,
    END,
    "",
  ].join("\n");
  return stripped ? `${stripped}\n\n${block}` : `${block}`;
}

export function stripNativeCodexBlock(raw: string): string {
  const start = raw.indexOf(BEGIN);
  if (start < 0) {
    return raw;
  }
  const end = raw.indexOf(END, start);
  if (end < 0) {
    return raw.slice(0, start);
  }
  return `${raw.slice(0, start)}${raw.slice(end + END.length)}`;
}

export async function codexNativeStatus(home: string): Promise<{
  connection: "on" | "off";
  provider?: string;
  auth?: string;
  model?: string;
  detail?: string;
}> {
  try {
    const raw = await readFile(codexConfigPath(home), "utf8");
    if (!raw.includes(BEGIN) || !raw.includes("127.0.0.1")) {
      return { connection: "off" };
    }
    return {
      connection: "on",
      provider: "ai& (local daemon)",
      auth: "api_key in config.toml",
      detail: `Endpoint: ${daemonUrl(resolveDaemonPort())}/v1`,
    };
  } catch {
    return { connection: "off" };
  }
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

async function readTextIfExists(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw err;
  }
}
