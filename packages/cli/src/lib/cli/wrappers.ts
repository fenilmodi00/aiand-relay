import { ALL_HARNESSES, type HarnessId } from "../harness.js";

/** The wrapper command installed for a harness (`api`, `ahermes`, …). */
export function harnessWrapperName(harness: HarnessId): string {
  return `a${harness}`;
}

export const HARNESS_WRAPPER_COMMANDS: ReadonlyArray<{ name: string; harness: HarnessId }> =
  ALL_HARNESSES.map((harness) => ({ name: harnessWrapperName(harness), harness }));

export const CLI_WRAPPER_NAMES = [
  "aiandrelay",
  ...HARNESS_WRAPPER_COMMANDS.map((entry) => entry.name),
] as const;
