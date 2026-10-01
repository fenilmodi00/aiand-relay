# @aiand/site

Docs + landing site for the [ai& CLI](https://github.com/aiandlabs/aiand-cli).

## Stack

- Vite + TanStack Start / TanStack Router + Tailwind CSS
- React 19, TypeScript

## Routes

- `/` — landing page for aiand-cli
- `/docs` — CLI documentation
- `public/llms.txt` — LLM-readable CLI reference (install, auth, agents, commands, config, exit codes)

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
- Output directory: `dist`

## Content sources

- [aiand-cli README](https://github.com/aiandlabs/aiand-cli)
- [docs.aiand.com](https://docs.aiand.com)

## What this repo is not

- No dashboard, no Convex, no telemetry.
- No bundle hosting — the CLI is distributed via npm (`@aiand/cli`) and the
  install scripts in the aiand-cli repo, not from this site.
