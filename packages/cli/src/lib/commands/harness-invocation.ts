import { ALL_HARNESSES, type HarnessId } from "../harness.js";
import type { ParsedArgs } from "../parse-args.js";
import type { HarnessVerb } from "../harness-verbs.js";

export type HarnessInvocation = {
  command: HarnessId | string | undefined;
  verb: HarnessVerb;
  flags: ParsedArgs["flags"];
};

export function resolveHarnessInvocation(
  positional: string[],
  flags: ParsedArgs["flags"],
  harnessVerb?: HarnessVerb,
): HarnessInvocation {
  const [rawCommand] = positional;
  const command = rawCommand === "picode" ? "pi" : rawCommand;
  const verb = harnessVerb ?? "on";

  return { command, verb, flags };
}

export function isHarnessCommand(value: string | undefined): value is HarnessId {
  return value !== undefined && (ALL_HARNESSES as readonly string[]).includes(value);
}
