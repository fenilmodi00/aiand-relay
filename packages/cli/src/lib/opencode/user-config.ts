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
