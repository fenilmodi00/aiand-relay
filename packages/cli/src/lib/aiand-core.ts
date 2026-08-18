import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { AIAND_BASE_URL as SHARED_AIAND_BASE_URL } from "@aiandrelay/models";
import type { HarnessContext } from "./harness-types.js";

// Re-exported from the shared @aiandrelay/models manifest so the base URL
// stays in one place; kept here to preserve this module's existing import surface.
export const AIAND_BASE_URL = SHARED_AIAND_BASE_URL;
export const AIAND_API_KEY_ENV_REF = "{env:AIAND_API_KEY}";

/**
 * Resolve the ai& API root from the trusted launcher environment.
 * Repository .env loading intentionally excludes AIAND_BASE_URL.
 */
export function resolveAiandBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.AIAND_BASE_URL?.trim();
  if (!override) {
    return AIAND_BASE_URL;
  }
  const normalized = override.replace(/\/+$/, "");
  return normalized.endsWith("/v1") ? normalized : `${normalized}/v1`;
}

export type JsonObject = Record<string, unknown>;

export async function readJsonIfExists<T extends JsonObject = JsonObject>(
  filePath: string,
): Promise<T> {
  try {
    const raw = await readFile(filePath, "utf8");
    return raw.trim() ? (JSON.parse(raw) as T) : ({} as T);
  } catch (err) {
    if (isNodeError(err) && err.code === "ENOENT") {
      return {} as T;
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read ${filePath}: ${message}`);
  }
}

export async function writeTextAtomic(filePath: string, text: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(tmpPath, text, { mode: 0o600 });
  await rename(tmpPath, filePath);
}

export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  await writeTextAtomic(filePath, serialized);
}

/**
 * Key resolution order: explicit flag > global config > AIAND_API_KEY env var.
 */
type ResolveAiandApiKeyOptions = {
  apiKey?: string | undefined;
  home?: string | undefined;
};

export async function resolveAiandApiKey({
  apiKey,
  home,
}: ResolveAiandApiKeyOptions): Promise<string> {
  if (apiKey?.trim()) {
    return apiKey.trim();
  }
  if (home) {
    const { readGlobalConfig, resolveStoredApiKey } = await import("./global-config.js");
    const globalKey = resolveStoredApiKey((await readGlobalConfig(home)).apiKey);
    if (globalKey) {
      return globalKey;
    }
  }
  return process.env.AIAND_API_KEY?.trim() ?? "";
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
