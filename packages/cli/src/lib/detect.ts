import {
  ALL_HARNESSES,
  HARNESS_BIN,
  HARNESS_INSTALL,
  HARNESS_LABEL,
  type HarnessId,
} from "./harness.js";
import { resolveBinPath } from "./spawn-bin.js";

export type HarnessDetection = {
  installed: boolean;
  path: string | null;
};

export { resolveBinPath, spawnBinary } from "./spawn-bin.js";

export function detectInstalledHarnesses(
  harnesses: readonly HarnessId[] = ALL_HARNESSES,
): Record<HarnessId, HarnessDetection> {
  const result = {} as Record<HarnessId, HarnessDetection>;
  for (const harness of harnesses) {
    const path = resolveBinPath(HARNESS_BIN[harness]);
    result[harness] = { installed: Boolean(path), path };
  }
  return result;
}

export function detectInstalledHarness(harness: HarnessId): HarnessDetection {
  const path = resolveBinPath(HARNESS_BIN[harness]);
  return { installed: Boolean(path), path };
}

export function missingHarnessMessage(harness: HarnessId): string {
  const install = HARNESS_INSTALL[harness];
  return [
    `${HARNESS_LABEL[harness]} is not installed or "${HARNESS_BIN[harness]}" is not on PATH.`,
    `Install it with: ${install.command}`,
    `Docs: ${install.url}`,
    `Then re-run: aiandrelay ${harness}`,
  ].join("\n");
}
