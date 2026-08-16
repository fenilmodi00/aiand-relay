import { readJsonIfExists, writeJsonAtomic, AIAND_API_KEY_ENV_REF } from "./aiand-core.js";
import os from "node:os";
import path from "node:path";

export type GlobalConfig = {
  apiKey: string;
};

/** Explicit-home variant used by configure/tests. Daemon uses paths.aiandrelayHome(). */
export function aiandrelayHome(home = os.homedir()): string {
  return path.join(home, ".aiandrelay");
}

function globalConfigPath(home = os.homedir()): string {
  return path.join(aiandrelayHome(home), "config.json");
}

export async function readGlobalConfig(home = os.homedir()): Promise<GlobalConfig> {
  const config = await readJsonIfExists<Partial<GlobalConfig>>(globalConfigPath(home));
  return {
    apiKey: config.apiKey ?? "",
  };
}

export async function writeGlobalConfig(home: string, config: GlobalConfig): Promise<void> {
  await writeJsonAtomic(globalConfigPath(home), config);
}

export async function setGlobalApiKey(home: string, apiKey: string): Promise<void> {
  const config = await readGlobalConfig(home);
  config.apiKey = apiKey;
  await writeGlobalConfig(home, config);
}

/**
 * Resolves a stored key value to the literal secret. Stored values are
 * either a literal key or the `{env:AIAND_API_KEY}` reference written
 * when the key came from the environment rather than `--api-key`.
 */
export function resolveStoredApiKey(stored: string | undefined): string {
  if (!stored) {
    return "";
  }
  if (stored === AIAND_API_KEY_ENV_REF) {
    return process.env.AIAND_API_KEY?.trim() ?? "";
  }
  return stored;
}
