# ai& Relay

Run your local coding agents on [ai&](https://docs.aiand.com/) open models. One install, and **Claude Code**, **Codex**, **OpenCode**, **Pi**, **Prime Agent**, **Hermes Agent**, **DeepSeek Harness**, **Grok Build**, and **omp** all talk to open-weight models (DeepSeek V4 Flash, GLM 5.2, Kimi K2.7 Code, Motif 3, …) instead of their default backends.

```bash
curl -fsSL https://aiand-relay-6eb9031f.onbld.com/install.sh | sh
```

Then:

```bash
aiandrelay claude on     # write Claude settings → local daemon (then use stock `claude`)
```

---

## What it does

ai& serves open models over an OpenAI-compatible API. It does **not** speak the Anthropic Messages API (Claude Code) or the OpenAI Responses API (Codex). ai& Relay writes each tool's own config so you do not memorize endpoint URLs, and runs a small local daemon that translates Claude/Codex wire formats to ai& `/chat/completions`.

- **`on` / `off` / `status`:** `on` snapshots your existing files, then writes provider config. `off` restores those bytes. There is no browser login — paste an ai& API key (`configure`, `--api-key`, or `AIAND_API_KEY`).
- **Persist-config harnesses** (OpenCode, Pi, Prime, Hermes, DeepSeek, Grok, omp): `on` (and `configure`, when the tool is detected) points the stock binary at `https://api.aiand.com/v1`. No daemon.
- **Proxied harnesses** (Claude Code, Codex): `on` points stock `claude` / `codex` at `127.0.0.1` (the daemon). Never at api.aiand.com. See `docs/adr/0001-claude-codex-persist-daemon.md`. `configure` does not turn these on.
- **`run`:** optional wrappers (`aclaude`, `aiandrelay claude run`) for a one-off session. Extra args after a harness name still imply `run` so `aclaude -p` keeps working.
- **`uninstall`:** runs `off` on every snapshotted harness, then removes the CLI and wrappers. Leaving is as easy as joining.

Keys stay in `~/.aiandrelay/config.json` and each tool's own files. The OS keychain is not used — harness configs need a baked key.

## Install

The one-liner installs the `aiandrelay`, `aclaude`, `aopencode`, `acodex`, `api`, `aprime`, `ahermes`, `adeepseek`, `agrok`, and `aomp` commands to `~/.aiandrelay/bin/` and installs [Bun](https://bun.sh) for you if it isn't already present:

```bash
curl -fsSL https://aiand-relay-6eb9031f.onbld.com/install.sh | sh
```

First run walks you through configuration (or run it directly):

```bash
aiandrelay configure
```

The installer finishes with a colored **ai& Relay** banner in the terminal. You'll be asked for an ai& API key (<https://docs.aiand.com/>). It is stored in `~/.aiandrelay/config.json` (mode `0600`) and never leaves your machine. You can also set `AIAND_API_KEY` in the environment instead.

If the underlying agent CLI (Claude Code, Codex, etc.) isn't installed, the relay offers to run its official install command (with your consent) or prints it and exits.

## Usage

Pick a tool interactively (TTY). The menu is built from every shipped harness — installed tools first, then missing ones marked `(not installed)` — plus ChatGPT Desktop and Configure:

```bash
aiandrelay
```

Global commands:

```bash
aiandrelay help
aiandrelay configure        # save key; turn on detected OpenAI-compatible tools
aiandrelay status           # key stored? + per-harness on/off
aiandrelay model list --search glm
aiandrelay uninstall        # off every harness, then remove the CLI
```

Per harness (`claude`, `codex`, `opencode`, `pi`, `prime`, `hermes`, `deepseek`, `grok`, `omp`):

```bash
aiandrelay claude           # same as on
aiandrelay claude on        # snapshot, then persist native routing
aiandrelay claude off       # restore snapshot
aiandrelay claude status
aiandrelay claude help
aiandrelay claude run       # optional wrapper (alias: aclaude with extra args)
aiandrelay opencode on      # stock `opencode` talks to ai& after this
```

Or launch a wrapper directly (each has a short alias). Extra args imply `run`:

```bash
aiandrelay claude       # alias: aclaude  (no extra args = on; extra args = run)
aiandrelay codex        # alias: acodex
aiandrelay opencode     # alias: aopencode
aiandrelay pi           # alias: api
aiandrelay prime        # alias: aprime  (PrimeIntellect Prime Agent)
aiandrelay hermes       # alias: ahermes (Nous Research Hermes Agent)
aiandrelay deepseek     # alias: adeepseek (DeepSeek Harness, alpha)
aiandrelay grok         # alias: agrok   (Grok Build UI on ai& models)
aiandrelay omp          # alias: aomp    (Oh My Pi)
aiandrelay chatgpt      # alpha: ChatGPT Desktop session with restore (alias: codex-app)
aiandrelay usage        # local spend report (optional: --last 7d)
aiandrelay update       # update to the latest release
aiandrelay daemon install   # auto-start daemon at login (macOS/Linux)
aiandrelay uninstall        # restore harness files and remove aiandrelay
```

Any extra arguments are passed straight through to the underlying agent:

```bash
aclaude -p "explain this repo"
acodex exec "add a test for the parser"
```

### OpenCode: plain `opencode` vs `aopencode`

If OpenCode is installed or `~/.config/opencode` exists (Windows: `%USERPROFILE%\.config\opencode\`, not AppData), `aiandrelay configure` registers ai& for plain `opencode`. Credentials go in OpenCode `auth.json` (`~/.local/share/opencode/auth.json`, Windows: `%USERPROFILE%\.local\share\opencode\auth.json`).

Use `aopencode` (`aiandrelay opencode`) when you want the locked-down ai&-only session. That path still injects via `OPENCODE_CONFIG_CONTENT` and writes nothing on launch.

### What `configure` reports

`aiandrelay configure` saves the relay API key first, then reports one of these outcomes per harness:

- `found` / `not found` plus support status in the detection summary
- success when auth/config files were created or updated
- `left unchanged (...)` when an existing user file has an unsupported shape or invalid syntax
- explicit skip/defer messaging for Claude Code and for tools that are not installed

Configure snapshots those files first (so `off` / `uninstall` can restore them), then injects. Reruns are safe: configure either adds the ai& provider state it knows how to manage, or leaves the user's file untouched and tells you why.

Claude Code and Codex are listed in the detection summary but are **not** turned on until `aiandrelay claude on` / `aiandrelay codex on`.

### Plain native harnesses after `configure`

For the native OpenAI-compatible harnesses, `aiandrelay configure` now writes only the provider/config state each tool needs in its own user config directory:

- OpenCode: `~/.config/opencode/` with `provider.aiand` and `auth.json` at `~/.local/share/opencode/auth.json` (Windows: `%USERPROFILE%\.config\opencode\` and `%USERPROFILE%\.local\share\opencode\auth.json`)
- Pi Code: `~/.pi/agent/models.json` plus `~/.pi/agent/auth.json`
- Prime Agent: `~/.prime/agent/models.json` plus `~/.prime/agent/auth.json`
- Hermes Agent: `~/.hermes/config.yaml` plus `~/.hermes/.env`
- DeepSeek Harness: `~/.dsh/settings.yaml` (or `$DSH_HOME/settings.yaml`)
- Grok Build: `~/.grok/config.toml` (or `$GROK_HOME/config.toml`)
- omp: `~/.omp/agent/models.yml`

The launcher commands (`api`, `aprime`, `ahermes`, `adeepseek`, `agrok`, `aomp`) still build a per-run ai& session. After `on` or `configure`, use the stock binary; `run` is optional.

### Leave

```bash
aiandrelay opencode off     # one tool
aiandrelay uninstall        # every snapshotted tool, then delete ~/.aiandrelay and PATH wrappers
```

`uninstall` only deletes wrappers it owns (scripts/links that point at `aiandrelay.js`). An unrelated `api` on your PATH is left alone. Restart running IDEs/CLIs after `off` or `uninstall` so they reread config.

## Models

Default chat model is `deepseek-ai/deepseek-v4-flash`. Text failover defaults to `motif-technologies/motif-3`. Vision describe failover: `moonshotai/kimi-k2.7-code` → `moonshotai/kimi-k2.6` (if present) → `google/gemma-4-31b-it`. Run `scripts/list-aiand-models.mjs` (with `AIAND_API_KEY` set) to print the raw catalog ai& serves.

## Web search

Native Anthropic/Codex `web_search` server tools are **not supported**. Custom function tools named `web_search` still pass through unchanged.

## Configuration & env vars

| Variable                          | Effect                                                                                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AIAND_API_KEY`                   | ai& key (or set via `configure`).                                                                                                                               |
| `AIAND_BASE_URL`                  | Override the API base (default `https://api.aiand.com/v1`).                                                                                                     |
| `AIANDRELAY_REASONING_EFFORT`     | `none`\|`low`\|`medium`\|`high`\|`max`. Default `none` for speed; raise for harder tasks.                                                                       |
| `AIANDRELAY_FALLBACK_MODEL`       | Model to fail over to when the target model returns no response headers (down/overloaded). Default `motif-technologies/motif-3`; set `off` to disable.          |
| `AIANDRELAY_DISABLE_AUTOUPDATE=1` | Stop the installed binary from self-updating.                                                                                                                   |
| `AIANDRELAY_TELEMETRY_URL`        | Opt in to telemetry by pointing at your own collector. Off by default.                                                                                          |
| `AIANDRELAY_METER=1`              | Route the spawned harnesses (Pi, Prime, Hermes, DeepSeek, Grok, omp) through the daemon, so they get cost metering, model fallback and retries. Off by default. |
| `AIANDRELAY_CACHE_READ_RATIO`     | Price of a cached input token as a fraction of the input price when the catalog leaves `cache_read` unpublished. Default `1`.                                   |
| `AIANDRELAY_CODEX_MEMORY_MODEL`   | Model used to summarize Codex task traces for durable memory. Defaults to Motif 3.                                                                              |

### Metering the spawned harnesses

Claude and Codex are proxied, so the daemon meters every turn. The other
harnesses hold the key and call ai& directly, which is why they report
`$0.00`. `AIANDRELAY_METER=1` points them at the daemon instead:

```bash
AIANDRELAY_METER=1 api --print "..."
# ai& Relay ▸ Launching Pi Code with ai&.
# [aiandrelay cost] session total: $0.0056 (1,518 in, 69 out)
```

They then share the same client as everyone else — automatic model fallback,
the per-model circuit breaker and transient-fault retries — and the real ai&
key stays inside the daemon (the harness only ever sees a local session token).
If the daemon is unreachable the launcher says so and connects directly, so
metering can never be the reason a session fails to start.

The installed binary keeps itself up to date from `aiand-relay-6eb9031f.onbld.com`, throttled to once an hour, and swallows every failure. Dev/source runs never self-update.

## For AI agents

An LLM-readable doc is published at <https://aiand-relay-6eb9031f.onbld.com/llms.txt>. If you are an agent asked to install, configure, or drive aiandrelay (including headless), read that first. It covers install, configure, every command, the models, and headless usage patterns.

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
