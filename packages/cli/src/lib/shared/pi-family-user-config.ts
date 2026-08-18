import { existsSync } from "node:fs";
import path from "node:path";
import { applyEdits, modify, parse, type ParseError } from "jsonc-parser";
import { isMap, parseDocument, stringify as stringifyYaml } from "yaml";
import {
  AIAND_API_KEY_ENV_NAME,
  AIAND_BASE_URL,
  writeJsonAtomic,
  writeTextAtomic,
} from "../aiand-core.js";
import {
  getNativeUserConfigModels,
  isPlainObject,
  isPresentByBinaryOrDirectory,
  type NativeInjectResult,
  readTextIfExists,
} from "./native-user-config.js";

export type PiFamilyHarness = "pi" | "omp" | "prime";

export type PiFamilyConfigErrorReason =
  | "invalid-json"
  | "invalid-yaml"
  | "not-object"
  | "providers-not-object"
  | "aiand-not-object";
export type PiFamilyConfigResult = NativeInjectResult<PiFamilyConfigErrorReason>;
export type PiFamilyAuthResult = NativeInjectResult<"invalid-json" | "not-object">;

const PI_FAMILY_PROVIDER_ID = "aiand";
const PI_FAMILY_AUTH_PLACEHOLDER = "configured-via-auth-json";
const PI_FAMILY_THINKING_LEVEL_MAP = {
  off: "none",
  minimal: "none",
  low: "none",
  medium: "high",
  high: "high",
  xhigh: "max",
  max: "max",
} as const;

type PiFamilyFormat = "json" | "yaml";

type LocatedPiFamilyConfigFile = {
  dir: string;
  filePath: string;
  existed: boolean;
  format: PiFamilyFormat;
};

type PiFamilyProviderModel = {
  id: string;
  name: string;
  reasoning: boolean;
  input: Array<"text" | "image">;
  contextWindow: number;
  maxTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  thinkingLevelMap?: typeof PI_FAMILY_THINKING_LEVEL_MAP;
};

type PiFamilyProviderConfig = {
  baseUrl: string;
  api: "openai-completions";
  authHeader: true;
  compat: {
    supportsDeveloperRole: false;
    supportsReasoningEffort: true;
  };
  models: PiFamilyProviderModel[];
  apiKey?: string;
};

export function piFamilyConfigDir(harness: PiFamilyHarness, home: string): string {
  switch (harness) {
    case "pi":
      return path.join(home, ".pi", "agent");
    case "omp":
      return path.join(home, ".omp", "agent");
    case "prime":
      return path.join(home, ".prime", "agent");
  }
}

export function locatePiFamilyConfigFile(
  harness: PiFamilyHarness,
  home: string,
): LocatedPiFamilyConfigFile {
  const dir = piFamilyConfigDir(harness, home);
  if (harness === "omp") {
    const yml = path.join(dir, "models.yml");
    const yaml = path.join(dir, "models.yaml");
    const json = path.join(dir, "models.json");
    if (existsSync(yml)) {
      return { dir, filePath: yml, existed: true, format: "yaml" };
    }
    if (existsSync(yaml)) {
      return { dir, filePath: yaml, existed: true, format: "yaml" };
    }
    if (existsSync(json)) {
      return { dir, filePath: json, existed: true, format: "json" };
    }
    return { dir, filePath: yml, existed: false, format: "yaml" };
  }

  const filePath = path.join(dir, "models.json");
  return { dir, filePath, existed: existsSync(filePath), format: "json" };
}

export function piFamilyAuthJsonPath(harness: Exclude<PiFamilyHarness, "omp">, home: string): string {
  return path.join(piFamilyConfigDir(harness, home), "auth.json");
}

export function isPiFamilyPresent(
  harness: PiFamilyHarness,
  home: string,
  binaryPresent: boolean,
): boolean {
  return isPresentByBinaryOrDirectory(binaryPresent, piFamilyConfigDir(harness, home));
}

export function buildPiFamilyProviderConfig(harness: PiFamilyHarness): PiFamilyProviderConfig {
  const models = getNativeUserConfigModels().map((definition) => ({
    id: definition.id,
    name: definition.name,
    reasoning: definition.reasoning,
    input: definition.modalities.input.filter(
      (mode): mode is "text" | "image" => mode === "text" || mode === "image",
    ),
    contextWindow: definition.limit.context,
    maxTokens: definition.limit.output,
    ...(definition.reasoning ? { thinkingLevelMap: PI_FAMILY_THINKING_LEVEL_MAP } : {}),
    cost: {
      input: definition.cost.input,
      output: definition.cost.output,
      cacheRead: definition.cost.cache_read ?? 0,
      cacheWrite: 0,
    },
  }));

  return {
    baseUrl: AIAND_BASE_URL,
    api: "openai-completions",
    authHeader: true,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: true,
    },
    models,
    ...(harness === "omp"
      ? { apiKey: AIAND_API_KEY_ENV_NAME }
      : { apiKey: PI_FAMILY_AUTH_PLACEHOLDER }),
  };
}

export async function upsertPiFamilyAuth(
  harness: Exclude<PiFamilyHarness, "omp">,
  home: string,
  apiKey: string,
): Promise<PiFamilyAuthResult> {
  const filePath = piFamilyAuthJsonPath(harness, home);
  const existing = await readTextIfExists(filePath);
  if (existing === undefined || existing.trim() === "") {
    await writeJsonAtomic(filePath, {
      [PI_FAMILY_PROVIDER_ID]: { type: "api_key", key: apiKey },
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
  parsed[PI_FAMILY_PROVIDER_ID] = { type: "api_key", key: apiKey };
  await writeJsonAtomic(filePath, parsed);
  return { status: "updated", path: filePath };
}

export async function injectPiFamilyConfig(
  harness: PiFamilyHarness,
  home: string,
): Promise<PiFamilyConfigResult> {
  const located = locatePiFamilyConfigFile(harness, home);
  const existing = await readTextIfExists(located.filePath);
  const nextProvider = buildPiFamilyProviderConfig(harness);

  if (existing === undefined || existing.trim() === "") {
    await writePiFamilyDocument(located.filePath, located.format, {
      providers: { [PI_FAMILY_PROVIDER_ID]: nextProvider },
    });
    return { status: "created", path: located.filePath };
  }

  const merged =
    located.format === "json"
      ? mergePiFamilyJsonText(existing, nextProvider)
      : mergePiFamilyYamlText(existing, nextProvider);
  if ("error" in merged) {
    return { status: "aborted", path: located.filePath, reason: merged.error };
  }
  await writeTextAtomic(located.filePath, merged.text);
  return {
    status: merged.hadExistingAiand ? "merged" : "created",
    path: located.filePath,
  };
}

function mergePiFamilyJsonText(
  text: string,
  nextProvider: PiFamilyProviderConfig,
): { text: string; hadExistingAiand: boolean } | { error: PiFamilyConfigErrorReason } {
  const errors: ParseError[] = [];
  const parsed: unknown = parse(text, errors);
  if (errors.length > 0) {
    return { error: "invalid-json" };
  }
  if (!isPlainObject(parsed)) {
    return { error: "not-object" };
  }
  if ("providers" in parsed && !isPlainObject(parsed.providers)) {
    return { error: "providers-not-object" };
  }

  const providers = isPlainObject(parsed.providers) ? parsed.providers : undefined;
  const existingAiand = providers?.[PI_FAMILY_PROVIDER_ID];
  if (existingAiand !== undefined && !isPlainObject(existingAiand)) {
    return { error: "aiand-not-object" };
  }

  const edits = modify(text, ["providers", PI_FAMILY_PROVIDER_ID], nextProvider, {
    formattingOptions: { tabSize: 2, insertSpaces: true },
  });
  return {
    text: applyEdits(text, edits),
    hadExistingAiand: existingAiand !== undefined,
  };
}

function mergePiFamilyYamlText(
  text: string,
  nextProvider: PiFamilyProviderConfig,
): { text: string; hadExistingAiand: boolean } | { error: PiFamilyConfigErrorReason } {
  const document = parseDocument(text);
  if (document.errors.length > 0) {
    return { error: "invalid-yaml" };
  }

  if (document.contents === null) {
    document.contents = document.createNode({
      providers: { [PI_FAMILY_PROVIDER_ID]: nextProvider },
    }) as unknown as NonNullable<typeof document.contents>;
    return { text: document.toString(), hadExistingAiand: false };
  }
  if (!isMap(document.contents)) {
    return { error: "not-object" };
  }

  const root = document.contents as typeof document.contents & {
    get(key: string, keepScalar?: boolean): unknown;
    set(key: string, value: unknown): void;
  };
  const providersNode = root.get("providers", true);
  if (providersNode !== undefined && !isMap(providersNode)) {
    return { error: "providers-not-object" };
  }

  if (providersNode === undefined) {
    root.set("providers", { [PI_FAMILY_PROVIDER_ID]: nextProvider });
    return { text: document.toString(), hadExistingAiand: false };
  }

  const existingAiandNode = providersNode.get(PI_FAMILY_PROVIDER_ID, true);
  if (existingAiandNode !== undefined && !isMap(existingAiandNode)) {
    return { error: "aiand-not-object" };
  }

  providersNode.set(PI_FAMILY_PROVIDER_ID, nextProvider);
  return {
    text: document.toString(),
    hadExistingAiand: existingAiandNode !== undefined,
  };
}

async function writePiFamilyDocument(
  filePath: string,
  format: PiFamilyFormat,
  value: Record<string, unknown>,
): Promise<void> {
  if (format === "json") {
    await writeJsonAtomic(filePath, value);
    return;
  }
  await writeTextAtomic(filePath, stringifyYaml(value));
}
