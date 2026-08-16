# aiandrelay Review-Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every finding from the post-`a0ddc30` code review so aiandrelay matches Nebius relay capability/safety with ai& as the only provider, native web search/Tavily fully deleted (not jugadu stubs), correct vision failover + effort defaults, and a regenerable install bundle.

**Architecture:** Keep the existing Bun CLI → daemon → harness proxies shape. Delete leftover search modules and collapse refuse paths into one small shared helper. Fix catalog vision ordering to the SPEC §13 id list only. Fix Claude interactive effort injection so product default `none` wins. End by regenerating `site/aiandrelay.js` via `scripts/build-bundle.sh` so the install channel ships the fixed CLI.

**Tech Stack:** TypeScript, pnpm workspaces (`@aiandrelay/cli`, `@aiandrelay/models`, `@aiandrelay/tests`), Vitest, Bun (`bun build --target=bun --production`), bash install/bundle scripts.

## Global Constraints

- Upstream only: `https://api.aiand.com/v1` via `AIAND_*` / `AIANDRELAY_*` — never read `NEBIUS_*`, `NEBIUSRELAY_*`, `TAVILY_*`.
- Default model: `zai-org/glm-5.2`; text fallback: `motif-technologies/motif-3` (`AIANDRELAY_FALLBACK_MODEL`; `off`/`none` disables).
- Default effort: wire `reasoning_effort: "none"` when unset; env `AIANDRELAY_REASONING_EFFORT` defaults to `none`.
- Vision failover order ONLY: `moonshotai/kimi-k2.7-code` → `moonshotai/kimi-k2.6` → `google/gemma-4-31b-it`; skip missing; do not alias K2.6→K2.7; do not append other vision models.
- Native web search: strip/refuse with clear per-tool error; custom function tools named `web_search` passthrough; no Tavily client/HTTP/key/configure.
- Install origin hostname stays `https://nebius-tf-relay.vercel.app`; artifact is `/aiandrelay.js`.
- Repo rename `nebius-tf-relay` → `aiand-relay` is cutover checklist only — note, do not block this plan.
- Canonical policy: `.scratch/nebius-to-aiand/SPEC.md` (+ issue `10` for search matrix).

---

## Bundle findings (read before Phase A)

| Question                                              | Answer                                                                                                                                                                                                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Is `nebiusrelay.js` / `aiandrelay.js` hand-written?   | **No.** Both are Bun CLI install artifacts from `bun build … --outfile site/…relay.js`.                                                                                                                                                                |
| Why ~372 local lines vs ~10k upstream?                | Local uses `bun build --production` (minified, few newlines, ~229KB). Upstream Nebius file is pretty-printed (~403KB, ~10k lines). Line count is **not** a capability metric.                                                                          |
| Does local lack daemon/proxy/harnesses?               | **No.** Marker scan shows `daemon`, `proxy`, `configure`, `aclaude`, Claude routing banner, version CLI — full product. Size drop vs Nebius is minify + Tavily/search removal.                                                                         |
| Is current `site/aiandrelay.js` a publish regression? | **Not a stub**, but it is a **snapshot of pre-review-fix source**. After Tasks 1–6, regenerate or install channel ships stale refuse/vision/effort behavior.                                                                                           |
| How to regenerate                                     | `pnpm run build:bundle` → runs `scripts/build-bundle.sh` → builds `@aiandrelay/models`, bundles `packages/cli/src/bin/aiandrelay.ts` to `site/public/aiandrelay.js`, copies to `site/aiandrelay.js`, refreshes `site/latest.json` + `site/install.sh`. |

Exact regenerate sequence (Windows Git Bash / WSL / CI Linux):

```bash
cd /path/to/nebius-tf-relay
pnpm --filter @aiandrelay/models build
pnpm run build:bundle
# Expect: site/aiandrelay.js and site/public/aiandrelay.js same byte size;
# site/latest.json.url === https://nebius-tf-relay.vercel.app/aiandrelay.js
# site/latest.json.version === root package.json version
ls -la site/aiandrelay.js site/public/aiandrelay.js site/latest.json
```

Sanity after rebuild:

```bash
# Should be hundreds of KB, not a tiny hand script
test $(wc -c < site/aiandrelay.js) -gt 150000
rg -c "aiandrelay|daemon|proxy|Native web search is not supported" site/aiandrelay.js
# Must NOT contain Tavily client leftovers
! rg -n "api.tavily.com|TAVILY_API_KEY|setGlobalTavily" site/aiandrelay.js
```

---

## File map (create / modify / delete)

| Path                                                                                   | Responsibility after this plan                                                                                                                                          |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/lib/native-search-refuse.ts`                                         | **Create** — single module: `NATIVE_WEB_SEARCH_UNSUPPORTED`, strip/refuse helpers, optional native-tool prompt note. Replaces `tavily-search.ts`.                       |
| `packages/cli/src/lib/tavily-search.ts`                                                | **Delete**                                                                                                                                                              |
| `packages/cli/src/lib/native-web-search.ts`                                            | **Delete** (Middle Man that only refuses) — callers use refuse helper directly                                                                                          |
| `packages/cli/src/lib/claude/native-web-search-response.ts`                            | **Simplify or delete** — keep minimal Anthropic `web_search_tool_result_error` shaper only if stream/response still need it; drop Tavily-shaped success result builders |
| `packages/cli/src/lib/claude/translate-request.ts`                                     | Strip native tools; refuse path; remove dead `isNativeWebSearchTool` schema branch after strip; import from refuse module                                               |
| `packages/cli/src/lib/claude/stream.ts`                                                | Same refuse import; keep accounting only for refused native calls if harness expects `server_tool_use.web_search_requests`                                              |
| `packages/cli/src/lib/claude/translate-response.ts`                                    | Align native-search accounting with refuse-only behavior                                                                                                                |
| `packages/cli/src/lib/claude/content-format.ts`                                        | Stop importing `trimSearchText` from Tavily file; inline or move tiny helper if still needed                                                                            |
| `packages/cli/src/lib/codex/translate-request.ts`                                      | Strip/refuse native `web_search*`; delete unused WebSearchParams plumbing                                                                                               |
| `packages/cli/src/lib/codex/stream.ts`                                                 | Refuse-only native search path                                                                                                                                          |
| `packages/models/src/index.ts`                                                         | Vision list = ordered SPEC ids only; remove `KIMI_K2_6 = KIMI_K2_7_CODE`; implement `AIANDRELAY_VISION_MODELS` override                                                 |
| `packages/models/src/catalog-snapshot.ts`                                              | Keep/add `kimi-k2.6` row only if live catalog has it; never fake via alias                                                                                              |
| `packages/cli/src/lib/claude/core.ts`                                                  | Fix `claudeEffortArgs`; fix leftover Nebius comment                                                                                                                     |
| `packages/cli/src/lib/claude/TODO.md`                                                  | Remove Tavily “executed via Tavily” drift; document refuse-only                                                                                                         |
| `packages/cli/src/lib/TOOL_COMPATIBILITY.md`                                           | Same — refuse/strip, no Tavily                                                                                                                                          |
| `packages/tests/src/ClaudeApi.test.ts`                                                 | Rewrite skipped native-search success tests → refuse/passthrough; drop `TAVILY_API_KEY` stubs                                                                           |
| `packages/tests/src/CodexProxyApi.test.ts`                                             | Same                                                                                                                                                                    |
| `packages/tests/src/proxy-utils.test.ts`                                               | Point at refuse module; keep “refuses without calling Tavily” as “never hits search HTTP”                                                                               |
| `packages/tests/src/vision.test.ts` / new catalog test                                 | Assert ordered vision ids + skip missing + no extra models                                                                                                              |
| `packages/tests/benchmarks/proxy-performance.bench.ts`                                 | Remove `TAVILY_API_KEY` stubs                                                                                                                                           |
| `scripts/build-bundle.sh`, `site/aiandrelay.js`, `site/latest.json`, `site/install.sh` | Regenerate after source fixes                                                                                                                                           |
| GitHub repo rename `aiand-relay`                                                       | Cutover checklist note only                                                                                                                                             |

---

### Task 1: Replace Tavily-shaped module with `native-search-refuse.ts`

**Files:**

- Create: `packages/cli/src/lib/native-search-refuse.ts`
- Delete: `packages/cli/src/lib/tavily-search.ts`
- Delete: `packages/cli/src/lib/native-web-search.ts`
- Modify: every import of `../tavily-search.js` / `./tavily-search.js` / `./native-web-search.js` under `packages/cli` and `packages/tests`
- Test: `packages/tests/src/proxy-utils.test.ts`

**Interfaces:**

- Produces:
  - `export const NATIVE_WEB_SEARCH_UNSUPPORTED = "Native web search is not supported by aiandrelay. Use a custom function tool if you need search.";`
  - `export function isNativeWebSearchToolType(type: string | undefined): boolean`
  - `export function refuseNativeWebSearch(query?: string): { query: string; text: string; errorCode: "unavailable" }`
  - `export function withNativeToolSystemPrompt<…>(…)` (keep only if Claude/Codex still inject a short denial when native tools were present on the request)
- Does **not** produce: `WebSearchParams.allowedDomains`, `blockedDomains`, `snippetLength`, `runWebSearch`, `runWebSearchDetailed` with Tavily shapes, `runNativeWebSearchCall` Middle Man.

- [x] **Step 1: Write the failing test** (update import path first so the test fails on missing module)

In `packages/tests/src/proxy-utils.test.ts`, replace the tavily import block with:

```ts
import {
  NATIVE_WEB_SEARCH_UNSUPPORTED,
  refuseNativeWebSearch,
} from "../../cli/src/lib/native-search-refuse.js";
```

And replace the refuse test body with:

```ts
test("refuses native web search without any search HTTP", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  const outcome = refuseNativeWebSearch("latest models");
  expect(outcome.text).toBe(NATIVE_WEB_SEARCH_UNSUPPORTED);
  expect(outcome.errorCode).toBe("unavailable");
  expect(fetchSpy).not.toHaveBeenCalled();
  fetchSpy.mockRestore();
});
```

Remove tests that only exercise `stringArray` / `trimSearchText` unless those helpers move elsewhere and are still used.

- [x] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @aiandrelay/tests test -- src/proxy-utils.test.ts
```

Expected: FAIL — `Cannot find module '.../native-search-refuse.js'` (or equivalent).

- [x] **Step 3: Write minimal implementation**

Create `packages/cli/src/lib/native-search-refuse.ts`:

```ts
export const NATIVE_WEB_SEARCH_UNSUPPORTED =
  "Native web search is not supported by aiandrelay. Use a custom function tool if you need search.";

export function isNativeWebSearchToolType(type: string | undefined): boolean {
  return type === "web_search" || type?.startsWith("web_search") === true;
}

export function refuseNativeWebSearch(query = ""): {
  query: string;
  text: string;
  errorCode: "unavailable";
} {
  return {
    query: typeof query === "string" ? query.trim() : "",
    text: NATIVE_WEB_SEARCH_UNSUPPORTED,
    errorCode: "unavailable",
  };
}

type NativeToolPromptOptions<Message, NativeTool> = {
  mergeLeadingSystemMessages?: (messages: Message[]) => Message[];
  toolName?: (tool: NativeTool) => string;
};

export function withNativeToolSystemPrompt<
  Message extends { role: string; content?: unknown },
  NativeTool,
>(
  messages: Message[],
  nativeTools: NativeTool[],
  options: NativeToolPromptOptions<Message, NativeTool> = {},
): Message[] {
  if (nativeTools.length === 0) return messages;
  const toolName = options.toolName ?? ((tool: NativeTool) => String(tool));
  const prompt = [
    "Note: native server web_search tools are not supported by aiandrelay.",
    ...nativeTools.map((tool) => `- ${toolName(tool)} will return an unsupported error.`),
  ].join("\n");
  const nextMessages = [{ role: "system", content: prompt } as Message, ...messages];
  return options.mergeLeadingSystemMessages
    ? options.mergeLeadingSystemMessages(nextMessages)
    : nextMessages;
}
```

Delete `tavily-search.ts` and `native-web-search.ts`. Update imports in:

- `packages/cli/src/lib/claude/translate-request.ts`
- `packages/cli/src/lib/claude/stream.ts`
- `packages/cli/src/lib/claude/chat-completions.ts`
- `packages/cli/src/lib/claude/native-web-search-response.ts` (or inline + delete)
- `packages/cli/src/lib/claude/content-format.ts` (if it only needed `trimSearchText`, copy a 5-line local helper or delete the call)
- `packages/cli/src/lib/codex/translate-request.ts`
- `packages/cli/src/lib/codex/stream.ts` (if any)

Replace `runWebSearch` / `runWebSearchDetailed` call sites with `refuseNativeWebSearch(...)`.

Remove wrappers that only call refuse then return — call `refuseNativeWebSearch` at the call site.

- [x] **Step 4: Run tests**

```bash
pnpm --filter @aiandrelay/tests test -- src/proxy-utils.test.ts
```

Expected: PASS for the refuse test; fix any leftover import errors in the same commit scope.

- [x] **Step 5: Commit**

```bash
git add packages/cli/src/lib/native-search-refuse.ts \
  packages/cli/src/lib/tavily-search.ts \
  packages/cli/src/lib/native-web-search.ts \
  packages/cli/src/lib/claude packages/cli/src/lib/codex \
  packages/tests/src/proxy-utils.test.ts
git commit -m "$(cat <<'EOF'
fix: replace Tavily leftovers with a single native-search refuse helper

EOF
)"
```

---

### Task 2: Finish Claude/Codex native-search strip + test rewrite

**Files:**

- Modify: `packages/cli/src/lib/claude/translate-request.ts`
- Modify: `packages/cli/src/lib/claude/stream.ts`
- Modify: `packages/cli/src/lib/claude/translate-response.ts`
- Modify: `packages/cli/src/lib/claude/native-web-search-response.ts` (simplify)
- Modify: `packages/cli/src/lib/codex/translate-request.ts`
- Modify: `packages/cli/src/lib/codex/stream.ts`
- Modify: `packages/tests/src/ClaudeApi.test.ts`
- Modify: `packages/tests/src/CodexProxyApi.test.ts`
- Modify: `packages/tests/benchmarks/proxy-performance.bench.ts`

**Interfaces:**

- Consumes: `isNativeWebSearchToolType`, `refuseNativeWebSearch`, `NATIVE_WEB_SEARCH_UNSUPPORTED`, `withNativeToolSystemPrompt` from Task 1
- Produces: strip native tools from upstream; if model emits native search call → Anthropic/Codex tool-result error with unsupported text; custom `name === "web_search"` without native type → passthrough unchanged

- [x] **Step 1: Write failing tests (un-skip + rewrite)**

In `ClaudeApi.test.ts`:

1. Delete or rewrite `test.skip("returns Anthropic native web-search blocks…")` into an active test that asserts:
   - no `api.tavily.com` fetch
   - no `TAVILY_API_KEY` stub
   - response contains unsupported error payload / `NATIVE_WEB_SEARCH_UNSUPPORTED`
2. Keep/strengthen existing `test("strips native web search and keeps custom web_search tools"…)`
3. Rewrite `test.skip("executes streamed native web_search…")` → `"refuses streamed native web_search server tools"` (assert refuse, not Tavily success)

In `CodexProxyApi.test.ts`:

1. Un-skip the three native web_search stream tests and rewrite expectations to refuse (no `api.tavily.com`, text contains unsupported message)
2. Remove every `vi.stubEnv("TAVILY_API_KEY", …)` and every `url.includes("api.tavily.com")` mock branch that returns fake search hits
3. Fix any expect that still wants `'…via Tavily'`

In `proxy-performance.bench.ts`: remove `TAVILY_API_KEY` stubs.

Example Claude refuse assertion shape:

```ts
test("refuses streamed native web_search server tools", async () => {
  // arrange: Claude request with type: "web_search_20250305"
  // model emits server tool_use for web_search
  // assert: tool result / error text includes NATIVE_WEB_SEARCH_UNSUPPORTED
  // assert: fetch URLs never include api.tavily.com
});
```

- [x] **Step 2: Run tests — expect FAIL on skipped/old success expectations**

```bash
pnpm --filter @aiandrelay/tests test -- src/ClaudeApi.test.ts src/CodexProxyApi.test.ts
```

- [x] **Step 3: Implement strip/refuse cleanup**

In `claude/translate-request.ts`:

- Keep strip in `toOpenAITools` for `isNativeWebSearchTool(tool)` (delegate to `isNativeWebSearchToolType(tool.type)`).
- **Delete** the dead branch in `toOpenAIToolParameters` that still builds a web_search JSON schema for native tools (unreachable after strip) — lines that `if (isNativeWebSearchTool(tool)) { return { type: "object", properties: { query: …}}}`.
- Replace detailed search runners with `refuseNativeWebSearch`.
- Deduplicate: one `isNativeWebSearchTool` helper that calls shared `isNativeWebSearchToolType`.

In `codex/translate-request.ts`:

- Native tools: strip from `translated` tools list (already `continue` without pushing a function tool) but keep mapping for refuse if the model invents a call.
- Replace `runSharedWebSearch` with `refuseNativeWebSearch`.
- Delete unused domain/snippet plumbing.

In `native-web-search-response.ts`:

- Prefer a minimal error-only helper:

```ts
export function nativeWebSearchUnsupportedBlocks(toolUseId: string, input: unknown) {
  return [
    { type: "server_tool_use", id: toolUseId, name: "web_search", input },
    {
      type: "web_search_tool_result",
      tool_use_id: toolUseId,
      content: { type: "web_search_tool_result_error", error_code: "unavailable" },
    },
  ];
}
```

Drop success `web_search_result` flattening from Tavily outcomes unless a test still needs it for fixtures — if unused, delete.

- [x] **Step 4: Run tests — expect PASS**

```bash
pnpm --filter @aiandrelay/tests test -- src/ClaudeApi.test.ts src/CodexProxyApi.test.ts src/proxy-utils.test.ts src/aiand-migration.test.ts
```

- [x] **Step 5: Repo grep gate**

```bash
rg -n "TAVILY|tavily-search|api.tavily.com|runWebSearchDetailed|WebSearchParams|snippetLength" packages --glob '!**/node_modules/**'
```

Expected: only intentional “ignore leftovers” comments / migration tests that assert `TAVILY_*` is **not** loaded — no configure/env writers, no HTTP client.

- [x] **Step 6: Commit**

```bash
git commit -m "$(cat <<'EOF'
fix: refuse native web search for real and rewrite skipped search tests

EOF
)"
```

---

### Task 3: Vision failover — ordered ids only

**Files:**

- Modify: `packages/models/src/index.ts`
- Modify: `packages/models/src/catalog-snapshot.ts` (add `moonshotai/kimi-k2.6` only if present in live catalog when regenerating; otherwise omit)
- Modify: `packages/tests/src/vision.test.ts` and/or add `packages/tests/src/vision-catalog.test.ts`
- Modify: `packages/cli/src/lib/claude/TODO.md` vision bullets if they omit kimi-k2.6

**Interfaces:**

- Produces:
  - `export const DEFAULT_VISION_MODEL_IDS = ["moonshotai/kimi-k2.7-code", "moonshotai/kimi-k2.6", "google/gemma-4-31b-it"] as const;`
  - `getVisionModels()` returns only those ids that exist in catalog **and** have vision, in that order (unless `AIANDRELAY_VISION_MODELS` override)
  - `KIMI_K2_6` is **not** aliased to `KIMI_K2_7_CODE`. Prefer `findModelById("moonshotai/kimi-k2.6")` or export only when present in snapshot.

- [x] **Step 1: Write failing catalog test**

Create `packages/tests/src/vision-catalog.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { buildCatalog, type AiandApiModel } from "../../models/src/index.js";

function row(id: string, caps: string[]): AiandApiModel {
  return {
    id,
    name: id,
    capabilities: caps,
    context_window: 128000,
    input_per_1m: 1,
    output_per_1m: 1,
  };
}

describe("vision failover order", () => {
  test("uses only SPEC ordered ids and skips missing", () => {
    const catalog = buildCatalog([
      row("zai-org/glm-5.2", ["chat", "reasoning", "tool_calling"]),
      row("moonshotai/kimi-k2.7-code", ["chat", "vision", "tool_calling"]),
      row("google/gemma-4-31b-it", ["chat", "vision"]),
      row("qwen/qwen3.6-27b", ["chat", "vision"]), // must NOT append
    ]);
    expect(catalog.vision.map((m) => m.id)).toEqual([
      "moonshotai/kimi-k2.7-code",
      "google/gemma-4-31b-it",
    ]);
  });

  test("inserts kimi-k2.6 when present", () => {
    const catalog = buildCatalog([
      row("moonshotai/kimi-k2.7-code", ["vision", "chat"]),
      row("moonshotai/kimi-k2.6", ["vision", "chat"]),
      row("google/gemma-4-31b-it", ["vision", "chat"]),
    ]);
    expect(catalog.vision.map((m) => m.id)).toEqual([
      "moonshotai/kimi-k2.7-code",
      "moonshotai/kimi-k2.6",
      "google/gemma-4-31b-it",
    ]);
  });
});
```

Adjust `AiandApiModel` field names to match the real type in `packages/models/src/index.ts`.

- [x] **Step 2: Run — expect FAIL** (today `qwen` is appended via `filter(attachment)` + sort)

```bash
pnpm --filter @aiandrelay/tests test -- src/vision-catalog.test.ts
```

- [x] **Step 3: Implement**

In `packages/models/src/index.ts`, replace vision construction inside `buildCatalog`:

```ts
export const DEFAULT_VISION_MODEL_IDS = [
  "moonshotai/kimi-k2.7-code",
  "moonshotai/kimi-k2.6",
  "google/gemma-4-31b-it",
] as const;

function resolveVisionModelIds(): readonly string[] {
  const raw = process.env.AIANDRELAY_VISION_MODELS?.trim();
  if (!raw) return DEFAULT_VISION_MODEL_IDS;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// inside buildCatalog, after `byId` exists:
const visionIds = resolveVisionModelIds();
const vision = visionIds.flatMap((id) => {
  const model = byId.get(id);
  if (!model || !model.attachment) return [];
  return [model];
});
```

Remove the old:

```ts
const vision = defs
  .filter((d) => d.attachment)
  .sort((a, b) => visionRankOf(a) - visionRankOf(b) || a.name.localeCompare(b.name));
```

Keep `visionRank` in curated overrides as documentation **or** delete if unused after this change (prefer delete unused ranks to avoid drift).

Replace:

```ts
/** @deprecated Snapshot no longer includes Kimi-K2.6; prefer KIMI_K2_7_CODE. */
export const KIMI_K2_6: ModelDefinition = KIMI_K2_7_CODE;
```

with either deletion + fix call sites, or:

```ts
export const KIMI_K2_6: ModelDefinition | undefined =
  SNAPSHOT_CATALOG.byId.get("moonshotai/kimi-k2.6");
```

Do **not** point K2.6 at K2.7.

If snapshot lacks kimi-k2.6, that is correct (skip missing). Optional: regen snapshot from live catalog later (`pnpm --filter @aiandrelay/models regen-catalog`) so K2.6 appears when the org has it — out of band if no key in CI.

- [x] **Step 4: Run vision tests**

```bash
pnpm --filter @aiandrelay/tests test -- src/vision-catalog.test.ts src/vision.test.ts
```

Expected: PASS. Update `vision.test.ts` if it assumed a 2-model list that now differs when qwen was previously in snapshot vision.

- [x] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
fix: restrict vision failover to SPEC ordered model ids

EOF
)"
```

---

### Task 4: Claude interactive effort default → `none`

**Files:**

- Modify: `packages/cli/src/lib/claude/core.ts` (`claudeEffortArgs`)
- Test: add/extend unit coverage near Claude launch args (prefer a small focused test file if none exports the helper — export `claudeEffortArgs` for test, or test via `buildClaudeLaunchArgs`)

**Interfaces:**

- Consumes: `AIANDRELAY_REASONING_EFFORT`, existing `buildClaudeLaunchArgs`
- Produces: when effort unset / `none` / `off` / `minimal`, **do not** inject `--effort low`; when env is a Claude-accepted value (`low|medium|high|xhigh|max`), inject that; never invent a default `low`

Rationale: Claude Code’s CLI cannot take `--effort none`. Product default is wire `none` via `defaultWireReasoningEffort` / `applyAiandChatWire`. Injecting `--effort low` fights SPEC §3/§7 and the review. Trade-off: interactive Claude UI may show its own medium selector — proxy still wires `none` when no effort header/field arrives. Document in a one-line comment.

- [x] **Step 1: Write failing test**

```ts
import { describe, expect, test, afterEach, vi } from "vitest";
import { buildClaudeLaunchArgs } from "../../cli/src/lib/claude/core.js";

describe("claudeEffortArgs via buildClaudeLaunchArgs", () => {
  afterEach(() => vi.unstubAllEnvs());

  test("does not inject --effort when AIANDRELAY_REASONING_EFFORT unset", () => {
    vi.stubEnv("AIANDRELAY_REASONING_EFFORT", "");
    const args = buildClaudeLaunchArgs([], "token");
    expect(args.includes("--effort")).toBe(false);
  });

  test("does not inject --effort when env is none", () => {
    vi.stubEnv("AIANDRELAY_REASONING_EFFORT", "none");
    const args = buildClaudeLaunchArgs([], "token");
    expect(args.includes("--effort")).toBe(false);
  });

  test("injects explicit high", () => {
    vi.stubEnv("AIANDRELAY_REASONING_EFFORT", "high");
    const args = buildClaudeLaunchArgs([], "token");
    expect(args.slice(-2)).toEqual(["--effort", "high"]);
  });

  test("respects user --effort", () => {
    vi.stubEnv("AIANDRELAY_REASONING_EFFORT", "high");
    const args = buildClaudeLaunchArgs(["--effort", "max"], "token");
    expect(args.filter((a) => a === "--effort" || a === "high")).not.toContain("high");
  });
});
```

Put this in `packages/tests/src/claude-effort-args.test.ts` (new).

- [x] **Step 2: Run — expect FAIL** (current default injects `low`)

```bash
pnpm --filter @aiandrelay/tests test -- src/claude-effort-args.test.ts
```

- [x] **Step 3: Implement**

Replace `claudeEffortArgs` in `packages/cli/src/lib/claude/core.ts`:

```ts
function claudeEffortArgs(args: string[]): string[] {
  for (const arg of args) {
    if (arg === "--effort" || arg.startsWith("--effort=")) {
      return [];
    }
    if (arg === "-p" || arg === "--print") {
      return [];
    }
  }
  const env = process.env.AIANDRELAY_REASONING_EFFORT?.trim().toLowerCase();
  // Product default is wire "none" (chat-wire). Claude CLI has no --effort none.
  // Only inject when the user explicitly chose a Claude-accepted level via env.
  if (env === "medium" || env === "high" || env === "xhigh" || env === "max" || env === "low") {
    return ["--effort", env];
  }
  return [];
}
```

Also fix the leftover Nebius comment above `ANTHROPIC_CUSTOM_MODEL_OPTION`:

```ts
// `--main aiand-kimi-k2-7-code` launch also marks Kimi as the custom row.
```

- [x] **Step 4: Run tests**

```bash
pnpm --filter @aiandrelay/tests test -- src/claude-effort-args.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
fix: stop injecting Claude --effort low when product default is none

EOF
)"
```

---

### Task 5: Docs / comment cleanup

**Files:**

- Modify: `packages/cli/src/lib/TOOL_COMPATIBILITY.md`
- Modify: `packages/cli/src/lib/claude/TODO.md`
- Modify: any remaining `nebius-kimi` / “via Tavily” comments under `packages/cli`

- [x] **Step 1: Edit TOOL_COMPATIBILITY.md**

Replace Tavily success narrative with refuse policy:

- Native Anthropic `web_search_*` / Codex `type: web_search` → strip upstream; refuse with `NATIVE_WEB_SEARCH_UNSUPPORTED` if invoked.
- Custom/client `WebSearch` / function `web_search` → passthrough.
- Remove “executed inside the proxy via Tavily”.
- Codex “Likely next work” bullet: change to “native web_search is explicitly unsupported (stripped/refused); do not reintroduce Tavily.”

- [x] **Step 2: Edit claude/TODO.md**

- Keep § web_search status as strip/refuse (already mostly correct).
- Fix vision section ordered list to three SPEC ids (include kimi-k2.6).
- Remove any implication that Tavily still runs.

- [x] **Step 3: Grep gate**

```bash
rg -n "Tavily|tavily|nebius-kimi|NEBIUSRELAY_REASONING|supports_search_tool: true" packages/cli --glob '!**/node_modules/**'
```

Expected: no product docs claiming Tavily works; Nebius comments gone or intentional history-only.

- [x] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
docs: align tool compatibility notes with native search removal

EOF
)"
```

---

### Task 6: Regenerate install bundle + verify

**Files:**

- Run: `scripts/build-bundle.sh` via `pnpm run build:bundle`
- Update: `site/aiandrelay.js`, `site/public/aiandrelay.js`, `site/latest.json`, `site/install.sh` (copied)

- [x] **Step 1: Full unit gate before bundle**

```bash
pnpm --filter @aiandrelay/models build
pnpm --filter @aiandrelay/tests test
```

Expected: all green (or only pre-existing unrelated failures — do not ignore new failures from Tasks 1–5).

- [x] **Step 2: Rebuild bundle**

```bash
pnpm run build:bundle
```

Expected stdout includes `Building aiandrelay v…` and byte size for `site/aiandrelay.js`.

- [x] **Step 3: Verify artifact**

```bash
node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync('site/latest.json','utf8'));const p=require('./package.json'); if(j.version!==p.version) throw new Error('version mismatch'); if(!j.url.endsWith('/aiandrelay.js')) throw new Error('bad url'); console.log('manifest ok', j);"
rg -n "api.tavily.com|TAVILY_API_KEY" site/aiandrelay.js && exit 1 || true
rg -n "Native web search is not supported" site/aiandrelay.js
# Byte-size floor: production bundle must remain a full CLI, not a stub
node -e "const n=require('fs').statSync('site/aiandrelay.js').size; if(n<150000) throw new Error('bundle too small: '+n); console.log('bytes', n);"
```

- [x] **Step 4: Commit bundle artifacts**

```bash
git add site/aiandrelay.js site/public/aiandrelay.js site/latest.json site/install.sh scripts/install.sh
git commit -m "$(cat <<'EOF'
chore: regenerate aiandrelay install bundle after review fixes

EOF
)"
```

Note: If `site/public/aiandrelay.js` is untracked by gitignore patterns, still ensure Vercel static build receives it (build script writes both). Tracked copy under `site/aiandrelay.js` must update.

---

### Task 7: Cutover checklist note (non-blocking)

**Files:**

- Optionally append a short checklist to `.scratch/nebius-to-aiand/SPEC.md` §15 or a `CUTOVER.md` — only if already editing docs; otherwise leave a PR description checklist.

Checklist items (do **not** block merge of Tasks 1–6):

- [ ] GitHub repo rename `nebius-tf-relay` → `aiand-relay` (**human cutover only** — not done in review-fixes; product/package names already `@aiandrelay/*` / `aiandrelay`)
- [ ] Confirm npm scope `@aiandrelay/*` publish names
- [ ] Vercel deploy serves new `aiandrelay.js` + `latest.json`
- [ ] Smoke: `curl -fsSL https://nebius-tf-relay.vercel.app/install.sh | sh` installs wrappers and runs `aiandrelay --version`

No code required in this task unless the team wants the checklist file committed.

---

## Verification matrix (Phase E)

| Check                         | Command / assertion                                                |
| ----------------------------- | ------------------------------------------------------------------ |
| Unit tests                    | `pnpm --filter @aiandrelay/tests test`                             |
| No Tavily module              | `test ! -f packages/cli/src/lib/tavily-search.ts`                  |
| No Middle Man refuse wrapper  | `test ! -f packages/cli/src/lib/native-web-search.ts`              |
| Custom web_search passthrough | Claude/Codex tests still cover name-only `web_search`              |
| Vision order                  | `vision-catalog.test.ts`                                           |
| Effort default                | `claude-effort-args.test.ts` + chat-wire still maps unset → `none` |
| Bundle parity                 | `pnpm run build:bundle` + size/marker checks above                 |
| Install script                | `site/install.sh` downloads `$ORIGIN/aiandrelay.js`                |

---

## Self-review (plan author)

1. **Spec coverage:** §9 search → Tasks 1–2; §13 vision → Task 3; §3/§7 effort → Task 4; §8 install → Task 6; docs → Task 5; repo rename → Task 7 (non-blocking).
2. **Placeholder scan:** none intentional; bundle regen commands are concrete.
3. **Type consistency:** refuse helper names (`refuseNativeWebSearch`, `isNativeWebSearchToolType`, `NATIVE_WEB_SEARCH_UNSUPPORTED`) are reused across tasks; vision ids use `DEFAULT_VISION_MODEL_IDS`.

## Ordered work phases (for parent)

1. **Phase A — Bundle truth + regenerate last:** Treat current 372-line look as minify, not a stub; still regenerate after code fixes.
2. **Phase B — Web search deletion:** Tasks 1–2 (highest correctness risk).
3. **Phase C — Vision + effort:** Tasks 3–4.
4. **Phase D — Docs:** Task 5.
5. **Phase E — Bundle + verify:** Task 6 (+ optional Task 7 checklist).
