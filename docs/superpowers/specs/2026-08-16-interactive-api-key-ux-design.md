# Interactive API key UX (slim first-run gate)

**Date:** 2026-08-16  
**Status:** Approved  
**Approach:** Central first-run gate (Approach 1)

## Problem

After install, users often run wrappers like `ahermes` immediately. With no AI& API key, v0.10.1 hard-errors:

```text
Error: No ai& API key found. Pass --api-key or set AIAND_API_KEY.
```

Install copy promises an interactive first run (“Enter to skip”), but wrappers skip the bare-`aiandrelay` launcher. Hermes/Prime are also missing from the partial interactive key gate that already exists for Claude/Codex/OpenCode/Pi.

## Goals

- On TTY, missing key → slim interactive prompt (Enter key / Open docs) → save → continue the chosen command.
- Wrappers keep their harness choice (`ahermes` stays Hermes).
- Bare `aiandrelay` keeps ↑↓ harness picker; use the same slim key flow when needed.
- Full `aiandrelay configure` stays the explicit deep setup (tool detection).
- Non-TTY / CI: no prompts; clear hard error.
- Minimal interaction; no new heavy CLI UI libraries.

## Non-goals

- Install-time wizard inside `install.sh` / piped install.
- Per-harness duplicated prompt logic.
- Skipping key entry with empty Enter.
- Changing harness spawn / proxy architecture.

## User-facing flow

### Wrappers and `aiandrelay <harness>`

1. Key present (env, `~/.aiandrelay/config.json`, or `--api-key`) → launch immediately.
2. Key missing + TTY → slim Clack flow:
   - Select: **Enter API key** | **Open docs in browser**
   - Open docs → best-effort open `https://docs.aiand.com/`; return to the same select
   - Enter key → masked password; reject empty; save; set `process.env.AIAND_API_KEY`; launch
3. Key missing + non-TTY → hard error (existing message; may mention `aiandrelay configure`)
4. Cancel (Ctrl+C) → cancel message, non-zero exit, no launch

### Bare `aiandrelay`

1. Slim key ensure (same helper) if needed.
2. Existing ↑↓ picker (Codex, Claude, Pi, OpenCode, Hermes, ChatGPT, Configure).

### Explicit configure

`aiandrelay configure` unchanged: detection dump + key persist + outro.

## Architecture

| Piece                                          | Responsibility                                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/lib/ensure-api-key.ts` (new) | `ensureApiKeyInteractive`, `openAiandDocsInBrowser`, TTY/non-TTY policy                                                   |
| `packages/cli/src/bin/aiandrelay.ts`           | Call slim ensure for **all** harness launches + codex-app + bare launcher; stop calling full `runConfigure` for first-run |
| `packages/cli/src/lib/commands/global.ts`      | Unchanged full configure                                                                                                  |
| Install scripts (`scripts/` + `site/` copies)  | Fix “Enter to skip” messaging                                                                                             |
| Harness modules                                | Keep hard-throw safety net if key still missing                                                                           |

### Helper contract

```ts
export const AIAND_DOCS_URL = "https://docs.aiand.com/";

export async function ensureApiKeyInteractive(options?: {
  home?: string;
  isInteractive?: boolean;
}): Promise<boolean>;

export async function openAiandDocsInBrowser(url?: string): Promise<boolean>;
```

- Already has key → `true` without prompts.
- Non-interactive + missing → `false`.
- Interactive + cancel → `false`.
- Interactive + saved key → persist via `setGlobalApiKey`, refresh env, `true`.
- Browser open: Linux `xdg-open`, macOS `open`, Windows `cmd /c start "" <url>`; on failure print URL and return `false` (loop continues).

## Edge cases

| Case                       | Behavior                                                            |
| -------------------------- | ------------------------------------------------------------------- |
| Env / config / `--api-key` | No prompts                                                          |
| Browser open fails         | Print URL; stay on Enter / Open select                              |
| After save                 | `AIAND_API_KEY` set so Hermes `${AIAND_API_KEY}` works same session |
| Missing harness binary     | Existing install-instructions error after key OK                    |
| Piped / CI                 | No prompts; hard error                                              |

## Install copy

Replace:

> On first run, aiandrelay will ask for your ai& API key (Enter to skip).

With:

> On first run (`ahermes`, `aclaude`, … or `aiandrelay`), you’ll be prompted for an ai& API key — or open https://docs.aiand.com/ from the prompt.

## Testing

- Unit: non-TTY + no key → `false`, no Clack calls.
- Unit: TTY + Enter path → password mocked → key persisted + env set → `true`.
- Unit: Open docs then Enter → open called; key saved.
- Unit: cancel → `false`.
- Bin gate: hermes/prime included in first-run ensure (same path as other harnesses).

## Out of scope follow-ups

- Bundle regenerate / deploy so vercel install channel ships the fix (do after implementation via existing `pnpm run build:bundle`).
