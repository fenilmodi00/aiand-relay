import { readFile } from "node:fs/promises";
import path from "node:path";
import { writeJsonAtomic } from "../aiand-core.js";
import { OPENCODE_PROVIDER_ID } from "./defaults.js";

export type AuthWriteResult =
  | { status: "created" | "updated"; path: string }
  | { status: "aborted"; path: string; reason: "invalid-json" | "not-object" };

export function opencodeAuthJsonPath(opts: { home: string; env: NodeJS.ProcessEnv }): string {
  const dataHome = opts.env.XDG_DATA_HOME || path.join(opts.home, ".local", "share");
  return path.join(dataHome, "opencode", "auth.json");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}

export async function upsertOpencodeAiandAuth(opts: {
  home: string;
  env: NodeJS.ProcessEnv;
  apiKey: string;
}): Promise<AuthWriteResult> {
  const filePath = opencodeAuthJsonPath(opts);
  let existing: string | undefined;
  try {
    existing = await readFile(filePath, "utf8");
  } catch (err) {
    if (!(isNodeError(err) && err.code === "ENOENT")) {
      throw err;
    }
  }

  if (existing === undefined) {
    await writeJsonAtomic(filePath, {
      [OPENCODE_PROVIDER_ID]: { type: "api", key: opts.apiKey },
    });
    return { status: "created", path: filePath };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(existing);
  } catch {
    return { status: "aborted", path: filePath, reason: "invalid-json" };
  }
  if (!isPlainObject(parsed)) {
    return { status: "aborted", path: filePath, reason: "not-object" };
  }

  parsed[OPENCODE_PROVIDER_ID] = { type: "api", key: opts.apiKey };
  await writeJsonAtomic(filePath, parsed);
  return { status: "updated", path: filePath };
}
