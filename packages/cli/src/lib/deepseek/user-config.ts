import path from "node:path";
import { isMap, isSeq, parseDocument, stringify as stringifyYaml } from "yaml";
import { AIAND_API_KEY_ENV_NAME, AIAND_BASE_URL } from "../aiand-core.js";
import {
  createdOrMergedStatus,
  getNativeUserConfigModels,
  isPlainObject,
  isPresentByBinaryOrDirectory,
  type NativeInjectResult,
  readTextIfExists,
} from "../shared/native-user-config.js";
import { writeTextAtomic } from "../aiand-core.js";

export type DeepseekConfigErrorReason =
  | "invalid-yaml"
  | "not-object"
  | "plugin-not-object"
  | "providers-not-object"
  | "aiand-not-object"
  | "aiand-compat-not-object"
  | "aiand-models-not-array";
export type DeepseekConfigResult = NativeInjectResult<DeepseekConfigErrorReason>;

export function deepseekConfigDir(opts: { home: string; env: NodeJS.ProcessEnv }): string {
  return opts.env.DSH_HOME || path.join(opts.home, ".dsh");
}

export function deepseekSettingsPath(opts: { home: string; env: NodeJS.ProcessEnv }): string {
  return path.join(deepseekConfigDir(opts), "settings.yaml");
}

export function isDeepseekPresent(opts: {
  home: string;
  env: NodeJS.ProcessEnv;
  binaryPresent: boolean;
}): boolean {
  return isPresentByBinaryOrDirectory(opts.binaryPresent, deepseekConfigDir(opts));
}

export async function injectDeepseekUserConfig(opts: {
  home: string;
  env: NodeJS.ProcessEnv;
}): Promise<DeepseekConfigResult> {
  const filePath = deepseekSettingsPath(opts);
  const existing = await readTextIfExists(filePath);
  const providerConfig: DeepseekProviderConfig = {
    apiKeyEnv: AIAND_API_KEY_ENV_NAME,
    api: "openai-completions",
    baseURL: AIAND_BASE_URL,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: true,
    },
    models: getNativeUserConfigModels().map((definition) => ({
      id: definition.id,
      name: definition.name,
      contextWindow: definition.limit.context,
      maxTokens: definition.limit.output,
      input: definition.modalities.input.filter(
        (mode): mode is "text" | "image" => mode === "text" || mode === "image",
      ),
    })),
  };

  if (existing === undefined || existing.trim() === "") {
    await writeTextAtomic(
      filePath,
      stringifyYaml({
        "llm-pi-ai": {
          providers: {
            aiand: providerConfig,
          },
        },
      }),
    );
    return { status: "created", path: filePath };
  }

  const merged = mergeDeepseekYamlText(existing, providerConfig);
  if ("error" in merged) {
    return { status: "aborted", path: filePath, reason: merged.error };
  }
  await writeTextAtomic(filePath, merged.text);
  return { status: createdOrMergedStatus(merged.hadExistingAiand), path: filePath };
}

type DeepseekProviderModel = {
  id: string;
  name: string;
  contextWindow: number;
  maxTokens: number;
  input: Array<"text" | "image">;
};

type DeepseekProviderConfig = {
  apiKeyEnv: string;
  api: "openai-completions";
  baseURL: string;
  compat: {
    supportsDeveloperRole: false;
    supportsReasoningEffort: true;
  };
  models: DeepseekProviderModel[];
};

function mergeDeepseekProvider(
  existingAiand: Record<string, unknown>,
  nextProvider: DeepseekProviderConfig,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    ...existingAiand,
    apiKeyEnv: nextProvider.apiKeyEnv,
    api: nextProvider.api,
    baseURL: nextProvider.baseURL,
  };

  const existingCompat = isPlainObject(existingAiand.compat) ? existingAiand.compat : undefined;
  merged.compat = existingCompat
    ? {
        ...existingCompat,
        supportsDeveloperRole: nextProvider.compat.supportsDeveloperRole,
        supportsReasoningEffort: nextProvider.compat.supportsReasoningEffort,
      }
    : nextProvider.compat;
  merged.models = mergeDeepseekModels(existingAiand.models, nextProvider.models);
  return merged;
}

function mergeDeepseekModels(
  existingModels: unknown,
  nextModels: DeepseekProviderModel[],
): unknown[] {
  if (!Array.isArray(existingModels)) {
    return nextModels;
  }

  const existingById = new Map<string, Record<string, unknown>>();
  const extras: unknown[] = [];
  for (const model of existingModels) {
    if (!isPlainObject(model) || typeof model.id !== "string") {
      extras.push(model);
      continue;
    }
    existingById.set(model.id, model);
  }

  const mergedModels: unknown[] = nextModels.map((nextModel) => {
    const existingModel = existingById.get(nextModel.id);
    return existingModel ? { ...existingModel, ...nextModel } : nextModel;
  });

  for (const model of existingModels) {
    if (!isPlainObject(model) || typeof model.id !== "string" || !existingById.has(model.id)) {
      continue;
    }
    if (!nextModels.some((nextModel) => nextModel.id === model.id)) {
      mergedModels.push(model);
    }
  }

  return [...mergedModels, ...extras];
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

type YamlScalarLike = {
  value: unknown;
};

function validateDeepseekYamlAiand(
  aiand: MutableYamlMap,
): Exclude<
  DeepseekConfigErrorReason,
  "invalid-yaml" | "not-object" | "plugin-not-object" | "providers-not-object" | "aiand-not-object"
> | undefined {
  const compatNode = aiand.get("compat", true);
  if (compatNode !== undefined && !isMap(compatNode)) {
    return "aiand-compat-not-object";
  }

  const modelsNode = aiand.get("models", true);
  if (modelsNode !== undefined && !isSeq(modelsNode)) {
    return "aiand-models-not-array";
  }

  return undefined;
}

function mergeDeepseekYamlText(
  text: string,
  nextProvider: DeepseekProviderConfig,
):
  | { text: string; hadExistingAiand: boolean }
  | { error: DeepseekConfigErrorReason } {
  const document = parseDocument(text);
  if (document.errors.length > 0) {
    return { error: "invalid-yaml" };
  }
  if (document.contents === null) {
    document.contents = document.createNode({
      "llm-pi-ai": {
        providers: {
          aiand: nextProvider,
        },
      },
    }) as unknown as NonNullable<typeof document.contents>;
    return { text: document.toString(), hadExistingAiand: false };
  }
  if (!isMap(document.contents)) {
    return { error: "not-object" };
  }

  const root = document.contents as unknown as MutableYamlMap;
  const pluginNode = root.get("llm-pi-ai", true);
  if (pluginNode !== undefined && !isMap(pluginNode)) {
    return { error: "plugin-not-object" };
  }
  if (pluginNode === undefined) {
    root.set("llm-pi-ai", { providers: { aiand: nextProvider } });
    return { text: document.toString(), hadExistingAiand: false };
  }

  const pluginMap = pluginNode as MutableYamlMap;
  const providersNode = pluginMap.get("providers", true);
  if (providersNode !== undefined && !isMap(providersNode)) {
    return { error: "providers-not-object" };
  }
  if (providersNode === undefined) {
    pluginMap.set("providers", { aiand: nextProvider });
    return { text: document.toString(), hadExistingAiand: false };
  }

  const providersMap = providersNode as MutableYamlMap;
  const aiandNode = providersMap.get("aiand", true);
  if (aiandNode !== undefined && !isMap(aiandNode)) {
    return { error: "aiand-not-object" };
  }
  if (aiandNode === undefined) {
    providersMap.set("aiand", nextProvider);
    return { text: document.toString(), hadExistingAiand: false };
  }
  const nestedError = validateDeepseekYamlAiand(aiandNode as MutableYamlMap);
  if (nestedError) {
    return { error: nestedError };
  }

  mergeDeepseekProviderNode(aiandNode as MutableYamlMap, nextProvider, document);
  return { text: document.toString(), hadExistingAiand: true };
}

function mergeDeepseekProviderNode(
  aiand: MutableYamlMap,
  nextProvider: DeepseekProviderConfig,
  document: ReturnType<typeof parseDocument>,
): void {
  aiand.set("apiKeyEnv", nextProvider.apiKeyEnv);
  aiand.set("api", nextProvider.api);
  aiand.set("baseURL", nextProvider.baseURL);
  mergeDeepseekCompatNode(aiand, nextProvider.compat);
  mergeDeepseekModelsNode(aiand, nextProvider.models, document);
}

function mergeDeepseekCompatNode(
  aiand: MutableYamlMap,
  compat: DeepseekProviderConfig["compat"],
): void {
  const existingCompat = aiand.get("compat", true);
  if (existingCompat !== undefined && isMap(existingCompat)) {
    const compatMap = existingCompat as MutableYamlMap;
    compatMap.set("supportsDeveloperRole", compat.supportsDeveloperRole);
    compatMap.set("supportsReasoningEffort", compat.supportsReasoningEffort);
    return;
  }

  aiand.set("compat", compat);
}

function mergeDeepseekModelsNode(
  aiand: MutableYamlMap,
  nextModels: DeepseekProviderModel[],
  document: ReturnType<typeof parseDocument>,
): void {
  const existingModels = aiand.get("models", true);
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
        existingModel.set("contextWindow", nextModel.contextWindow);
        existingModel.set("maxTokens", nextModel.maxTokens);
        existingModel.set("input", nextModel.input);
      } else {
        modelSeq.add(document.createNode(nextModel));
      }
    }
    return;
  }

  aiand.set("models", nextModels);
}

function yamlStringValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (isPlainObject(value) && "value" in value && typeof (value as YamlScalarLike).value === "string") {
    return (value as YamlScalarLike).value as string;
  }
  return undefined;
}
