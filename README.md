# ai& CLI docs and website

Landing page and documentation for the [ai& CLI](https://github.com/aiandlabs/aiand-cli).

Live at **https://aiand-relay-6eb9031f.onbld.com**

## Stack

- Vite + TanStack Start / TanStack Router + Tailwind CSS
- React 19, TypeScript

## Routes

- `/` — landing page: install, browser sign-in, agent wiring, models and prompts
- `/docs` — CLI documentation: install, signing in, agents, commands, prompts,
  logs and usage, configuration, profiles, exit codes, troubleshooting
- `/models` — model catalog with per-token pricing
- `public/llms.txt` — LLM-readable CLI reference (install, auth, agents,
  commands, config, exit codes)

## Dev

```bash
pnpm install
pnpm dev
pnpm build
pnpm typecheck
```

## Deploy

- Hosted on Vercel (`vercel.json`)
- Build command: `pnpm build`
- Output directory: `dist/client` (Vite client build; `/` and `/docs` and `/models`
  are prerendered to static HTML)

## Content sources

- [aiand-cli README](https://github.com/aiandlabs/aiand-cli)
- [docs.aiand.com](https://docs.aiand.com)

## License

This site's own code is MIT (see [LICENSE](LICENSE)). The ai& CLI it documents
is Apache-2.0 — see [its LICENSE](https://github.com/aiandlabs/aiand-cli/blob/main/LICENSE).

## Brand

ai& red `#E2091A`, deep red `#C70007`, graphite `#151517` / `#303037`. Tokens
live in `src/styles/app.css`; landing-page overrides in `src/styles/landing.css`
and docs overrides in `src/styles/docs.css`.

## What this repo is not

- No dashboard, no Convex, no telemetry.
- No bundle hosting — the CLI is distributed via npm (`@aiand/cli`) and the
  install scripts in the aiand-cli repo, not from this site.

## Agent support

The CLI wires **OpenCode**, **Claude Code**, and **Codex** today. Pi, Prime,
Hermes, DeepSeek, Grok, Unreal, and omp are listed as upcoming — their marks
are kept in `src/components/ProviderBrand.tsx` and rendered with an "Upcoming"
badge rather than removed.
