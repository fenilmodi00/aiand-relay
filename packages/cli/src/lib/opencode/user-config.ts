import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { AIAND_BASE_URL } from "@aiandrelay/models";
import { applyEdits, modify, parse, type ParseError } from "jsonc-parser";
import { writeJsonAtomic, writeTextAtomic } from "../aiand-core.js";
import { OPENCODE_PROVIDER_ID, opencodeModelEntries } from "./defaults.js";

export type UserOpencodeProvider = {
  npm: string;
  name: string;
  options: { baseURL: string };
  models: ReturnType<typeof opencodeModelEntries>;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function buildUserOpencodeProvider(): UserOpencodeProvider {
  return {
    npm: "@ai-sdk/openai-compatible",
    name: "ai&",
    options: { baseURL: AIAND_BASE_URL },
    models: { ...opencodeModelEntries() },
  };
}

export function mergeUserOpencodeProvider(
  existing: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...existing };
  merged.npm = "@ai-sdk/openai-compatible";
  merged.name = "ai&";

  const options = isPlainObject(existing.options) ? { ...existing.options } : {};
  options.baseURL = AIAND_BASE_URL;
  delete options.apiKey;
  merged.options = options;

  const models = isPlainObject(existing.models) ? { ...existing.models } : {};
  for (const [id, entry] of Object.entries(opencodeModelEntries())) {
    models[id] = entry;
  }
  merged.models = models;
  return merged;
}

export function opencodeGlobalConfigDir(opts: {
  home: string;
  env: NodeJS.ProcessEnv;
}): string {
  const configHome = opts.env.XDG_CONFIG_HOME || path.join(opts.home, ".config");
  return path.join(configHome, "opencode");
}

export function isOpencodePresent(opts: {
  home: string;
  env: NodeJS.ProcessEnv;
  binaryPresent: boolean;
}): boolean {
  if (opts.binaryPresent) {
    return true;
  }
  const dir = opencodeGlobalConfigDir(opts);
  try {
    return statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

export type LocatedOpencodeConfigFile = {
  dir: string;
  filePath: string;
  existed: boolean;
};

export function locateOpencodeGlobalConfigFile(opts: {
  home: string;
  env: NodeJS.ProcessEnv;
}): LocatedOpencodeConfigFile {
  const dir = opencodeGlobalConfigDir(opts);
  const jsonc = path.join(dir, "opencode.jsonc");
  const json = path.join(dir, "opencode.json");
  const config = path.join(dir, "config.json");
  if (existsSync(jsonc)) {
    return { dir, filePath: jsonc, existed: true };
  }
  if (existsSync(json)) {
    return { dir, filePath: json, existed: true };
  }
  if (existsSync(config)) {
    return { dir, filePath: config, existed: true };
  }
  return { dir, filePath: json, existed: false };
}

export type ConfigInjectResult =
  | { status: "created" | "merged"; path: string }
  | { status: "aborted"; path: string; reason: "invalid-json" | "v2-schema" | "provider-not-object" | "aiand-not-object" };

function newUserOpencodeDocument(): Record<string, unknown> {
  return {
    $schema: "https://opencode.ai/config.json",
    provider: {
      [OPENCODE_PROVIDER_ID]: buildUserOpencodeProvider(),
    },
  };
}

export async function injectOpencodeUserConfig(opts: {
  home: string;
  env: NodeJS.ProcessEnv;
}): Promise<ConfigInjectResult> {
  const located = locateOpencodeGlobalConfigFile(opts);
  const filePath = located.filePath;

  if (!located.existed) {
    await writeJsonAtomic(filePath, newUserOpencodeDocument());
    return { status: "created", path: filePath };
  }

  const text = await readFile(filePath, "utf8");
  if (text.trim() === "") {
    await writeJsonAtomic(filePath, newUserOpencodeDocument());
    return { status: "created", path: filePath };
  }

  const errors: ParseError[] = [];
  const parsed: unknown = parse(text, errors);
  if (errors.length > 0 || !isPlainObject(parsed)) {
    return { status: "aborted", path: filePath, reason: "invalid-json" };
  }

  if ("providers" in parsed && !("provider" in parsed)) {
    return { status: "aborted", path: filePath, reason: "v2-schema" };
  }

  if ("provider" in parsed && !isPlainObject(parsed.provider)) {
    return { status: "aborted", path: filePath, reason: "provider-not-object" };
  }

  const provider = parsed.provider;
  const existingAiand =
    isPlainObject(provider) && OPENCODE_PROVIDER_ID in provider
      ? provider[OPENCODE_PROVIDER_ID]
      : undefined;
  if (existingAiand !== undefined && !isPlainObject(existingAiand)) {
    return { status: "aborted", path: filePath, reason: "aiand-not-object" };
  }

  const nextAiand = isPlainObject(existingAiand)
    ? mergeUserOpencodeProvider(existingAiand)
    : buildUserOpencodeProvider();
  const edits = modify(text, ["provider", OPENCODE_PROVIDER_ID], nextAiand, {
    formattingOptions: { tabSize: 2, insertSpaces: true },
  });
  const nextText = applyEdits(text, edits);
  await writeTextAtomic(filePath, nextText);
  return {
    status: isPlainObject(existingAiand) ? "merged" : "created",
    path: filePath,
  };
}
