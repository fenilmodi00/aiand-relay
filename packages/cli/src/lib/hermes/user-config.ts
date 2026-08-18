import path from "node:path";
import { isMap, isSeq, parseDocument, stringify as stringifyYaml } from "yaml";
import { AIAND_BASE_URL, AIAND_API_KEY_ENV_NAME, writeTextAtomic } from "../aiand-core.js";
import {
  createdOrMergedStatus,
  getNativeUserConfigModels,
  isPlainObject,
  isPresentByBinaryOrDirectory,
  type NativeInjectResult,
  readTextIfExists,
  upsertDotenvVar,
} from "../shared/native-user-config.js";

export type HermesConfigResult = NativeInjectResult<
  | "invalid-yaml"
  | "not-object"
  | "providers-not-object"
  | "aiand-not-object"
  | "models-not-sequence"
>;

export function hermesConfigDir(opts: { home: string; env: NodeJS.ProcessEnv }): string {
  return opts.env.HERMES_HOME || path.join(opts.home, ".hermes");
}

export function hermesConfigPath(opts: { home: string; env: NodeJS.ProcessEnv }): string {
  return path.join(hermesConfigDir(opts), "config.yaml");
}

export function hermesEnvPath(opts: { home: string; env: NodeJS.ProcessEnv }): string {
  return path.join(hermesConfigDir(opts), ".env");
}

export function isHermesPresent(opts: {
  home: string;
  env: NodeJS.ProcessEnv;
  binaryPresent: boolean;
}): boolean {
  return isPresentByBinaryOrDirectory(opts.binaryPresent, hermesConfigDir(opts));
}

export async function injectHermesUserConfig(opts: {
  home: string;
  env: NodeJS.ProcessEnv;
}): Promise<HermesConfigResult> {
  const filePath = hermesConfigPath(opts);
  const existing = await readTextIfExists(filePath);
  const providerConfig = {
    base_url: AIAND_BASE_URL,
    discover_models: false,
    models: getNativeUserConfigModels().map((definition) => ({
      id: definition.id,
      name: definition.name,
    })),
  };

  if (existing === undefined || existing.trim() === "") {
    await writeTextAtomic(filePath, stringifyYaml({ providers: { aiand: providerConfig } }));
    return { status: "created", path: filePath };
  }

  const document = parseDocument(existing);
  if (document.errors.length > 0) {
    return { status: "aborted", path: filePath, reason: "invalid-yaml" };
  }

  if (document.contents === null) {
    document.contents = document.createNode({
      providers: { aiand: providerConfig },
    }) as unknown as NonNullable<typeof document.contents>;
    await writeTextAtomic(filePath, document.toString());
    return { status: "created", path: filePath };
  }
  if (!isMap(document.contents)) {
    return { status: "aborted", path: filePath, reason: "not-object" };
  }

  const root = document.contents as unknown as MutableYamlMap;
  const providersNode = root.get("providers", true);
  if (providersNode !== undefined && !isMap(providersNode)) {
    return { status: "aborted", path: filePath, reason: "providers-not-object" };
  }

  if (providersNode === undefined) {
    root.set("providers", { aiand: providerConfig });
    await writeTextAtomic(filePath, document.toString());
    return { status: "created", path: filePath };
  }

  const existingAiandNode = providersNode.get("aiand", true);
  if (existingAiandNode !== undefined && !isMap(existingAiandNode)) {
    return { status: "aborted", path: filePath, reason: "aiand-not-object" };
  }

  if (existingAiandNode === undefined) {
    providersNode.set("aiand", providerConfig);
  } else {
    const mergeError = mergeHermesProvider(
      existingAiandNode as MutableYamlMap,
      providerConfig,
      document,
    );
    if (mergeError) {
      return { status: "aborted", path: filePath, reason: mergeError };
    }
  }

  await writeTextAtomic(filePath, document.toString());
  return { status: createdOrMergedStatus(existingAiandNode !== undefined), path: filePath };
}

export function upsertHermesEnvKey(opts: {
  home: string;
  env: NodeJS.ProcessEnv;
  apiKey: string;
}) {
  return upsertDotenvVar(hermesEnvPath(opts), AIAND_API_KEY_ENV_NAME, opts.apiKey);
}

type MutableYamlMap = {
  get(key: string, keepScalar?: boolean): unknown;
  set(key: string, value: unknown): void;
  items?: unknown[];
};

type MutableYamlSeq = {
  items: unknown[];
  add(value: unknown): void;
};

type HermesProviderConfig = {
  base_url: string;
  discover_models: boolean;
  models: Array<{ id: string; name: string }>;
};

function mergeHermesProvider(
  aiandNode: MutableYamlMap,
  providerConfig: HermesProviderConfig,
  document: ReturnType<typeof parseDocument>,
): "models-not-sequence" | undefined {
  aiandNode.set("base_url", providerConfig.base_url);
  aiandNode.set("discover_models", providerConfig.discover_models);
  return mergeHermesModels(aiandNode, providerConfig.models, document);
}

function mergeHermesModels(
  aiandNode: MutableYamlMap,
  nextModels: HermesProviderConfig["models"],
  document: ReturnType<typeof parseDocument>,
): "models-not-sequence" | undefined {
  const existingModels = aiandNode.get("models", true);
  if (existingModels !== undefined && isSeq(existingModels)) {
    const modelSeq = existingModels as MutableYamlSeq;
    const byId = new Map<string, MutableYamlMap>();
    for (const item of modelSeq.items) {
      if (!isMap(item)) {
        continue;
      }
      const id = yamlStringValue((item as MutableYamlMap).get("id", true));
      if (id !== undefined) {
        byId.set(id, item as MutableYamlMap);
      }
    }

    for (const nextModel of nextModels) {
      const existingModel = byId.get(nextModel.id);
      if (existingModel) {
        existingModel.set("id", nextModel.id);
        existingModel.set("name", nextModel.name);
      } else {
        modelSeq.add(document.createNode(nextModel));
      }
    }
    return undefined;
  }

  if (existingModels !== undefined) {
    return "models-not-sequence";
  }

  aiandNode.set("models", nextModels);
  return undefined;
}

function yamlStringValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (isPlainObject(value) && "value" in value && typeof value.value === "string") {
    return value.value;
  }
  return undefined;
}
