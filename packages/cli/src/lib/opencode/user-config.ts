import { existsSync, lstatSync } from "node:fs";
import path from "node:path";
import { AIAND_BASE_URL } from "@aiandrelay/models";
import { opencodeModelEntries } from "./defaults.js";

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
    return lstatSync(dir).isDirectory();
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
