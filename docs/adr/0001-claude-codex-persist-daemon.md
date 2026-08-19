# ADR-0001: Claude and Codex persist to the local daemon

Date: 2026-08-19

## Status

Accepted

## Context

ai& does not speak the Anthropic Messages API or the OpenAI Responses API, so Claude Code and Codex CLI cannot be pointed at `https://api.aiand.com`. They need a local translation proxy.

Users still should not have to launch `aclaude` / `acodex` forever, or memorize loopback URLs.

## Decision

`aiandrelay claude on` and `aiandrelay codex on` persist native config that points at `127.0.0.1` (the aiandrelay daemon), never at `https://api.aiand.com`. The daemon registration is written under `~/.aiandrelay/persistent/` so stock binaries keep working after daemon restart. `off` restores the pre-connect snapshot.

OpenAI-compatible harnesses persist directly to ai&.

## Consequences

- Stock `claude` / `codex` require the daemon to be running (auto-start on `on` when the platform supports it).
- Wrappers remain as `aiandrelay <harness> run` for one-off sessions.
- Do not re-suggest writing Anthropic/Responses traffic straight to api.aiand.com.
