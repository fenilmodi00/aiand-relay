import { describe, expect, test } from "vitest";
import {
  harnessWrapperName,
  interactiveLauncherOptions,
  LAUNCHER_CHATGPT,
  LAUNCHER_CONFIGURE,
} from "../../../cli/src/lib/interactive-launcher-options.js";
import { CLI_WRAPPER_NAMES } from "../../../cli/src/lib/cli/wrappers.js";
import { ALL_HARNESSES, HARNESS, type HarnessId } from "../../../cli/src/lib/harness.js";

const allInstalled = () => true;
const noneInstalled = () => false;

function isHarnessValue(value: string): value is HarnessId {
  return (ALL_HARNESSES as readonly string[]).includes(value);
}

describe("interactive launcher covers everything we ship", () => {
  // The bug this replaces: the menu was a second hand-written list, so harnesses
  // added after the first batch could ship with wrappers and README entries but
  // never appear - `aiandrelay` offered fewer tools than it had.
  test("every registered harness appears", () => {
    const values = new Set(interactiveLauncherOptions(allInstalled).map((o) => o.value));
    for (const harness of ALL_HARNESSES) {
      expect(values.has(harness), `${harness} missing from the launcher menu`).toBe(true);
    }
  });

  test("omp is present alongside the upstream harness set", () => {
    const values = interactiveLauncherOptions(allInstalled).map((o) => o.value);
    expect(values).toContain(HARNESS.OMP);
  });

  test("ChatGPT Desktop and Configure are offered alongside the harnesses", () => {
    const values = interactiveLauncherOptions(allInstalled).map((o) => o.value);
    expect(values).toContain(LAUNCHER_CHATGPT);
    expect(values).toContain(LAUNCHER_CONFIGURE);
    expect(values).toHaveLength(ALL_HARNESSES.length + 2);
  });

  test("hints match the wrappers install.sh actually creates", () => {
    for (const option of interactiveLauncherOptions(allInstalled)) {
      if (isHarnessValue(option.value)) {
        expect(option.hint).toBe(harnessWrapperName(option.value));
        expect(CLI_WRAPPER_NAMES).toContain(option.hint);
      }
    }
  });
});

describe("installed-first ordering", () => {
  test("installed harnesses sort above missing ones", () => {
    const onlyGrok = (harness: HarnessId) => harness === HARNESS.GROK;
    const values = interactiveLauncherOptions(onlyGrok).map((o) => o.value);
    const grok = values.indexOf(HARNESS.GROK);
    const codex = values.indexOf(HARNESS.CODEX);
    // Grok is last in priority but the only one present, so it leads.
    expect(grok).toBeLessThan(codex);
    expect(grok).toBe(0);
  });

  test("familiar tools lead when everything is installed", () => {
    const values = interactiveLauncherOptions(allInstalled).map((o) => o.value);
    expect(values[0]).toBe(HARNESS.CODEX);
    expect(values[1]).toBe(HARNESS.CLAUDE);
  });

  // A missing tool is still offered - the launch path prints its official
  // install command - so the menu must not look broken on a fresh machine.
  test("nothing installed still lists every harness, marked", () => {
    const options = interactiveLauncherOptions(noneInstalled);
    const harnessOptions = options.filter((o) => isHarnessValue(o.value));
    expect(harnessOptions).toHaveLength(ALL_HARNESSES.length);
    for (const option of harnessOptions) {
      expect(option.hint).toContain("(not installed)");
    }
  });
});
