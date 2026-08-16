# Claude Proxy TODO

Claude Code ↔ local ai& proxy notes. Keep this file short — delete stale items.

## Supported

- **Client tools** — Anthropic schemas → OpenAI function tools → `tool_use` back.
- **Vision** — image/`url` blocks described via SPEC §13 failover before text models see them.
- **Native `web_search_*`** — stripped from upstream (SPEC §9). Custom function tools named `web_search` passthrough. No Tavily / no server-tool emulation loop.
- **`/feedback` disabled** — Claude Code's `/feedback` posts to Anthropic, not our proxy. We set `DISABLE_FEEDBACK_COMMAND=1` by default. No in-proxy replacement planned until product asks for one.

## Open (real gaps only)

### `web_fetch_*`

Claude Code may send native `web_fetch_*` server tools. Today they are not implemented. Options if needed: clear unsupported strip (like search), or a local fetch+extract path.

### `code_execution_*` / `tool_search_*` / `advisor_*`

Mark unsupported or ignore until Claude Code actually depends on them in the wild.
