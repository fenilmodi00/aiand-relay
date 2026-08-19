export const HARNESS_VERBS = ["on", "off", "status", "help", "run"] as const;

export type HarnessVerb = (typeof HARNESS_VERBS)[number];

export function isHarnessVerb(value: string | undefined): value is HarnessVerb {
  return value !== undefined && (HARNESS_VERBS as readonly string[]).includes(value);
}
