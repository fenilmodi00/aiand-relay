# Final Fix Report

## Scope

Fixed the Important whole-branch safety regression where malformed nested managed ai& sections were being silently replaced during native config injection instead of causing a safe abort that preserves the original file bytes.

This fix covers:

- Pi/Prime JSON merge path in `packages/cli/src/lib/shared/pi-family-user-config.ts`
- legacy-OMP YAML merge path in `packages/cli/src/lib/shared/pi-family-user-config.ts`
- DeepSeek YAML merge path in `packages/cli/src/lib/deepseek/user-config.ts`
- configure-command abort-message plumbing in `packages/cli/src/lib/commands/global.ts`

Launcher behavior was left unchanged.

## Root Cause

The existing injectors validated only the outer managed object boundary:

- `providers`
- `providers.aiand`
- `llm-pi-ai`
- `llm-pi-ai.providers`
- `llm-pi-ai.providers.aiand`

After that point, nested managed nodes such as `compat`, `models`, `cost`, and `thinkingLevelMap` were treated as replaceable fallbacks. If one of those nodes already existed with the wrong shape, the merge code would overwrite it with fresh managed content instead of aborting safely.

That violated the add-only / safe-abort contract because malformed user bytes could be rewritten even though the injector had already entered an incompatible shape.

## Fix Implemented

### Pi / Prime / OMP

Added explicit nested-shape validation before any managed overwrite occurs.

New explicit abort reasons:

- `aiand-compat-not-object`
- `aiand-models-not-array`
- `aiand-model-cost-not-object`
- `aiand-model-thinking-level-map-not-object`

Behavior now:

- If `providers.aiand.compat` exists but is not an object/map, abort.
- If `providers.aiand.models` exists but is not an array/sequence, abort.
- If any managed model entry has `cost` present but not as an object/map, abort.
- If any managed reasoning model entry has `thinkingLevelMap` present but not as an object/map, abort.
- On abort, the injector returns the explicit reason and leaves the original bytes unchanged.

### DeepSeek

Added explicit nested-shape validation before mutating `llm-pi-ai.providers.aiand`.

New explicit abort reasons:

- `aiand-compat-not-object`
- `aiand-models-not-array`

Behavior now:

- If `llm-pi-ai.providers.aiand.compat` exists but is not an object/map, abort.
- If `llm-pi-ai.providers.aiand.models` exists but is not an array/sequence, abort.
- On abort, the injector returns the explicit reason and leaves the original bytes unchanged.

### Configure Messaging

Extended `runConfigure()` logging/formatting to understand the new explicit abort reasons so the CLI reports the exact malformed nested path instead of failing type checks or collapsing back to a vague message.

## Regression Tests Added

Added focused abort-safe regression coverage for malformed nested managed ai& content.

### Pi-family shared/native tests

Added failing-now-fixed cases for:

- Pi JSON: `providers.aiand.compat` not object
- Prime JSON: `providers.aiand.models` not array
- Pi JSON: model `cost` not object
- Pi JSON: model `thinkingLevelMap` not object
- OMP YAML: `providers.aiand.compat` not object
- OMP YAML: `providers.aiand.models` not sequence
- OMP YAML: model `cost` not object
- OMP YAML: model `thinkingLevelMap` not object

Each test asserts:

- result status is `aborted`
- the explicit nested reason is returned
- the file contents are byte-for-byte unchanged after the attempted inject

### DeepSeek tests

Added failing-now-fixed cases for:

- `llm-pi-ai.providers.aiand.compat` not object
- `llm-pi-ai.providers.aiand.models` not sequence

Each test also asserts explicit abort reason plus unchanged file bytes.

## Verification Run

Focused regression suites:

- `pnpm -F @aiandrelay/tests test -- src/shared/native-user-config.test.ts src/deepseek/user-config-inject.test.ts`

Narrow integration / contract checks:

- `pnpm -F @aiandrelay/cli typecheck`
- `pnpm -F @aiandrelay/tests test -- src/shared/configure.test.ts`

Results:

- focused regression suites passed
- configure integration test suite passed
- CLI typecheck passed
- lint check on edited files reported no errors

## Notes

- No launcher-path behavior was changed.
- No unrelated refactors were introduced.
- The Minor wording suggestion was not separately pursued beyond the necessary configure-message support for the new explicit abort reasons.
