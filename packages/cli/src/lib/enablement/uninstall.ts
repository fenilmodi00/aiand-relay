import { lstat, readFile, readlink, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ALL_HARNESSES, HARNESS_LABEL, type HarnessId } from "../harness.js";
import { engineOff } from "./engine.js";
import { hasSnapshot } from "./snapshot.js";
import { relayHomeFor } from "./relay-home.js";
import { CLI_WRAPPER_NAMES } from "../cli/wrappers.js";
import { printSuccess } from "../cli/messages.js";

export type UninstallResult = {
  offErrors: Array<{ harnessId: HarnessId; message: string }>;
  removalFailures: Array<{ path: string; message: string }>;
};

export async function runUninstall(options: { home?: string } = {}): Promise<UninstallResult> {
  const home = options.home ?? os.homedir();
  const relayHome = relayHomeFor(home);
  const ctx = { home };
  const offErrors: UninstallResult["offErrors"] = [];

  try {
    const { uninstallAutoStart } = await import("../daemon/auto-start.js");
    await uninstallAutoStart();
  } catch {
    // Best-effort: leave login items if the platform helper fails.
  }

  for (const harnessId of ALL_HARNESSES) {
    if (!(await hasSnapshot(relayHome, harnessId))) {
      continue;
    }
    try {
      await engineOff(harnessId, ctx);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      offErrors.push({ harnessId, message });
      console.error(`Warning: failed to restore ${harnessId}: ${message}`);
      console.error(`Restart ${HARNESS_LABEL[harnessId]} manually to clear any ai& settings.`);
    }
  }

  const removalFailures: UninstallResult["removalFailures"] = [];
  for (const wrapper of await ownedWrapperPaths(home, relayHome)) {
    const failure = await removePath(wrapper);
    if (failure) {
      removalFailures.push(failure);
    }
  }

  const homeFailure = await removePath(relayHome);
  if (homeFailure) {
    removalFailures.push(homeFailure);
  }

  const hasErrors = offErrors.length > 0 || removalFailures.length > 0;
  if (!hasErrors) {
    printSuccess("aiandrelay has been uninstalled. Restart any running harnesses to fully apply.");
  } else if (removalFailures.length > 0) {
    console.error("aiandrelay uninstall completed with file removal errors:");
    for (const failure of removalFailures) {
      console.error(`  ${failure.path}: ${failure.message}`);
    }
  } else {
    printSuccess("aiandrelay files removed. Restart any running harnesses to fully apply.");
  }

  return { offErrors, removalFailures };
}

async function ownedWrapperPaths(home: string, relayHome: string): Promise<string[]> {
  const dirs = new Set<string>([
    path.join(home, ".local", "bin"),
    path.join(home, ".bun", "bin"),
    path.join(relayHome, "bin"),
  ]);
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (dir) {
      dirs.add(dir);
    }
  }

  const found: string[] = [];
  for (const dir of dirs) {
    for (const name of CLI_WRAPPER_NAMES) {
      const candidate = path.join(dir, name);
      if (await isAiandrelayOwned(candidate)) {
        found.push(candidate);
      }
    }
  }
  return found;
}

export async function isAiandrelayOwned(filePath: string): Promise<boolean> {
  try {
    const st = await lstat(filePath);
    if (st.isSymbolicLink()) {
      const target = await readlink(filePath);
      return /aiandrelay/i.test(target);
    }
    if (!st.isFile()) {
      return false;
    }
    if (st.size > 64_000) {
      return false;
    }
    const text = await readFile(filePath, "utf8");
    return text.includes("aiandrelay.js") || /aiandrelay/i.test(text);
  } catch {
    return false;
  }
}

async function removePath(
  pathToRemove: string,
): Promise<{ path: string; message: string } | undefined> {
  try {
    await rm(pathToRemove, { recursive: true, force: true });
    return undefined;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return undefined;
    }
    return { path: pathToRemove, message: err instanceof Error ? err.message : String(err) };
  }
}
