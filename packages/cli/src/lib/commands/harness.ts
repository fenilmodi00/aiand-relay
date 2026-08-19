import os from "node:os";
import { ALL_HARNESSES, HARNESS_LABEL, type HarnessId } from "../harness.js";
import { loadHarness, isHarnessImplemented } from "../harness-registry.js";
import { detectInstalledHarness, missingHarnessMessage } from "../detect.js";
import { initModelCatalog } from "../model-catalog-init.js";
import type { HarnessContext } from "../harness-types.js";
import type { HarnessVerb } from "../harness-verbs.js";
import { engineOff, engineOn, engineStatus, printHarnessHelp } from "../enablement/engine.js";

export async function dispatchHarnessCommand(
  harnessName: string | undefined,
  verb: HarnessVerb | undefined,
  flags: Partial<HarnessContext>,
): Promise<void> {
  if (!isKnownHarness(harnessName)) {
    throw new Error(
      `Unknown harness "${harnessName}". Expected one of: ${ALL_HARNESSES.join(", ")}`,
    );
  }
  if (!isHarnessImplemented(harnessName)) {
    throw new Error(
      `${HARNESS_LABEL[harnessName]} support isn't built yet (coming in a later phase - it needs a local translation proxy).`,
    );
  }
  const action = verb ?? "on";
  const ctx: HarnessContext = { home: os.homedir(), ...flags };

  if (action === "help") {
    printHarnessHelp(harnessName);
    return;
  }
  if (action === "status") {
    await engineStatus(harnessName, ctx);
    return;
  }
  if (action === "off") {
    await engineOff(harnessName, ctx);
    return;
  }
  if (action === "on") {
    if (!detectInstalledHarness(harnessName).installed) {
      const { ensureHarnessInstalled } = await import("../install-harness.js");
      if (!(await ensureHarnessInstalled(harnessName))) {
        throw new Error(missingHarnessMessage(harnessName));
      }
    }
    await initModelCatalog({ home: ctx.home });
    await engineOn(harnessName, ctx);
    return;
  }

  if (!detectInstalledHarness(harnessName).installed) {
    const { ensureHarnessInstalled } = await import("../install-harness.js");
    if (!(await ensureHarnessInstalled(harnessName))) {
      throw new Error(missingHarnessMessage(harnessName));
    }
  }

  const harnessModule = await loadHarness(harnessName);
  await initModelCatalog({ home: ctx.home });
  const result = await harnessModule.run(ctx);
  renderResult(result, flags);
}

function isKnownHarness(value: string | undefined): value is HarnessId {
  return value !== undefined && (ALL_HARNESSES as readonly string[]).includes(value);
}

function renderResult(
  result: { message?: string; payload?: Record<string, unknown> },
  flags: Partial<HarnessContext>,
): void {
  if (!result) {
    return;
  }
  if (result.message) {
    console.log(result.message);
  }
  if (result.payload) {
    if (flags.json) {
      console.log(JSON.stringify(result.payload, null, 2));
    } else {
      for (const [key, value] of Object.entries(result.payload)) {
        console.log(`${key}: ${value ?? "(unset)"}`);
      }
    }
  }
}
