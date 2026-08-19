import type { HarnessContext } from "./harness-types.js";
import { ALL_HARNESSES } from "./harness.js";
import { isHarnessVerb, type HarnessVerb } from "./harness-verbs.js";

const FLAG_ALIASES = {
  "--api-key": "apiKey",
  "--main": "main",
  "--model": "main",
  "--last": "last",
  "--search": "search",
  "--slot": "slot",
} as const satisfies Record<string, keyof HarnessContext>;

const BOOLEAN_FLAGS = new Set(["--json", "--restore"]);
type BooleanFlag = "json" | "restore";
const BOOLEAN_FLAG_KEYS = {
  "--json": "json",
  "--restore": "restore",
} as const satisfies Record<string, BooleanFlag>;

export type ParsedArgs = {
  positional: string[];
  harnessVerb?: HarnessVerb;
  flags: Partial<HarnessContext> &
    Record<BooleanFlag, boolean> & { passthroughSeparator?: boolean };
};

/**
 * Harness-first grammar:
 * - `aiandrelay claude` → on
 * - `aiandrelay claude on|off|status|help|run`
 * - Unknown flags / extra args after a harness (without a verb) imply `run`
 *   so wrapper aliases like `aclaude -p` still launch.
 * - After `run` or `--`, remaining tokens are agent passthrough.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: ParsedArgs["flags"] = { json: false, restore: false };
  let harnessVerb: HarnessVerb | undefined;
  let seenHarness = false;

  const startRunPassthrough = (rest: string[], separator = false) => {
    flags.passthrough = rest;
    if (separator) {
      flags.passthroughSeparator = true;
    }
    if (harnessVerb === undefined) {
      harnessVerb = "run";
    }
  };

  const relayFlagsAllowed = () =>
    harnessVerb === undefined ||
    harnessVerb === "on" ||
    harnessVerb === "off" ||
    harnessVerb === "status" ||
    harnessVerb === "help";

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === undefined) {
      continue;
    }
    if (token === "--") {
      startRunPassthrough(argv.slice(i + 1), true);
      break;
    }
    if (harnessVerb === "run") {
      startRunPassthrough([...(flags.passthrough ?? []), ...argv.slice(i)]);
      break;
    }
    if (BOOLEAN_FLAGS.has(token) && relayFlagsAllowed()) {
      flags[BOOLEAN_FLAG_KEYS[token as keyof typeof BOOLEAN_FLAG_KEYS]] = true;
      continue;
    }
    if (token in FLAG_ALIASES && relayFlagsAllowed()) {
      const key = FLAG_ALIASES[token as keyof typeof FLAG_ALIASES];
      const value = argv[i + 1];
      if (value === undefined) {
        throw new Error(`Flag ${token} expects a value`);
      }
      flags[key] = value;
      i += 1;
      continue;
    }
    if (token.startsWith("-") && seenHarness) {
      startRunPassthrough(argv.slice(i));
      break;
    }
    if (!seenHarness && isHarnessToken(token)) {
      positional.push(token);
      seenHarness = true;
      continue;
    }
    if (seenHarness && harnessVerb === undefined && isHarnessVerb(token)) {
      harnessVerb = token;
      continue;
    }
    if (seenHarness && harnessVerb === undefined) {
      startRunPassthrough(argv.slice(i));
      break;
    }
    positional.push(token);
  }

  if (seenHarness && harnessVerb === undefined) {
    harnessVerb = "on";
  }

  if (flags.apiKey) {
    flags.apiKeyFromFlag = true;
  }

  return harnessVerb !== undefined ? { positional, flags, harnessVerb } : { positional, flags };
}

function isHarnessToken(value: string): boolean {
  return value === "picode" || (ALL_HARNESSES as readonly string[]).includes(value);
}
