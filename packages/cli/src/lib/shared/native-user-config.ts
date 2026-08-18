import { statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getSelectableModels, type ModelDefinition } from "@aiandrelay/models";
import { writeTextAtomic } from "../aiand-core.js";

export type NativeInjectSuccessStatus = "created" | "merged" | "updated";

export type NativeInjectContext = {
  home: string;
  env: NodeJS.ProcessEnv;
};

export type NativePresenceContext = NativeInjectContext & {
  binaryPresent: boolean;
};

export type NativeInjectResult<TReason extends string> =
  | { status: NativeInjectSuccessStatus; path: string }
  | { status: "aborted"; path: string; reason: TReason };

export type NativeAuthInjector<TReason extends string> = {
  persistAuth(opts: NativeInjectContext & { apiKey: string }): Promise<NativeInjectResult<TReason>>;
};

export type NativeUserConfigInjector<
  TConfigReason extends string,
  TAuthReason extends string = never,
> = {
  harness: string;
  isPresent(opts: NativePresenceContext): boolean;
  injectUserConfig(opts: NativeInjectContext): Promise<NativeInjectResult<TConfigReason>>;
} & ([TAuthReason] extends [never] ? object : NativeAuthInjector<TAuthReason>);

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createdOrMergedStatus(hadExistingEntry: boolean): "created" | "merged" {
  return hadExistingEntry ? "merged" : "created";
}

export function updatedOrCreatedStatus(hadExistingEntry: boolean): "created" | "updated" {
  return hadExistingEntry ? "updated" : "created";
}

export function directoryExists(dirPath: string): boolean {
  try {
    return statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

export function isPresentByBinaryOrDirectory(
  binaryPresent: boolean,
  directoryPath: string,
): boolean {
  return binaryPresent || directoryExists(directoryPath);
}

export async function readTextIfExists(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (err) {
    if (isNodeError(err) && err.code === "ENOENT") {
      return undefined;
    }
    throw err;
  }
}

export type DotenvUpsertResult = {
  status: "created" | "updated";
  path: string;
};

export async function upsertDotenvVar(
  filePath: string,
  key: string,
  value: string,
): Promise<DotenvUpsertResult> {
  const line = `${key}=${value}`;
  const existing = await readTextIfExists(filePath);
  if (existing === undefined || existing.trim() === "") {
    await writeTextAtomic(filePath, `${line}\n`);
    return { status: "created", path: filePath };
  }

  const updatedLines = existing
    .split(/\r?\n/)
    .filter((entry, index, arr) => !(index === arr.length - 1 && entry === ""))
    .map((entry) => (entry.startsWith(`${key}=`) ? line : entry));
  if (!updatedLines.some((entry) => entry.startsWith(`${key}=`))) {
    updatedLines.push(line);
  }
  await writeTextAtomic(filePath, `${updatedLines.join("\n")}\n`);
  return { status: "updated", path: filePath };
}

export function homeDotDir(home: string, ...parts: string[]): string {
  return path.join(home, ...parts);
}

/**
 * Shared ai& model source for native user-config payloads. Later harness
 * injectors should derive their provider-model lists from this helper instead
 * of reaching into harness-local defaults independently.
 */
export function getNativeUserConfigModels(): readonly ModelDefinition[] {
  return getSelectableModels();
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
