# ai& Relay

Run your local coding agents on [ai&](https://docs.aiand.com/) open models. One install, and **Claude Code**, **Codex**, **OpenCode**, **Pi**, **Prime Agent**, **Hermes Agent**, and **omp** all talk to open-weight models (GLM 5.2, Kimi K2.7 Code, Motif 3, DeepSeek V4, …) instead of their default backends.

```bash
curl -fsSL https://aiand-relay.vercel.app/install.sh | sh
```

Then:

```bash
aiandrelay claude     # Claude Code on ai& models (alias: aclaude)
```

---

## What it does

ai& serves open models over an OpenAI-compatible API. It does **not** speak the Anthropic Messages API (Claude Code) or the OpenAI Responses API (Codex). ai& Relay runs a small local daemon that translates those wire formats to ai& `/chat/completions` on the fly, so your agent believes it is talking to its native backend while every token is served by ai&.

- **Proxied harnesses** (Claude Code, Codex): a local daemon translates each request/response, tracks cost, retries transient failures, trims context to fit, and refuses native web_search server tools with a clear error.
- **Spawned harnesses** (OpenCode, Pi, Prime Agent, Hermes Agent, omp): launched with a generated provider config pointed at ai&, no proxy needed (they already speak ai&'s OpenAI-compatible format).

Nothing about your agent install changes. The relay injects a base URL and API key per session and writes nothing permanent to your agent's config.

## Install

The one-liner installs the `aiandrelay`, `aclaude`, `aopencode`, `acodex`, `apiagent`, `aprime`, `ahermes`, and `aomp` commands to `~/.aiandrelay/bin/` and installs [Bun](https://bun.sh) for you if it isn't already present:

```bash
curl -fsSL https://aiand-relay.vercel.app/install.sh | sh
```

First run walks you through configuration (or run it directly):

```bash
aiandrelay configure
```

You'll be asked for an ai& API key (<https://docs.aiand.com/>). It is stored in `~/.aiandrelay/` and never leaves your machine. You can also set `AIAND_API_KEY` in the environment instead.

If the underlying agent CLI (Claude Code, Codex, etc.) isn't installed, the relay prints its official install command and exits. It never installs agents for you.

## Usage

Pick a tool interactively:

```bash
aiandrelay
```

Or launch one directly (each has a short alias):

```bash
aiandrelay claude       # alias: aclaude
aiandrelay codex        # alias: acodex
aiandrelay opencode     # alias: aopencode
aiandrelay pi           # alias: apiagent
aiandrelay prime        # alias: aprime  (PrimeIntellect Prime Agent)
aiandrelay hermes       # alias: ahermes (Nous Research Hermes Agent)
aiandrelay omp          # alias: aomp    (Oh My Pi)
aiandrelay chatgpt      # alpha: ChatGPT Desktop session with restore (alias: codex-app)
```

Any extra arguments are passed straight through to the underlying agent:

```bash
aclaude -p "explain this repo"
acodex exec "add a test for the parser"
```

## Models

Default chat model is `zai-org/glm-5.2`. Text failover defaults to `motif-technologies/motif-3`. Vision describe failover: `moonshotai/kimi-k2.7-code` → `moonshotai/kimi-k2.6` (if present) → `google/gemma-4-31b-it`. Run `scripts/list-aiand-models.mjs` (with `AIAND_API_KEY` set) to print the raw catalog ai& serves.

## Web search

Native Anthropic/Codex `web_search` server tools are **not supported**. Custom function tools named `web_search` still pass through unchanged.

## Configuration & env vars

| Variable                          | Effect                                                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AIAND_API_KEY`                   | ai& key (or set via `configure`).                                                                                                                      |
| `AIAND_BASE_URL`                  | Override the API base (default `https://api.aiand.com/v1`).                                                                                            |
| `AIANDRELAY_REASONING_EFFORT`     | `none`\|`low`\|`medium`\|`high`\|`max`. Default `none` for speed; raise for harder tasks.                                                              |
| `AIANDRELAY_FALLBACK_MODEL`       | Model to fail over to when the target model returns no response headers (down/overloaded). Default `motif-technologies/motif-3`; set `off` to disable. |
| `AIANDRELAY_DISABLE_AUTOUPDATE=1` | Stop the installed binary from self-updating.                                                                                                          |
| `AIANDRELAY_TELEMETRY_URL`        | Opt in to telemetry by pointing at your own collector. Off by default.                                                                                 |

The installed binary keeps itself up to date from `aiand-relay.vercel.app`, throttled to once an hour, and swallows every failure. Dev/source runs never self-update.

## For AI agents

An LLM-readable doc is published at <https://aiand-relay.vercel.app/llms.txt>. If you are an agent asked to install, configure, or drive aiandrelay (including headless), read that first. It covers install, configure, every command, the models, and headless usage patterns.

## Local development

Monorepo: pnpm workspaces + Turbo. `packages/cli` (the relay), `packages/models` (the catalog), `packages/tests`, and `site/` (the install/update host).

```bash
pnpm install                       # from repo root
pnpm -F @aiandrelay/cli build     # build the CLI
pnpm dev                           # rebuild on change (run relay commands from another terminal)
pnpm test                          # offline test suite
```

Run the built CLI directly, or through the workspace bin (closest to how users invoke it):

```bash
node packages/cli/dist/bin/aiandrelay.js help
pnpm -F @aiandrelay/cli exec aiandrelay help
```

Testing commands and live-smoke notes are in [TESTING.md](TESTING.md).

### Publishing

The install one-liner, the auto-updating bundle, and `llms.txt` are served from the static site in `site/`:

```bash
pnpm build:site        # builds the CLI bundle + latest.json + the site
# deploy site/ to Vercel (or any static host)
```

`scripts/build-bundle.sh` writes `site/public/aiandrelay.js` (the installed bundle) and `site/public/latest.json` (the self-update manifest). Cut a release with `pnpm bump-version`, rebuild, and redeploy so installed binaries pick it up.

## License

MIT licensed. See [LICENSE](LICENSE).
