/**
 * Single source of truth for the ai& models aiandrelay routes to: ids,
 * capabilities, modalities, reasoning efforts, and per-1M cost. Both harnesses
 * (Claude Code's local proxy and OpenCode's ephemeral config) import from here
 * so the facts can't drift between them.
 *
 * The catalog is DYNAMIC: at startup the CLI/daemon fetches the live ai&
 * catalog (`GET /v1/models`) and builds the model list from it. Remap:
 * `context_window`, `capabilities[]`, `input_per_1m` / `output_per_1m` /
 * `cached_input_per_1m`, and per-row `reasoning_efforts`.
 *
 * A small curated override table (`CURATED_OVERRIDES`) supplies facts the
 * endpoint does not expose: max-output limits, Claude aliases, picker order,
 * and vision-failover rank.
 *
 * When the live fetch has not run or fails, everything falls back to
 * CATALOG_SNAPSHOT.
 */

import { CATALOG_SNAPSHOT } from "./catalog-snapshot.js";

export const AIAND_BASE_URL = "https://api.aiand.com/v1";

export type ModelCost = {
  /** USD-or-org-currency units per 1M input tokens (stored as catalog per-1M). */
  input: number;
  /** Per 1M output tokens. */
  output: number;
  /** Per 1M cached input tokens. 0 if none. */
  cache_read: number;
};

export type ModelLimit = {
  context: number;
  output: number;
};

export type Modality = "text" | "audio" | "image" | "video" | "pdf";

export type ModelModalities = {
  input: readonly Modality[];
  output: readonly Modality[];
};

export type AiandReasoningEffort = "none" | "low" | "medium" | "high" | "max";

export type ModelDefinition = {
  /** The ai& API model id, e.g. "zai-org/glm-5.2". */
  id: string;
  name: string;
  /** Claude Code's ANTHROPIC_MODEL alias, or null for non-curated. */
  anthropicAlias: string | null;
  cost: ModelCost;
  limit: ModelLimit;
  attachment: boolean;
  reasoning: boolean;
  temperature: boolean;
  tool_call: boolean;
  modalities: ModelModalities;
  /** Catalog allowlist for `reasoning_effort`; empty = do not send. */
  reasoningEfforts: readonly AiandReasoningEffort[];
  /** Catalog hint only — product default effort is still `"none"`. */
  reasoningEffortDefault?: AiandReasoningEffort | undefined;
};

const TOKENS_PER_MILLION = 1_000_000;

/** Convert a per-1M-token price to a per-token price (for CostTracker). */
export function costPerToken(costPerMillion: number): number {
  return costPerMillion / TOKENS_PER_MILLION;
}

export type AiandApiModel = {
  id: string;
  name?: string | null;
  description?: string | null;
  owned_by?: string | null;
  provider?: string | null;
  context_window?: number | null;
  capabilities?: readonly string[] | null;
  reasoning_efforts?: readonly string[] | null;
  reasoning_effort_default?: string | null;
  currency?: string | null;
  input_per_1m?: string | number | null;
  output_per_1m?: string | number | null;
  cached_input_per_1m?: string | number | null;
};

type ModelOverride = {
  name?: string;
  anthropicAlias?: string | null;
  outputLimit?: number;
  minContext?: number;
  reasoning?: boolean;
  temperature?: boolean;
  tool_call?: boolean;
  order?: number;
};

/**
 * Curated flagships only. Aliases are `aiand-<slug>`. Vision failover order
 * (SPEC §13): kimi-k2.7-code → kimi-k2.6 → gemma-4-31b-it (skip missing).
 */
const CURATED_OVERRIDES: Record<string, ModelOverride> = {
  "deepseek-ai/deepseek-v4-flash": {
    name: "DeepSeek V4 Flash",
    anthropicAlias: "aiand-deepseek-v4-flash",
    outputLimit: 384_000,
    order: 0,
  },
  "zai-org/glm-5.2": {
    name: "GLM 5.2",
    anthropicAlias: "aiand-glm-5-2",
    outputLimit: 164_000,
    order: 5,
  },
  "moonshotai/kimi-k2.7-code": {
    name: "Kimi K2.7 Code · vision",
    anthropicAlias: "aiand-kimi-k2-7-code",
    outputLimit: 131_072,
    order: 10,
  },
  "moonshotai/kimi-k2.6": {
    name: "Kimi K2.6 · vision",
    anthropicAlias: "aiand-kimi-k2-6",
    outputLimit: 131_000,
    order: 15,
  },
  "moonshotai/kimi-k3": {
    name: "Kimi K3",
    anthropicAlias: "aiand-kimi-k3",
    outputLimit: 131_072,
    order: 20,
  },
  "motif-technologies/motif-3": {
    name: "Motif 3 · fallback",
    anthropicAlias: "aiand-motif-3",
    outputLimit: 65_536,
    order: 30,
  },
  "deepseek-ai/deepseek-v4-pro": {
    name: "DeepSeek V4 Pro",
    anthropicAlias: "aiand-deepseek-v4-pro",
    outputLimit: 384_000,
    order: 50,
  },
  "google/gemma-4-31b-it": {
    name: "Gemma 4 31B · vision",
    outputLimit: 32_768,
    order: 60,
  },
  "qwen/qwen3.6-27b": {
    name: "Qwen 3.6 27B · vision",
    outputLimit: 65_536,
    order: 70,
  },
  "openai/gpt-oss-120b": {
    name: "GPT OSS 120B",
    outputLimit: 32_768,
    order: 80,
  },
};

export const DEFAULT_MODEL_ID = "deepseek-ai/deepseek-v4-flash";

/** SPEC §13 vision failover order (skip missing / non-vision). */
export const DEFAULT_VISION_MODEL_IDS = [
  "moonshotai/kimi-k2.7-code",
  "moonshotai/kimi-k2.6",
  "google/gemma-4-31b-it",
] as const;

function resolveVisionModelIds(): readonly string[] {
  const raw = process.env.AIANDRELAY_VISION_MODELS?.trim();
  if (!raw) {
    return DEFAULT_VISION_MODEL_IDS;
  }
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Claude Code ANTHROPIC_CUSTOM_MODEL_OPTION_SUPPORTED_CAPABILITIES (no xhigh). */
export const GLM_5_2_ANTHROPIC_CAPABILITIES =
  "effort,max_effort,thinking,adaptive_thinking,interleaved_thinking";

const ORDER_FALLBACK = 1_000;
const DEFAULT_OUTPUT_LIMIT = 32_768;
const DEFAULT_CONTEXT = 131_072;

const KNOWN_EFFORTS = new Set<string>(["none", "low", "medium", "high", "max"]);

function pricePerMillion(value: string | number | null | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : 0;
  }
  if (typeof value === "string") {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  return 0;
}

function parseReasoningEfforts(
  values: readonly string[] | null | undefined,
): AiandReasoningEffort[] {
  if (!values) {
    return [];
  }
  const out: AiandReasoningEffort[] = [];
  for (const raw of values) {
    const v = raw.toLowerCase();
    if (KNOWN_EFFORTS.has(v)) {
      out.push(v as AiandReasoningEffort);
    }
  }
  return out;
}

function modalitiesFromCapabilities(capabilities: readonly string[] | null | undefined): {
  modalities: ModelModalities;
  attachment: boolean;
  reasoning: boolean;
  tool_call: boolean;
} {
  const caps = new Set((capabilities ?? []).map((c) => c.toLowerCase()));
  const input: Modality[] = ["text"];
  if (caps.has("vision") || caps.has("image")) {
    input.push("image");
  }
  if (caps.has("video")) {
    input.push("video");
  }
  if (caps.has("document") || caps.has("pdf")) {
    input.push("pdf");
  }
  return {
    modalities: { input, output: ["text"] },
    attachment: input.includes("image"),
    reasoning: caps.has("reasoning"),
    tool_call: caps.has("tool_calling") || caps.has("tools"),
  };
}

function mapApiModel(api: AiandApiModel, override: ModelOverride | undefined): ModelDefinition {
  const fromCaps = modalitiesFromCapabilities(api.capabilities);
  const apiContext =
    typeof api.context_window === "number" && api.context_window > 0 ? api.context_window : 0;
  const context = Math.max(apiContext, override?.minContext ?? 0) || DEFAULT_CONTEXT;
  const output = override?.outputLimit ?? Math.min(context, DEFAULT_OUTPUT_LIMIT);
  const efforts = parseReasoningEfforts(api.reasoning_efforts);
  const defaultEffortRaw = api.reasoning_effort_default?.toLowerCase();
  const reasoningEffortDefault =
    defaultEffortRaw && KNOWN_EFFORTS.has(defaultEffortRaw)
      ? (defaultEffortRaw as AiandReasoningEffort)
      : undefined;
  return {
    id: api.id,
    name: override?.name ?? api.name ?? api.id,
    anthropicAlias: override?.anthropicAlias ?? null,
    cost: {
      input: pricePerMillion(api.input_per_1m),
      output: pricePerMillion(api.output_per_1m),
      cache_read: pricePerMillion(api.cached_input_per_1m),
    },
    limit: { context, output },
    attachment: fromCaps.attachment,
    reasoning: override?.reasoning ?? fromCaps.reasoning,
    temperature: override?.temperature ?? true,
    tool_call: override?.tool_call ?? fromCaps.tool_call,
    modalities: fromCaps.modalities,
    reasoningEfforts: efforts,
    reasoningEffortDefault,
  };
}

export type AiandCatalog = {
  all: readonly ModelDefinition[];
  selectable: readonly ModelDefinition[];
  vision: readonly ModelDefinition[];
  byId: ReadonlyMap<string, ModelDefinition>;
  defaultModel: ModelDefinition;
};

/**
 * Build a catalog from live (or snapshot) API rows. Chat models only:
 * anything without text chat/reasoning/tool capabilities is dropped.
 */
export function buildCatalog(apiModels: readonly AiandApiModel[]): AiandCatalog {
  const defs = apiModels
    .filter((m) => m && typeof m.id === "string" && m.id.length > 0)
    .filter((m) => {
      const caps = new Set((m.capabilities ?? []).map((c) => c.toLowerCase()));
      // Keep models that look like chat backends (not embeddings-only).
      return (
        caps.size === 0 ||
        caps.has("chat") ||
        caps.has("reasoning") ||
        caps.has("tool_calling") ||
        caps.has("vision")
      );
    })
    .map((m) => mapApiModel(m, CURATED_OVERRIDES[m.id]));

  const orderOf = (d: ModelDefinition): number => CURATED_OVERRIDES[d.id]?.order ?? ORDER_FALLBACK;
  const selectable = [...defs].sort(
    (a, b) => orderOf(a) - orderOf(b) || a.name.localeCompare(b.name),
  );

  const byId = new Map(defs.map((d) => [d.id, d]));
  const visionIds = resolveVisionModelIds();
  const vision = visionIds.flatMap((id) => {
    const model = byId.get(id);
    if (!model || !model.attachment) {
      return [];
    }
    return [model];
  });
  const defaultModel = byId.get(DEFAULT_MODEL_ID) ?? selectable[0] ?? defs[0];
  if (!defaultModel) {
    throw new Error("ai& catalog is empty: no chat models available.");
  }

  return { all: defs, selectable, vision, byId, defaultModel };
}

export class AiandCatalogError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AiandCatalogError";
  }
}

/**
 * Fetch the live catalog from `GET {baseUrl}/models` (no `?verbose=true`).
 */
export async function fetchAiandCatalog(opts: {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<AiandCatalog> {
  const base = (opts.baseUrl ?? AIAND_BASE_URL).replace(/\/$/, "");
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(`${base}/models`, {
    headers: { Authorization: `Bearer ${opts.apiKey}` },
    ...(opts.signal ? { signal: opts.signal } : {}),
  });
  if (!res.ok) {
    throw new AiandCatalogError(`GET /models failed: ${res.status}`, res.status);
  }
  let body: { data?: AiandApiModel[] };
  try {
    body = (await res.json()) as { data?: AiandApiModel[] };
  } catch {
    throw new AiandCatalogError("GET /models returned non-JSON");
  }
  const rows = Array.isArray(body.data) ? body.data : [];
  if (rows.length === 0) {
    throw new AiandCatalogError("GET /models returned no models");
  }
  return buildCatalog(rows);
}

export const SNAPSHOT_CATALOG: AiandCatalog = buildCatalog(CATALOG_SNAPSHOT);

function fromSnapshot(id: string): ModelDefinition {
  const model = SNAPSHOT_CATALOG.byId.get(id);
  if (!model) {
    throw new Error(`Snapshot is missing required model "${id}".`);
  }
  return model;
}

export const GLM_5_2: ModelDefinition = fromSnapshot("zai-org/glm-5.2");
export const KIMI_K2_7_CODE: ModelDefinition = fromSnapshot("moonshotai/kimi-k2.7-code");
export const KIMI_K3: ModelDefinition = fromSnapshot("moonshotai/kimi-k3");
export const MOTIF_3: ModelDefinition = fromSnapshot("motif-technologies/motif-3");
export const DEEPSEEK_V4_FLASH: ModelDefinition = fromSnapshot("deepseek-ai/deepseek-v4-flash");
export const DEEPSEEK_V4_PRO: ModelDefinition = fromSnapshot("deepseek-ai/deepseek-v4-pro");
export const GEMMA_4_31B: ModelDefinition = fromSnapshot("google/gemma-4-31b-it");
export const QWEN_3_6_27B: ModelDefinition = fromSnapshot("qwen/qwen3.6-27b");
export const GPT_OSS_120B: ModelDefinition = fromSnapshot("openai/gpt-oss-120b");

export const KIMI_K2_6: ModelDefinition | undefined =
  SNAPSHOT_CATALOG.byId.get("moonshotai/kimi-k2.6");

export const SELECTABLE_MODELS: readonly ModelDefinition[] = SNAPSHOT_CATALOG.selectable;
export const VISION_MODELS: readonly ModelDefinition[] = SNAPSHOT_CATALOG.vision;
export const VISION_PRIMARY: ModelDefinition = SNAPSHOT_CATALOG.vision[0] ?? KIMI_K2_7_CODE;

let activeCatalog: AiandCatalog = SNAPSHOT_CATALOG;

export function applyCatalog(catalog: AiandCatalog): void {
  activeCatalog = catalog;
}

export function getCatalog(): AiandCatalog {
  return activeCatalog;
}

export async function refreshCatalog(opts: {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<AiandCatalog> {
  const catalog = await fetchAiandCatalog(opts);
  applyCatalog(catalog);
  return catalog;
}

export function getSelectableModels(): readonly ModelDefinition[] {
  return activeCatalog.selectable;
}

export function getVisionModels(): readonly ModelDefinition[] {
  return activeCatalog.vision;
}

export function getVisionPrimary(): ModelDefinition {
  return activeCatalog.vision[0] ?? VISION_PRIMARY;
}

export function getDefaultModel(): ModelDefinition {
  return activeCatalog.defaultModel;
}

export function findModelById(id: string): ModelDefinition | undefined {
  return activeCatalog.byId.get(id);
}

export function isVisionModel(model: ModelDefinition): boolean {
  return model.attachment && model.modalities.input.includes("image");
}

/**
 * Whether a model accepts `reasoning_effort`. Prefer catalog `reasoningEfforts`;
 * empty list means omit the parameter.
 */
export function acceptsReasoningEffort(modelId: string): boolean {
  const model = activeCatalog.byId.get(modelId) ?? SNAPSHOT_CATALOG.byId.get(modelId);
  return (model?.reasoningEfforts.length ?? 0) > 0;
}

/**
 * Map harness effort vocabulary onto ai& wire values, then catalog-gate.
 * SPEC: none|minimal|off|low → none; medium|high → high; xhigh|max → max.
 */
export function mapReasoningEffortForModel(
  model: ModelDefinition,
  raw: string | undefined,
): AiandReasoningEffort | undefined {
  if (!raw) {
    return undefined;
  }
  const effort = raw.toLowerCase();
  let mapped: AiandReasoningEffort;
  if (effort === "none" || effort === "minimal" || effort === "off" || effort === "low") {
    mapped = "none";
  } else if (effort === "medium" || effort === "high") {
    mapped = "high";
  } else if (effort === "xhigh" || effort === "max") {
    mapped = "max";
  } else {
    return undefined;
  }
  if ((model.reasoningEfforts?.length ?? 0) === 0) {
    return undefined;
  }
  return model.reasoningEfforts.includes(mapped) ? mapped : undefined;
}

export function resolveModelByKeys(
  list: readonly ModelDefinition[],
  value: string | undefined,
  keys: ReadonlyArray<(model: ModelDefinition) => string | null | undefined>,
  defaultId: string,
): ModelDefinition | undefined {
  const defaultModel = list.find((model) => model.id === defaultId) ?? list[0];
  if (!value) {
    return defaultModel;
  }
  return list.find((model) => keys.some((key) => key(model) === value));
}

export const VISION_PROMPT =
  "Describe this image for a coding assistant that cannot see it. " +
  "Be concise but specific: layout, UI elements, colors, any text (quote it " +
  "verbatim), diagrams, charts, or notable details. If it is a screenshot, " +
  "describe the visible UI. Keep it under 150 words.";
